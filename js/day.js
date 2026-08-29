// ═══════════════════════════════════════════
// js/day.js
// 白天流程（天亮公告、發言、投票、PK、遺言、開槍鏈）
// ═══════════════════════════════════════════

function jgPushDayLog(line){
  if(!jgDayLog[jgNight]) jgDayLog[jgNight]=[];
  jgDayLog[jgNight].push(line);
}
// 遺言頁面的「已翻牌是傻瓜」勾選框——法官照桌上實際情況勾選，不自動假設。
// 追刀規則：翻牌代表「這次放逐免死」，人要復原回存活狀態，之後得靠夜晚手段（狼刀等）
// 另外淘汰才算數。不追刀規則：翻牌只是留在場上發言的敘事許可，遊戲判定上維持已淘汰
// （不用復原存活），屠神／屠民不用再補刀。取消勾選則完全復原成一般死亡（沒有翻牌）。
function jgToggleFoolReveal(checked){
  const num=jgRecord._voteOutNum;
  const p=num?jgFind(num):null;
  if(!p||p.role!=='fool') return;
  if(checked){
    p.foolRevealed=true;
    if(jgFoolChaseMode==='chase'){
      p.alive=true;
      jgPushDayLog(num+'號翻牌是傻瓜！免於此次放逐，之後只能發言、不能再投票，需另外淘汰才算數');
    } else {
      jgPushDayLog(num+'號翻牌是傻瓜！可留在場上發言，但視同已淘汰、不能再投票');
    }
  } else {
    p.foolRevealed=false;
    if(jgFoolChaseMode==='chase') p.alive=false;
  }
  jgRenderRoster();
  const cw=jgCheckWin();
  if(cw){ jgShowWin(cw); return; }
  jgRenderStep(jgCurrentStep);
}
// 白天「票X」那一行事後被開槍帶人補上帶走的對象（黑狼王／獵人被票出局後開槍），
// 跟夜晚的「刀」那行道理一樣，只是白天是接在對應的票數列後面。
function jgAmendDayVoteLine(shooterNum, abbr, val){
  if(!jgDayLog[jgNight]||!shooterNum) return;
  const idx=jgDayLog[jgNight].findIndex(l=>l.startsWith('票'+shooterNum+'：')||l.startsWith('票'+shooterNum+':')||l.startsWith('PK票'+shooterNum+'：')||l.startsWith('PK票'+shooterNum+':'));
  if(idx>=0) jgDayLog[jgNight][idx]+='（'+shooterNum+abbr+'帶'+val+'）';
  else jgPushDayLog(shooterNum+abbr+'帶'+val);
}
function jgAfterDawn(){
  // 警上競選過程中若有狼人自爆（不論雙爆的第一爆、還是最終真的流失警徽的一爆），當天不進行
  // 發言與投票，遺言結束後直接天黑；沒有自爆的一般狀況才正常進入白天發言、投票。
  if(jgRecord&&jgRecord._selfDestructNum) return 'next-night';
  return 'discuss';
}
function jgSetDiscussStart(n){
  jgDayMeta[jgNight]=Object.assign({}, jgDayMeta[jgNight], {start:n, dir:jgSheriffLRAutoDir(n)});
  jgRenderStep(jgCurrentStep);
}
// 警長選警左／警右的簡化版 picker：只列出警長左右兩邊的號碼給法官選，
// 兩個號碼中選較小的 → 自動判定逆時針；選較大的 → 自動判定順時針，畫面精簡不用另外選方向。
function jgDiscussExtraButtonsHtml(){
  let html='';
  const ww=jgPlayers.find(p=>p.role==='whitewolf'&&p.alive);
  if(ww) html+='<button class="danger" onclick="jgGoStep(\'whitewolf-selfblow\')" style="margin-top:4px;">'+ww.num+'號 白狼王宣告自爆 →</button>';
  const knP=jgPlayers.find(p=>p.role==='knight'&&p.alive);
  if(knP) html+='<button class="danger" onclick="jgGoStep(\'knight-duel\')" style="margin-top:4px;">'+knP.num+'號 騎士翻牌決鬥 →</button>';
  // 血月使者的自爆併進「狼人自爆」這顆按鈕：點進去選號碼，選到血月使者會自動導去血月專屬流程
  // （封印當晚神職技能），選到一般狼人／黑狼王則走一般自爆流程，不用另外分開兩顆按鈕。
  // 自刀自爆規則：狼兄不可自爆（可自刀）、狼弟可自爆（可自刀），一併算進「狼人自爆」這顆按鈕的資格判斷
  const canWolfBlow=jgPlayers.some(p=>p.alive&&(p.role==='wolf'||p.role==='wolfking'||p.role==='bloodmoon'||p.role==='wolfbrother_y'||p.role==='wolfshaman'));
  if(canWolfBlow) html+='<button class="danger" onclick="jgGoStep(\'wolf-selfblow\')" style="margin-top:4px;">🐺 狼人自爆 →</button>';
  return html;
}
function jgFirstDayCompCheckHtml(){
  const actual={};
  jgPlayers.forEach(p=>{
    const r=p.role||'villager';
    actual[r]=(actual[r]||0)+1;
    // 雙身分模式：卡2尚未生效也算在配置內，否則永遠會顯示「缺少」卡2身分
    if(jgDualIdentityMode&&p.role2) actual[p.role2]=(actual[p.role2]||0)+1;
  });
  const allKeys=new Set([...Object.keys(jgComp),...Object.keys(actual)]);
  const mismatches=[];
  allKeys.forEach(k=>{
    let want=jgComp[k]||0;
    // 盜賊候選時被淘汰、埋掉的那個身分：jgComp 裡刻意保留原本的數字不變（讓每晚流程
    // 照樣喊到這個身分、維持節奏，見 THIEF_BURIED_STEP_INFO），但全場實際不會有真人
    // 持有這個身分，所以這裡比對「應配置」時要扣掉 1，才不會誤判成配置錯誤。
    if(jgThiefChosen&&jgThiefBuriedRole===k) want=Math.max(0,want-1);
    // 盜賊本人已經在第一夜選定最終身分、變成別的角色，場上不會再有真人顯示為「盜賊」，
    // 這是預期中的結果（不是配置錯誤），比對時同樣要扣掉這 1 個名額。
    if(jgThiefChosen&&k==='thief') want=Math.max(0,want-1);
    const got=actual[k]||0;
    if(want!==got) mismatches.push(jgFullRoleName(k)+'：應 '+want+'，實際 '+got);
  });
  const wolves=Object.entries(actual).filter(([k])=>WOLF_ROLES.includes(k)).reduce((s,[,v])=>s+v,0);
  const gods=Object.entries(actual).filter(([k])=>GOD_ROLES.includes(k)).reduce((s,[,v])=>s+v,0);
  const vils=actual.villager||0;
  const summary='狼 '+wolves+'　神職 '+gods+'　民 '+vils;
  if(mismatches.length===0){
    return '';
  }
  const roleOptions=Object.keys(jgComp);
  let fixRows='';
  for(let i=1;i<=jgTotal;i++){
    const p=jgByNum(i);
    const cur=p?(p.role||'villager'):'villager';
    fixRows+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">'
      +'<div style="width:28px;height:28px;border-radius:50%;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;flex-shrink:0;">'+i+'</div>'
      +'<select id="jg-compfix-'+i+'" style="flex:1;">'
      +roleOptions.map(r=>'<option value="'+r+'"'+(cur===r?' selected':'')+'>'+jgFullRoleName(r)+'</option>').join('')
      +'</select></div>';
  }
  return '<div class="info-danger" style="margin-bottom:10px;font-size:13px;">⚠️ 身分配置與原始設定不符，請確認是否有神/狼身分忘記記錄：<br>'+mismatches.join('<br>')+'<br>目前：'+summary+'</div>'
    +'<button style="margin-bottom:10px;" onclick="document.getElementById(\'jg-compfix-panel\').style.display=\'block\';this.style.display=\'none\';">🔧 直接修正身分</button>'
    +'<div id="jg-compfix-panel" style="display:none;margin-bottom:10px;">'
    +fixRows
    +'<button class="primary" style="margin-top:6px;" onclick="jgApplyCompFix()">套用修正</button>'
    +'</div>';
}

