'use strict';
// ═══════════════════════════════════════════
// js/room/night-shell.js
// 連線房間：夜晚畫面總機（依 currentStep 分派給各角色畫面）、房主強制推進、預言家、通靈師、獵魔人。
// 連線房間的程式拆成 js/room/ 底下好幾個一般 script 檔（依 index.html 的順序用 defer 載入，
// 共用同一個全域範圍，互相看得到彼此的變數與函式）；Firestore 函式由 js/firebase-init.js 提供。
// 檔案總覽見 js/room/core.js 開頭。
// ═══════════════════════════════════════════

// ── 夜晚畫面：目前做了預言家（查陣營）跟通靈師（查真實身分）兩個角色當示範，展示同一份
//    secrets 資料可以給「只查陣營」跟「查真實身分」兩種不同查驗角色共用。是該角色的人會
//    看到選人查驗的介面，其他人一律看到「夜晚進行中，請安靜等待」，不會透露現在輪到誰。──
async function jgRoomRenderNightShell(){
  const root=document.getElementById('jg-room-content');
  if(!root) return;
  const night=(jgRoomLatestRoomDoc&&jgRoomLatestRoomDoc.night)||1;
  const currentStep=jgRoomLatestRoomDoc&&jgRoomLatestRoomDoc.currentStep;
  const rd=jgRoomLatestRoomDoc||{};
  let bodyHtml, needsTimer=false;
  // 邱比特配對結果的「情侶互相確認」卡片優先權最高——不管現在夜晚走到哪一步，只要我是
  // 配對到的其中一位、而且還沒按過確認，就會先看到這張卡片，蓋住原本這一步該看到的畫面。
  const cupidReveal=jgRoomCupidRevealHtml(rd, night);
  if(cupidReveal){
    bodyHtml=cupidReveal.html; needsTimer=cupidReveal.needsTimer;
  } else if(currentStep==='thief'&&jgMyRole==='thief'){
    const r=jgRoomThiefViewHtml(rd, night); bodyHtml=r.html; needsTimer=r.needsTimer;
  } else if(currentStep==='cupid'&&jgMyRole==='cupid'){
    const r=await jgRoomCupidViewHtml(night); bodyHtml=r?r.html:''; needsTimer=r?r.needsTimer:false;
  } else if(currentStep==='nightmare'&&jgMyRole==='nightmare'){
    const r=await jgRoomNightmareViewHtml(night); bodyHtml=r.html; needsTimer=r.needsTimer;
  } else if(currentStep==='magician'&&jgMyRole==='magician'){
    const r=await jgRoomMagicianViewHtml(night); bodyHtml=r.html; needsTimer=r.needsTimer;
  } else if(currentStep==='guard'&&jgMyRole==='guard'){
    const r=await jgRoomGuardViewHtml(night); bodyHtml=r.html; needsTimer=r.needsTimer;
  } else if(currentStep==='dreamcatcher'&&jgMyRole==='dreamcatcher'){
    const r=await jgRoomDreamcatcherViewHtml(night); bodyHtml=r.html; needsTimer=r.needsTimer;
  } else if(currentStep==='hybrid'&&jgMyRole==='hybrid'){
    const r=await jgRoomHybridViewHtml(night); bodyHtml=r.html; needsTimer=r.needsTimer;
  } else if(currentStep==='wolfbeauty'&&jgMyRole==='wolfbeauty'){
    const r=await jgRoomWolfbeautyViewHtml(night); bodyHtml=r.html; needsTimer=r.needsTimer;
  } else if(currentStep==='wolfbrother'&&(jgMyRole==='wolfbrother_e'||jgMyRole==='wolfbrother_y')){
    const r=await jgRoomWolfbrotherViewHtml(night); bodyHtml=r.html; needsTimer=r.needsTimer;
  } else if(currentStep==='mechwolf'&&jgMyRole==='mechanicalwolf'){
    const r=await jgRoomMechWolfViewHtml(night); bodyHtml=r.html; needsTimer=r.needsTimer;
  } else if(currentStep==='wolf'&&typeof WOLF_ROLES!=='undefined'&&WOLF_ROLES.includes(jgMyRole)&&jgMyRole!=='nightmare'&&jgMyRole!=='mechanicalwolf'
    &&!(jgMyRole==='wolfbrother_y'&&!jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid&&p.wolfbrotherJoinedPack))
    // 這個判斷式原本沒檢查自己是不是還活著——狼白天被投票放逐、已經死亡之後，隔天晚上
    // 這個角色本身的判斷式還是符合（身分還是狼），會讓死掉的狼繼續看到「選擇今晚要殺的
    // 對象」選人畫面。加上「自己還活著」這個條件，死掉的狼落到最下面的 else，跟其他死掉
    // 的非特殊角色一樣看到「夜晚進行中，請安靜閉眼等待」，不會顯示夜間互動畫面
    // （jgRoomGetWolfUids 本來就已經濾掉死狼、只算活著的隊友，這裡只是補上畫面本身的門檻）。
    &&jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid&&p.alive!==false)){
    // 已經確認先前卡住的根本原因是 Firestore 安全規則擋住了好幾個子集合的寫入（不是這裡
    // 的多人同步邏輯本身），規則調整過後恢復成每一位見面狼隊友都能操作的畫面。
    const r=await jgRoomWolfViewHtml(night); bodyHtml=r.html; needsTimer=r.needsTimer;
  } else if(currentStep==='blackmarket'&&jgMyRole==='blackmarket'){
    const r=await jgRoomBlackmarketViewHtml(night); bodyHtml=r.html; needsTimer=r.needsTimer;
  } else if(currentStep==='witch'&&jgMyRole==='witch'){
    const r=await jgRoomWitchViewHtml(night); bodyHtml=r.html; needsTimer=r.needsTimer;
  } else if(currentStep==='witch'&&jgRoomMyActiveLuckyOneSkill(night)==='witch'){
    const r=await jgRoomLuckyOneWitchViewHtml(night); bodyHtml=r.html; needsTimer=r.needsTimer;
  } else if(jgMyRole==='seer'&&currentStep==='seer'){
    const r=await jgRoomSeerViewHtml(night); bodyHtml=r.html; needsTimer=r.needsTimer;
  } else if(currentStep==='seer'&&jgRoomMyActiveLuckyOneSkill(night)==='seer'){
    const r=await jgRoomSeerViewHtml(night); bodyHtml=r.html; needsTimer=r.needsTimer;
  } else if(currentStep==='shoot'&&(rd.pendingShootUids||[]).includes(window.jgFirebaseUid)){
    const r=await jgRoomShootViewHtml(night); bodyHtml=r.html; needsTimer=r.needsTimer;
  } else if(currentStep==='badge'&&rd.pendingBadgeUid===window.jgFirebaseUid){
    const r=jgRoomBadgeViewHtml(); bodyHtml=r.html; needsTimer=r.needsTimer;
  } else if(jgMyRole==='medium'&&currentStep==='medium'){
    const r=await jgRoomMediumViewHtml(night); bodyHtml=r.html; needsTimer=r.needsTimer;
  } else if(jgMyRole==='hunter'&&currentStep==='hunter'){
    const r=await jgRoomHunterViewHtml(night); bodyHtml=r.html; needsTimer=r.needsTimer;
  } else if(jgMyRole==='demonhunter'&&currentStep==='demonhunter'){
    const r=await jgRoomDemonhunterViewHtml(night); bodyHtml=r.html; needsTimer=r.needsTimer;
  } else if(currentStep==='bloodmoonlaststand'){
    // 這一晚是全房公開的（不是角色機密），所有人都看得到同一份畫面——不像其餘步驟要
    // 用 jgMyRole 篩選誰看得到操作介面，這裡由 jgRoomBloodmoonLastStandViewHtml 自己
    // 依「我是不是血月使者本人」分成操作畫面／安靜等待畫面兩種。
    const r=await jgRoomBloodmoonLastStandViewHtml(night); bodyHtml=r.html; needsTimer=r.needsTimer;
  } else {
    jgRoomStopTimer();
    bodyHtml='<div class="nbanner nbanner-night" style="margin-top:20px;"><h1>夜晚進行中</h1>'
      +'<p class="sub" style="text-align:center;margin-top:8px;">請安靜閉眼等待，輪到你操作時畫面會自動出現</p></div>';
  }
  const hostAdvanceHtml=jgRoomIsHost?jgRoomHostAdvanceHtml(currentStep, night):'';
  root.innerHTML=`<div class="section-title">第 ${night} 夜</div>${bodyHtml}${hostAdvanceHtml}`;
  // 狼人睜眼出刀維持 30 秒（隊友要互相商量，時間比較緊繃），其餘所有夜晚步驟都是 20 秒——
  // 這裡要跟每個步驟自己 HTML 裡用 jgRoomTimerHtml() 顯示出來的秒數對應一致，不然畫面上
  // 寫「倒數20秒」但計時器實際上跑30秒才會觸發自動跳下一步，會對不起來。
  const timerSeconds=(currentStep==='wolf'||currentStep==='bloodmoonlaststand')?30:20;
  if(needsTimer) jgRoomStartTimer(timerSeconds); else jgRoomStopTimer();
}
// 房主專用提示：狼隊出刀完成後，如果板子有查驗類角色（預言家/通靈師擇一）就會先進行查驗，
// 查驗完（或本來就沒有查驗類角色）currentStep 會變成空，這裡改成直接顯示「開始警長競選」
// 按鈕，銜接到白天流程（預言家跟通靈師不會同時出現在同一場板子，不需要「下一位」按鈕）。
// 這些步驟「今晚沒人行動」有明確、安全的預設結果（等同該角色自己選擇跳過），可以放心讓
// 房主強制推進——最常見的卡住情境是：該步驟真正的角色持有人已經死亡（例如女巫吃過毒、
// 通靈師被狼刀殺死），這種情況下這個人不一定還有人拿著他的手機盯著螢幕操作，導致全場等
// 不到一個不會再有人回應的動作。其餘還沒有明確安全預設的步驟（邱比特配對、夢魘恐懼、
// 魔術師換人、攝夢人夢遊、狼兄狼弟）先不開放強制跳過，避免用錯預設值扭曲遊戲結果。
const JG_ROOM_FORCE_SKIPPABLE_STEPS=new Set(['witch','seer','medium','mechwolf','guard','blackmarket','demonhunter','hunter','wolfbeauty','hybrid']);
function jgRoomHostAdvanceHtml(currentStep, night){
  const forceHtml=(jgRoomIsHost&&currentStep&&JG_ROOM_FORCE_SKIPPABLE_STEPS.has(currentStep))
    ?'<div style="text-align:center;margin-top:10px;"><button style="font-size:12px;color:var(--text3);" onclick="jgRoomHostForceAdvanceStep(\''+currentStep+'\','+night+')">⚠️ 卡住了？房主強制往下一步</button></div>'
    :'';
  if(currentStep==='shoot') return '<div class="info" style="font-size:12px;margin-top:20px;text-align:center;">昨晚有人被狼刀淘汰、而且他持有開槍資格（獵人／黑狼王／幸運兒獵槍），正在等他決定要不要開槍帶人；決定完（或所有有資格的人都決定完）會自動往下一步。</div>';
  if(currentStep==='badge') return '<div class="info" style="font-size:12px;margin-top:20px;text-align:center;">警長剛剛陣亡了，正在等他決定警徽要傳給誰（或摧毀警徽）；決定完會自動往下一步。</div>';
  if(currentStep==='cupid') return '<div class="info" style="font-size:12px;margin-top:20px;text-align:center;">邱比特配對完、兩位情侶也互相確認過身分之後，會自動往下一步。</div>';
  if(currentStep==='nightmare') return '<div class="info" style="font-size:12px;margin-top:20px;text-align:center;">夢魘選完恐懼對象之後，會自動往下一步。</div>';
  if(currentStep==='magician') return '<div class="info" style="font-size:12px;margin-top:20px;text-align:center;">魔術師換完（或選擇不換）之後，會自動往下一步。</div>';
  if(currentStep==='guard') return '<div class="info" style="font-size:12px;margin-top:20px;text-align:center;">守衛選完之後，會自動往下一步。</div>'+forceHtml;
  if(currentStep==='dreamcatcher') return '<div class="info" style="font-size:12px;margin-top:20px;text-align:center;">攝夢人選完夢遊對象之後，會自動往下一步。</div>';
  if(currentStep==='wolfbrother') return '<div class="info" style="font-size:12px;margin-top:20px;text-align:center;">第一夜是狼兄狼弟互相確認身分；其餘夜晚平常沒事，只有狼兄陣亡後狼弟覺醒復仇那一晚才需要操作，完成後會自動往下一步。</div>';
  if(currentStep==='wolf') return '';
  if(currentStep==='hybrid') return '<div class="info" style="font-size:12px;margin-top:20px;text-align:center;">混血兒選完支持對象之後，會自動往下一步。</div>'+forceHtml;
  if(currentStep==='wolfbeauty') return '<div class="info" style="font-size:12px;margin-top:20px;text-align:center;">狼美人選完魅惑對象之後，會自動往下一步。</div>'+forceHtml;
  if(currentStep==='mechwolf') return forceHtml;
  if(currentStep==='blackmarket') return '<div class="info" style="font-size:12px;margin-top:20px;text-align:center;">黑市商人交易完（或選擇不交易）之後，會自動往下一步。獵人獵槍這項技能目前還沒自動化，請法官／房主用本機工具手動處理。</div>'+forceHtml;
  if(currentStep==='witch') return forceHtml;
  if(currentStep==='seer') return '<div class="info" style="font-size:12px;margin-top:20px;text-align:center;">預言家（或持有查驗技能的幸運兒）查驗完之後，會自動往下一步。</div>'+forceHtml;
  if(currentStep==='medium') return '<div class="info" style="font-size:12px;margin-top:20px;text-align:center;">通靈師查驗完之後，會自動往下一步。</div>'+forceHtml;
  if(currentStep==='demonhunter') return forceHtml;
  if(currentStep==='hunter') return '<div class="info" style="font-size:12px;margin-top:20px;text-align:center;">獵人看過今晚的技能使用狀況、按下「已知道」之後，會自動往下一步。</div>'+forceHtml;
  if(!currentStep) return '<div class="info" style="font-size:12px;margin-top:20px;text-align:center;">這一夜已經結束，正在自動接警長競選...</div>';
  return '<div class="info" style="font-size:12px;margin-top:20px;text-align:center;">這一步的角色還沒有自動化，請法官／房主用本機工具手動處理。</div>';
}
// 房主強制把卡住的步驟往下推進——比照 jgRoomHostForceAdvanceWolf 的精神，把「這一步沒人
// 行動」視為該角色自己選擇不使用技能／不查驗的結果，寧可事後用口頭方式跟現場核對真正
// 發生了什麼，也不要讓整場遊戲卡死在這裡出不去（最常見的原因是這一步真正的角色持有人
// 已經死亡，沒有人會再去點他的手機）。
window.jgRoomHostForceAdvanceStep=async function(step, night){
  if(!JG_ROOM_FORCE_SKIPPABLE_STEPS.has(step)) return;
  if(!confirm('確定要強制跳過目前這一步嗎？這會當作「這一步沒有人採取任何行動」直接往下一步。')) return;
  const db0=window.jgFirebaseDb;
  // 跟 jgRoomHostForceAdvanceWolf 同樣的道理：按確認鈕的當下這一步很可能已經在其他裝置上
  // 完成、往下一步了，先重讀一次最新狀態，已經不在這一步就什麼都不做，避免「沒有人採取
  // 任何行動」蓋掉其實已經定案的結果（例如女巫已經救/毒完，卻被誤判成沒行動）。
  const freshSnap0=await getDoc(doc(db0,'rooms',jgRoomCode));
  const rd=freshSnap0.data()||{};
  if(rd.currentStep!==step){ await jgRoomRefreshAndRenderCurrent(); return; }
  if(step==='witch'){
    if(rd.wolfKillTargetSeatNum) await jgRoomAppendNightLog(night, '救 x');
    await jgRoomAppendNightLog(night, '毒 x');
    await jgRoomResolveNightDeaths();
    await jgRoomAdvanceToCheckOrSheriff();
  } else if(step==='seer'||step==='medium'){
    await jgRoomAdvanceToDayPhase(night);
  } else if(step==='mechwolf'||step==='guard'){
    await jgRoomAdvanceToWolfOrBeyond(step, night);
  } else if(step==='blackmarket'){
    await jgRoomAfterBlackmarketStep(night);
  } else if(step==='wolfbeauty'){
    await jgRoomAppendNightLog(night, '魅 x');
    await jgRoomAfterWolfbeautyStep(night);
  } else if(step==='hybrid'){
    await jgRoomAppendNightLog(night, '混 x');
    await jgRoomAdvanceToWolfOrBeyond('hybrid', night);
  } else if(step==='demonhunter'){
    await jgRoomAppendNightLog(night, '獵 x');
    await jgRoomFinishDemonhunterStep(night);
  } else if(step==='hunter'){
    await setDoc(doc(db0,'rooms',jgRoomCode),{ hunterStatusDoneNight:night },{ merge:true });
    await jgRoomAfterHunterStep(night);
  }
  await jgRoomRefreshAndRenderCurrent();
};
// 預言家的查驗畫面：先看看這一晚是不是已經查過了（重新整理／斷線重連都要能接續，不能
// 讓他重複查、也不能讓他看不到剛剛已經查到的結果）。
async function jgRoomSeerViewHtml(night){
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  if(jgRoomAmIFeared(rd,night)) return jgRoomFearedNoticeHtml();
  // 預言家已出局：比照本機法官助手（steps.js seer-wake 的「Dead seer」分支）——仍然要走完
  // 流程避免洩露身分，但不能讓她真的查驗、也不能透露任何查驗結果，直接給一顆「下一步」。
  const deadMe=jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid);
  if(deadMe&&jgRoomIsPubliclyDead(deadMe,rd)){
    const deadCheckSnap=await getDoc(doc(db,'rooms',jgRoomCode,'seerChecks',window.jgFirebaseUid));
    if(deadCheckSnap.exists()&&deadCheckSnap.data().night===night){
      return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><h1>已行動</h1></div>'
        +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">請記住，等待其他人完成夜晚行動</div>'};
    }
    return {needsTimer:true, html:jgRoomTimerHtml(20,'你要查驗的對象是？')
      +'<div class="nbanner" style="margin-top:20px;"><h1>預言家請睜眼</h1></div>'
      +'<div class="info-warn" style="text-align:center;">預言家已出局，仍需走完流程</div>'
      +'<div style="text-align:center;"><button class="primary" style="margin-top:14px;" onclick="jgRoomSeerDeadContinue('+night+')">下一步 →</button></div>'};
  }
  const checkSnap=await getDoc(doc(db,'rooms',jgRoomCode,'seerChecks',window.jgFirebaseUid));
  if(checkSnap.exists()&&checkSnap.data().night===night){
    const d=checkSnap.data();
    return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><h1>查驗結果</h1>'
      +'<p class="sub" style="text-align:center;margin-top:8px;font-size:20px;font-weight:800;">'+d.targetSeatNum+'號 是 '+(d.team==='wolf'?'壞人':'好人')+'</p></div>'
      +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">請記住這個結果，等待其他人完成夜晚行動</div>'};
  }
  const others=jgRoomLatestPlayers.filter(p=>p.uid!==window.jgFirebaseUid);
  return {needsTimer:true, html:jgRoomTimerHtml(20,'你要查驗的對象是？')
    +'<div class="nbanner" style="margin-top:20px;"><h1>請選擇查驗對象</h1></div>'
    +jgRoomNumGridHtml('jg-room-seer-pick', null)
    +'<div style="text-align:center;"><button class="primary" style="margin-top:14px;" onclick="jgRoomSubmitCheckFromGrid(\'seer\',\'jg-room-seer-pick\','+night+')">確認</button></div>'};
}
// 查驗結果直接讀 secrets/{targetUid}（全房都讀得到的真實身分，見 jgRoomAssignRoles 的
// 註解），拿到真實角色後，預言家只需要換算成「好人/壞人」顯示——不用另外維護一份陣營資料。
// ── 點號碼不會馬上生效：查驗機會通常整局只有一次（或很珍貴），點錯就沒有回頭路，所以
//    一律先跳出確認視窗，按「確定」才真的送出查驗，取消的話就當作沒點過，可以重新選。
//    確認文字統一走簡短的「確定要[動作] X號 嗎？」格式，不要加多餘的說明——之後加女巫
//    （救/毒）、魔術師（交換）等角色時，一樣照這個格式：「確定要救 X號 嗎？」「確定要毒
//    X號 嗎？」「確定要交換 X-Y號 嗎？」。──
window.jgRoomSubmitCheckFromGrid=function(kind, gridId, night){
  const hidden=document.getElementById(gridId);
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seatNum);
  if(!p) return;
  if(kind==='seer') jgRoomSeerCheck(p.uid, seatNum, night);
  else if(kind==='medium') jgRoomMediumCheck(p.uid, seatNum, night);
  else if(kind==='guard') jgRoomGuardAct(p.uid, seatNum, night);
};

