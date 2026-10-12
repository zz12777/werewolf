'use strict';
// ═══════════════════════════════════════════
// js/room/roles-batch1.js
// 連線房間：第一批新增：狼美人、惡靈騎士、騎士、混血兒、唯鄰是從傀儡、邱比特勝負。
// 連線房間的程式拆成 js/room/ 底下好幾個一般 script 檔（依 index.html 的順序用 defer 載入，
// 共用同一個全域範圍，互相看得到彼此的變數與函式）；Firestore 函式由 js/firebase-init.js 提供。
// 檔案總覽見 js/room/core.js 開頭。
// ═══════════════════════════════════════════

// ══════════════════════════════════════════
// 連線房間第一批新增：狼美人（魅惑／殉情）、惡靈騎士（免疫與反傷）、騎士（白天決鬥）、
// 混血兒（第一夜選支持對象）、唯鄰是從（第一夜選傀儡），以及邱比特板的勝負判定。
// 規則都比照本機法官助手（js/night.js、js/day.js、js/core.js）。
// ══════════════════════════════════════════
function jgRoomIsPuppetBoard(){ return (jgRoomLatestRoomDoc||{}).boardPreset==='neighbor_puppet'; }
function jgRoomSeatOfUid(uid){ const p=jgRoomLatestPlayers.find(pp=>pp.uid===uid); return p?p.seatNum:null; }
function jgRoomUidOfSeat(seat){ const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===Number(seat)); return p?p.uid:null; }
// 全房的真實身分對照表 uid → role（secrets 全房可讀，見 jgRoomAssignRoles 的說明）。
async function jgRoomSecretsMap(){
  const db=window.jgFirebaseDb;
  const { getDocs } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js");
  const snap=await getDocs(collection(db,'rooms',jgRoomCode,'secrets'));
  const m={}; snap.docs.forEach(d=>{ m[d.id]=d.data().role; });
  return m;
}
async function jgRoomRoleOfUid(uid){
  if(!uid) return null;
  const db=window.jgFirebaseDb;
  const snap=await getDoc(doc(db,'rooms',jgRoomCode,'secrets',uid));
  return snap.exists()?snap.data().role:null;
}
async function jgRoomIsAliveUid(uid){
  if(!uid) return false;
  const db=window.jgFirebaseDb;
  const snap=await getDoc(doc(db,'rooms',jgRoomCode,'players',uid));
  return snap.exists()?(snap.data().alive!==false):false;
}
// 不能自刀的狼隊角色（狼美人、惡靈騎士、夢魘）：狼隊出刀時這些號碼不能選。
const JG_ROOM_NO_SELFKNIFE_ROLES=['wolfbeauty','evilknight','nightmare'];
async function jgRoomNoSelfKnifeSeats(){
  const m=await jgRoomSecretsMap();
  return Object.keys(m).filter(uid=>JG_ROOM_NO_SELFKNIFE_ROLES.includes(m[uid])).map(jgRoomSeatOfUid).filter(Boolean);
}
// 白天公開發生的事（騎士決鬥結果、狼美人殉情…）記在 dayLog/{night}.extraNotes，白天畫面
// 跟上帝視角都會顯示。
async function jgRoomAddDayNote(night, note){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode,'dayLog',String(night)),{ extraNotes: arrayUnion(note) },{ merge:true });
}