// Apply the inline quick-fix panel's role selections directly (no need to navigate back)
function jgApplyCompFix(){
  for(let i=1;i<=jgTotal;i++){
    const sel=document.getElementById('jg-compfix-'+i);
    if(!sel) continue;
    const p=jgByNum(i);
    if(p) p.role=sel.value;
  }
  jgRenderRoster();
  jgGoStep('discuss');
}

// Feature: peaceful-night (平安夜) speaking-order wheel — picks a random living
// player's number and a random direction to start the day's speeches from. The chosen
// direction persists for the rest of the game (see jgComputeSpeakStart).
function jgSpinWheel(){
  const alive=jgAlive().map(p=>p.num);
  if(alive.length===0) return;
  const box=document.getElementById('jg-wheel-result');
  let ticks=0;
  const maxTicks=18;
  const timer=setInterval(()=>{
    ticks++;
    const n=alive[Math.floor(Math.random()*alive.length)];
    jgShowBigCard(n+'號', '抽籤中…', true);
    if(ticks>=maxTicks){
      clearInterval(timer);
      const finalNum=alive[Math.floor(Math.random()*alive.length)];
      // Direction is decided only the first time it's ever established; once set for this
      // game, it never changes again — later peaceful nights only re-draw the start seat.
      const dir=jgSpeakDirection||(Math.random()<0.5?'順':'逆');
      jgSpeakDirection=dir;
      jgDayMeta[jgNight]={start:finalNum, dir:dir};
      const dirLabel=dir==='順'?'順時針 →':'← 逆時針';
      jgShowBigCard(finalNum+'號', dirLabel+' 發言');
      if(box) box.innerHTML='<div class="info-success" style="text-align:center;padding:14px;">'
        +'<div style="font-size:34px;font-weight:800;">'+finalNum+'號</div>'
        +'<div style="font-size:15px;margin-top:4px;">'+dirLabel+' 發言</div></div>';
      jgRenderStep('discuss');
    }
  },80);
}

// Feature: when a death occurs before a speaking direction has ever been established
// (e.g. someone dies on night 1, so there's been no 平安夜 wheel-spin yet), the judge
// still needs to randomly decide 順/逆, but the start seat is fixed by the death itself
// (per jgComputeSpeakStart's convention), not randomly drawn like the peaceful-night wheel.
function jgSpinDirectionOnly(){
  const box=document.getElementById('jg-wheel-result');
  let ticks=0;
  const maxTicks=14;
  const timer=setInterval(()=>{
    ticks++;
    const d=Math.random()<0.5?'順時針 →':'← 逆時針';
    jgShowBigCard(d, '決定中…', true);
    if(ticks>=maxTicks){
      clearInterval(timer);
      const dir=Math.random()<0.5?'順':'逆';
      jgSpeakDirection=dir;
      const start=jgComputeSpeakStart();
      if(start!==null) jgDayMeta[jgNight]={start:start, dir:dir};
      const dirLabel=dir==='順'?'順時針 →':'← 逆時針';
      jgShowBigCard(start!==null?start+'號':'—', dirLabel+' 發言');
      if(box) box.innerHTML='<div class="info-success" style="text-align:center;padding:14px;">'
        +(start!==null?'<div style="font-size:34px;font-weight:800;">'+start+'號</div>':'')
        +'<div style="font-size:15px;margin-top:4px;">'+dirLabel+' 發言</div></div>';
      jgRenderStep('discuss');
    }
  },80);
}

// Once a speaking direction has been established (via the peaceful-night wheel above),
// later nights with deaths derive their starting speaker automatically instead of a manual
// draw: 逆向 starts from the player seated just before the smallest-numbered death; 順向
// starts from the player seated just after the largest-numbered death (wrapping around the
// full seat range 1..total, skipping anyone not currently alive).
function jgComputeSpeakStart(){
  if(!jgSpeakDirection) return null;
  const deadNums=jgPlayers.filter(p=>p._diedThisDawn).map(p=>p.num);
  if(deadNums.length===0) return null;
  const total=jgTotal;
  const aliveSet=new Set(jgAlive().map(p=>p.num));
  if(aliveSet.size===0) return null;
  let n;
  if(jgSpeakDirection==='逆'){
    n=Math.min(...deadNums);
    for(let i=0;i<total;i++){ n--; if(n<1) n=total; if(aliveSet.has(n)) return n; }
  } else {
    n=Math.max(...deadNums);
    for(let i=0;i<total;i++){ n++; if(n>total) n=1; if(aliveSet.has(n)) return n; }
  }
  return null;
}

