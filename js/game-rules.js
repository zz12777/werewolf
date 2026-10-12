// ═══════════════════════════════════════════
// js/game-rules.js
// 共用的勝負規則：法官助手（js/core.js）跟連線房間（js/room/win.js）都呼叫這一份，
// 規則只寫一次，兩邊判定結果一定一致，不會再出現「法官助手修好了、連線房間還是舊規則」。
//
// 這個檔案只放「純規則」：不碰畫面、不讀 Firestore、不讀法官助手的全域狀態。呼叫端先把
// 自己的資料整理成下面這種「局面」物件（state）再丟進來：
//
//   state = {
//     players: [{                 // 全場玩家（含死亡的）
//       id,                       // 識別碼（字串）：法官助手用座位號碼，連線房間用 uid
//       role, alive,
//       wolfPack,                 // 是不是狼隊（可省略，預設看 WOLF_ROLES；法官助手雙身分要另外算）
//       converted, infected,      // 風聲諜影轉化者、殭屍感染
//       puppet,                   // 唯鄰是從的傀儡（守衛、女巫技能不生效）
//       knifeImmune,              // 被狼刀不會死（白貓、學到白貓的機械狼、已翻牌的白貓）
//       witchSaveUsed, witchPoisonUsed,  // 女巫本人的藥
//       knightDuelUsed, foxcubUsed,
//       luckyWitchUnused,         // 幸運兒拿到女巫毒藥、還沒用
//     }],
//     comp,                       // 板子角色配置 {role: 數量}
//     lovers,                     // 邱比特連的兩位情侶 [idA, idB]，沒有就 null
//     windspy, hybridTarget,      // 風聲諜影；混血兒混的對象 id（只有風聲諜影會跟著陣營走）
//     foolChase,                  // 傻瓜「要追刀」規則（屠神時傻瓜也要殺）
//     dualMode,                   // 雙身分模式
//     divinerMarkUsed,            // 占卜師標記用過了沒
//     windspyKnifeReady,          // 風聲諜影今晚狼隊刀得出去（有覺醒石像鬼或可以入隊的人）
//   }
//
// 回傳的勝負結果格式：{winner:'wolf'|'good'|'third', msg, icon}，還沒分出勝負回傳 null。
// ═══════════════════════════════════════════
const JG_RULES=(function(){
  const wolfRoles=()=>(typeof WOLF_ROLES!=='undefined'?WOLF_ROLES:[]);
  const godRoles=()=>(typeof GOD_ROLES!=='undefined'?GOD_ROLES:[]);
  const find=(st,id)=>st.players.find(p=>String(p.id)===String(id))||null;
  const alive=(st)=>st.players.filter(p=>p.alive);
  const isPack=(p)=>!!p&&(p.wolfPack!==undefined?!!p.wolfPack:wolfRoles().includes(p.role));
  const isVillagerForWin=(p)=>p.role==='villager'||p.role==='hybrid'||p.role==='cupid'; // 混血兒、邱比特屠民時算平民

  // 「屠神」要殺光的神職：所有神職，傻瓜只有「要追刀」規則才算。
  function allGodsForWin(st){
    const base=godRoles().filter(r=>r!=='fool');
    if(st&&st.foolChase) base.push('fool');
    return base;
  }

  // 情侶配對種類：狼狼鏈 'wolf'、人人鏈 'good'、人狼鏈 'third'（第三方），沒有配對 null。
  function loverPairType(st){
    if(!st.lovers||st.lovers.length!==2) return null;
    const p1=find(st,st.lovers[0]), p2=find(st,st.lovers[1]);
    if(!p1||!p2) return null;
    const w1=isPack(p1), w2=isPack(p2);
    if(w1&&w2) return 'wolf';
    if(!w1&&!w2) return 'good';
    return 'third';
  }
  // 人狼鏈時的第三方成員：兩位情侶＋邱比特本人（邱比特連自己的話只有兩人）。
  function thirdPartyMembers(st){
    if(loverPairType(st)!=='third') return [];
    const set=new Set(st.lovers.map(String));
    st.players.filter(p=>p.role==='cupid').forEach(p=>set.add(String(p.id)));
    return [...set];
  }

  // 勝負判定用的狼隊歸屬：狼隊、風聲諜影轉化者、風聲諜影混到狼的混血兒、狼狼鏈的邱比特。
  // 只用在算輸贏，睜眼順序、查驗結果等不要用這個。
  function isWolfForWin(st,p){
    if(!p) return false;
    if(isPack(p)) return true;
    if(p.converted) return true;
    if(st.windspy&&p.role==='hybrid'&&st.hybridTarget!=null){
      const t=find(st,st.hybridTarget);
      if(t&&String(t.id)!==String(p.id)&&(isPack(t)||t.converted)) return true;
    }
    return p.role==='cupid'&&loverPairType(st)==='wolf';
  }

  // 殭屍：場上除了殭屍以外的存活玩家全部被感染，殭屍單獨獲勝。
  function checkWinZombie(st){
    const zb=st.players.find(p=>p.role==='zombie');
    if(!zb||!zb.alive) return null;
    const others=alive(st).filter(p=>p!==zb);
    if(!others.length) return null;
    if(others.every(p=>p.infected)) return {winner:'third', msg:'場上存活玩家已全數被殭屍感染，殭屍單獨獲勝', icon:'🧟'};
    return null;
  }

  // 人狼鏈：第三方還有人活著時才會走到這裡。屠光其餘玩家，或人數壓過其餘玩家就獲勝——
  // 三人都活著要嚴格多於，剩一兩人時打平也算贏。第三方還在場時，好人／狼人都不能提前獲勝。
  function checkWinThirdParty(st,tp,tpAlive){
    const others=alive(st).filter(p=>!tp.includes(String(p.id)));
    if(!others.length) return {winner:'third', msg:'邱比特與情侶（第三方陣營）已將其餘玩家屠光', icon:'💘'};
    if(tpAlive.length===3&&tpAlive.length>others.length)
      return {winner:'third', msg:'第三方陣營（邱比特／情侶）存活人數多於其餘玩家，直接判定第三方獲勝', icon:'💘'};
    if((tpAlive.length===1||tpAlive.length===2)&&tpAlive.length>=others.length)
      return {winner:'third', msg:'第三方陣營（邱比特／情侶）存活人數與其餘玩家打平或更多，直接判定第三方獲勝', icon:'💘'};
    return null;
  }

  // 好人 vs 狼人。
  function checkWinNormal(st){
    // 殭屍是獨立第三方，不算進好人或狼人的人數。
    const a=alive(st).filter(p=>p.role!=='zombie');
    const aw=a.filter(p=>isWolfForWin(st,p));
    const ag=a.filter(p=>!isWolfForWin(st,p));
    if(!aw.length) return {winner:'good', msg:'所有狼人已被淘汰', icon:'🎉'};
    const allGods=allGodsForWin(st);
    // 風聲諜影：狼隊彼此不相認，不看人數；沒有平民，神職全滅（屠神）狼人才獲勝。
    if(st.windspy){
      if(!ag.some(p=>allGods.includes(p.role))) return {winner:'wolf', msg:'所有神職已被淘汰', icon:'🐺'};
      return null;
    }
    const comp=st.comp||{};
    // 機械狼板、假面板：狼隊互不相認，人數優勢不算數，一定要屠邊。
    const noMajority=(comp.mechanicalwolf||0)>0||(comp.mask||0)>0;
    // 魔術師板：換號碼可能讓狼誤殺自己人，人數打平還不明朗，要嚴格多於才算。
    const strictMajority=(comp.magician||0)>0||ag.some(p=>hasComebackThreat(p));
    if(!noMajority){
      if(strictMajority){ if(aw.length>ag.length) return {winner:'wolf', msg:'狼人人數已達多數', icon:'🐺'}; }
      else if(aw.length>=ag.length) return {winner:'wolf', msg:'狼人人數已達多數', icon:'🐺'};
    }
    const aGod=ag.filter(p=>allGods.includes(p.role));
    const aVil=ag.filter(isVillagerForWin);
    if(!aVil.length&&aGod.length) return {winner:'wolf', msg:'所有平民已被淘汰', icon:'🐺'};
    if(!aGod.length&&aVil.length) return {winner:'wolf', msg:'所有神職已被淘汰', icon:'🐺'};
    return null;
  }
  // 人數打平時，好人還有沒有「主動翻盤、狼躲不掉」的手段：女巫還有藥（解藥能延一晚、毒藥
  // 能直接毒狼）、獵魔人、還沒決鬥的騎士、攝夢人、還握著女巫毒藥的幸運兒。有的話狼人要
  // 嚴格多於好人才算贏。守衛（只能拖）、獵人（狼可以不刀他）不算。
  function hasComebackThreat(p){
    if(p.role==='witch') return !p.witchPoisonUsed||!p.witchSaveUsed;
    if(p.role==='demonhunter') return true;
    if(p.role==='knight') return !p.knightDuelUsed;
    if(p.role==='dreamcatcher') return true;
    if(p.luckyWitchUnused) return true;
    return false;
  }

  // 完整勝負判定：殭屍 → 邱比特第三方（還有人活著時）→ 好人 vs 狼人。
  function checkWin(st){
    const z=checkWinZombie(st);
    if(z) return z;
    const tp=thirdPartyMembers(st);
    if(tp.length){
      const tpAlive=tp.filter(id=>{ const p=find(st,id); return p&&p.alive; });
      if(tpAlive.length) return checkWinThirdParty(st,tp,tpAlive);
    }
    return checkWinNormal(st);
  }

  // 目前是不是「屠邊」（神職全滅或平民全滅，而且狼還活著）。屠邊不會被同一晚狼刀之後的
  // 好人技能（女巫毒、獵魔人）翻盤，「狼刀在先」的判斷要用到。風聲諜影沒有平民，只看神職。
  function isSlaughter(st){
    const a=alive(st).filter(p=>p.role!=='zombie');
    const aw=a.filter(p=>isWolfForWin(st,p)), ag=a.filter(p=>!isWolfForWin(st,p));
    if(!aw.length) return false;
    const allGods=allGodsForWin(st);
    const aGod=ag.filter(p=>allGods.includes(p.role));
    if(st.windspy) return aGod.length===0;
    const aVil=ag.filter(isVillagerForWin);
    return aGod.length===0||aVil.length===0;
  }

  // 把局面複製一份，指定的人改成死亡／存活（模擬用，不動到原本的 state）。
  function withAlive(st,changes){
    return Object.assign({},st,{players:st.players.map(p=>
      Object.prototype.hasOwnProperty.call(changes,String(p.id))?Object.assign({},p,{alive:changes[String(p.id)]}):p)});
  }

  // 天亮結算的「狼刀在先」：wolfVictims 是今晚死於狼隊的人，goodKilledWolves 是今晚被好人技能
  // （女巫毒、獵魔人）殺掉的狼。把被好人殺掉的狼先當作還活著，如果光靠狼刀就已經屠邊，
  // 狼人獲勝（同一晚毒死最後一狼也沒用）；只是人數達標的話不算，照正常判定。
  // 回傳狼人勝利結果或 null。
  function wolfFirstWin(st,goodKilledWolves){
    if(!goodKilledWolves||!goodKilledWolves.length) return null;
    const changes={}; goodKilledWolves.forEach(id=>{ changes[String(id)]=true; });
    const sim=withAlive(st,changes);
    const r=checkWin(sim);
    if(r&&r.winner==='wolf'&&isSlaughter(sim)) return r;
    return null;
  }

  // 白天結束、準備進入黑夜時：今晚沒有任何能影響「誰會死」的好人技能，而且不管狼人刀
  // 剩下的哪一位好人，天亮都一定達成狼人勝利條件，就直接判定狼人獲勝。
  // 例：剩一狼、一獵人、一民——刀獵人屠神、刀平民屠民，狼人怎麼刀都贏。
  // 第三方、殭屍、雙身分、假面、雙機械狼一律不提前判定。
  function guaranteedNightWin(st){
    if(st.dualMode) return null;
    const comp=st.comp||{};
    if(((comp.mask||0)+(comp.bigmechwolf||0)+(comp.smallmechwolf||0))>0) return null;
    if(st.players.some(p=>p.role==='zombie'&&p.alive)) return null;
    if(thirdPartyMembers(st).some(id=>{ const p=find(st,id); return p&&p.alive; })) return null;
    const a=alive(st);
    const aw=a.filter(p=>isWolfForWin(st,p));
    const ag=a.filter(p=>!isWolfForWin(st,p));
    if(!aw.length||!ag.length) return null;
    if(st.windspy&&!st.windspyKnifeReady) return null; // 風聲諜影今晚可能卡刀
    // 狼刀之前（或同時）會改變誰會死的好人技能：還在就不能提前判。女巫只看解藥——毒藥在
    // 狼刀之後，狼刀已經屠邊的話毒死最後一狼也沒用。傀儡的守衛、女巫技能不生效。
    const blocker=ag.some(p=>{
      if(p.puppet&&(p.role==='guard'||p.role==='witch')) return false;
      switch(p.role){
        case 'guard': case 'magician': case 'trickmage': case 'dreamcatcher': case 'dancer': return true;
        case 'witch': return !p.witchSaveUsed;
        case 'foxcub': return !p.foxcubUsed;
        case 'diviner': return !st.divinerMarkUsed;
      }
      return false;
    });
    if(blocker) return null;
    // 狼刀之後才會殺到狼的好人技能：只影響「人數達標」這種判定，屠邊不受影響。
    const lateKiller=ag.some(p=>(!p.puppet&&((p.role==='witch'&&!p.witchPoisonUsed)||p.role==='demonhunter'||p.role==='purewhitemaiden'))||p.luckyWitchUnused);
    for(const t of ag){
      if(t.knifeImmune) return null; // 白貓被刀會翻牌，不會死
      const changes={}; changes[String(t.id)]=false;
      if(st.lovers&&st.lovers.length===2&&st.lovers.map(String).includes(String(t.id))){
        const partner=find(st,st.lovers.map(String).find(id=>id!==String(t.id)));
        if(partner&&partner.alive) changes[String(partner.id)]=false;
      }
      const sim=withAlive(st,changes);
      const r=checkWin(sim);
      if(!r||r.winner!=='wolf') return null;
      if(lateKiller&&!isSlaughter(sim)) return null;
    }
    return {winner:'wolf', msg:'進入黑夜前就已確定：剩下的好人不管被狼人刀哪一位，狼人都會達成勝利條件', icon:'🐺'};
  }

  return {allGodsForWin, loverPairType, thirdPartyMembers, isWolfForWin, isSlaughter, hasComebackThreat,
    checkWin, checkWinZombie, checkWinThirdParty, checkWinNormal, wolfFirstWin, guaranteedNightWin, withAlive};
})();
if(typeof module!=='undefined'&&module.exports) module.exports=JG_RULES;