// 已出局的預言家按「下一步」：不記錄任何真正的查驗對象／結果，純粹只是把這一步結束、
// 往下一步推進，跟本機法官助手「仍需走完流程」的精神一致。
window.jgRoomSeerDeadContinue=async function(night){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode,'seerChecks',window.jgFirebaseUid),{ night:night, targetUid:null, targetSeatNum:null, team:null });
  await jgRoomAdvanceToDayPhase(night);
  await jgRoomRefreshAndRenderCurrent();
};
window.jgRoomSeerCheck=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  const effective=jgRoomEffectiveTarget(rd,night,targetUid);
  const secretSnap=await getDoc(doc(db,'rooms',jgRoomCode,'secrets',effective));
  const role=secretSnap.exists()?secretSnap.data().role:'villager';
  let team=(typeof WOLF_ROLES!=='undefined'&&WOLF_ROLES.includes(role))?'wolf':'good';
  // 唯鄰是從：傀儡被查驗一律是狼人；真預言家自己是傀儡時，查驗結果整個相反。
  const puppetUid=jgRoomPuppetUid(rd);
  if(puppetUid&&effective===puppetUid) team='wolf';
  if(puppetUid&&jgMyRole==='seer'&&puppetUid===window.jgFirebaseUid) team=team==='wolf'?'good':'wolf';
  // 惡靈騎士反傷：真預言家查驗到惡靈騎士，預言家天亮死亡（整局限一次）。
  if(role==='evilknight'&&jgMyRole==='seer'&&!rd.evilknightRevengeUsed){
    await setDoc(doc(db,'rooms',jgRoomCode),{ evilknightRevengeUsed:true, evilknightRevengeSeerUid:window.jgFirebaseUid, evilknightRevengeSeerNight:night },{ merge:true });
  }
  await setDoc(doc(db,'rooms',jgRoomCode,'seerChecks',window.jgFirebaseUid),{
    night:night, targetUid:targetUid, targetSeatNum:targetSeatNum, team:team
  });
  // 真預言家記「驗」，幸運兒（黑市商人給的查驗技能）記「幸驗」——用 jgMyRole 判斷：這個
  // 函式是預言家跟幸運兒共用的（見 jgRoomRenderNightShell 的 dispatch），我自己不是預言家
  // 卻能呼叫到這裡，代表我是持有查驗技能的幸運兒。
  const abbr=(jgMyRole==='seer')?'驗':'幸驗';
  await jgRoomAppendNightLog(night, abbr+' '+targetSeatNum+(team==='wolf'?'(狼)':'(好)'));
  // 查驗結果用大字報清楚告知，比照機械狼學到身分、通靈師查驗的呈現方式：「X號」+ 查到的
  // 陣營（預言家只會知道好人/狼人陣營，不會知道確切角色，跟通靈師不一樣）。
  jgRoomShowBigCard(targetSeatNum+'號', team==='wolf'?'狼人':'好人');
  // 查完就代表這一夜的行動結束了，直接自動接白天（第一夜是警長競選，其餘夜晚直接公告
  // 死訊、開放發言／投票放逐），不用等房主按按鈕。
  await jgRoomAdvanceToDayPhase(night);
  await jgRoomRefreshAndRenderCurrent();
};

