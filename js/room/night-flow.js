'use strict';
// ═══════════════════════════════════════════
// js/room/night-flow.js
// 連線房間：夜晚流程：分配身分、夜晚步驟順序表、天亮前後的推進、死訊、警徽、夜槍資格、夜晚死亡結算、情侶殉情。
// 連線房間的程式拆成 js/room/ 底下好幾個一般 script 檔（依 index.html 的順序用 defer 載入，
// 共用同一個全域範圍，互相看得到彼此的變數與函式）；Firestore 函式由 js/firebase-init.js 提供。
// 檔案總覽見 js/room/core.js 開頭。
// ═══════════════════════════════════════════

// ── 隨機分配身分（房主操作）：用「建立房間時就鎖定好」的板子配置洗牌，不是憑目前加入
//    人數臨時套用預設板子——人數不足或超過都不能分配，避免牌組跟實際玩家數兜不起來。
// 這一版採用「全房都讀得到 secrets（真實身分）」的簡化做法（使用者已確認接受這個取捨：
// 懂開發工具的人技術上可以查到所有人的真實身分，不做額外防範，預設玩家自願保持公正）。
// 好處是不用維護一份額外的「陣營」資料，也不用 Cloud Functions／升級 Blaze：任何查驗類
// 角色（預言家查陣營、通靈師/石像鬼查真實身分）都直接讀同一份 secrets，畫面上要顯示到
// 「陣營」還是「完整身分」，由查驗的那個角色自己的邏輯決定即可。
window.jgRoomAssignRoles=async function(){
  if(!jgRoomCode) return;
  if(!jgRoomComp||!jgRoomTotal){ alert('這個房間沒有記錄板子配置，無法分配身分（可能是用舊版連結建立的房間）。'); return; }
  const db=window.jgFirebaseDb;
  const { getDocs } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js");
  const playersSnap=await getDocs(collection(db,'rooms',jgRoomCode,'players'));
  const players=playersSnap.docs.map(d=>({uid:d.id, ...d.data()})).sort((a,b)=>a.seatNum-b.seatNum);
  if(players.length!==jgRoomTotal){
    alert('⚠️ 這個房間設定的是 '+jgRoomTotal+' 人局，目前只有 '+players.length+' 人加入，請等所有人到齊再分配身分。');
    return;
  }
  let extra={};
  if(jgRoomComp.thief>0){
    // 有盜賊時，板子設定的角色總數是「人數+2」（比對照 jgRoomComp 本身，不是另外算），
    // 其中一張一定是『盜賊』本身（保證有人先暫時是盜賊身分，之後才自己選），剩下人數+1
    // 張裡隨機抽 2 張當「候選身分」另外放一邊（不發給任何人），其餘人數-1 張＋盜賊
    // 這張湊成人數張，才是真的要發給玩家的牌——這跟本機法官助手的規則一致：盜賊選中的
    // 候選角色本來就已經算在板子配置的總數裡，選完不會讓場上多一個原本沒設定的角色出來。
    const fullPool=buildPool(jgRoomComp);
    const thiefIdx=fullPool.indexOf('thief');
    fullPool.splice(thiefIdx,1);
    const shuffledRest=shuffle(fullPool.slice());
    const candidates=shuffledRest.slice(0,2);
    const dealPool=shuffle(shuffledRest.slice(2).concat(['thief']));
    extra={ thiefCand1:candidates[0], thiefCand2:candidates[1], thiefResolved:false };
    const pool=dealPool;
    await Promise.all(players.map((p,i)=>
      setDoc(doc(db,'rooms',jgRoomCode,'secrets',p.uid),{ role:pool[i]||'villager', seatNum:p.seatNum })
    ));
  } else {
    const pool=shuffle(buildPool(jgRoomComp));
    await Promise.all(players.map((p,i)=>
      setDoc(doc(db,'rooms',jgRoomCode,'secrets',p.uid),{ role:pool[i]||'villager', seatNum:p.seatNum })
    ));
  }
  await setDoc(doc(db,'rooms',jgRoomCode),Object.assign({ status:'role-assigned', phase:'lobby' },extra),{ merge:true });
  await jgRoomResetChat();
  jgRoomSpeechOrderAutoTriedNight=null;
  jgRoomVoiceDayAnnouncedNight=null; jgRoomVoiceSheriffAnnouncedNight=null;
  if(jgRoomSpeechSpinInterval){ clearInterval(jgRoomSpeechSpinInterval); jgRoomSpeechSpinInterval=null; }
  jgRoomSpeechTurnAutoTriedKey=null; jgRoomSpeechTurnRungKey=null;
  if(jgRoomSpeechTurnClockInterval){ clearInterval(jgRoomSpeechTurnClockInterval); jgRoomSpeechTurnClockInterval=null; }
};

