'use strict';
// ═══════════════════════════════════════════
// js/room/win.js
// 連線房間：勝負自動判定（jgRoomComputeWinCheck／jgRoomMaybeDeclareWin）。
// 連線房間的程式拆成 js/room/ 底下好幾個一般 script 檔（依 index.html 的順序用 defer 載入，
// 共用同一個全域範圍，互相看得到彼此的變數與函式）；Firestore 函式由 js/firebase-init.js 提供。
// 檔案總覽見 js/room/core.js 開頭。
// ═══════════════════════════════════════════

// ═══════════════════════════════════════════
// 連線房間勝負自動判定。規則本身跟法官助手共用 js/game-rules.js（JG_RULES），這裡只負責
// 把房間的 Firestore 資料整理成規則要的「局面」格式（jgRoomBuildRulesState），再丟進去判定，
// 兩邊判定結果一定一致。
// 板子只要出現支援清單以外的角色，就整個不判定（回傳 null），讓房主照舊自己宣布，不會誤判。
// ═══════════════════════════════════════════
const JG_ROOM_WIN_CHECK_SUPPORTED_ROLES=new Set([
  'villager','wolf','wolfking','whitewolf','seer','witch','hunter','guard',
  'mechanicalwolf','medium','dreamcatcher','nightmare',
  'blackmarket','wolfbrother_e','wolfbrother_y','magician',
  'bloodmoon','demonhunter',
  // 第一批新增：狼美人+騎士、惡靈騎士+守衛、混血兒+黑/白狼王+血月、邱比特、唯鄰是從。
  'wolfbeauty','knight','evilknight','hybrid','cupid'
]);
// 讀 Firestore 最新資料，組成 JG_RULES 吃的局面。板子不在支援範圍回傳 null。
// 回傳 {st, rd}：st 是局面（玩家 id 用 uid），rd 是房間文件最新內容。
async function jgRoomBuildRulesState(){
  const db=window.jgFirebaseDb;
  if(!jgRoomComp) return null;
  const compRoles=Object.keys(jgRoomComp).filter(r=>(jgRoomComp[r]||0)>0);
  if(compRoles.some(r=>!JG_ROOM_WIN_CHECK_SUPPORTED_ROLES.has(r))) return null;
  const { getDocs } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js");
  const secretsSnap=await getDocs(collection(db,'rooms',jgRoomCode,'secrets'));
  const roleByUid={}; secretsSnap.docs.forEach(d=>{ roleByUid[d.id]=d.data().role; });
  const roomSnap=await getDoc(doc(db,'rooms',jgRoomCode));
  const rd=roomSnap.exists()?roomSnap.data():{};
  const puppetUid=(rd.boardPreset==='neighbor_puppet'&&rd.puppetUid)?rd.puppetUid:null;
  // 存活狀態逐一重新讀最新的 players/{uid} 文件，不要信任 jgRoomLatestPlayers 這份畫面快取
  // ——這個函式常常緊接在剛寫入 alive:false 之後就呼叫，即時監聽器可能還沒同步回最新狀態。
  // 讀不到文件就退回畫面快取本身的值（不直接當成還活著，避免誤判）。
  const players=[];
  for(const p of jgRoomLatestPlayers){
    const pSnap=await getDoc(doc(db,'rooms',jgRoomCode,'players',p.uid));
    const f=pSnap.exists()?pSnap.data():p;
    players.push({ id:p.uid, role:roleByUid[p.uid]||'villager', alive:f.alive!==false,
      puppet:p.uid===puppetUid,
      witchSaveUsed:!!f.witchSaveUsed, witchPoisonUsed:!!f.witchPoisonUsed,
      knightDuelUsed:!!f.knightDuelUsed,
      // 黑市商人交易出來、拿到女巫毒藥的幸運兒，毒藥還沒用掉一樣算「還有翻盤機會」。
      luckyWitchUnused:f.luckyOneSkill==='witch'&&!f.luckyOneWitchUsed });
  }
  const lovers=(rd.cupidLoverAUid&&rd.cupidLoverBUid)?[rd.cupidLoverAUid, rd.cupidLoverBUid]:null;
  return { rd, st:{ players, comp:jgRoomComp, lovers, windspy:false, hybridTarget:null, foolChase:false, dualMode:false } };
}
// 今晚被好人技能殺掉的狼（女巫毒、幸運兒的毒、獵魔人），給「狼刀在先」用。
function jgRoomGoodKilledWolvesTonight(st, rd){
  const night=rd.night||1;
  const ids=[];
  const deadWolf=uid=>{ const p=st.players.find(x=>x.id===uid); return p&&!p.alive&&JG_RULES.isWolfForWin(st,p); };
  if(rd.witchPoisonUid&&rd.witchPoisonNight===night&&deadWolf(rd.witchPoisonUid)) ids.push(rd.witchPoisonUid);
  if(rd.demonhunterHuntNight===night&&rd.demonhunterHuntIsWolf&&deadWolf(rd.demonhunterHuntTargetUid)) ids.push(rd.demonhunterHuntTargetUid);
  return ids;
}
async function jgRoomComputeWinCheck(){
  const built=await jgRoomBuildRulesState();
  if(!built) return null;
  const {st, rd}=built;
  const isNight=rd.phase==='night';
  // 狼刀在先：今晚狼刀已經屠邊，就算同一晚女巫毒死／獵魔人獵死最後一狼，仍然是狼人獲勝。
  if(isNight){
    const wf=JG_RULES.wolfFirstWin(st, jgRoomGoodKilledWolvesTonight(st, rd));
    if(wf) return wf;
  }
  const res=JG_RULES.checkWin(st);
  // 獵魔人今晚還沒行動（排在查驗類角色之後、天亮之前）：狼人只是人數達標、還沒屠邊的話，
  // 先不判定，等獵魔人狩獵完再看（他可能獵死一隻狼）。
  if(res&&res.winner==='wolf'&&isNight&&rd.currentStep!=='demonhunter'
    &&jgRoomDemonhunterPending(rd.night||1)
    &&st.players.some(p=>p.role==='demonhunter'&&p.alive)
    &&!JG_RULES.isSlaughter(st)) return null;
  return res;
}
// 白天結束、準備進入黑夜時：不管狼人刀哪一位好人都會贏，就不用再走一次夜晚，直接判定
// 狼人獲勝（跟法官助手同一條規則，見 JG_RULES.guaranteedNightWin）。
async function jgRoomComputeGuaranteedNightWin(){
  const built=await jgRoomBuildRulesState();
  if(!built) return null;
  const res=JG_RULES.checkWin(built.st);
  if(res) return res;
  return JG_RULES.guaranteedNightWin(built.st);
}
// 呼叫端在「這一輪死亡結算已經全部塵埃落定」的幾個關卡點呼叫這個函式：算出勝負就把
// gameOverWinner／gameOverMsg 寫進房間文件（讓所有人的畫面自動切去 jgRoomRenderGameOverPhase）
// 並回傳 true；沒有分出勝負（或板子不在支援範圍）就回傳 false，呼叫端照原本流程繼續走。
// guaranteedNight:true 是進入黑夜前用的（多判一條「狼人怎麼刀都贏」）。
async function jgRoomMaybeDeclareWin(opts){
  const db=window.jgFirebaseDb;
  const roomSnap=await getDoc(doc(db,'rooms',jgRoomCode));
  const rd=roomSnap.data()||{};
  if(rd.gameOverWinner) return true; // 已經判定過了，不要重複判定/覆寫
  const res=(opts&&opts.guaranteedNight)?await jgRoomComputeGuaranteedNightWin():await jgRoomComputeWinCheck();
  if(!res) return false;
  await setDoc(doc(db,'rooms',jgRoomCode),{ gameOverWinner:res.winner, gameOverMsg:res.msg },{ merge:true });
  return true;
}