function jgFormatDayVoteBlock(n){
  const raw=jgDayLog[n]||[];
  const round1=raw.filter(l=>/^票\d+：/.test(l));
  const round1Abstain=raw.find(l=>/^棄票：/.test(l));
  const tie=raw.find(l=>/^平票/.test(l));
  const pk=raw.filter(l=>/^PK票\d+：/.test(l));
  const pkAbstain=raw.find(l=>/^PK棄票：/.test(l));
  const tie2=raw.find(l=>/^PK 後再度平票/.test(l));
  const noOut=raw.find(l=>l==='無人出局');
  if(round1.length===0&&!round1Abstain&&pk.length===0&&!noOut&&!tie&&!tie2) return '';
  let out='';
  if(round1.length>0){ out+=round1.join('\n')+'\n'; }
  if(round1Abstain) out+='棄票：'+round1Abstain.replace(/^棄票：/,'')+'\n';
  if(tie) out+=tie+'\n';
  if(pk.length>0){ out+='－ PK －\n'+pk.join('\n')+'\n'; }
  if(pkAbstain) out+='PK棄票：'+pkAbstain.replace(/^PK棄票：/,'')+'\n';
  if(tie2) out+=tie2+'\n';
  if(noOut) out+=noOut+'\n';
  return out.trim();
}
function jgRenderVoteHistory(){
  const el=document.getElementById('jg-vote-history');
  if(!el) return;
  let html='';
  if(jgSheriffCampaignHappened||jgSheriffSelfDestruct){
    const sb=jgFormatSheriffBlock().replace(/^\*\*警長競選\n/,'');
    if(sb) html+='<div class="vh-block"><div class="vh-title">🎖️ 警長票型</div><pre class="vh-pre">'+sb.replace(/</g,'&lt;').replace(/^>/,'').replace(/\n>/g,'\n')+'</pre></div>';
  }
  const nightNums=Object.keys(jgDayLog).map(Number).sort((a,b)=>a-b);
  nightNums.forEach(n=>{
    const block=jgFormatDayVoteBlock(n);
    if(!block) return;
    html+='<div class="vh-block"><div class="vh-title">☀️ 第'+n+'天白天投票</div><pre class="vh-pre">'+block.replace(/</g,'&lt;')+'</pre></div>';
  });
  el.innerHTML=html||'<div class="vh-empty">尚無投票紀錄</div>';
}

// Deep-snapshot every piece of mutable game state (player list/roles/alive-status, the
// current night's in-progress record, one-time-use flags like witch antidote/poison,
// consecutive-target trackers, logs, vote tally, etc). Excludes setup-only data that never
// changes mid-game (jgTotal/jgComp/jgPlayerNames) and the history stacks themselves.
function jgSaveDawnHunterShot(){
  const shooter=jgPlayers.find(pl=>pl.role==='wolfking'&&jgRecord.wolfKill&&pl.num.toString()===jgRecord.wolfKill.toString())
    ||jgFind(jgRecord.wolfKill);
  // 這一槍的開槍資格是不是（也）來自黑市商人給的「獵人獵槍」幸運兒技能——不管開槍的人
  // 本身是不是真獵人，只要他就是目前這個未使用過的幸運兒，這一槍用完都要標記成已使用。
  const shooterIsLuckyGun=!!(shooter&&jgLuckyOne&&jgLuckyOne.gift==='hunter'&&!jgLuckyOne.used&&jgNight>=jgLuckyOne.startNight&&jgLuckyOne.num===shooter.num);
  // 被狼刀殺死的這位若本身「同時」是真獵人、又是這個幸運兒，等於身上有兩把槍，
  // 各自獨立開一槍（判斷條件跟渲染畫面時的 dawnDoubleGun 一致，狀態沒變過所以重算一次沒問題）
  const doubleGun=!!(shooterIsLuckyGun&&shooter.role==='hunter');
  const rawVal=(document.getElementById('jg-hunter-dawn-shot')||{}).value?.trim()||'';
  const val=rawVal?jgMagicSwapNum(rawVal):'';
  const rawVal2=doubleGun?((document.getElementById('jg-hunter-dawn-shot2')||{}).value?.trim()||''):'';
  const val2=rawVal2?jgMagicSwapNum(rawVal2):'';
  const chainQueue=[];
  const fireDawnShot=(rv,v,abbr)=>{
    if(!v) return;
    // 守衛（或機械狼學到守衛）當晚若守到這個號碼，同一個盾可以擋下夜槍，帶不走
    const guardBlocked=!!((jgRecord.guardTarget&&jgRecord.guardTarget.toString()===v.toString())
      || (jgRecord.mechWolfGuardTarget&&jgRecord.mechWolfGuardTarget.toString()===v.toString()));
    const p=jgFind(v);
    // 惡靈騎士夜間免疫（含夜槍）：獵人/黑狼王被狼刀後開槍，若對象是惡靈騎士，不會倒牌
    const isEvilKnightImmune=!!(p&&p.role==='evilknight');
    let wbNote='';
    if(guardBlocked){
      alert('🛡️ '+v+'號當晚被守衛守護，夜槍/王槍被擋下，不會被帶走！');
    } else if(isEvilKnightImmune){
      alert('🖤 '+v+'號是惡靈騎士，夜間（含夜槍）免疫，不會倒牌！');
    } else if(p&&p.alive){
      const wasRole=p.role; // 換牌前先記住原本身分，避免 jgApplyDeath 換牌後 role 已經變了
      const trulyDied=jgApplyDeath(p);
      const wbCharmNum=jgCascadeWolfBeautyDeath(wasRole, trulyDied);
      jgCascadeDreamcatcherDeath(wasRole, trulyDied);
      { const loverDeadNum=jgCascadeLoverDeath(p.num, trulyDied);
        if(loverDeadNum){
          alert('💘 '+p.num+'號的情侶 '+loverDeadNum+'號 跟著殉情！（殉情不會觸發任何技能，即使殉情者是獵人／黑狼王等，也不能開槍帶人）\n\n法官口白：「'+p.num+'號、'+loverDeadNum+'號 淘汰。」');
        }
      }
      // 被夜槍／王槍帶走的對象，如果本身也具備獵人開槍資格（真獵人／已學得獵人的機械狼／
      // 得到獵槍技能的幸運兒），也要能連鎖啟動自己的技能帶人
      const chainTag=trulyDied?jgHunterCapableTag(wasRole,p.num):null;
      if(chainTag){ chainQueue.push({num:p.num, role:chainTag}); }
      if(wbCharmNum){
        wbNote='（'+v+'狼美，魅惑對象'+wbCharmNum+'一同出局）';
        alert('💋 '+v+'號是狼美人，魅惑對象一同殉情！\n\n法官口白：「'+v+'號、'+wbCharmNum+'號 淘汰。」');
      }
    }
    // Amend this night's death line (not the 刀 line itself) with the shooter's follow-up kill,
    // so the export shows it as "X死亡（X獵帶Y）(Y狼美，魅惑對象Z一同出局)" under 白天, not under 夜晚.
    if(shooter&&jgDawnDeaths[jgNight]){
      if(!jgDawnDeaths[jgNight].notes) jgDawnDeaths[jgNight].notes={};
      jgDawnDeaths[jgNight].notes[shooter.num]=(jgDawnDeaths[jgNight].notes[shooter.num]||'')
        +'（'+shooter.num+abbr+'帶'+jgSwapDisplay(rv,v)+(guardBlocked?'，被守衛擋下':isEvilKnightImmune?'，惡靈騎士免疫':'')+'）'+wbNote;
    }
  };
  // 這一槍的手勢／稱呼：真獵人或機械狼學到獵人＝獵、黑狼王＝王；若「唯一」的開槍資格
  // 就是幸運兒的獵人獵槍（不是真獵人也不是黑狼王），則直接標記為幸獵，跟原本規則一致
  const abbr1=shooter&&shooter.role==='wolfking'?'王':(shooterIsLuckyGun&&!doubleGun?'幸獵':'獵');
  fireDawnShot(rawVal,val,abbr1);
  if(doubleGun){
    fireDawnShot(rawVal2,val2,'幸獵');
  }
  // 不管開了幾槍、槍有沒有真的擊中人，只要這一槍的資格（單獨一把、或兩把當中的第二把）
  // 來自幸運兒的獵人獵槍，這個死亡時機一過就不會再有機會用了，直接標記成已使用
  if(shooterIsLuckyGun&&jgLuckyOne){ jgLuckyOne.used=true; }
  // 注意：這個 checkWin 一定要跑在「不管有沒有開槍」的路徑上——就算法官選擇不開槍／留空，
  // 淘汰這位獵人／黑狼王本身（狼刀致死）也可能已經達成勝負條件（例如神職剛好死絕），
  // 這裡沒有再檢查一次的話，遊戲會誤判成還沒結束，直接跳進一整個白天發言＋投票流程。
  jgRenderRoster();
  const win=jgCheckWin();
  if(win){jgShowWin(win);return;}
  // Now show last words for all dead including hunter
  const dawnDeads=jgPlayers.filter(p=>!p.alive&&p._diedThisDawn);
  if(chainQueue.length){
    const first=chainQueue.shift();
    jgRecord._mechHunterChainQueue=chainQueue;
    jgRecord._mechHunterChainNum=first.num;
    jgRecord._mechHunterChainRole=first.role;
    jgRecord._mechHunterChainNextStep=jgAfterDawn();
    jgRecord._mechHunterChainOrigin='night';
    jgGoStep('mechhunter-chain-shot');
    return;
  }
  jgGoStep(jgAfterDawn());
}

