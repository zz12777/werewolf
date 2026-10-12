'use strict';
// ═══════════════════════════════════════════
// js/room/win.js
// 連線房間：勝負自動判定（jgRoomComputeWinCheck／jgRoomMaybeDeclareWin）。
// 連線房間的程式拆成 js/room/ 底下好幾個一般 script 檔（依 index.html 的順序用 defer 載入，
// 共用同一個全域範圍，互相看得到彼此的變數與函式）；Firestore 函式由 js/firebase-init.js 提供。
// 檔案總覽見 js/room/core.js 開頭。
// ═══════════════════════════════════════════

// ═══════════════════════════════════════════
// 連線房間勝負自動判定：目前只給「機械狼＋通靈師」「攝夢人＋夢魘」這兩個已經全自動的
// 板子使用（房主建立房間時鎖定的板子只要不含這兩個板子以外的角色，這裡的邏輯就完全
// 適用；其餘板子——魔術師/黑市商人/邱比特那三個目前全自動板子，以及所有手機發牌板子
// ——jgRoomComp 裡會出現這裡沒處理到的角色，直接讓 jgRoomMaybeDeclareWin 判斷「板子
// 不在支援範圍」就跳過，不會誤判）。判定邏輯照抄本機法官助手 jgCheckWinNormal()：
//   ‧ 狼人全滅 → 好人贏
//   ‧ 機械狼板：狼隊跟真正的狼人互不相認、憑人數優勢不算數，一定要屠民或屠神才算贏
//   ‧ 其餘情況（目前只剩攝夢人板）：攝夢人本身就是「主動翻盤」的活棋（連續兩晚鎖同一人
//     就能弄死狼隊），人數打平時還不能篤定狼贏，狼隊人數要「嚴格多於」好人才算贏；
//     女巫如果還有解藥或毒藥沒用完，一樣算「還有翻盤機會」
//   ‧ 屠民（好人裡的平民死光，但神職還有人活著）→ 狼贏
//   ‧ 屠神（好人裡的神職死光，但平民還有人活著）→ 狼贏
// 支援範圍以外的角色一律讓這個函式直接回傳 null（不判定），呼叫端看到 null 就什麼都不做，
// 不會影響其餘板子原本「勝負由法官／房主自己看場上情況宣布」的既有行為。
const JG_ROOM_WIN_CHECK_SUPPORTED_ROLES=new Set([
  'villager','wolf','wolfking','whitewolf','seer','witch','hunter','guard',
  'mechanicalwolf','medium','dreamcatcher','nightmare',
  'blackmarket','wolfbrother_e','wolfbrother_y','magician',
  'bloodmoon','demonhunter',
  // 第一批新增：狼美人+騎士、惡靈騎士+守衛、混血兒+黑/白狼王+血月、邱比特、唯鄰是從。
  'wolfbeauty','knight','evilknight','hybrid','cupid'
]);
function jgRoomAllGodsForWin(){
  // 跟本機法官助手 jgAllGodsForWin() 一樣的「屠神」神職清單，這裡先只列出這些支援板子
  // 可能出現的神職（seer/witch/hunter/guard/dreamcatcher/medium/blackmarket/magician），
  // 其餘神職角色一律不在 JG_ROOM_WIN_CHECK_SUPPORTED_ROLES 裡，根本不會走到這裡——狼兄
  // 狼弟、黑狼王、白狼王是狼隊，不算「神職」，不放進這份清單（跟本機法官助手
  // jgAllGodsForWin() 一致）。魔術師雖然只是換號碼、不算查驗/救人這種主動反殺技能，但
  // 本機法官助手的規則裡他仍然算「神」（不是「民」）——加進這份清單，不然屠民/屠神判斷
  // 會把還活著的魔術師誤算成兩邊都不是，可能提前誤判成屠民。
  // 所有神職都列進來（跟本機法官助手 jgAllGodsForWin 一致；傻瓜另外處理，這裡不算）。
  return ['seer','witch','hunter','guard','dreamcatcher','knight','magician','demonhunter','gravkeeper','medium','blackmarket','purewhitemaiden','dancer','littlegirl','diviner','trickmage','sequenceprince','bear','foxcub','pufferfish','whitecat'];
}
async function jgRoomComputeWinCheck(){
  const db=window.jgFirebaseDb;
  if(!jgRoomComp) return null;
  // 板子角色只要出現任何一個不在支援清單裡的角色（例如魔術師、黑市商人、邱比特、盜賊…），
  // 這個板子就不在這次先做的範圍內，直接不判定，讓法官／房主照舊自己宣布。
  const compRoles=Object.keys(jgRoomComp).filter(r=>(jgRoomComp[r]||0)>0);
  if(compRoles.some(r=>!JG_ROOM_WIN_CHECK_SUPPORTED_ROLES.has(r))) return null;
  const { getDocs } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js");
  const secretsSnap=await getDocs(collection(db,'rooms',jgRoomCode,'secrets'));
  const roleByUid={}; secretsSnap.docs.forEach(d=>{ roleByUid[d.id]=d.data().role; });
  // 存活狀態逐一重新讀最新的 players/{uid} 文件，不要信任 jgRoomLatestPlayers 這份畫面快取
  // ——這個函式常常緊接在剛寫入 alive:false 之後就呼叫，即時監聽器可能還沒同步回最新狀態
  // （跟 jgRoomCheckAndSetPendingBadge 是同一個道理）；uid／座位清單本身板子人數固定不會
  // 中途變動，用 jgRoomLatestPlayers 取就好，只有 alive 這個欄位需要重新讀。
  const players=[];
  for(const p of jgRoomLatestPlayers){
    const pSnap=await getDoc(doc(db,'rooms',jgRoomCode,'players',p.uid));
    // 讀不到文件（理論上正式環境不會發生，但保留這個備援）就退回畫面快取本身的 alive 值，
    // 不要直接當成「還活著」——這樣比較安全，不會因為讀取失敗而誤判一個已經死亡的玩家
    // 還活著、進而影響勝負判定。
    const fresh=pSnap.exists()?pSnap.data():null;
    const alive=fresh?(fresh.alive!==false):(p.alive!==false);
    players.push({ uid:p.uid, alive,
      knightDuelUsed: fresh?fresh.knightDuelUsed:p.knightDuelUsed,
      witchSaveUsed: fresh?fresh.witchSaveUsed:p.witchSaveUsed, witchPoisonUsed: fresh?fresh.witchPoisonUsed:p.witchPoisonUsed,
      luckyOneSkill: fresh?fresh.luckyOneSkill:p.luckyOneSkill, luckyOneWitchUsed: fresh?fresh.luckyOneWitchUsed:p.luckyOneWitchUsed });
  }
  const alive=players.filter(p=>p.alive!==false);
  // 邱比特：人狼鏈時邱比特＋情侶是第三方（比照本機 jgCheckWinThirdParty）；狼狼鏈時邱比特
  // 算狼人陣營；人人鏈照一般規則。
  const roomSnapW=await getDoc(doc(db,'rooms',jgRoomCode));
  const rdW=roomSnapW.exists()?roomSnapW.data():{};
  const pairType=jgRoomLoverPairType(roleByUid, rdW);
  const cupidUid=Object.keys(roleByUid).find(u=>roleByUid[u]==='cupid')||null;
  if(pairType==='third'){
    const tp=new Set([rdW.cupidLoverAUid, rdW.cupidLoverBUid].concat(cupidUid?[cupidUid]:[]));
    const tpAlive=alive.filter(p=>tp.has(p.uid));
    if(tpAlive.length>0){
      const others=alive.filter(p=>!tp.has(p.uid));
      if(others.length===0) return {winner:'third', msg:'邱比特與情侶（第三方陣營）已將其餘玩家屠光'};
      if(tpAlive.length===3&&tpAlive.length>others.length) return {winner:'third', msg:'第三方陣營（邱比特／情侶）存活人數多於其餘玩家，直接判定第三方獲勝'};
      if((tpAlive.length===1||tpAlive.length===2)&&tpAlive.length>=others.length) return {winner:'third', msg:'第三方陣營（邱比特／情侶）存活人數與其餘玩家打平或更多，直接判定第三方獲勝'};
      return null;
    }
  }
  const isWolf=(p)=>(typeof WOLF_ROLES!=='undefined'&&WOLF_ROLES.includes(roleByUid[p.uid]))||(pairType==='wolf'&&p.uid===cupidUid);
  const aw=alive.filter(isWolf);
  const ag=alive.filter(p=>!isWolf(p));
  if(aw.length===0) return {winner:'good', msg:'所有狼人已被淘汰'};
  const hasMechWolfBoard=(jgRoomComp.mechanicalwolf||0)>0;
  if(!hasMechWolfBoard){
    const hasComebackThreat=ag.some(p=>{
      const r=roleByUid[p.uid];
      if(r==='witch') return !p.witchSaveUsed||!p.witchPoisonUsed;
      if(r==='dreamcatcher') return true;
      if(r==='knight') return !p.knightDuelUsed; // 騎士還沒決鬥：白天隨時能翻牌，人數打平還不能篤定狼贏
      // 黑市商人交易出來、拿到女巫毒藥技能的幸運兒，只要毒藥還沒用掉，一樣算「還有翻盤
      // 機會」——跟真女巫的判斷邏輯一致，不能因為他底層角色只是平民/其他角色，就漏算
      // 這個還握在手上的反殺機會。
      if(p.luckyOneSkill==='witch') return !p.luckyOneWitchUsed;
      return false;
    });
    if(hasComebackThreat){
      if(aw.length>ag.length) return {winner:'wolf', msg:'狼人人數已達多數'};
    } else if(aw.length>=ag.length) return {winner:'wolf', msg:'狼人人數已達多數'};
  }
  const allGods=jgRoomAllGodsForWin();
  const aGod=ag.filter(p=>allGods.includes(roleByUid[p.uid]));
  // 混血兒、邱比特在屠民判定上視為平民（比照本機 jgCheckWinNormal）。
  const aVil=ag.filter(p=>['villager','hybrid','cupid'].includes(roleByUid[p.uid]));
  if(aVil.length===0&&aGod.length>0) return {winner:'wolf', msg:'所有平民已被淘汰'};
  if(aGod.length===0&&aVil.length>0) return {winner:'wolf', msg:'所有神職已被淘汰'};
  return null;
}
// 呼叫端在「這一輪死亡結算已經全部塵埃落定」的幾個關卡點呼叫這個函式：算出勝負就把
// gameOverWinner／gameOverMsg 寫進房間文件（讓所有人的畫面自動切去 jgRoomRenderGameOverPhase）
// 並回傳 true；沒有分出勝負（或板子不在支援範圍）就回傳 false，呼叫端照原本流程繼續走。
async function jgRoomMaybeDeclareWin(){
  const db=window.jgFirebaseDb;
  const roomSnap=await getDoc(doc(db,'rooms',jgRoomCode));
  const rd=roomSnap.data()||{};
  if(rd.gameOverWinner) return true; // 已經判定過了，不要重複判定/覆寫
  const res=await jgRoomComputeWinCheck();
  if(!res) return false;
  await setDoc(doc(db,'rooms',jgRoomCode),{ gameOverWinner:res.winner, gameOverMsg:res.msg },{ merge:true });
  return true;
}