// ── 通靈師的查驗畫面：跟預言家幾乎一模一樣的結構，差別只在查驗結果顯示「完整真實身分」
//    而不是「陣營」——這正是回答「通靈師/石像鬼這種要查真實身分的角色怎麼做」的示範：
//    都是讀同一份 secrets，差別只在查驗角色自己要不要把完整角色名稱顯示出來。──
async function jgRoomMediumViewHtml(night){
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  if(jgRoomAmIFeared(rd,night)) return jgRoomFearedNoticeHtml();
  // 通靈師已出局：一樣比照本機法官助手（steps.js medium-wake 的「dead」分支）——仍然要走完
  // 流程避免洩露身分，但不能讓她真的查驗、也不能透露任何查驗結果，直接給一顆「下一步」。
  const deadMe=jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid);
  if(deadMe&&jgRoomIsPubliclyDead(deadMe,rd)){
    const deadCheckSnap=await getDoc(doc(db,'rooms',jgRoomCode,'mediumChecks',window.jgFirebaseUid));
    if(deadCheckSnap.exists()&&deadCheckSnap.data().night===night){
      return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><h1>已行動</h1></div>'
        +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">請記住，等待其他人完成夜晚行動</div>'};
    }
    return {needsTimer:true, html:jgRoomTimerHtml(20,'你要查驗的對象是？')
      +'<div class="nbanner" style="margin-top:20px;"><h1>通靈師請睜眼</h1></div>'
      +'<div class="info-warn" style="text-align:center;">通靈師已出局，仍需走完流程</div>'
      +'<div style="text-align:center;"><button class="primary" style="margin-top:14px;" onclick="jgRoomMediumDeadContinue('+night+')">下一步 →</button></div>'};
  }
  const checkSnap=await getDoc(doc(db,'rooms',jgRoomCode,'mediumChecks',window.jgFirebaseUid));
  if(checkSnap.exists()&&checkSnap.data().night===night){
    const d=checkSnap.data();
    return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><h1>查驗結果</h1>'
      +'<p class="sub" style="text-align:center;margin-top:8px;font-size:20px;font-weight:800;">'+d.targetSeatNum+'號 是 '+d.roleName+'</p></div>'
      +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">請記住這個結果，等待其他人完成夜晚行動</div>'};
  }
  const others=jgRoomLatestPlayers.filter(p=>p.uid!==window.jgFirebaseUid);
  return {needsTimer:true, html:jgRoomTimerHtml(20,'你要查驗的對象是？')
    +'<div class="nbanner" style="margin-top:20px;"><h1>請選擇查驗對象</h1></div>'
    +jgRoomNumGridHtml('jg-room-medium-pick', null)
    +'<div style="text-align:center;"><button class="primary" style="margin-top:14px;" onclick="jgRoomSubmitCheckFromGrid(\'medium\',\'jg-room-medium-pick\','+night+')">確認</button></div>'};
}
// 已出局的通靈師按「下一步」：不記錄任何真正的查驗對象／結果，純粹只是把這一步結束、
// 往下一步推進，跟本機法官助手「仍需走完流程」的精神一致。
window.jgRoomMediumDeadContinue=async function(night){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode,'mediumChecks',window.jgFirebaseUid),{ night:night, targetUid:null, targetSeatNum:null, roleName:null });
  await jgRoomAdvanceToDayPhase(night);
  await jgRoomRefreshAndRenderCurrent();
};