// 具獵人開槍資格的身分（真獵人／已學得獵人的機械狼／得到獵槍技能的幸運兒）被別人的槍
// 帶走時的連鎖開槍：跟一般夜槍/王槍同一套擋槍規則（守衛可擋、惡靈騎士免疫），
// 成功帶走的話一樣要補進文字紀錄。
function jgSaveMechHunterChainShot(){
  const rawVal=(document.getElementById('jg-mechhunter-chain-shot')||{}).value?.trim()||'';
  const val=rawVal?jgMagicSwapNum(rawVal):'';
  const chainNum=jgRecord._mechHunterChainNum;
  const nextStep=jgRecord._mechHunterChainNextStep||'dawn';
  const chainOrigin=jgRecord._mechHunterChainOrigin||'night';
  const chainRole=jgRecord._mechHunterChainRole||'hunter';
  const pendingQueue=jgRecord._mechHunterChainQueue||[];
  jgRecord._mechHunterChainNum=null;
  jgRecord._mechHunterChainNextStep=null;
  jgRecord._mechHunterChainOrigin=null;
  jgRecord._mechHunterChainRole=null;
  jgRecord._mechHunterChainQueue=null;
  const abbr={hunter:'獵',mechanicalwolf:'機獵',luckyone:'幸獵'}[chainRole]||'獵';
  if(val){
    const guardBlocked=!!((jgRecord.guardTarget&&jgRecord.guardTarget.toString()===val.toString())
      || (jgRecord.mechWolfGuardTarget&&jgRecord.mechWolfGuardTarget.toString()===val.toString()));
    const p=jgFind(val);
    const isEvilKnightImmune=!!(p&&p.role==='evilknight');
    if(guardBlocked){
      alert('🛡️ '+val+'號當晚被守衛守護，槍被擋下，不會被帶走！');
    } else if(isEvilKnightImmune){
      alert('🖤 '+val+'號是惡靈騎士，夜間（含夜槍）免疫，不會倒牌！');
    } else if(p&&p.alive){
      const wasRole=p.role;
      const trulyDied=jgApplyDeath(p);
      const wbCharmNum2=jgCascadeWolfBeautyDeath(wasRole, trulyDied);
      jgCascadeDreamcatcherDeath(wasRole, trulyDied);
      { const loverDeadNum=jgCascadeLoverDeath(p.num, trulyDied);
        if(loverDeadNum){
          alert('💘 '+p.num+'號的情侶 '+loverDeadNum+'號 跟著殉情！（殉情不會觸發任何技能，即使殉情者是獵人／黑狼王等，也不能開槍帶人）\n\n法官口白：「'+p.num+'號、'+loverDeadNum+'號 淘汰。」');
        }
      }
      if(wbCharmNum2){
        jgRecord._chainShotWbCharmNote='（'+val+'狼美，魅惑對象'+wbCharmNum2+'一同出局）';
        alert('💋 '+val+'號是狼美人，魅惑對象一同殉情！\n\n法官口白：「'+val+'號、'+wbCharmNum2+'號 淘汰。」');
      }
    }
    if(chainRole==='luckyone'&&jgLuckyOne&&jgLuckyOne.gift==='hunter'&&jgLuckyOne.num===chainNum){
      jgLuckyOne.used=true;
    }
    if(chainNum){
      const wbNote2=jgRecord._chainShotWbCharmNote||'';
      jgRecord._chainShotWbCharmNote=null;
      if(chainOrigin==='night'){
        if(jgDawnDeaths[jgNight]){
          if(!jgDawnDeaths[jgNight].notes) jgDawnDeaths[jgNight].notes={};
          jgDawnDeaths[jgNight].notes[chainNum]=(jgDawnDeaths[jgNight].notes[chainNum]||'')
            +'（'+chainNum+abbr+'帶'+jgSwapDisplay(rawVal,val)+(guardBlocked?'，被守衛擋下':isEvilKnightImmune?'，惡靈騎士免疫':'')+'）'+wbNote2;
        }
      } else {
        jgAmendDayVoteLine(chainNum,abbr,jgSwapDisplay(rawVal,val)+wbNote2);
      }
    }
  }
  // 注意：跟 jgSaveDawnHunterShot 一樣，這個 checkWin 一定要跑在「不管有沒有開槍」的路徑上，
  // 避免法官選擇不開槍時漏掉「觸發這次連鎖開槍的那一刀，其實已經讓遊戲結束」的情況。
  jgRenderRoster();
  const win=jgCheckWin();
  if(win){jgShowWin(win);return;}
  // 若同一輪（例如獵人本身開一槍＋幸運兒獵槍再開一槍）還有排隊中、尚未處理的連鎖開槍對象，
  // 先接著處理完，不能漏掉
  const queue=pendingQueue;
  if(queue&&queue.length){
    const next=queue.shift();
    jgRecord._mechHunterChainNum=next.num;
    jgRecord._mechHunterChainRole=next.role;
    jgRecord._mechHunterChainNextStep=nextStep;
    jgRecord._mechHunterChainOrigin=chainOrigin;
    jgRecord._mechHunterChainQueue=queue;
    jgGoStep('mechhunter-chain-shot');
    return;
  }
  jgGoStep(nextStep);
}