// ── 唯鄰是從：第一夜狼隊在出刀之前先選一位跟狼人相鄰（圓桌頭尾相連）、本身不是狼人的玩家
//    當傀儡。傀儡被預言家查驗為狼人；傀儡如果是預言家，查驗結果相反；傀儡是女巫、守衛，
//    技能照樣用掉但不生效；傀儡是獵人，死亡時不能開槍。──
function jgRoomPuppetCandidateSeats(wolfSeats){
  const total=jgRoomTotal||jgRoomLatestPlayers.length;
  const ws=new Set(wolfSeats.map(Number));
  const out=new Set();
  ws.forEach(w=>[w-1,w+1].forEach(n=>{ const seat=((n-1+total)%total)+1; if(!ws.has(seat)) out.add(seat); }));
  return [...out].sort((a,b)=>a-b);
}
async function jgRoomPuppetViewHtml(night){
  const m=await jgRoomSecretsMap();
  const wolfSeats=Object.keys(m).filter(uid=>typeof WOLF_ROLES!=='undefined'&&WOLF_ROLES.includes(m[uid])).map(jgRoomSeatOfUid).filter(Boolean);
  const cands=jgRoomPuppetCandidateSeats(wolfSeats);
  const disabled=jgRoomLatestPlayers.map(p=>p.seatNum).filter(s=>!cands.includes(s));
  return {needsTimer:true, html:jgRoomTimerHtml(30,'請選擇一位與狼人相鄰的玩家作為傀儡')
    +'<div class="nbanner" style="margin-top:20px;"><h1>請選擇傀儡</h1></div>'
    +'<div class="info" style="font-size:12px;text-align:center;">只能選狼人左右相鄰、且本身不是狼人的玩家（1號與最後一號也算相鄰），選好之後再選今晚要殺的對象</div>'
    +jgRoomNumGridHtml('jg-room-puppet-pick', null, disabled)
    +'<div style="text-align:center;"><button class="primary" style="margin-top:14px;" onclick="jgRoomPuppetPickFromGrid('+night+')">確認傀儡</button></div>'};
}
window.jgRoomPuppetPickFromGrid=async function(night){
  const hidden=document.getElementById('jg-room-puppet-pick');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  if(!confirm('確定要選 '+seatNum+'號 當傀儡嗎？')) return;
  const uid=jgRoomUidOfSeat(seatNum);
  if(!uid) return;
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{ puppetUid:uid, puppetSeatNum:seatNum, puppetNight:night },{ merge:true });
  await jgRoomAppendNightLog(night, '傀儡 '+seatNum);
  await jgRoomRefreshAndRenderCurrent();
};
function jgRoomPuppetUid(rd){ return jgRoomIsPuppetBoard()&&rd&&rd.puppetUid?rd.puppetUid:null; }

// ── 混血兒：第一夜選一位支持對象（不能選自己），之後沒有夜間動作；勝負跟隨支持對象。──
async function jgRoomHybridViewHtml(night){
  const rd=jgRoomLatestRoomDoc||{};
  if(jgRoomAmIFeared(rd,night)){
    return {needsTimer:false, html:jgRoomFearedNoticeHtml().html
      +'<div style="text-align:center;"><button class="primary" style="margin-top:14px;" onclick="jgRoomHybridSkip('+night+')">下一步 →</button></div>'};
  }
  if(rd.hybridTargetSeatNum){
    return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><h1>已選擇支持 '+rd.hybridTargetSeatNum+'號</h1></div>'
      +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">你的勝利條件跟這位玩家相同，請等待其他人完成夜晚行動</div>'};
  }
  return {needsTimer:true, html:jgRoomTimerHtml(20,'請選擇你要混的玩家')
    +'<div class="nbanner" style="margin-top:20px;"><h1>請選擇你要混的玩家</h1></div>'
    +'<div class="info" style="font-size:12px;text-align:center;">你的勝利條件會跟這位玩家相同（不能選自己）</div>'
    +jgRoomNumGridHtml('jg-room-hybrid-pick', null, [jgMySeatNum])
    +'<div style="text-align:center;"><button class="primary" style="margin-top:14px;" onclick="jgRoomHybridPickFromGrid('+night+')">確認</button></div>'};
}
window.jgRoomHybridPickFromGrid=async function(night){
  const hidden=document.getElementById('jg-room-hybrid-pick');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  if(!confirm('確定要混 '+seatNum+'號 嗎？')) return;
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{ hybridTargetUid:jgRoomUidOfSeat(seatNum), hybridTargetSeatNum:seatNum },{ merge:true });
  await jgRoomAppendNightLog(night, '混 '+seatNum);
  await jgRoomAdvanceToWolfOrBeyond('hybrid', night);
  await jgRoomRefreshAndRenderCurrent();
};
window.jgRoomHybridSkip=async function(night){
  await jgRoomAppendNightLog(night, '混 x');
  await jgRoomAdvanceToWolfOrBeyond('hybrid', night);
  await jgRoomRefreshAndRenderCurrent();
};