// ── 房主開始遊戲：進入第一夜。完整順序（跟本機法官助手 jgAfterXStep 那一串固定順序的
//    邏輯一致，只挑房間系統目前有支援的角色）是：
//    邱比特（配對情侶，僅第一夜）→ 夢魘（恐懼）→ 魔術師（換技能）→ 守衛（盲守）→
//    攝夢人（夢遊）→ 狼兄狼弟（第一夜互認／狼兄陣亡後狼弟覺醒復仇）→
//    機械狼（學習/技能/接管出刀）→ 狼隊出刀 → 黑市商人（交易，整局限一次）→ 女巫 →
//    查驗類角色（預言家/通靈師擇一）→ 自動接警長競選。
//    邱比特要整局最先睜眼（僅第一夜），因為情侶配對結果會影響後面所有人的生死連動；
//    夢魘接下來睜眼，因為牠可能恐懼到後面任何一個角色，讓對方整晚無法行動；魔術師其次，
//    因為換完號碼之後，後面所有「以號碼為目標」的技能都要重新導向到對方號碼；守衛再其次
//    （盲守，不知道狼隊會殺誰），攝夢人固定排在守衛之後，狼兄狼弟、機械狼因為不跟狼隊一起
//    商議，固定排在正式狼隊出刀之前；黑市商人要在狼隊出刀之後才交易（避免誤判存活狀態），
//    女巫要在狼隊出刀（和黑市商人）之後才會知道目標，才能決定要不要救。
// 用「固定順序陣列＋board 是否包含這個角色」這種寫法，而不是像本機法官助手那樣每個角色
// 各寫一個 jgAfterXStep()：這裡每個步驟只會跑一次（不像本機要應付雙機械狼、狼兄狼弟覺醒
// 這種同一晚可能要繞好幾輪的複雜案例），用查表就能同時算「第一步是誰」跟「這一步做完後
// 換誰」，不用每加一個角色就多寫一個函式、還要小心會不會不小心把自己算成下一步（那樣會
// 卡在同一步無限迴圈）。黑市商人／女巫／查驗類角色不放進這個表——它們是在「狼刀目標決定
// 之後」才會用到的另一條鏈（見 jgRoomAfterKillDecided／jgRoomAfterBlackmarketStep），跟
// 這裡「狼隊出刀之前」的鏈是兩段獨立的邏輯，用法官助手既有的兩段式設計沿用即可。──
const JG_ROOM_NIGHT_STEP_ORDER=['thief','cupid','nightmare','magician','guard','dreamcatcher','hybrid','wolfbrother','mechwolf','wolf'];
function jgRoomStepPresent(step, night){
  const c=jgRoomComp||{};
  // 盜賊要整局最先睜眼（比邱比特還早——盜賊選完身分之後，接下來所有角色才知道自己「最終」
  // 是誰，邱比特配對等後面的步驟才不會用到還沒定案的身分），而且只有還沒選過（沒有
  // thiefResolved）的時候才需要這一步。
  if(step==='thief') return c.thief>0&&night===1&&!(jgRoomLatestRoomDoc&&jgRoomLatestRoomDoc.thiefResolved);
  if(step==='cupid') return c.cupid>0&&night===1;
  if(step==='nightmare') return c.nightmare>0;
  if(step==='magician') return c.magician>0;
  if(step==='guard') return c.guard>0;
  if(step==='dreamcatcher') return c.dreamcatcher>0;
  if(step==='hybrid') return c.hybrid>0&&night===1; // 混血兒只有第一夜選支持對象
  if(step==='wolfbrother') return (c.wolfbrother_e>0)||(c.wolfbrother_y>0);
  if(step==='mechwolf') return c.mechanicalwolf>0;
  return true; // 'wolf' 固定存在（房間系統目前要求每個板子都至少有基本狼隊）
}
// 從某一步「之後」開始找，回傳板子裡真的有配置的下一個步驟；沒指定 afterStep（或傳
// null）就是從頭開始找，等於「這一夜的第一步是誰」。night 用來判斷邱比特這種「只有
// 第一夜才會出現」的步驟。
function jgRoomNextNightStep(afterStep, night){
  const startIdx=afterStep?JG_ROOM_NIGHT_STEP_ORDER.indexOf(afterStep)+1:0;
  for(let i=startIdx;i<JG_ROOM_NIGHT_STEP_ORDER.length;i++){
    if(jgRoomStepPresent(JG_ROOM_NIGHT_STEP_ORDER[i], night)) return JG_ROOM_NIGHT_STEP_ORDER[i];
  }
  return 'wolf'; // 理論上不會走到這裡（wolf 一定在清單裡），保底避免回傳 undefined
}
window.jgRoomStartNight=async function(){
  if(!jgRoomCode) return;
  const db=window.jgFirebaseDb;
  const firstStep=jgRoomNextNightStep(null, 1);
  await setDoc(doc(db,'rooms',jgRoomCode),{ phase:'night', night:1, currentStep:firstStep },{ merge:true });
};
// 白天結束（沒人出局、PK 後還是沒人出局、有人出局但槍也決定完了……等等）之後，進入下一夜。
// 大部分「這一晚選了誰」的欄位（wolfKillNight／guardTargetNight／...）本來就是每個步驟
// 自己拿目前的 night 去比對「這筆資料是不是這一晚寫的」，換到新的夜晚之後這些舊資料自然
// 對不上、會被當成「這一晚還沒選」，不需要特地清掉；只有 pendingShootUids 這種「這一晚
// 有沒有事情還沒解決」的旗標需要在這裡明確歸零，避免萬一有殘留卡住下一夜的流程。這個函式
// 只在程式內部呼叫（不是按鈕 onclick），所以不用掛到 window 上。
// overrideStep：不想照正常的夜晚步驟順序走、直接指定 currentStep 時用（目前只有血月
// 使者最後一擊——那一晚使用者明確要求「只有狼人（血月使者本人）會睜眼，其他神職都不用
// 睜眼操作」，見 jgRoomStartBloodmoonLastStand）；extraFields：這次進新的一夜同時要
// 一起寫入的額外欄位，避免呼叫端還要另外多一次 setDoc。
async function jgRoomStartNextNight(overrideStep, extraFields){
  if(!jgRoomCode) return;
  const db=window.jgFirebaseDb;
  const roomSnap=await getDoc(doc(db,'rooms',jgRoomCode));
  const rd=roomSnap.data()||{};
  const nextNight=(rd.night||1)+1;
  // 一般進入黑夜（不是自爆、血月最後一刀這種指定步驟）：不管狼人刀哪一位好人都會贏的話，
  // 直接判定狼人獲勝，不用再走一次夜晚。
  if(!overrideStep&&await jgRoomMaybeDeclareWin({ guaranteedNight:true })) return null;
  const firstStep=overrideStep||jgRoomNextNightStep(null, nextNight);
  await setDoc(doc(db,'rooms',jgRoomCode),Object.assign({
    phase:'night', night:nextNight, currentStep:firstStep,
    pendingShootUids:[], pendingShootContext:null,
    votingActive:false, dayVotePkRound:false,
    // 發言方向（順/逆）整局只會決定一次，之後每天都沿用同一個方向，不能每晚重設——
    // 只有「今天從幾號開始講」（daySpeechStart）才是每天都要重新決定的，跟本機法官助手
    // 的 jgSpeakDirection（整局唯一）／jgDayMeta[night].start（每天都不同）是同一套規則。
    daySpeechStart:null
  }, extraFields||{}),{ merge:true });
  return nextNight;
}
// 這一晚查驗階段該輪到誰——板子裡有預言家就輪預言家，沒有的話看有沒有幸運兒目前正好
// 持有「預言家查驗」技能（黑市商人交易來的），再沒有就看通靈師，都沒有就代表這一晚沒有
// 查驗類角色可以示範，直接留空。
function jgRoomNextCheckStep(){
  const night=(jgRoomLatestRoomDoc&&jgRoomLatestRoomDoc.night)||1;
  if(jgRoomComp&&jgRoomComp.seer>0) return 'seer';
  if(jgRoomActiveLuckyOne('seer', night)) return 'seer';
  if(jgRoomComp&&jgRoomComp.medium>0) return 'medium';
  return null;
}
// 幸運兒（黑市商人交易產生）：查場上有沒有人目前正好「持有且可以使用」指定的技能——
// 查驗類技能每晚都能用，女巫類（毒藥）技能整局限一次，用過就不會再回傳。技能要從
// 「取得的下一晚」才能使用，所以 luckyOneGrantedNight 必須嚴格小於現在這一晚。
function jgRoomActiveLuckyOne(skill, night){
  return jgRoomLatestPlayers.find(p=>p.luckyOneSkill===skill&&p.luckyOneGrantedNight<night
    &&p.alive!==false&&!(skill==='witch'&&p.luckyOneWitchUsed));
}
// 我自己這一晚是不是某個幸運兒技能的持有人（用來決定要不要在 seer/witch 步驟多顯示
// 一份操作畫面給我，即使我本人不是真正的預言家/女巫）。
function jgRoomMyActiveLuckyOneSkill(night){
  const me=jgRoomActiveLuckyOne('seer', night);
  if(me&&me.uid===window.jgFirebaseUid) return 'seer';
  const me2=jgRoomActiveLuckyOne('witch', night);
  if(me2&&me2.uid===window.jgFirebaseUid) return 'witch';
  return null;
}
async function jgRoomAdvanceToSheriffCampaign(){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{
    currentStep:null, phase:'sheriff', sheriffPhase:'joining', sheriffCandidates:[], sheriffEverCandidates:[],
    sheriffPkRound:false, sheriffJoinDeadline: Date.now()+10000
  },{ merge:true });
}
// 查驗類角色結束（或本來就沒有）之後，先看板子上有沒有獵魔人要接手狩獵——他排在通靈師/
// 預言家之後、天亮之前（跟本機法官助手 GOD_CHAIN 的順序一致：查驗類角色→獵魔人），
// 第二夜起才會真的有動作（見 jgRoomDemonhunterPending），有的話讓他先行動，行動完（他自己
// 的 jgRoomFinishDemonhunterStep）才會真的呼叫 jgRoomReallyAdvanceToDayPhase 進入白天，
// 這樣死訊才能正確包含他這一刀的結果；沒有獵魔人要接的話直接進白天。
async function jgRoomAdvanceToDayPhase(night){
  // 惡靈騎士反傷預言家：查驗完、天亮之前預言家死亡，死了之後先看有沒有分出勝負。
  if(await jgRoomEvilknightRevengeSeerApply(night)){
    if(await jgRoomMaybeDeclareWin()) return;
  }
  // 獵人的「技能使用狀況」手勢排在查驗類角色之後、獵魔人之前（跟本機法官助手 GOD_CHAIN
  // 的順序一致：女巫→預言家/通靈師→獵人→…→獵魔人），見 jgRoomHunterPending 的說明。
  if(jgRoomHunterPending(night)){
    const db=window.jgFirebaseDb;
    await setDoc(doc(db,'rooms',jgRoomCode),{ currentStep:'hunter' },{ merge:true });
    return;
  }
  if(jgRoomDemonhunterPending(night)){
    const db=window.jgFirebaseDb;
    await setDoc(doc(db,'rooms',jgRoomCode),{ currentStep:'demonhunter' },{ merge:true });
    return;
  }
  await jgRoomReallyAdvanceToDayPhase(night);
}
// 獵魔人第一夜沒有任何動作可做（第一晚只確認身分、不能狩獵，見規則說明）——房間系統
// 索性連這一步的睜眼畫面都跳過（反正這個 app 隨時都能按右上角「確認自己身分」看自己是
// 誰，不用特地走一次沒有任何操作的空白睜眼畫面），從第二夜開始才真的排進流程。
function jgRoomDemonhunterPending(night){
  return !!(jgRoomComp&&jgRoomComp.demonhunter>0&&night>=2&&!jgRoomGodSkillsSealedThisNight(night));
}
// 獵人「技能使用狀況」手勢——比照本機法官助手：獵人每一晚都要睜眼一次，法官比讚／倒讚
// 告知他今晚槍還能不能用，不能只在真的被狼刀淘汰、要開槍帶人的那一刻才讓他看到任何畫面
// （不然只要哪一晚突然跳出操作畫面，等於直接洩漏「你今晚被狼刀了」）。跟本機規則一致：
// 被毒（含機械狼學到的毒、雙機械狼板任一台學到的毒）、被夢魘恐懼、被攝夢人連續兩晚夢遊
// 致死，這三種情況技能被封印比倒讚；其餘情況（含正常存活、被狼刀但技能會在天亮啟動、
// 早就死透的假流程）都比讚——真正「能不能開槍」的判斷完全交給既有的
// jgRoomCheckShootEligible／pendingShootUids 那一套，這裡純粹只是每晚先讓他知道結果，
// 不影響任何既有邏輯。跟獵魔人一樣排在查驗類角色之後、天亮之前；用 hunterStatusDoneNight
// 記住「這一晚已經看過手勢了」，看完之後才會真的推進到下一步，避免每次重畫都重複觸發。
function jgRoomHunterPending(night){
  return !!(jgRoomComp&&jgRoomComp.hunter>0&&!jgRoomGodSkillsSealedThisNight(night)
    &&!(jgRoomLatestRoomDoc&&jgRoomLatestRoomDoc.hunterStatusDoneNight===night));
}
function jgRoomThumbsUpSvg(){
  return '<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'
    +'<path d="M7 10v11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3z"></path>'
    +'<path d="M7 10l4.5-7a2 2 0 0 1 2 2.2L13 9h5.5a2 2 0 0 1 1.9 2.6l-2.3 7A2 2 0 0 1 16.2 20H10a3 3 0 0 1-3-3v-7z"></path>'
    +'</svg>';
}
function jgRoomThumbsDownSvg(){
  return '<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'
    +'<path d="M17 14V3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-3z"></path>'
    +'<path d="M17 14l-4.5 7a2 2 0 0 1-2-2.2L11 15H5.5a2 2 0 0 1-1.9-2.6l2.3-7A2 2 0 0 1 7.8 4H14a3 3 0 0 1 3 3v7z"></path>'
    +'</svg>';
}
async function jgRoomHunterViewHtml(night){
  const rd=jgRoomLatestRoomDoc||{};
  const myUid=window.jgFirebaseUid;
  // 技能被封印（比倒讚）的三種情況：被毒（含機械狼/雙機械狼板學到的毒）、被夢魘恐懼、
  // 被攝夢人連續兩晚夢遊致死——跟 js/night.js 的 jgBuildHunterStatusHtml 同一套規則。
  const poisoned=(rd.witchPoisonUid===myUid&&rd.witchPoisonNight===night)
    ||(rd.mechWolfPoisonUid===myUid&&rd.mechWolfPoisonNight===night);
  const feared=jgRoomAmIFeared(rd,night);
  const dreamKilled=rd.dreamcatcherTargetNight===night&&rd.dreamcatcherTargetUid===myUid;
  const sealed=poisoned||feared||dreamKilled;
  return {needsTimer:true, html:jgRoomTimerHtml(20,'獵人請睜眼')
    +'<div class="nbanner" style="margin-top:20px;"><h1>你的技能使用狀況</h1></div>'
    +'<div style="text-align:center;padding:10px 0;color:'+(sealed?'var(--wolf,#b83828)':'var(--vil,#3a7a2a)')+';">'+(sealed?jgRoomThumbsDownSvg():jgRoomThumbsUpSvg())+'</div>'
    +(sealed?'<div class="info-warn" style="text-align:center;">技能被封印，今晚就算被淘汰也不能開槍帶人</div>'
      :'<div class="info-success" style="text-align:center;">技能正常，如果今晚或之後被淘汰可以開槍帶人</div>')
    +'<div style="text-align:center;"><button class="primary" style="margin-top:14px;" onclick="jgRoomHunterStatusAck('+night+')">已知道，下一步 →</button></div>'};
}
window.jgRoomHunterStatusAck=async function(night){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{ hunterStatusDoneNight:night },{ merge:true });
  await jgRoomAfterHunterStep(night);
  await jgRoomRefreshAndRenderCurrent();
};
// 獵人看完手勢、確認完之後銜接下一棒——故意不呼叫 jgRoomAdvanceToDayPhase（那個函式一
// 進來就會重新檢查 jgRoomHunterPending，但這裡剛寫入的 hunterStatusDoneNight 可能還沒
// 同步回 jgRoomLatestRoomDoc 這份畫面快取，會誤判「還沒看過」又把 currentStep 蓋回
// 'hunter'，原地打轉出不去）。直接接手下一步（獵魔人／真正進白天），跟
// jgRoomFinishDemonhunterStep 直接呼叫 jgRoomReallyAdvanceToDayPhase、不重新檢查自己
// 剛完成的那一步是同一個做法。
async function jgRoomAfterHunterStep(night){
  const db=window.jgFirebaseDb;
  if(jgRoomDemonhunterPending(night)){
    await setDoc(doc(db,'rooms',jgRoomCode),{ currentStep:'demonhunter' },{ merge:true });
    return;
  }
  await jgRoomReallyAdvanceToDayPhase(night);
}
// 血月使者自爆（見 jgRoomBloodmoonDetonateConfirm）封印的那一夜——這一晚除了狼隊正常
// 出刀之外，守衛／女巫／查驗類角色／獵魔人這些「神牌」技能全部跳過，不受任何一步的
// 強制推進按鈕影響（本來就不會顯示，因為 currentStep 從來不會被設成那些步驟）。
function jgRoomGodSkillsSealedThisNight(night){
  return !!(jgRoomLatestRoomDoc&&jgRoomLatestRoomDoc.godSkillsSealedNight===night);
}
// 真正的「進入白天」：第一夜要接警長競選（僅限房主建房時有勾選「本局開放上警競選」
// ——沒勾選的話，第一夜不會出現參選警長畫面，直接跟第二夜起一樣進白天），第二夜起
// （本局已經選過警長，不會再選第二次）直接進入白天公告死訊、開放發言／投票放逐。
async function jgRoomReallyAdvanceToDayPhase(night){
  const db=window.jgFirebaseDb;
  await jgRoomCaptureDeathLine(night);
  const roomSnap=await getDoc(doc(db,'rooms',jgRoomCode));
  const fresh=roomSnap.exists()?roomSnap.data():{};
  const sheriffEnabled=!!fresh.sheriffEnabled;
  // daySpeechStart（今天從幾號開始發言）每天都要重新決定，但這個欄位原本只在建房時被設成
  // null 過一次，進入白天時完全沒有重置——導致第一天抽（或警長指定）出起點之後，欄位就
  // 一直留在資料庫裡，後面每一天進到白天畫面時 jgRoomRenderDayOpen 看到「已經有值」就直接
  // 沿用第一天的舊起點，不會再轉盤／重抽。這裡在真正進入白天之前先清空，daySpeechDir
  // （順/逆時針）不受影響——那個依規則整局只決定一次，之後每天都要維持同一個方向。
  await setDoc(doc(db,'rooms',jgRoomCode),{ daySpeechStart:null },{ merge:true });
  // 雙爆吞警徽・昨天發生過第一爆（警徽保留，競選延到隔天）：今天不重新問候選人起立、
  // 也不用再政見發表一次（政見昨天已經講過了），直接恢復成「候選人可以退水／房主開放
  // 投票」的畫面（見 jgRoomRenderSheriffCampaign 的 day2resume 分支），沿用昨天還活著、
  // 還沒退水的候選人名單（sheriffCandidates 整晚都沒被清掉）。這個判斷要放在
  // night===1&&sheriffEnabled 前面，因為恢復競選這件事跟「是不是第一夜」無關（一定是在
  // 第一爆發生的隔天，night 可能是任何數字）。
  if(fresh.sheriffPostponedToDay2){
    await setDoc(doc(db,'rooms',jgRoomCode),{
      currentStep:null, phase:'sheriff', sheriffPhase:'day2resume', sheriffPostponedToDay2:false
    },{ merge:true });
    return;
  }
  if(night===1&&sheriffEnabled){
    await jgRoomAdvanceToSheriffCampaign();
  } else {
    await setDoc(doc(db,'rooms',jgRoomCode),{ currentStep:null, phase:'day-open', sheriffPhase:null },{ merge:true });
  }
}
// 這一晚的死訊：比照本機法官助手「>X號死亡、Y號死亡」（或「>平安夜」）的格式，寫進
// rooms/{code}/dayLog/{night}.deathLine，永久保留（不會被下一晚蓋掉）。這裡只看房間系統
// 目前真的有自動化的幾種死法（狼刀/女巫毒/機械狼額外一刀或毒/黑市商人交易失敗/攝夢人
// 連續兩晚致死/邱比特殉情），用「這個座位現在是不是活著＝false」來判斷這次死亡有沒有
// 真的發生（例如狼刀被守衛+解藥擋下就不會出現在這裡）。開槍帶人的結果之後會用
// jgRoomAppendShotNoteToDayLog 補在這一行後面，不是在這裡處理。
async function jgRoomCaptureDeathLine(night){
  const db=window.jgFirebaseDb;
  const roomSnap=await getDoc(doc(db,'rooms',jgRoomCode));
  const fresh=roomSnap.data()||{};
  const seatOfUid=(uid)=>{ const p=jgRoomLatestPlayers.find(pp=>pp.uid===uid); return p?p.seatNum:null; };
  const uidOfSeat=(seat)=>{ const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seat); return p?p.uid:null; };
  // 死訊是整晚最後一步才結算，前面女巫／機械狼等好幾個步驟剛寫完 alive:false，即時監聽器
  // （onSnapshot）不一定來得及在這裡執行之前就把畫面快取（jgRoomLatestPlayers）更新好——
  // 改成用資料庫最新狀態判斷「這個人是不是真的死了」，避免用還沒同步到的舊快取誤判成
  // 平安夜（這個問題是這次補測試才抓到的：測試環境模擬「剛下毒」跟「結算死訊」這兩步
  // 之間完全沒有時間讓監聽器同步，結果死訊真的被誤報成平安夜）。座位↔uid 的對應關係本身
  // 是穩定不變的（一旦加入房間就不會再變），可以放心用快取查，只有「死活狀態」這種真的
  // 會變動的欄位才需要重新讀資料庫。
  const isDeadUid=async(uid)=>{
    if(!uid) return false;
    const pSnap=await getDoc(doc(db,'rooms',jgRoomCode,'players',uid));
    return pSnap.exists()&&pSnap.data().alive===false;
  };
  const seen=new Set(); const parts=[];
  const add=async(uid, seat, note)=>{
    if(!uid||!seat||seen.has(seat)) return;
    if(!(await isDeadUid(uid))) return;
    seen.add(seat); parts.push(seat+'號死亡'+(note||''));
  };
  if(fresh.wolfKillNight===night) await add(fresh.wolfKillTargetUid, fresh.wolfKillTargetSeatNum, '');
  await add(fresh.witchPoisonUid, seatOfUid(fresh.witchPoisonUid), '');
  if(fresh.mechWolfBonusKillNight===night) await add(fresh.mechWolfBonusKillUid, seatOfUid(fresh.mechWolfBonusKillUid), '');
  if(fresh.mechWolfPoisonNight===night) await add(fresh.mechWolfPoisonUid, seatOfUid(fresh.mechWolfPoisonUid), '');
  if(fresh.blackmarketFailNight===night) await add(fresh.blackmarketFailUid, seatOfUid(fresh.blackmarketFailUid), '（黑市商人交易失敗）');
  if(fresh.dreamcatcherTargetNight===night) await add(uidOfSeat(fresh.dreamcatcherTargetSeatNum), fresh.dreamcatcherTargetSeatNum, '（連續兩晚被夢，致死）');
  if(fresh.evilknightRevengeWitchNight===night) await add(fresh.evilknightRevengeWitchUid, seatOfUid(fresh.evilknightRevengeWitchUid), '');
  if(fresh.evilknightRevengeSeerNight===night) await add(fresh.evilknightRevengeSeerUid, seatOfUid(fresh.evilknightRevengeSeerUid), '');
  if(fresh.wolfbeautyCascadeNight===night) await add(fresh.wolfbeautyCascadeUid, seatOfUid(fresh.wolfbeautyCascadeUid), '');
  await add(uidOfSeat(fresh.cupidLoverASeatNum), fresh.cupidLoverASeatNum, '（情侶殉情）');
  await add(uidOfSeat(fresh.cupidLoverBSeatNum), fresh.cupidLoverBSeatNum, '（情侶殉情）');
  if(fresh.demonhunterHuntNight===night){
    if(fresh.demonhunterHuntIsWolf) await add(fresh.demonhunterHuntTargetUid, fresh.demonhunterHuntTargetSeatNum, '（獵魔人狩獵）');
    else await add(fresh.demonhunterUid, seatOfUid(fresh.demonhunterUid), '（獵魔人狩獵失敗，反噬自身）');
  }
  let line=parts.length?parts.join('、'):'平安夜';
  // 夜槍（獵人/黑狼王/幸運兒被狼刀淘汰後開的槍）的結果，在槍決定完的當下就先存進
  // shotNotes（見 jgRoomAppendShotNoteToDayLog 的說明），這裡讀出來接在死訊句子後面。
  const dayLogSnap=await getDoc(doc(db,'rooms',jgRoomCode,'dayLog',String(night)));
  const shotNotes=(dayLogSnap.exists()&&dayLogSnap.data().shotNotes)||[];
  if(shotNotes.length) line+=shotNotes.join('');
  await jgRoomSetDayDeathLine(night, line);
}
// 查驗類角色結束後（或本來就沒有）要接白天（第一夜是警長競選，其餘夜晚直接公告死訊），
// 狼刀/女巫結束後則要接查驗類角色（或沒有查驗類角色時直接接白天）——共用這個判斷，避免
// 每個地方都要重複寫一次 if/else。
// 這一晚如果還有人（獵人／黑狼王／持有獵槍技能的幸運兒）被狼刀淘汰、還沒決定要不要開槍
// 帶人，要先卡在「開槍」這一步，等所有人都決定完才能繼續往下走——不然查驗類角色/警長
// 競選會在死訊還沒完全結算前就先跑掉。
async function jgRoomAdvanceToCheckOrSheriff(){
  const db=window.jgFirebaseDb;
  const roomSnap=await getDoc(doc(db,'rooms',jgRoomCode));
  const rd=roomSnap.data()||{};
  const pendingShoot=rd.pendingShootUids||[];
  if(pendingShoot.length){
    await setDoc(doc(db,'rooms',jgRoomCode),{ currentStep:'shoot', pendingShootContext:'night' },{ merge:true });
    return;
  }
  // 警長如果剛好也在這一晚死了（不管是狼刀、女巫毒、或任何一種死法），要先讓他決定警徽
  // 傳給誰，才能繼續往下走——見 jgRoomCheckAndSetPendingBadge 的說明。
  if(await jgRoomCheckAndSetPendingBadge()){
    await setDoc(doc(db,'rooms',jgRoomCode),{ currentStep:'badge' },{ merge:true });
    return;
  }
  // 這一晚的死亡（含夜槍、警徽傳遞）都已經塵埃落定，才是檢查勝負的正確時機——
  // 分出勝負就直接讓所有人的畫面切去結束畫面，不用再進查驗步驟或天亮。
  if(await jgRoomMaybeDeclareWin()) return;
  // 血月使者自爆封印當晚所有神牌技能（見 jgRoomBloodmoonDetonateConfirm）：查驗類角色
  // 這一步也要跳過，不能因為技能被封印就卡住流程。
  const checkStep=jgRoomGodSkillsSealedThisNight(rd.night||1)?null:jgRoomNextCheckStep();
  if(checkStep){
    await setDoc(doc(db,'rooms',jgRoomCode),{ currentStep:checkStep },{ merge:true });
  } else {
    await jgRoomAdvanceToDayPhase(rd.night||1);
  }
}
// 現在的警長是不是剛好死了、警徽還沒處理過——是的話把 pendingBadgeUid 設成他的 uid（讓他
// 自己的畫面跳出「警徽要傳給誰」的選擇畫面），並回傳 true 讓呼叫端知道要先卡住流程等他
// 決定。跟夜槍不一樣，警徽傳遞不管警長是怎麼死的都會觸發（沒有「被毒殺就不能傳」這種
// 限制），所以判斷比 jgRoomCheckShootEligible 單純很多，只要「現在的警長死了、這次死亡
// 還沒處理過警徽」就一定要問。sheriffBadgeHandledUids 記錄「這個人死掉時警徽已經處理過
// 了」，避免同一次死亡被不同呼叫點（狼刀結算／開槍結算／放逐投票結算）重複觸發。
async function jgRoomCheckAndSetPendingBadge(){
  const db=window.jgFirebaseDb;
  const roomSnap=await getDoc(doc(db,'rooms',jgRoomCode));
  const fresh=roomSnap.data()||{};
  if(!fresh.sheriffWinnerSeatNum) return false;
  if(fresh.pendingBadgeUid) return true;
  const sheriffP=jgRoomLatestPlayers.find(p=>p.seatNum===fresh.sheriffWinnerSeatNum);
  if(!sheriffP) return false;
  // 直接讀資料庫最新狀態，不要只看 jgRoomLatestPlayers 這份畫面快取——這個函式常常緊接在
  // 剛寫入 alive:false 之後就呼叫，即時監聽器（onSnapshot）的更新可能還沒同步回來，用快取
  // 判斷有機率讀到「警長其實已經死了，但畫面上還顯示活著」的舊狀態，導致警徽流程沒有被
  // 正確觸發。
  const freshPSnap=await getDoc(doc(db,'rooms',jgRoomCode,'players',sheriffP.uid));
  const stillAlive=freshPSnap.exists()?(freshPSnap.data().alive!==false):true;
  if(stillAlive) return false;
  if((fresh.sheriffBadgeHandledUids||[]).includes(sheriffP.uid)) return false;
  await setDoc(doc(db,'rooms',jgRoomCode),{ pendingBadgeUid: sheriffP.uid },{ merge:true });
  return true;
}
// 警徽傳遞完（傳給別人，或選擇摧毀）之後，接回原本被打斷的流程——夜晚接查驗類角色／
// 白天接下一夜。
async function jgRoomAfterBadgeResolved(){
  const rd=jgRoomLatestRoomDoc||{};
  if(rd.phase==='night'){
    await jgRoomAdvanceToCheckOrSheriff();
  } else if(rd.knightDuelContinueDay){
    // 騎士決鬥到好人、騎士本人是警長：警徽交接完，白天繼續發言與投票。
    const db=window.jgFirebaseDb;
    await setDoc(doc(db,'rooms',jgRoomCode),{ knightDuelContinueDay:false },{ merge:true });
    await jgRoomMaybeDeclareWin();
  } else {
    await jgRoomStartNextNight();
  }
  jgRoomRenderCurrentPhase();
}
window.jgRoomPassBadge=async function(targetUid, targetSeatNum){
  if(!confirm('確定要把警徽傳給 '+targetSeatNum+'號 嗎？')) return;
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  const myUid=rd.pendingBadgeUid;
  await setDoc(doc(db,'rooms',jgRoomCode),{
    sheriffWinnerSeatNum: targetSeatNum, pendingBadgeUid:null,
    sheriffBadgeHandledUids: arrayUnion(myUid)
  },{ merge:true });
  await jgRoomAfterBadgeResolved();
};
window.jgRoomDestroyBadge=async function(){
  if(!confirm('確定要摧毀警徽（不傳給任何人，之後的放逐投票不再有 1.5 票加權）嗎？')) return;
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  const myUid=rd.pendingBadgeUid;
  await setDoc(doc(db,'rooms',jgRoomCode),{
    sheriffWinnerSeatNum: null, pendingBadgeUid:null,
    sheriffBadgeHandledUids: arrayUnion(myUid)
  },{ merge:true });
  await jgRoomAfterBadgeResolved();
};
// 警長死亡、要決定警徽傳給誰的畫面：可以傳給任何一位還活著的人（含自己已死但畫面上還
// 看得到的其他死者？不行，只能選活著的人——跟本機法官助手一致，死人不能接警徽）。
function jgRoomBadgeViewHtml(){
  return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><h1>你陣亡了，警徽要傳給誰？</h1></div>'
    +jgRoomNumGridHtml('jg-room-badge-pick', null)
    +'<div style="text-align:center;"><button class="primary" style="margin-top:14px;" onclick="jgRoomPassBadgeFromGrid()">傳給他</button></div>'
    +'<div style="text-align:center;"><button style="margin-top:8px;" onclick="jgRoomDestroyBadge()">摧毀警徽（不傳）</button></div>'};
}
window.jgRoomPassBadgeFromGrid=function(){
  const hidden=document.getElementById('jg-room-badge-pick');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seatNum);
  if(!p) return;
  window.jgRoomPassBadge(p.uid, seatNum);
};
// 這個人被狼刀／機械狼額外一刀害死，或白天被投票放逐時，算不算「有資格夜槍/白天槍帶
// 人」——獵人、黑狼王、或目前持有幸運兒獵槍技能的人都算；女巫毒殺、黑市商人交易失敗死亡、
// 攝夢人夢遊被動連死、邱比特殉情，這些死法都不算（獵人被毒殺時規則明講不能開槍；其餘幾種
// 死法角色說明裡都沒有提到可以開槍，這裡採取跟本機法官助手一致的判斷）。night 用參數傳
// 進來，不要用 jgRoomLatestRoomDoc（那是畫面上快取的，這裡要跟結算當下讀到的資料庫狀態
// 一致）。幸運兒的查驗/毒藥技能要等「下一晚」才能用，但獵槍比較特別——黑市商人交易發生在
// 狼隊出刀之後，緊接著就是白天，所以獵槍是「當天的白天」就能用（見 ALL_ROLES.blackmarket：
// 「下一個白天起可使用」）；dayVote=true（白天投票放逐時呼叫）用「<=」比較，dayVote=false
// （夜裡被狼刀淘汰時呼叫）維持原本「<」比較，兩種情境都對應到「交易當晚之後的第一次淘汰
// 機會」就能用。
async function jgRoomCheckShootEligible(uid, night, dayVote){
  if(!uid) return false;
  const db=window.jgFirebaseDb;
  const secretSnap=await getDoc(doc(db,'rooms',jgRoomCode,'secrets',uid));
  const role=secretSnap.exists()?secretSnap.data().role:null;
  if(role==='hunter'){
    // 唯鄰是從：獵人是傀儡，技能失效，死亡時不能開槍。
    const rSnap=await getDoc(doc(db,'rooms',jgRoomCode));
    const rdx=rSnap.exists()?rSnap.data():{};
    if(rdx.boardPreset==='neighbor_puppet'&&rdx.puppetUid===uid) return false;
    return true;
  }
  if(role==='wolfking') return true;
  const pSnap=await getDoc(doc(db,'rooms',jgRoomCode,'players',uid));
  const p=pSnap.exists()?pSnap.data():null;
  if(!p) return false;
  // 機械狼學到「獵人」：這個被動的「淘汰時開槍」能力本身沒有「次晚起」的限制（跟每晚可用的
  // 主動技能不一樣），學到的當下就算數，不用檢查是哪一晚學到、現在是第幾晚——跟本機法官助手
  // jgMechWolfHunterActive() 的規則一致（只看有沒有學到，不看學到之後過了幾晚）。
  if(role==='mechanicalwolf'&&p.mechWolfLearnedRole==='hunter') return true;
  if(p.luckyOneSkill!=='hunter') return false;
  return dayVote ? (p.luckyOneGrantedNight<=night) : (p.luckyOneGrantedNight<night);
}
// 狼刀死亡結算：只在「女巫回合結束後」（或板子沒有女巫、狼隊確認完就直接算）呼叫一次。
// 規則：守衛跟女巫的解藥都保到同一個人＝奶穿，還是會死；只有其中一種保護才會活下來；
// 女巫的毒不受任何保護影響，中毒必死（跟法官助手既有的規則一致）。
// 攝夢人板：夢遊者這一晚免疫狼刀／女巫毒／機械狼學到的技能造成的夜間死亡（見
// ALL_ROLES.dreamcatcher 的技能說明），所以要先判斷「這一晚被狼刀/毒到的人是不是今晚的
// 夢遊者」，是的話直接跳過那筆死亡，不受任何保護標記影響（跟守衛/解藥是分開判斷的另一層）。
// 機械狼板：學到狼人/黑狼王的額外一刀、學到女巫的毒藥都是「整局限一次、不可被守衛或女巫
// 解藥阻擋」的直接擊殺，這裡也一併結算（一樣先檢查夢遊免疫，但不檢查守衛/解藥）。
async function jgRoomResolveNightDeaths(){
  const db=window.jgFirebaseDb;
  const freshSnap=await getDoc(doc(db,'rooms',jgRoomCode));
  const fresh=freshSnap.data()||{};
  const night=fresh.night;
  const isDreaming=(uid)=>!!(uid&&fresh.dreamcatcherTargetNight===night&&fresh.dreamcatcherTargetUid===uid);
  // diedNight 記住「這個人是哪一晚死的」，給 jgRoomIsPubliclyDead 判斷死訊有沒有公布用
  // （見該函式說明）——死訊本身還是要等天亮 jgRoomCaptureDeathLine／進入白天才算公布。
  const kill=async(uid)=>{ if(uid) await setDoc(doc(db,'rooms',jgRoomCode,'players',uid),{ alive:false, diedNight:night },{ merge:true }); };
  // 這一晚「真的死於狼刀／機械狼額外一刀」的人——只有這兩種死法才可能觸發夜槍（見
  // jgRoomCheckShootEligible 的說明），先收集起來，結算完再一起檢查資格、寫進
  // pendingShootUids，避免跟下面的死亡結算穿插在一起、漏算或算重。
  const wolfKillDeathCandidates=[];
  const wolfTarget=fresh.wolfKillTargetUid;
  // 第一批新增角色需要的真實身分：惡靈騎士（免疫狼刀／毒、毒他會反傷女巫）、唯鄰是從的
  // 傀儡（傀儡是守衛／女巫時技能用掉但不生效）、狼美人（被毒死時魅惑對象殉情）。
  const roleOf=await jgRoomSecretsMap();
  const puppetUid=(fresh.boardPreset==='neighbor_puppet')?fresh.puppetUid:null;
  const puppetRole=puppetUid?roleOf[puppetUid]:null;
  if(wolfTarget&&!isDreaming(wolfTarget)&&roleOf[wolfTarget]!=='evilknight'){
    // guardProtectedUid／witchSavedUid 原本沒有比對「是不是這一晚存的」，只要欄位裡剛好
    // 是同一個 uid 就算數——這兩個欄位從來沒有在每晚開始時清空，只要守衛/女巫之前任何一晚
    // 保護／救過某人，之後只要狼隊「剛好」又選中同一個人當目標（很常見，例如連兩晚都殺
    // 同一個高價值目標），就會被這筆早就過期的舊紀錄誤判成「這一晚也被保護／救了」，明明
    // 女巫這晚根本沒救、甚至沒藥了，狼刀卻莫名其妙被擋下、天亮播平安夜。改成一定要「這一晚
    // 存的」（guardTargetNight／witchSavedNight＝現在這一晚）才算數，跟下面 mechGuardedThis
    // 本來就有的 night 比對邏輯一致。
    const guardedThis=puppetRole!=='guard'&&fresh.guardProtectedUid&&fresh.guardTargetNight===night&&fresh.guardProtectedUid===wolfTarget;
    const savedThis=puppetRole!=='witch'&&fresh.witchSavedUid&&fresh.witchSavedNight===night&&fresh.witchSavedUid===wolfTarget;
    const mechGuardedThis=fresh.mechWolfGuardUid&&fresh.mechWolfGuardNight===night&&fresh.mechWolfGuardUid===wolfTarget;
    const overheal=guardedThis&&savedThis;
    if(overheal||(!guardedThis&&!savedThis&&!mechGuardedThis)){
      await kill(wolfTarget);
      wolfKillDeathCandidates.push(wolfTarget);
    }
  }
  // 獵魔人免疫女巫毒藥（見角色規則說明）——毒到他本人的話要先查一下被毒對象的真實
  // 角色再決定要不要真的殺，跟其餘幾種「整局限一次、不可阻擋」的死法不一樣，這裡是
  // 唯一需要額外讀 secrets 的一種。只有真的有人被毒、而且這場板子確實可能有獵魔人時
  // 才查（板子沒有獵魔人的情況多讀一次 secrets 沒有意義，但直接查也無害，不特地省略）。
  // witchPoisonUid 一樣要比對是不是這一晚下的毒，理由跟上面 guardedThis／savedThis 一樣——
  // 沒有這個比對的話，某一晚下過毒之後，之後每一晚結算都會把同一個人重新「毒」一次
  // （雖然對方通常早就已經死亡，寫入不會造成新的錯誤死亡，但邏輯上是錯的，萬一那個人剛好
  // 被守衛/女巫救回來或其他方式復活，就會被這筆過期紀錄再殺一次）。
  let wolfbeautyPoisoned=false;
  if(fresh.witchPoisonUid&&fresh.witchPoisonNight===night&&!isDreaming(fresh.witchPoisonUid)&&puppetRole!=='witch'){
    const poisonRole=roleOf[fresh.witchPoisonUid]||null;
    if(poisonRole==='evilknight'){
      // 惡靈騎士免疫女巫毒；反傷（整局限一次）：女巫天亮死亡。
      if(!fresh.evilknightRevengeUsed){
        const witchUid=Object.keys(roleOf).find(u=>roleOf[u]==='witch');
        if(witchUid){
          await kill(witchUid);
          await setDoc(doc(db,'rooms',jgRoomCode),{ evilknightRevengeUsed:true, evilknightRevengeWitchUid:witchUid, evilknightRevengeWitchNight:night },{ merge:true });
        }
      }
    } else if(poisonRole!=='demonhunter'){
      await kill(fresh.witchPoisonUid);
      if(poisonRole==='wolfbeauty') wolfbeautyPoisoned=true;
    }
  }
  // 機械狼學到狼人/黑狼王的額外一刀、學到女巫的毒藥：整局限一次、不可被守衛/解藥阻擋。
  if(fresh.mechWolfBonusKillUid&&fresh.mechWolfBonusKillNight===night&&!isDreaming(fresh.mechWolfBonusKillUid)){
    await kill(fresh.mechWolfBonusKillUid);
    wolfKillDeathCandidates.push(fresh.mechWolfBonusKillUid); // 這也算狼隊的刀，一樣可能觸發夜槍
  }
  if(fresh.mechWolfPoisonUid&&fresh.mechWolfPoisonNight===night&&!isDreaming(fresh.mechWolfPoisonUid)&&roleOf[fresh.mechWolfPoisonUid]!=='evilknight'){
    await kill(fresh.mechWolfPoisonUid);
    if(roleOf[fresh.mechWolfPoisonUid]==='wolfbeauty') wolfbeautyPoisoned=true;
  }
  // 攝夢人被動技：如果攝夢人自己這一晚也死了（例如中了女巫毒或機械狼的毒），夢遊者要
  // 一併死亡——重新讀一次玩家名單確認攝夢人真的死了（上面幾筆死亡可能剛寫進去，這裡
  // 用資料庫最新狀態判斷，不要用畫面上可能還沒更新的 jgRoomLatestPlayers）。
  if(fresh.dreamcatcherTargetNight===night&&fresh.dreamcatcherOwnUid&&fresh.dreamcatcherTargetUid){
    const dcSnap=await getDoc(doc(db,'rooms',jgRoomCode,'players',fresh.dreamcatcherOwnUid));
    const dcAlive=dcSnap.exists()?(dcSnap.data().alive!==false):true;
    if(!dcAlive) await kill(fresh.dreamcatcherTargetUid);
  }
  // 黑市商人交易失敗（誤跟狼隊交易）：黑市商人自己死亡，不可被守衛/解藥阻擋，但一樣先看
  // 夢遊免疫（跟其他「整局限一次、不可被守衛/解藥阻擋」的死法一致處理）。
  if(fresh.blackmarketFailUid&&fresh.blackmarketFailNight===night&&!isDreaming(fresh.blackmarketFailUid)) await kill(fresh.blackmarketFailUid);
  // 邱比特情侶殉情：只要這一晚死亡結算完之後，兩位情侶剛好變成「一個死一個活」，活著的
  // 那位要立刻跟著殉情——重新讀一次最新的存活狀態判斷（上面的死亡可能剛寫進去）。殉情
  // 死亡不算夜槍資格（見 ALL_ROLES.cupid：「殉情者原本的技能不會發動」），所以要在這一步
  // 之前就先把 wolfKillDeathCandidates 的夜槍資格算好、寫進 pendingShootUids。
  const eligibleShooters=[];
  for(const uid of wolfKillDeathCandidates){
    if(await jgRoomCheckShootEligible(uid, night)) eligibleShooters.push(uid);
  }
  if(eligibleShooters.length){
    await setDoc(doc(db,'rooms',jgRoomCode),{ pendingShootUids:eligibleShooters, pendingShootContext:'night' },{ merge:true });
  }
  await jgRoomApplyCupidCascade();
  // 狼美人夜裡被毒死：當晚魅惑的對象殉情。
  if(wolfbeautyPoisoned){
    const wbUid=Object.keys(roleOf).find(u=>roleOf[u]==='wolfbeauty');
    await jgRoomWolfbeautyCascade(wbUid, night);
  }
}
// 邱比特情侶殉情連動：讀最新的兩位情侶存活狀態，只要剛好一死一活，把活著的那位也標記
// 死亡。用 while 迴圈而不是判斷一次就結束，是因為「殉情」本身也可能再觸發別的連動
// （目前系統只有邱比特這一種連動，正常情況跑一次迴圈就會穩定下來，迴圈只是保險）。
async function jgRoomApplyCupidCascade(){
  const db=window.jgFirebaseDb;
  const roomSnap=await getDoc(doc(db,'rooms',jgRoomCode));
  const rd=roomSnap.data()||{};
  const a=rd.cupidLoverAUid, b=rd.cupidLoverBUid;
  if(!a||!b||a===b) return; // 沒有配對、或配對成同一人（不太可能，保險起見）
  for(let i=0;i<3;i++){
    const [aSnap,bSnap]=await Promise.all([
      getDoc(doc(db,'rooms',jgRoomCode,'players',a)),
      getDoc(doc(db,'rooms',jgRoomCode,'players',b))
    ]);
    const aAlive=aSnap.exists()?(aSnap.data().alive!==false):true;
    const bAlive=bSnap.exists()?(bSnap.data().alive!==false):true;
    if(aAlive===bAlive) return; // 都活著或都死了，不用殉情
    const survivor=aAlive?a:b;
    // 殉情可能是夜裡死亡連動觸發、也可能是白天投票放逐連動觸發——只有前者（還在夜晚
    // 階段）需要記 diedNight 延後公布，白天放逐本來就是當場公開的死亡，不用隱藏。
    await setDoc(doc(db,'rooms',jgRoomCode,'players',survivor),{ alive:false, diedNight:rd.phase==='night'?(rd.night||null):null },{ merge:true });
  }
}