// Lets the judge pick the player from a select (showing their name if the roster was set
// up in advance) instead of typing a bare number and re-typing the name each time.
// If the identity was already recorded up front (機械狼／黑市商人板 mech-assign page),
// show nothing here at all — the always-visible roster panel at the bottom of the screen
// already reminds the judge who's who, so a repeated summary box would just be clutter.
function jgSaveLuckyoneHunterShot(){
  const val=(document.getElementById('jg-luckyone-shot-rec')||{}).value?.trim()||'';
  let chainTarget=null;
  if(val){
    const p=jgFind(val);
    if(p&&p.alive){
      const wasRole=p.role;
      const trulyDied=jgApplyDeath(p);
      const wbCharmNum3=jgCascadeWolfBeautyDeath(wasRole, trulyDied);
      jgCascadeDreamcatcherDeath(wasRole, trulyDied);
      { const loverDeadNum=jgCascadeLoverDeath(p.num, trulyDied);
        if(loverDeadNum){
          alert('💘 '+p.num+'號的情侶 '+loverDeadNum+'號 跟著殉情！（殉情不會觸發任何技能，即使殉情者是獵人／黑狼王等，也不能開槍帶人）\n\n法官口白：「'+p.num+'號、'+loverDeadNum+'號 淘汰。」');
        }
      }
      let wbNote3='';
      if(wbCharmNum3){
        wbNote3='（'+val+'狼美，魅惑對象'+wbCharmNum3+'一同出局）';
        alert('💋 '+val+'號是狼美人，魅惑對象一同殉情！\n\n法官口白：「'+val+'號、'+wbCharmNum3+'號 淘汰。」');
      }
      jgAmendDayVoteLine(jgRecord._voteOutNum,'幸獵',val+wbNote3);
      const chainTag=trulyDied?jgHunterCapableTag(wasRole,p.num):null;
      if(chainTag){ chainTarget=p.num; jgRecord._mechHunterChainRole=chainTag; }
    }
  }
  jgRenderRoster();
  const win=jgCheckWin(); if(win){jgShowWin(win);return;}
  if(chainTarget){
    jgRecord._mechHunterChainNum=chainTarget;
    jgRecord._mechHunterChainNextStep='next-night';
    jgRecord._mechHunterChainOrigin='day';
    jgGoStep('mechhunter-chain-shot');
    return;
  }
  jgGoStep('next-night');
}

// How a player appears to a seer's investigation (good/wolf) — 狼弟 appears as 好人
// until 狼兄 has died and 狼弟 has had their awakening kill.
function jgLastWordsBtn(btn){
  const num=parseInt(btn.getAttribute('data-num'));
  const p=jgByNum(num);
  const name=p?p.num+'號 '+p.name:'死亡玩家';
  jgShowPg(`
    <h2>遺言</h2>
    <div class="speech">「<em>${name} 可以發表遺言。</em>」</div>
    <button class="primary" onclick="jgGoStep('discuss')">遺言結束，開始發言 →</button>
  `,'💬 遺言');
}

// ── 快速輸入投票：法官依序輸入每個「有投票權」玩家（死掉的人自動跳過、PK 回合排除候選人）
// 投給誰的號碼，可以直接連續輸入不用逗號分隔（也可以用逗號分隔），棄票打 n，套用後直接幫
// 下方按鈕勾好，法官確認沒問題再送出，不用逐一點按鈕；重新輸入、再按一次套用即可覆蓋。──
function jgVoteQuickInputHtml(){
  const voters=jgVoteVoters();
  if(voters.length===0) return '';
  return '<div class="card" style="margin:10px 0;padding:10px 14px;">'
    +'<label style="margin:0 0 4px;">⚡ 快速輸入投票（可連續輸入不用分隔，或用空白／逗號分隔，棄票打 n）</label>'
    +'<div style="font-size:11px;color:var(--text2);margin-bottom:6px;">依序對應：'+voters.join('、')+' 號（死亡玩家已自動跳過）</div>'
    +'<input type="text" id="jg-vote-quick" placeholder="例如：13n442 或 1 3 n 4 4 2" style="margin:0;">'
    +'<button class="primary" style="margin-top:8px;" onclick="jgApplyQuickVote()">套用到下方 →</button>'
    +'</div>';
}
function jgApplyQuickVote(){
  const input=document.getElementById('jg-vote-quick');
  if(!input) return;
  const voters=jgVoteVoters();
  const targets=new Set(jgVoteTargets());
  const tokens=jgParseQuickVoteTokens(input.value, voters.length, targets);
  if(!tokens||tokens.length!==voters.length){
    alert('⚠️ 看不懂這串輸入，請確認：\n· 總共要對應 '+voters.length+' 位投票玩家（'+voters.join('、')+'）\n· 號碼須為目前可投票的對象\n· 棄票打 n\n也可以改用空白或逗號分隔輸入，例如：3 5 n 2 或 3,5,n,2');
    return;
  }
  const newTally={};
  const newAbstain={};
  const errors=[];
  voters.forEach((voter,i)=>{
    const tok=(tokens[i]||'').trim();
    if(tok===''||tok.toLowerCase()==='n'||tok==='棄'){
      newAbstain[voter]=true;
    } else {
      const t=parseInt(tok,10);
      if(!Number.isFinite(t)||!targets.has(t)){
        errors.push(voter+'號→「'+tok+'」');
      } else {
        if(!newTally[t]) newTally[t]={};
        newTally[t][voter]=true;
      }
    }
  });
  if(errors.length>0){
    alert('⚠️ 以下輸入無法辨識，請確認號碼是否正確、是否為目前可投票的對象：\n'+errors.join('\n'));
    return;
  }
  jgVoteTally=newTally;
  jgAbstainVoters=newAbstain;
  jgRenderVoteTally();
}

// ── 投票計票：點選每個號碼下方投給他的人 ──
let jgVoteTally={}; // target num -> {voterNum: true}
let jgAbstainVoters={}; // voter num -> true（本輪棄票，不投給任何人）