// ── 狼美人：狼隊決定刀口之後單獨睜眼魅惑一人（每晚必須魅惑，不能連續兩晚同一人、不能
//    魅惑自己）。狼美人被票出局、被開槍帶走、夜裡被毒死時，當晚（白天則是前一晚）魅惑的
//    對象殉情；被騎士決鬥出局則不會。──
async function jgRoomWolfbeautyViewHtml(night){
  const rd=jgRoomLatestRoomDoc||{};
  const me=jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid);
  const contBtn='<div style="text-align:center;"><button class="primary" style="margin-top:14px;" onclick="jgRoomWolfbeautyContinue('+night+')">下一步 →</button></div>';
  if(jgRoomAmIFeared(rd,night)) return {needsTimer:false, html:jgRoomFearedNoticeHtml().html+contBtn};
  if(me&&jgRoomIsPubliclyDead(me,rd)){
    return {needsTimer:true, html:jgRoomTimerHtml(20,'今晚要魅惑的對象是？')
      +'<div class="nbanner" style="margin-top:20px;"><h1>狼美人請睜眼</h1></div>'
      +'<div class="info-warn" style="text-align:center;">狼美人已出局，仍需走完流程</div>'+contBtn};
  }
  if(rd.wolfbeautyCharmNight===night&&rd.wolfbeautyCharmSeatNum){
    return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><h1>已魅惑 '+rd.wolfbeautyCharmSeatNum+'號</h1></div>'
      +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">請等待其他人完成夜晚行動</div>'};
  }
  const lastSeat=me&&me.lastCharmUid?jgRoomSeatOfUid(me.lastCharmUid):null;
  const disabled=[jgMySeatNum].concat(lastSeat?[lastSeat]:[]);
  return {needsTimer:true, html:jgRoomTimerHtml(20,'今晚要魅惑的對象是？')
    +'<div class="nbanner" style="margin-top:20px;"><h1>請選擇今晚要魅惑的對象</h1></div>'
    +'<div class="info" style="font-size:12px;text-align:center;">每晚必須魅惑一人；不能魅惑自己'+(lastSeat?'，也不能連續兩晚魅惑同一人（'+lastSeat+'號）':'')+'。你被票出局、被開槍帶走或夜裡被毒死時，魅惑對象會殉情</div>'
    +jgRoomNumGridHtml('jg-room-wolfbeauty-pick', null, disabled)
    +'<div style="text-align:center;"><button class="primary" style="margin-top:14px;" onclick="jgRoomWolfbeautyCharmFromGrid('+night+')">確認</button></div>'};
}
window.jgRoomWolfbeautyCharmFromGrid=async function(night){
  const hidden=document.getElementById('jg-room-wolfbeauty-pick');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  if(!confirm('確定要魅惑 '+seatNum+'號 嗎？')) return;
  const uid=jgRoomUidOfSeat(seatNum);
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  const effective=jgRoomEffectiveTarget(rd,night,uid);
  await setDoc(doc(db,'rooms',jgRoomCode),{ wolfbeautyCharmUid:effective, wolfbeautyCharmSeatNum:jgRoomSeatOfUid(effective)||seatNum, wolfbeautyCharmNight:night },{ merge:true });
  await setDoc(doc(db,'rooms',jgRoomCode,'players',window.jgFirebaseUid),{ lastCharmUid:uid },{ merge:true });
  await jgRoomAppendNightLog(night, '魅 '+seatNum);
  await jgRoomAfterWolfbeautyStep(night);
  await jgRoomRefreshAndRenderCurrent();
};
window.jgRoomWolfbeautyContinue=async function(night){
  await jgRoomAppendNightLog(night, '魅 x');
  await jgRoomAfterWolfbeautyStep(night);
  await jgRoomRefreshAndRenderCurrent();
};
// 狼美人殉情：deadUid 剛剛真的死亡、而且他是狼美人，就讓這一回合的魅惑對象一起死亡。
// diedNight：夜裡死亡要傳當晚夜數（死訊天亮才公布），白天公開死亡傳 null。回傳殉情者座位。
async function jgRoomWolfbeautyCascade(deadUid, diedNight){
  if(!deadUid) return null;
  if((await jgRoomRoleOfUid(deadUid))!=='wolfbeauty') return null;
  const db=window.jgFirebaseDb;
  const snap=await getDoc(doc(db,'rooms',jgRoomCode));
  const rd=snap.data()||{};
  const night=rd.night||1;
  if(!rd.wolfbeautyCharmUid||rd.wolfbeautyCharmNight!==night) return null;
  const target=rd.wolfbeautyCharmUid;
  if(!(await jgRoomIsAliveUid(target))) return null;
  await setDoc(doc(db,'rooms',jgRoomCode,'players',target),Object.assign({ alive:false, diedNight:diedNight||null }, diedNight?{}:{exiledByVote:true}),{ merge:true });
  await setDoc(doc(db,'rooms',jgRoomCode),{ wolfbeautyCascadeUid:target, wolfbeautyCascadeNight:night },{ merge:true });
  await jgRoomApplyCupidCascade();
  return jgRoomSeatOfUid(target);
}