// ── 獵魔人：查驗類角色之後、天亮之前的最後一步（見 jgRoomAdvanceToDayPhase）。第二夜起
//    每晚都能選一人狩獵（可以留空跳過）：對方是狼人陣營→狼死，對方是好人→獵魔人自己死；
//    免疫女巫毒藥（見 jgRoomResolveNightDeaths 裡加的角色判斷）。這一刀是立即結算、確定
//    生死的效果，不像狼刀可能被守衛/解藥擋下，所以直接在這裡標記死亡，不透過
//    jgRoomResolveNightDeaths（那個函式是給「狼刀/毒/額外一刀」這幾種當晚已經寫好目標、
//    要一起結算的死法共用，這一步的行動時間點已經在那些都結算完之後，重新呼叫一次會把
//    狼刀/毒的死亡結算邏輯重跑一遍，可能誤觸發已經處理過的夜槍/警徽流程）。──
async function jgRoomDemonhunterViewHtml(night){
  const rd=jgRoomLatestRoomDoc||{};
  if(jgRoomAmIFeared(rd,night)) return jgRoomFearedNoticeHtml();
  const db=window.jgFirebaseDb;
  const deadMe=jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid);
  if(deadMe&&jgRoomIsPubliclyDead(deadMe,rd)){
    const deadActSnap=await getDoc(doc(db,'rooms',jgRoomCode,'demonhunterActs',window.jgFirebaseUid));
    if(deadActSnap.exists()&&deadActSnap.data().night===night){
      return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><h1>已行動</h1></div>'
        +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">請記住，等待其他人完成夜晚行動</div>'};
    }
    return {needsTimer:true, html:jgRoomTimerHtml(20,'今晚要狩獵的對象是？')
      +'<div class="nbanner" style="margin-top:20px;"><h1>獵魔人請睜眼</h1></div>'
      +'<div class="info-warn" style="text-align:center;">獵魔人已出局，仍需走完流程</div>'
      +'<div style="text-align:center;"><button class="primary" style="margin-top:14px;" onclick="jgRoomDemonhunterSkip('+night+')">下一步 →</button></div>'};
  }
  const actSnap=await getDoc(doc(db,'rooms',jgRoomCode,'demonhunterActs',window.jgFirebaseUid));
  if(actSnap.exists()&&actSnap.data().night===night){
    const d=actSnap.data();
    return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><h1>已行動</h1>'
      +'<p class="sub" style="text-align:center;margin-top:8px;">'+(d.targetSeatNum?('狩獵了 '+d.targetSeatNum+'號'):'這晚沒有狩獵')+'</p></div>'
      +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">請記住，等待其他人完成夜晚行動</div>'};
  }
  return {needsTimer:true, html:jgRoomTimerHtml(20,'今晚要狩獵的對象是？（可以留空跳過）')
    +'<div class="nbanner" style="margin-top:20px;"><h1>請選擇狩獵對象</h1></div>'
    +'<div class="info" style="font-size:12px;text-align:center;margin-top:4px;">對方是狼→狼死；對方是好人→你自己死。免疫女巫毒藥。</div>'
    +jgRoomNumGridHtml('jg-room-demonhunter-pick', null)
    +'<div style="text-align:center;"><button class="primary" style="margin-top:10px;" onclick="jgRoomDemonhunterHuntFromGrid('+night+')">狩獵</button></div>'
    +'<div style="text-align:center;"><button style="margin-top:8px;" onclick="jgRoomDemonhunterSkip('+night+')">今晚不狩獵，跳過</button></div>'};
}
window.jgRoomDemonhunterHuntFromGrid=function(night){
  const hidden=document.getElementById('jg-room-demonhunter-pick');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seatNum);
  if(!p) return;
  if(!confirm('確定要狩獵 '+seatNum+'號 嗎？如果對方是好人，你自己會死。')) return;
  window.jgRoomDemonhunterHunt(p.uid, seatNum, night);
};
window.jgRoomDemonhunterHunt=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  const effective=jgRoomEffectiveTarget(rd,night,targetUid);
  const secretSnap=await getDoc(doc(db,'rooms',jgRoomCode,'secrets',effective));
  const role=secretSnap.exists()?secretSnap.data().role:'villager';
  const isWolf=(typeof WOLF_ROLES!=='undefined'&&WOLF_ROLES.includes(role));
  await setDoc(doc(db,'rooms',jgRoomCode),{
    demonhunterHuntNight:night, demonhunterHuntTargetUid:effective, demonhunterHuntTargetSeatNum:targetSeatNum,
    demonhunterHuntIsWolf:isWolf, demonhunterUid:window.jgFirebaseUid
  },{ merge:true });
  if(isWolf){
    await setDoc(doc(db,'rooms',jgRoomCode,'players',effective),{ alive:false, diedNight:night },{ merge:true });
  } else {
    await setDoc(doc(db,'rooms',jgRoomCode,'players',window.jgFirebaseUid),{ alive:false, diedNight:night },{ merge:true });
  }
  await setDoc(doc(db,'rooms',jgRoomCode,'demonhunterActs',window.jgFirebaseUid),{ night:night, targetSeatNum:targetSeatNum });
  await jgRoomAppendNightLog(night, '獵 '+targetSeatNum+(isWolf?'(狼)':'(好，獵魔人自死)'));
  await jgRoomApplyCupidCascade();
  await jgRoomFinishDemonhunterStep(night);
};
window.jgRoomDemonhunterSkip=async function(night){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode,'demonhunterActs',window.jgFirebaseUid),{ night:night, targetSeatNum:null });
  await jgRoomAppendNightLog(night, '獵 x');
  await jgRoomFinishDemonhunterStep(night);
};
// 獵魔人這一步結束（不管有沒有真的狩獵）之後：先檢查有沒有警徽要處理（萬一他自己死了、
// 剛好又是警長），再檢查勝負（他這一刀可能剛好屠邊、或剛好害狼人全滅），都沒有才真的
// 進入白天（見 jgRoomReallyAdvanceToDayPhase，這裡刻意不呼叫 jgRoomAdvanceToDayPhase，
// 不然會被 jgRoomDemonhunterPending 誤判成「還沒輪到獵魔人」又繞回這一步，無限迴圈）。
async function jgRoomFinishDemonhunterStep(night){
  const db=window.jgFirebaseDb;
  if(await jgRoomCheckAndSetPendingBadge()){
    await setDoc(doc(db,'rooms',jgRoomCode),{ currentStep:'badge' },{ merge:true });
    await jgRoomRefreshAndRenderCurrent();
    return;
  }
  if(await jgRoomMaybeDeclareWin()){
    await jgRoomRefreshAndRenderCurrent();
    return;
  }
  await jgRoomReallyAdvanceToDayPhase(night);
  await jgRoomRefreshAndRenderCurrent();
}
// 查驗到機械狼：機械狼尚未學習技能時顯示「機械狼」，已經學習之後改顯示學到的具體身分
// （見 ALL_ROLES.medium 的規則說明），學到的身分存在機械狼自己 players/{uid}.mechWolfLearnedRole。
window.jgRoomMediumCheck=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  const effective=jgRoomEffectiveTarget(rd,night,targetUid);
  const secretSnap=await getDoc(doc(db,'rooms',jgRoomCode,'secrets',effective));
  const role=secretSnap.exists()?secretSnap.data().role:'villager';
  let resolvedRole=role;
  let roleName=(typeof RNAME!=='undefined'&&RNAME[role])||role;
  if(role==='mechanicalwolf'){
    const mwSnap=await getDoc(doc(db,'rooms',jgRoomCode,'players',effective));
    const learned=mwSnap.exists()?mwSnap.data().mechWolfLearnedRole:null;
    resolvedRole=learned||role;
    roleName=learned?((typeof RNAME!=='undefined'&&RNAME[learned])||learned):'機械狼';
  }
  await setDoc(doc(db,'rooms',jgRoomCode,'mediumChecks',window.jgFirebaseUid),{
    night:night, targetUid:targetUid, targetSeatNum:targetSeatNum, roleName:roleName
  });
  const roleAbbr=(typeof ROLE_ABBR!=='undefined'&&ROLE_ABBR[resolvedRole])||roleName;
  await jgRoomAppendNightLog(night, '通驗 '+targetSeatNum+'('+roleAbbr+')');
  // 查驗結果一樣用大字報清楚告知，比照機械狼學到身分的呈現方式：「X號」+ 查到的身分
  // 中文名稱——原本這裡查完什麼都沒顯示，直接跳下一步，玩家根本不知道查到了什麼。
  jgRoomShowBigCard(targetSeatNum+'號', roleName);
  await jgRoomAdvanceToDayPhase(night);
  await jgRoomRefreshAndRenderCurrent();
};