// 平票 PK 期間，只有平票的候選人可以被投票；其餘所有活著的玩家才有投票權。
function jgVoteTargets(){
  // 傻瓜翻牌免於淘汰後，之後整局都不能再被投票放逐（只能靠夜晚的手段淘汰）——
  // 不管一般投票還是 PK 投票，他的號碼都不會再出現在可投的目標清單裡。
  const base=jgVotePkRound ? jgVotePkCandidates.slice() : jgAlive().map(p=>p.num);
  return base.filter(n=>{ const p=jgFind(n); return !(p&&p.foolRevealed); }).sort((a,b)=>a-b);
}
function jgVoteVoters(){
  // 傻瓜翻牌免於淘汰後，之後整局都只能發言、不能再參與投票（不管是一般投票還是 PK 投票）。
  const alive=jgAlive().filter(p=>!p.foolRevealed).map(p=>p.num);
  return (jgVotePkRound ? alive.filter(n=>!jgVotePkCandidates.includes(n)) : alive).sort((a,b)=>a-b);
}
// 警長在場時，警長自己那一票算 1.5 票；其餘每人 1 票。
function jgVoteWeight(voter){
  return (jgSheriff&&Number(voter)===jgSheriff)?1.5:1;
}

// 改成以「投票者」為主：一行一個投票玩家，點選他投給誰（或棄票），
// 比原本「被誰投」的目標分組畫面更直覺，法官照座位順序一路點下去就好。
function jgRenderVoteTally(){
  const box=document.getElementById('jg-vote-tally');
  if(!box) return;
  const targets=jgVoteTargets();
  const voters=jgVoteVoters();
  let html='';
  voters.forEach(voter=>{
    const votedFor=targets.find(t=>jgVoteTally[t]&&jgVoteTally[t][voter]);
    const abst=!!jgAbstainVoters[voter];
    html+='<div style="margin-bottom:10px;">'
      +'<div style="font-weight:700;font-size:13px;margin-bottom:4px;">'+voter+' 號 投給'+(jgSheriff&&Number(voter)===jgSheriff?' <span style="color:var(--gold);">🎖️(1.5票)</span>':'')+'</div>'
      +'<div style="display:flex;flex-wrap:wrap;gap:6px;">'
      +targets.map(target=>{
        const sel=votedFor===target;
        return '<button type="button" onclick="jgToggleVote('+target+','+voter+')" style="width:34px;height:34px;border-radius:50%;padding:0;font-size:12px;margin:0;'
          +(sel?'background:var(--danger,#c0392b);color:#fff;border-color:transparent;':'')
          +'">'+target+'</button>';
      }).join('')
      +'<button type="button" onclick="jgToggleAbstain('+voter+')" style="width:34px;height:34px;border-radius:50%;padding:0;font-size:11px;margin:0;'
        +(abst?'background:var(--text3,#888);color:#fff;border-color:transparent;':'')
        +'">棄票</button>'
      +'</div></div>';
  });
  box.innerHTML=html||'<div class="info" style="font-size:12px;">目前沒有可投票的玩家。</div>';
  jgUpdateVoteTallySummary();
}

function jgToggleVote(target,voter){
  const turningOn=!(jgVoteTally[target]&&jgVoteTally[target][voter]);
  if(turningOn){
    // Each voter may only vote for one target at a time — clear them from every other target first
    Object.keys(jgVoteTally).forEach(t=>{
      if(jgVoteTally[t]) delete jgVoteTally[t][voter];
    });
    if(!jgVoteTally[target]) jgVoteTally[target]={};
    jgVoteTally[target][voter]=true;
    delete jgAbstainVoters[voter]; // 投給人了，就不算棄票
  } else {
    if(jgVoteTally[target]) delete jgVoteTally[target][voter];
  }
  jgRenderVoteTally();
}

// 棄票跟投票互斥：點棄票就把這個人原本投給任何人的票清掉，再點一次取消棄票
function jgToggleAbstain(voter){
  if(jgAbstainVoters[voter]){
    delete jgAbstainVoters[voter];
  } else {
    jgAbstainVoters[voter]=true;
    Object.keys(jgVoteTally).forEach(t=>{
      if(jgVoteTally[t]) delete jgVoteTally[t][voter];
    });
  }
  jgRenderVoteTally();
}

function jgUpdateVoteTallySummary(){
  const box=document.getElementById('jg-vote-tally-summary');
  if(!box) return;
  const targets=jgVoteTargets();
  const fmt=w=>Number.isInteger(w)?String(w):w.toFixed(1);
  const counts=targets.map(t=>{
    const marks=jgVoteTally[t]||{};
    const voters=Object.keys(marks).filter(v=>marks[v]).map(Number);
    const weight=voters.reduce((s,v)=>s+jgVoteWeight(v),0);
    return {target:t,voters,weight};
  }).filter(e=>e.voters.length>0);
  const abstainCount=Object.values(jgAbstainVoters).filter(Boolean).length;
  if(counts.length===0){
    box.innerHTML=abstainCount>0?'<div style="font-size:13px;color:var(--text2);">棄票 '+abstainCount+' 人</div>':'';
    return;
  }
  counts.sort((a,b)=>b.weight-a.weight);
  const maxWeight=counts[0].weight;
  const top=counts.filter(e=>e.weight===maxWeight).map(e=>e.target);
  const summaryText=counts.map(e=>e.target+'號 '+fmt(e.weight)+'票').join('　')+(abstainCount>0?'　棄票 '+abstainCount+' 人':'');
  let extra;
  if(top.length===1){
    extra='<div class="info-success" style="margin-top:6px;font-size:13px;">目前最高票：'+top[0]+'號</div>';
  } else {
    extra='<div class="info-warn" style="margin-top:6px;font-size:13px;">平票：'+top.join('、')+'號，確認後將自動進入 PK</div>';
  }
  box.innerHTML='<div style="font-size:13px;">'+summaryText+'</div>'+extra;
}