// ── 惡靈騎士：夜間免疫狼刀、女巫毒與夜槍；被預言家查驗→預言家天亮死亡，被女巫毒→女巫
//    天亮死亡（反傷整局限一次）。不能自刀自爆。──
async function jgRoomEvilknightRevengeSeerApply(night){
  const db=window.jgFirebaseDb;
  const snap=await getDoc(doc(db,'rooms',jgRoomCode));
  const rd=snap.data()||{};
  if(rd.evilknightRevengeSeerNight!==night||rd.evilknightRevengeSeerApplied) return false;
  await setDoc(doc(db,'rooms',jgRoomCode),{ evilknightRevengeSeerApplied:true },{ merge:true });
  if(await jgRoomIsAliveUid(rd.evilknightRevengeSeerUid)){
    await setDoc(doc(db,'rooms',jgRoomCode,'players',rd.evilknightRevengeSeerUid),{ alive:false, diedNight:night },{ merge:true });
    await jgRoomApplyCupidCascade();
  }
  return true;
}

// ── 騎士：白天發言階段可以翻牌決鬥（整局一次）。對方是狼→對方淘汰、直接進入黑夜（沒有
//    遺言，被決鬥的黑狼王／狼美人／白狼王不會發動技能）；對方是好人→騎士以死謝罪，白天
//    繼續發言與投票。──
function jgRoomAppendKnightButton(){
  if(document.getElementById('jg-room-knight-btn')) return;
  const btn=document.createElement('button');
  btn.id='jg-room-knight-btn';
  btn.textContent='騎士決鬥';
  btn.onclick=function(){ window.jgRoomKnightDuelStart(); };
  btn.style.cssText='position:fixed;bottom:116px;left:8px;z-index:250;width:auto;margin:0;padding:8px 14px;border-radius:20px;font-size:12px;font-weight:700;border:1px solid var(--accent,#b83828);background:var(--accent,#b83828);color:#fff;box-shadow:0 1px 6px rgba(0,0,0,0.2);cursor:pointer;display:none;';
  document.body.appendChild(btn);
}
function jgRoomRemoveKnightButton(){ const b=document.getElementById('jg-room-knight-btn'); if(b) b.remove(); }
function jgRoomUpdateKnightButton(){
  const btn=document.getElementById('jg-room-knight-btn');
  if(!btn) return;
  const rd=jgRoomLatestRoomDoc||{};
  const me=jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid);
  const eligible=jgMyRole==='knight'&&me&&me.alive!==false&&!me.knightDuelUsed&&!rd.votingActive
    &&rd.phase==='day-open'&&!rd.gameOverWinner
    &&!(rd.pendingShootUids&&rd.pendingShootUids.length)
    &&!rd.pendingBadgeUid&&!rd.dayVoteLastWordsUid
    &&!(rd.dayVotePkPendingUids&&rd.dayVotePkPendingUids.length);
  btn.style.display=eligible?'block':'none';
}
window.jgRoomKnightDuelStart=function(){
  const root=document.getElementById('jg-room-content');
  if(!root) return;
  root.innerHTML='<div class="nbanner" style="margin-top:20px;"><h1>騎士決鬥</h1></div>'
    +'<div class="info-warn" style="text-align:center;">翻牌決鬥一名玩家（整局一次）：對方是狼人就淘汰並直接進入黑夜；對方是好人，騎士以死謝罪</div>'
    +jgRoomNumGridHtml('jg-room-knight-pick', null, [jgMySeatNum])
    +'<div style="text-align:center;margin-top:10px;"><button class="primary" onclick="jgRoomKnightDuelConfirm()">決鬥</button>'
    +' <button onclick="jgRoomRenderCurrentPhase()">取消</button></div>';
};
window.jgRoomKnightDuelConfirm=async function(){
  const hidden=document.getElementById('jg-room-knight-pick');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  if(!confirm('確定要跟 '+seatNum+'號 決鬥嗎？翻牌之後無法反悔。')) return;
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  const night=rd.night||1;
  const targetUid=jgRoomUidOfSeat(seatNum);
  const role=await jgRoomRoleOfUid(targetUid);
  const isWolf=typeof WOLF_ROLES!=='undefined'&&WOLF_ROLES.includes(role);
  await setDoc(doc(db,'rooms',jgRoomCode,'players',window.jgFirebaseUid),{ knightDuelUsed:true },{ merge:true });
  if(isWolf){
    await setDoc(doc(db,'rooms',jgRoomCode,'players',targetUid),{ alive:false, exiledByVote:true },{ merge:true });
    await jgRoomAddDayNote(night, '騎士'+jgMySeatNum+'號決鬥'+seatNum+'號：'+seatNum+'號是狼人，淘汰');
    await jgRoomApplyCupidCascade();
    if(await jgRoomCheckAndSetPendingBadge()){ await jgRoomRefreshAndRenderCurrent(); return; }
    if(await jgRoomMaybeDeclareWin()){ await jgRoomRefreshAndRenderCurrent(); return; }
    await jgRoomStartNextNight();
  } else {
    await setDoc(doc(db,'rooms',jgRoomCode,'players',window.jgFirebaseUid),{ alive:false, exiledByVote:true },{ merge:true });
    await jgRoomAddDayNote(night, '騎士'+jgMySeatNum+'號決鬥'+seatNum+'號：'+seatNum+'號是好人，騎士以死謝罪');
    await jgRoomApplyCupidCascade();
    // 騎士自己是警長的話先交接警徽；交接完白天繼續（見 jgRoomAfterBadgeResolved 的 knightDuelContinueDay）。
    if(await jgRoomCheckAndSetPendingBadge()) await setDoc(doc(db,'rooms',jgRoomCode),{ knightDuelContinueDay:true },{ merge:true });
    else await jgRoomMaybeDeclareWin();
  }
  await jgRoomRefreshAndRenderCurrent();
};

// 邱比特板勝負（人狼鏈第三方、狼狼鏈邱比特算狼）已經併進共用規則 js/game-rules.js。