function jgSaveVote(){ jgSaveVoteInner(); jgLiveSyncPush(); }
function jgSaveVoteInner(){
  const targets=jgVoteTargets();
  const voters=jgVoteVoters();
  const fmt=w=>Number.isInteger(w)?String(w):w.toFixed(1);
  const counts=targets.map(t=>{
    const marks=jgVoteTally[t]||{};
    const vs=Object.keys(marks).filter(v=>marks[v]).map(Number).sort((a,b)=>a-b);
    const weight=vs.reduce((s,v)=>s+jgVoteWeight(v),0);
    return {target:t,voters:vs,weight};
  });
  // 自動棄票：合格投票人裡，沒投給任何人、也沒手動點棄票的，確認時直接算棄票
  const votedSet=new Set();
  counts.forEach(c=>c.voters.forEach(v=>votedSet.add(v)));
  const explicitAbstain=Object.keys(jgAbstainVoters).filter(v=>jgAbstainVoters[v]).map(Number);
  const autoAbstain=voters.filter(v=>!votedSet.has(v)&&!explicitAbstain.includes(v));
  const abstainNums=[...new Set([...explicitAbstain,...autoAbstain])].sort((a,b)=>a-b);

  const maxWeight=Math.max(0,...counts.map(c=>c.weight));
  const top=counts.filter(c=>c.weight===maxWeight&&maxWeight>0).map(c=>c.target);
  // 唯一最高票、確定出局的那一行，票數後面直接加註「（X號出局）」，方便法官事後回頭對照文字紀錄，
  // 一眼就能看出這輪票是誰出局，不用自己再重新算一次最高票。平票／無人得票則不加註（沒人真的出局）。
  const soleOut=top.length===1?top[0]:null;

  const prefix=jgVotePkRound?'PK票':'票';
  const withVotes=counts.filter(c=>c.voters.length>0).sort((a,b)=>b.weight-a.weight||a.target-b.target);
  let voteLines=withVotes.map(c=>prefix+c.target+'：'+c.voters.join(',')+(c.weight!==c.voters.length?'（'+fmt(c.weight)+'票）':'')+(soleOut===c.target?' （'+c.target+'號出局）':''));
  if(abstainNums.length>0) voteLines.push((jgVotePkRound?'PK棄票':'棄票')+'：'+abstainNums.join(','));

  jgAbstainVoters={};

  if(top.length===0){
    // 無人得票（或全數棄票），無人出局
    voteLines.push('無人出局');
    jgDayLog[jgNight]=(jgDayLog[jgNight]||[]).concat(voteLines);
    jgVotePkRound=false; jgVotePkCandidates=[];
    jgGoStep('next-night');
    return;
  }
  if(top.length>1){
    if(jgVotePkRound){
      // PK 之後再度平票：無人出局
      voteLines.push('PK 後再度平票：'+top.join('、')+'號，無人出局');
      jgDayLog[jgNight]=(jgDayLog[jgNight]||[]).concat(voteLines);
      jgVotePkRound=false; jgVotePkCandidates=[];
      jgGoStep('next-night');
      return;
    }
    // 第一次平票：進入 PK，下一步只有平票玩家可被投票，其餘玩家重新投票
    // PK 發言順序：前一輪（今天的一般發言討論）越晚發言的人，PK 越早發言——取今天的完整發言順序，
    // 篩出平票的人，再整個反過來。
    {
      const prevOrder=jgDaySpeechOrderList(jgNight);
      jgVotePkOrder=prevOrder.filter(n=>top.includes(n)).reverse();
    }
    voteLines.push('平票：'+top.join('、')+'號，進入 PK（PK 發言順序：'+jgVotePkOrder.join('→')+'）');
    jgDayLog[jgNight]=(jgDayLog[jgNight]||[]).concat(voteLines);
    jgVotePkRound=true;
    jgVotePkCandidates=top;
    jgVoteTally={};
    alert('⚠️ 平票：'+top.join('、')+'號，進入 PK。PK 發言順序：'+jgVotePkOrder.join('→')+'（前一輪越晚發言者，PK 越早發言），請依序發言後再重新投票。');
    jgGoStep('vote');
    return;
  }
  // 唯一最高票，出局
  jgDayLog[jgNight]=(jgDayLog[jgNight]||[]).concat(voteLines);
  const val=String(top[0]);
  jgVotePkRound=false; jgVotePkCandidates=[];
  const found=jgFind(val);
  // 傻瓜被投出局：不再自動假設他一定會翻牌（真實桌上翻不翻牌是玩家自己的選擇，法官不該替他
  // 決定）——預設跟一般玩家一樣直接死亡，遺言頁面會有一個「已翻牌」的勾選框，法官照桌上實際
  // 情況勾選即可（見 jgToggleFoolReveal，會依「要不要追刀」規則決定勾選後死亡狀態怎麼變）。
  if(found){
    const eliminatedRole=found.role; // capture BEFORE any dual-identity card-swap
    const trulyDied=jgApplyDeath(found);
    jgRecord._voteOutTrulyDied=trulyDied;
    // 邱比特情侶殉情：被投票出局的人如果是情侶其中一人，另一人立刻跟著殉情
    { const loverDeadNum=jgCascadeLoverDeath(found.num, trulyDied);
      if(loverDeadNum){
        alert('💘 '+found.num+'號的情侶 '+loverDeadNum+'號 跟著殉情！（殉情不會觸發任何技能，即使殉情者是獵人／黑狼王等，也不能開槍帶人）\n\n法官口白：「'+found.num+'號、'+loverDeadNum+'號 淘汰。」');
      }
    }
    // Record wolfbeauty charm kill if wolfbeauty was voted out
    if(eliminatedRole==='wolfbeauty'&&jgRecord.wolfbeautyCharm){
      jgRecord._wolfbeautyKillCharm=jgRecord.wolfbeautyCharm;
    }
    // 血月使者特殊判斷必須搶在 jgCheckWin() 之前處理：如果她是最後一隻活著的狼被票出，
    // 她要「暫時存活」進入黑夜再殺一人，不能在這裡就被 jgCheckWin() 直接誤判成好人獲勝。
    if(eliminatedRole==='bloodmoon'&&trulyDied){
      const aliveWolves=jgAlive().filter(p=>WOLF_ROLES.includes(p.role));
      if(aliveWolves.length===0){
        jgRecord.bloodmoonSealNight=true;
        jgRenderRoster();
        jgGoStep('bloodmoon-last-night');
        return;
      }
    }
    jgRenderRoster();
    const winCheck=jgCheckWin();
    if(winCheck){jgShowWin(winCheck);return;}
    jgRecord._voteOutNum=found.num;
    jgLastVoteOutPlayer=found.num; // for gravkeeper（獨立變數，不會被夜晚重置的 jgRecord 清掉）
    if(eliminatedRole==='hunter'){
      jgRecord._hunterDoubleGun=!!(jgLuckyOne&&jgLuckyOne.gift==='hunter'&&!jgLuckyOne.used&&jgNight>=jgLuckyOne.startNight&&jgLuckyOne.num===found.num);
      jgGoStep('hunter-shot');return;
    }
    if(eliminatedRole==='mechanicalwolf'&&jgMechWolfHunterActive()){jgGoStep('hunter-shot');return;}
    if(jgLuckyOne&&jgLuckyOne.gift==='hunter'&&!jgLuckyOne.used&&found.num===jgLuckyOne.num&&jgNight>=jgLuckyOne.startNight){
      jgLuckyOne.used=true;
      jgGoStep('luckyone-hunter-shot');return;
    }
    if(eliminatedRole==='wolfking'){jgGoStep('wolfking-shot');return;}
    if(eliminatedRole==='mechanicalwolf'&&jgMechWolfWolfkingActive()){jgGoStep('wolfking-shot');return;}
    if(eliminatedRole==='wolfbeauty'&&jgRecord.wolfbeautyCharm){jgGoStep('wolfbeauty-charm-kill');return;}
    // 注意：白狼王被放逐（投票出局）不能帶人——白狼王的「帶人」只限自己白天主動自爆時發動，
    // 被票出局／被獵人開槍帶走都不行，所以這裡刻意不做任何 whitewolf 特殊處理，跟一般角色
    // 一樣直接走遺言／下一夜流程。（黑狼王被票出局可以帶人，見上面 wolfking 的處理。）
    // 雙身分模式：這只是換牌、不是真的離場，不用交代遺言，直接進入下一夜即可
    jgGoStep(trulyDied?'vote-last-words':'next-night');return;
  }
  jgGoStep('next-night');
}

function jgSaveWolfKingShot(){
  const val=(document.getElementById('jg-wolfking-shot-rec')||{}).value?.trim()||'';
  let chainTarget=null;
  if(val){
    const p=jgFind(val);
    if(p&&p.alive){
      const wasRole=p.role;
      const trulyDied=jgApplyDeath(p);
      const wbCharmNum4=jgCascadeWolfBeautyDeath(wasRole, trulyDied);
      jgCascadeDreamcatcherDeath(wasRole, trulyDied);
      { const loverDeadNum=jgCascadeLoverDeath(p.num, trulyDied);
        if(loverDeadNum){
          alert('💘 '+p.num+'號的情侶 '+loverDeadNum+'號 跟著殉情！（殉情不會觸發任何技能，即使殉情者是獵人／黑狼王等，也不能開槍帶人）\n\n法官口白：「'+p.num+'號、'+loverDeadNum+'號 淘汰。」');
        }
      }
      let wbNote4='';
      if(wbCharmNum4){
        wbNote4='（'+val+'狼美，魅惑對象'+wbCharmNum4+'一同出局）';
        alert('💋 '+val+'號是狼美人，魅惑對象一同殉情！\n\n法官口白：「'+val+'號、'+wbCharmNum4+'號 淘汰。」');
      }
      jgAmendDayVoteLine(jgRecord._voteOutNum,'王',val+wbNote4);
      { const chainTag=trulyDied?jgHunterCapableTag(wasRole,p.num):null;
        if(chainTag){ chainTarget=p.num; jgRecord._mechHunterChainRole=chainTag; } }
    }
  }
  // 不管有沒有開槍都要檢查一次：黑狼王被票出局如果剛好是場上最後一隻狼，就算選擇不開槍，
  // 「所有狼人已被淘汰」這個勝負條件也已經成立，不能因為沒開槍就漏掉這次判定。
  jgRenderRoster();
  const w=jgCheckWin();if(w){jgShowWin(w);return;}
  const nextStep=jgRecord._voteOutTrulyDied===false?'next-night':'vote-last-words';
  if(chainTarget){
    jgRecord._mechHunterChainNum=chainTarget;
    jgRecord._mechHunterChainNextStep=nextStep;
    jgRecord._mechHunterChainOrigin='day';
    jgGoStep('mechhunter-chain-shot');
    return;
  }
  jgGoStep(nextStep);
}

function jgSaveBloodMoonBlow(){
  const bm=jgPlayers.find(p=>p.role==='bloodmoon');
  if(bm&&bm.alive){jgApplyDeath(bm);jgPushDayLog(bm.num+'自爆');}
  jgRecord.bloodmoonSealNight=true;
  jgRenderRoster();
  const win=jgCheckWin(); if(win){jgShowWin(win);return;}
  jgGoStep('next-night');
}

function jgSaveWhiteWolfBlow(){
  const val=(document.getElementById('jg-whitewolf-blow-rec')||{}).value?.trim()||'';
  const ww=jgPlayers.find(p=>p.role==='whitewolf');
  if(ww&&ww.alive){jgApplyDeath(ww);}
  let broughtAlive=false;
  if(val){ const p=jgFind(val); if(p&&p.alive){jgApplyDeath(p);broughtAlive=true;} }
  if(ww) jgPushDayLog('自爆'+ww.num+(broughtAlive?'帶'+val:''));
  jgRenderRoster();
  const win=jgCheckWin(); if(win){jgShowWin(win);return;}
  // 白狼王自爆：直接天黑，無遺言
  jgGoStep('next-night');
}

// 一般狼人／黑狼王：發言階段主動自爆，直接淘汰自己，不能開槍帶人，跳過投票直接進入夜晚
function jgSaveWolfSelfBlow(){
  const val=(document.getElementById('jg-wolf-blow-rec')||{}).value?.trim()||'';
  if(!val){ alert('⚠️ 請選擇自爆的玩家號碼！'); return; }
  const p=jgFind(val);
  if(!p||!p.alive||!(p.role==='wolf'||p.role==='wolfking'||p.role==='bloodmoon'||p.role==='wolfbrother_y')){
    alert('⚠️ 這個號碼目前不是存活的狼人／黑狼王／血月使者／狼弟！');
    return;
  }
  // 血月使者的自爆有自己專屬的特殊規則（封印當晚神職技能、屠邊最後一擊等），
  // 併進這顆按鈕的選號只是共用入口，實際規則仍照血月使者專屬流程走。
  if(p.role==='bloodmoon'){ jgGoStep('bloodmoon-selfblow'); return; }
  jgApplyDeath(p);
  jgPushDayLog(p.num+'自爆');
  jgRenderRoster();
  const win=jgCheckWin(); if(win){jgShowWin(win);return;}
  // 自爆：不能開槍帶人，跳過投票，直接進入夜晚
  jgGoStep('next-night');
}

// 騎士決鬥：對方是狼→對方淘汰、直接進入黑夜；對方是好人→騎士淘汰、繼續發言與投票。
// 用 jgApplyDeath 直接淘汰，不經過投票出局那條路徑的各種連動判斷（開槍帶人／狼美人殉情等），
// 所以被決鬥出局的黑狼王／狼美人／白狼王自然不會發動技能。
function jgSaveKnightDuel(){
  const val=(document.getElementById('jg-knight-duel-rec')||{}).value?.trim()||'';
  if(!val){ alert('⚠️ 請選擇決鬥對象！'); return; }
  const target=jgFind(val);
  const knP=jgPlayers.find(p=>p.role==='knight');
  if(!target||!target.alive){ alert('⚠️ 找不到這個號碼，或對方已經出局！'); return; }
  const isWolf=WOLF_ROLES.includes(target.role);
  if(isWolf){
    jgApplyDeath(target);
    jgPushDayLog('決鬥'+(knP?knP.num:'x')+'→'+target.num+'（狼）'+target.num+'出局');
    jgRenderRoster();
    alert('⚔️ '+target.num+'號是狼人，'+target.num+'號淘汰');
    const win=jgCheckWin(); if(win){jgShowWin(win);return;}
    jgGoStep('next-night');
  } else {
    const knNum=knP?knP.num:null;
    if(knP) jgApplyDeath(knP);
    jgPushDayLog('決鬥'+(knNum||'x')+'→'+target.num+'（好人）'+(knNum||'x')+'出局');
    jgRenderRoster();
    alert('⚔️ '+target.num+'號是好人，騎士以死謝罪');
    const win=jgCheckWin(); if(win){jgShowWin(win);return;}
    jgGoStep('discuss');
  }
}

