'use strict';
// ═══════════════════════════════════════════
// js/room/widgets.js
// 連線房間：法官語音、畫面上的浮動按鈕（白狼王／血月使者／狼人自爆）、文字聊天室。
// 連線房間的程式拆成 js/room/ 底下好幾個一般 script 檔（依 index.html 的順序用 defer 載入，
// 共用同一個全域範圍，互相看得到彼此的變數與函式）；Firestore 函式由 js/firebase-init.js 提供。
// 檔案總覽見 js/room/core.js 開頭。
// ═══════════════════════════════════════════

// ═══════════════════════════════════════════
// 法官語音（連線房間）——用瀏覽器內建的語音合成（Web Speech API），不需要另外準備任何
// 語音檔，也不用另外架設服務。跟 jgRoomComputeWinCheck 用同一份「這個板子的角色我們都
// 認識」白名單（JG_ROOM_WIN_CHECK_SUPPORTED_ROLES）判斷要不要開放語音，先只在勝負也能
// 自動判定的兩個板子（機械狼＋通靈師、攝夢人＋夢魘）生效，避免對還沒驗證過流程的其他
// 板子亂念台詞、誤導玩家。開關預設關閉、存在 localStorage，每個人自己的裝置各自記憶
// （避免好幾支手機同時開著語音互相搶著念、吵成一團）。
// ═══════════════════════════════════════════
let jgRoomVoiceState={ key:null, night:null, step:null }; // 記住「上次已經念過的狀態」，同一個狀態被重複觸發的重畫（例如玩家名單監聽器也會重畫畫面）不會重複念
// 「天亮請睜眼」（day-open／sheriff 這兩個分支）另外用這兩個變數各自記住「已經幫這一夜
// 念過開場白了嗎」，不能只靠 jgRoomVoiceState.key 判斷——白天期間投票、遺言這些狀態會
// 輪流把 jgRoomVoiceState.key 蓋成別的值，蓋掉之後如果又繞回「顯示白天開場畫面」這個
// 分支（例如平票 PK 重新投票前那個中間畫面），key 對不起來就會被誤判成「還沒念過」，
// 把「天亮請睜眼」在同一個白天裡重複念好幾次——這是這次抓到的真正 bug。
let jgRoomVoiceDayAnnouncedNight=null;
let jgRoomVoiceSheriffAnnouncedNight=null;
let jgRoomVoiceSpokenLog=[]; // 純粹留給測試／除錯用：依序記錄目前為止念過的每一句話，不影響正式運作
// 房間目前的板子（compRoles）是不是都在勝負自動判定支援的角色清單裡——語音功能沿用同一份
// 白名單，理由跟勝負判定一樣：這兩個板子以外的流程還沒逐一驗證過語音時機對不對，先不要念。
function jgRoomVoiceSupported(){
  if(!jgRoomComp) return false;
  const compRoles=Object.keys(jgRoomComp).filter(r=>(jgRoomComp[r]||0)>0);
  return compRoles.length>0 && compRoles.every(r=>JG_ROOM_WIN_CHECK_SUPPORTED_ROLES.has(r));
}
function jgRoomVoiceGetPref(){
  try{ return localStorage.getItem('jgRoomVoiceOn')==='1'; }catch(e){ return false; }
}
function jgRoomVoiceSetPref(on){
  try{ localStorage.setItem('jgRoomVoiceOn', on?'1':'0'); }catch(e){}
}
// 真正開口念一句話——新的一句話一定比舊的優先（cancel 掉還在排隊或正在念的舊台詞），
// 避免狀態變化太快時，語音排隊排到過時、跟畫面對不上的台詞。
function jgRoomSpeak(text){
  if(!text) return;
  jgRoomVoiceSpokenLog.push(text);
  if(typeof window==='undefined'||!window.speechSynthesis) return;
  try{
    // 原本這裡每次講話前都先 speechSynthesis.cancel()，理由是想避免「舊狀態排隊排到現在
    // 才念、跟畫面已經不相關」的殘留台詞——但這個 app 好幾個地方（jgRoomVoiceMaybeNarrate
    // 的「XX請睜眼」廣播播報、jgRoomSpeakScriptLine 讀畫面上「你要...」的個人提示、房主
    // 強制跳過等操作）常常在極短時間內連續呼叫 jgRoomSpeak 兩次以上，例如通靈師畫面剛念完
    // 「你要查驗的對象是？」，緊接著房間文件更新觸發的「通靈師請睜眼」廣播就把它整句
    // 打斷、蓋掉，兩句話糊在一起甚至聽起來像多出一個字（回報過的「機械狼請睜眼嗎」很可能
    // 就是這樣兩句台詞尾巴黏在一起造成的）。改成不主動打斷，讓瀏覽器內建的語音佇列自然
    // 依序播放完——真正「同一句話不要重複念」的去重邏輯本來就交給呼叫端各自的 key 比對
    // （jgRoomVoiceSpeakOnce／jgRoomTimerLastSpokenKey／xxxAnnouncedNight 這幾個），不需要
    // 靠這裡的 cancel() 來防止重複，拿掉之後同一時間有好幾句話要講，會排隊依序念完，不會
    // 半途打斷彼此。
    const u=new SpeechSynthesisUtterance(text);
    u.lang='zh-TW';
    window.speechSynthesis.speak(u);
  }catch(e){}
}
// 夜晚各個步驟（連線房間的 currentStep 值）對應的角色稱呼——跟 RNAME 大致相同，但
// 'wolfbrother'／'mechwolf' 這兩個 currentStep 名稱本身跟 RNAME 的角色 key 對不上
// （狼兄弟分成 wolfbrother_e／wolfbrother_y 兩個角色 key、機械狼的 currentStep 叫
// 'mechwolf' 但角色 key 是 'mechanicalwolf'），這裡另外對應一份給語音專用。
const JG_ROOM_STEP_ROLE_NAME={
  thief:'盜賊', cupid:'邱比特', nightmare:'夢魘', magician:'魔術師', guard:'守衛',
  dreamcatcher:'攝夢人', wolfbrother:'狼兄狼弟', mechwolf:'機械狼', wolf:'狼人',
  blackmarket:'黑市商人', witch:'女巫', seer:'預言家', medium:'通靈師', demonhunter:'獵魔人',
  hunter:'獵人', hybrid:'混血兒', wolfbeauty:'狼美人'
};
function jgRoomVoiceSpeakOnce(key, text){
  if(key===jgRoomVoiceState.key) return;
  jgRoomVoiceState={ key, night:null, step:null };
  if(text) jgRoomSpeak(text);
}
// 依照房間目前狀態（房間文件即時監聽收到的最新資料）組出這次該念的台詞。每次監聽器
// 觸發都會呼叫一次，只有「狀態真的往前推進」才會念新的台詞，同一個狀態被重複觸發的
// 重畫不會反覆念。
// 天亮公告的死訊那句台詞，比照本機法官助手 jgBuildDawnMsg 的讀法：讀 dayLog/{night}.deathLine
// （見 jgRoomCaptureDeathLine），平安夜就講「昨晚是平安夜」，有人死就講「昨晚 X號、Y號死亡」。
async function jgRoomVoiceDeathLineText(night){
  if(!jgRoomCode||!night) return '昨晚是平安夜。';
  try{
    const db=window.jgFirebaseDb;
    const dayLogSnap=await getDoc(doc(db,'rooms',jgRoomCode,'dayLog',String(night)));
    const line=dayLogSnap.exists()?dayLogSnap.data().deathLine:null;
    if(!line||line==='平安夜') return '昨晚是平安夜。';
    return '昨晚 '+line+'。';
  }catch(e){ return '昨晚是平安夜。'; }
}
async function jgRoomVoiceMaybeNarrate(rd){
  if(!rd) return;
  if(!jgRoomVoiceGetPref()) return;
  if(!jgRoomVoiceSupported()) return;
  if(rd.gameOverWinner){
    jgRoomVoiceSpeakOnce('gameover:'+rd.gameOverWinner,
      '遊戲結束，'+(rd.gameOverWinner==='wolf'?'狼人':(rd.gameOverWinner==='third'?'第三方':'好人'))+'獲勝。');
    return;
  }
  if(rd.mode==='deal') return; // 發牌模式不是真的在進行遊戲，不用語音
  if(rd.votingActive){
    jgRoomVoiceSpeakOnce('vote:'+(rd.night||0)+':'+(rd.votingRound||0), rd.votingScript||'請開始投票。');
    return;
  }
  if(rd.dayVoteLastWordsUid){
    jgRoomVoiceSpeakOnce('lastwords:'+(rd.night||0)+':'+rd.dayVoteLastWordsUid,
      rd.dayVoteLastWordsSeatNum+'號出局，請發表遺言。');
    return;
  }
  if(rd.sheriffPhase==='pick-direction'&&rd.sheriffWinnerSeatNum){
    jgRoomVoiceSpeakOnce('sheriffelected:'+(rd.night||0)+':'+rd.sheriffWinnerSeatNum,
      rd.sheriffWinnerSeatNum+'號當選警長。');
    return;
  }
  if(rd.phase==='sheriff'){
    const night=rd.night||0;
    if(jgRoomVoiceSheriffAnnouncedNight===night) return;
    jgRoomVoiceSheriffAnnouncedNight=night;
    jgRoomVoiceState={ key:'sheriff:'+night, night, step:null };
    const deathText=await jgRoomVoiceDeathLineText(rd.night);
    jgRoomSpeak('天亮請睜眼，'+deathText+'開放警長競選。');
    return;
  }
  if(rd.phase==='day-open'){
    const night=rd.night||0;
    if(jgRoomVoiceDayAnnouncedNight===night) return;
    jgRoomVoiceDayAnnouncedNight=night;
    jgRoomVoiceState={ key:'day:'+night, night, step:null };
    const deathText=await jgRoomVoiceDeathLineText(rd.night);
    jgRoomSpeak('天亮請睜眼，'+deathText);
    return;
  }
  if(rd.phase==='night'){
    const night=rd.night||0, step=rd.currentStep||null;
    const key='night:'+night+':'+(step||'end');
    if(key===jgRoomVoiceState.key) return;
    // 只有還在同一夜裡，前一個步驟的角色才接得上「XX請閉眼」；跨到新的一夜就直接從
    // 「天黑請閉眼」開始，不用去接上一夜最後一個步驟的角色。
    const prevRoleName=(jgRoomVoiceState.night===night)?JG_ROOM_STEP_ROLE_NAME[jgRoomVoiceState.step]:null;
    const roleName=step?JG_ROOM_STEP_ROLE_NAME[step]:null;
    // 黑市商人「真的談成一筆交易」（不管對象是好人成功、還是踩到狼人失敗，只要不是單純
    // 跳過不交易）離開這一步時，要插一句掩護台詞——跟本機法官助手「幸運兒走一圈」的精神
    // 一樣：不管交易成功與否都講同一句話，避免玩家從「有沒有講這句話」猜出交易結果，
    // 只是連線房間不用真的睜眼查看，改成「白天會在自己手機上顯示」。單純跳過不交易的
    // 夜晚不會設定 blackmarketTradeNight，這裡不會誤講。
    const bmAnnounce=(jgRoomVoiceState.step==='blackmarket'&&jgRoomVoiceState.night===night&&rd.blackmarketTradeNight===night)
      ?'幸運兒將在白天時於頁面顯示你是幸運兒即你獲得的技能，請小心不要讓別人看到。'
      :'';
    let text=null;
    if(jgRoomVoiceState.night!==night){
      text=roleName?('天黑請閉眼，'+roleName+'請睜眼。'):null;
    } else if(prevRoleName&&roleName){
      text=prevRoleName+'請閉眼。'+bmAnnounce+roleName+'請睜眼。';
    } else if(prevRoleName&&!roleName){
      text=prevRoleName+'請閉眼。'+bmAnnounce+'這一夜已經結束。';
    } else if(roleName){
      text=roleName+'請睜眼。';
    }
    jgRoomVoiceState={ key, night, step };
    if(text) jgRoomSpeak(text);
  }
}
// ── 左上角「法官語音」小按鈕：跟右上角「確認自己身分」按鈕（jgRoomAppendMyIdentityButton）
//    是同一種做法——固定掛在 body 上（不是掛在會被整個 innerHTML 換掉的 #jg-room-content
//    裡面），不管現在畫面切到哪個步驟、捲到哪裡都固定看得到，不用每次畫面重畫都在內容
//    最下面重新找一次。只有支援語音的板子才會顯示這顆按鈕，其餘板子整個藏起來。──
function jgRoomAppendVoiceToggleButton(){
  if(document.getElementById('jg-room-voice-btn')) return; // 已經加過了，不要重複加
  const btn=document.createElement('button');
  btn.id='jg-room-voice-btn';
  btn.onclick=jgRoomToggleVoice;
  btn.style.cssText='position:fixed;top:66px;left:8px;z-index:200;width:auto;margin:0;padding:6px 12px;font-size:12px;font-weight:600;border-radius:20px;border:1px solid var(--border);background:var(--bg2);color:var(--text2);cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,0.08);';
  document.body.appendChild(btn);
  jgRoomUpdateVoiceToggleButton();
}
function jgRoomRemoveVoiceToggleButton(){
  const btn=document.getElementById('jg-room-voice-btn');
  if(btn) btn.remove();
}
// ── 白狼王「自爆帶人」：規則說「白天除了投票環節以外的任何階段都可以主動宣告」，不是
//    某個特定步驟才有的操作介面，所以做成跟語音/確認身分同一種「固定貼在畫面角落、
//    不管現在畫面切到哪個子步驟都看得到」的按鈕，而不是塞進某一個特定的 render 函式裡。
//    每次 jgRoomRenderCurrentPhase() 重畫都會呼叫 jgRoomUpdateWhitewolfButton() 判斷這個
//    當下能不能自爆（活著、輪到白天、不是投票中、沒有槍/警徽/遺言/PK 卡著）。──
function jgRoomAppendWhitewolfButton(){
  if(document.getElementById('jg-room-whitewolf-btn')) return;
  const btn=document.createElement('button');
  btn.id='jg-room-whitewolf-btn';
  btn.textContent='白狼王自爆';
  btn.onclick=function(){ window.jgRoomWhitewolfDetonateStart(); };
  btn.style.cssText='position:fixed;bottom:70px;left:8px;z-index:250;width:auto;margin:0;padding:8px 14px;border-radius:20px;font-size:12px;font-weight:700;border:1px solid var(--wolf,#b83828);background:var(--wolf,#b83828);color:#fff;box-shadow:0 1px 6px rgba(0,0,0,0.2);cursor:pointer;display:none;';
  document.body.appendChild(btn);
}
function jgRoomRemoveWhitewolfButton(){
  const btn=document.getElementById('jg-room-whitewolf-btn');
  if(btn) btn.remove();
}
function jgRoomUpdateWhitewolfButton(){
  const btn=document.getElementById('jg-room-whitewolf-btn');
  if(!btn) return;
  const rd=jgRoomLatestRoomDoc||{};
  const me=jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid);
  const eligible=jgMyRole==='whitewolf'&&me&&me.alive!==false&&!rd.votingActive
    &&(rd.phase==='day-open'||rd.phase==='sheriff')
    &&!(rd.pendingShootUids&&rd.pendingShootUids.length)
    &&!rd.pendingBadgeUid&&!rd.dayVoteLastWordsUid
    &&!(rd.dayVotePkPendingUids&&rd.dayVotePkPendingUids.length);
  btn.style.display=eligible?'block':'none';
}
// 點下去先換成一個獨立的選人畫面（取代目前的 #jg-room-content，跟警徽/開槍那些特殊互動
// 畫面是同一種做法），不是彈出視窗——自爆是「整場公開、後果重大」的宣告，用整頁畫面
// 呈現比較慎重，選錯號碼也還有「取消」可以退回目前這一步原本該顯示的畫面。
window.jgRoomWhitewolfDetonateStart=function(){
  const root=document.getElementById('jg-room-content');
  if(!root) return;
  root.innerHTML='<div class="nbanner nbanner-evil" style="margin-top:20px;"><h1>白狼王自爆</h1></div>'
    +'<div class="info-warn" style="text-align:center;">自爆之後會直接進入夜晚，可以選一位玩家一起帶走，也可以不選、只有自己陣亡</div>'
    +jgRoomNumGridHtml('jg-room-whitewolf-pick', null)
    +'<div style="text-align:center;margin-top:10px;"><button class="primary" onclick="jgRoomWhitewolfDetonateConfirm()">自爆</button>'
    +' <button onclick="jgRoomRenderCurrentPhase()">取消</button></div>';
};
// 自爆之後：先標記自己死亡，帶走的人（如果有選）也一起標記死亡，接著跟白天投票放逐
// 死亡同一套流程——先看有沒有警徽要處理，沒有再看有沒有分出勝負，都沒有的話讓白狼王
// 自己發表 90 秒遺言（見 jgRoomStartDayVoteLastWords，同時會標記 exiledByVote，讓他遺言
// 講完之後不用等隔天公布死訊就能看上帝視角——這是白天公開發生的事，沒有保密的必要）。
// 帶走的那個人是被自爆連坐死亡，不是自己選擇要不要講遺言，不會另外卡出他的遺言畫面，
// 但一樣視為「白天公開死亡」，標記 exiledByVote 讓他也能提早看上帝視角。
window.jgRoomWhitewolfDetonateConfirm=async function(){
  const hidden=document.getElementById('jg-room-whitewolf-pick');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!confirm('確定要自爆'+(seatNum?'並帶走 '+seatNum+'號':'（不帶走任何人）')+'嗎？這會直接進入夜晚，無法反悔。')) return;
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  const night=rd.night||1;
  const me=jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid);
  const mySeat=me?me.seatNum:null;
  await setDoc(doc(db,'rooms',jgRoomCode,'players',window.jgFirebaseUid),{ alive:false },{ merge:true });
  let targetSeatText='沒有人';
  if(seatNum){
    const target=jgRoomLatestPlayers.find(p=>p.seatNum===seatNum);
    if(target){
      await setDoc(doc(db,'rooms',jgRoomCode,'players',target.uid),{ alive:false, exiledByVote:true },{ merge:true });
      targetSeatText=seatNum+'號';
    }
  }
  // 自爆不管是在白天發言、還是剛好在警長競選階段發生，都直接算進入白天死訊結算流程——
  // 競選本身直接作廢（反正下一步就是天黑），這樣才能沿用白天既有的「開槍／警徽／遺言」
  // 判斷鏈（那條鏈是掛在 phase==='day-open' 才會被檢查，見 jgRoomRenderDayOpen），不用在
  // 警長競選畫面另外重做一套。如果自爆當下剛好還在警長競選期間，jgRoomMaybeApplyBadgeSwallow
  // 會額外套用單爆/雙爆吞警徽規則（自己不算是候選人的話，函式內部自然不會有任何效果）。
  await jgRoomAppendNightLog(night, (mySeat||'?')+'號（白狼王）自爆，帶走 '+targetSeatText);
  await jgRoomMaybeApplyBadgeSwallow(rd, night, mySeat);
  await setDoc(doc(db,'rooms',jgRoomCode),{ phase:'day-open', sheriffPhase:null },{ merge:true });
  await jgRoomApplyCupidCascade();
  if(await jgRoomCheckAndSetPendingBadge()){
    await jgRoomRefreshAndRenderCurrent();
    return;
  }
  if(await jgRoomMaybeDeclareWin()){
    await jgRoomRefreshAndRenderCurrent();
    return;
  }
  await jgRoomStartDayVoteLastWords(window.jgFirebaseUid, mySeat);
  await jgRoomRefreshAndRenderCurrent();
};

// ── 血月使者自己的主動技能：「白天自己發言階段可自爆後直接進入黑夜，當晚所有神牌技能
//    封印」——限定「自己的發言階段」，不是像白狼王那樣白天任何時候都能按，所以這顆按鈕
//    要另外檢查「現在輪到的發言人是不是我自己」（沿用 90 秒發言輪流計時器的
//    speechTurnContext／speechTurnOrder／speechTurnIdx，見 jgRoomSpeechTurnWidgetHtml），
//    只在白天一般發言輪到自己時才會出現，警長競選政見發表輪到自己時不算。──
function jgRoomAppendBloodmoonButton(){
  if(document.getElementById('jg-room-bloodmoon-btn')) return;
  const btn=document.createElement('button');
  btn.id='jg-room-bloodmoon-btn';
  btn.textContent='血月使者自爆';
  btn.onclick=function(){ window.jgRoomBloodmoonDetonateStart(); };
  btn.style.cssText='position:fixed;bottom:120px;left:8px;z-index:250;width:auto;margin:0;padding:8px 14px;border-radius:20px;font-size:12px;font-weight:700;border:1px solid var(--wolf,#b83828);background:var(--wolf,#b83828);color:#fff;box-shadow:0 1px 6px rgba(0,0,0,0.2);cursor:pointer;display:none;';
  document.body.appendChild(btn);
}
function jgRoomRemoveBloodmoonButton(){
  const btn=document.getElementById('jg-room-bloodmoon-btn');
  if(btn) btn.remove();
}
function jgRoomUpdateBloodmoonButton(){
  const btn=document.getElementById('jg-room-bloodmoon-btn');
  if(!btn) return;
  const rd=jgRoomLatestRoomDoc||{};
  const me=jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid);
  const night=rd.night||1;
  const isMySpeechTurn=rd.speechTurnContext==='day:'+night
    &&Array.isArray(rd.speechTurnOrder)
    &&me&&rd.speechTurnOrder[rd.speechTurnIdx||0]===me.seatNum;
  // 警長競選期間（還沒選出警長）自爆不受「輪到自己發言」限制——那是自爆吞警徽規則本身的
  // 行為，任何符合資格的狼都能在競選期間隨時自爆，不管現在輪到誰發言；「須在自己發言階段
  // 宣告」只限白天一般發言時的自爆（見 jgRoomMaybeApplyBadgeSwallow 的說明）。
  const inSheriffCampaign=rd.phase==='sheriff'&&!rd.sheriffWinnerSeatNum&&!!rd.sheriffPhase;
  const inDayTurn=rd.phase==='day-open'&&isMySpeechTurn;
  const eligible=jgMyRole==='bloodmoon'&&me&&me.alive!==false&&!rd.votingActive
    &&(inDayTurn||inSheriffCampaign)
    &&!(rd.pendingShootUids&&rd.pendingShootUids.length)
    &&!rd.pendingBadgeUid&&!rd.dayVoteLastWordsUid
    &&!(rd.dayVotePkPendingUids&&rd.dayVotePkPendingUids.length);
  btn.style.display=eligible?'block':'none';
}
window.jgRoomBloodmoonDetonateStart=function(){
  if(!confirm('確定要自爆嗎？今晚只有狼隊會正常出刀，其他神牌技能（守衛/女巫/查驗類/獵魔人）全部封印，直接進入黑夜，無法反悔。')) return;
  window.jgRoomBloodmoonDetonateConfirm();
};
// 自爆不帶人（規則明講「自爆時不能開槍帶人」），直接標記自己死亡，接續跟白狼王一樣的
// 「警徽→勝負」判斷鏈，但不給遺言（他剛才就是在自己的發言階段中途自爆，不像白狼王
// 是隨時打斷別人發言，沒有另外需要一段遺言時間的必要）——直接指定下一夜從 wolf 開始
// （跳過守衛），並且標記 godSkillsSealedNight，讓 jgRoomAfterBlackmarketStep／
// jgRoomAdvanceToCheckOrSheriff／jgRoomDemonhunterPending 這幾個檢查點都知道要跳過。
window.jgRoomBloodmoonDetonateConfirm=async function(){
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  const night=rd.night||1;
  const me=jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid);
  const mySeat=me?me.seatNum:null;
  await setDoc(doc(db,'rooms',jgRoomCode,'players',window.jgFirebaseUid),{ alive:false, exiledByVote:true },{ merge:true });
  await jgRoomAppendNightLog(night, (mySeat||'?')+'號（血月使者）自爆，當晚封印所有神牌技能');
  // 如果這一爆剛好發生在警長競選期間，額外套用單爆/雙爆吞警徽規則（自己不是候選人的話，
  // 函式內部自然不會有任何效果）；不管有沒有套用，強制把 phase 收回 day-open，讓後面
  // jgRoomStartNextNight 之前的判斷鏈不用管競選畫面殘留的狀態。
  await jgRoomMaybeApplyBadgeSwallow(rd, night, mySeat);
  await setDoc(doc(db,'rooms',jgRoomCode),{ phase:'day-open', sheriffPhase:null },{ merge:true });
  await jgRoomApplyCupidCascade();
  if(await jgRoomCheckAndSetPendingBadge()){
    await jgRoomRefreshAndRenderCurrent();
    return;
  }
  if(await jgRoomMaybeDeclareWin()){
    await jgRoomRefreshAndRenderCurrent();
    return;
  }
  const nextNight=await jgRoomStartNextNight('wolf', {});
  await setDoc(doc(db,'rooms',jgRoomCode),{ godSkillsSealedNight:nextNight },{ merge:true });
  await jgRoomRefreshAndRenderCurrent();
};

// ── 自爆吞警徽（單爆／雙爆，房主建房時沿用法官助手設定頁的選擇，存進房間文件的
//    badgeMode）：任何可自爆的狼隊角色，如果自爆發生在「警長還沒選出來的競選期間」
//    （sheriffPhase 是 joining／locked／day2resume 這幾種還沒有結果的狀態），除了正常
//    死亡結算之外，還要額外套用吞警徽規則——
//    ・單爆：這一爆直接讓警徽流失，本局不再有警長。
//    ・雙爆：第一爆警徽保留、當天競選直接結束（跟其他情況的自爆一樣直接進入下一夜），
//      隔天白天重新恢復競選（見 jgRoomReallyAdvanceToDayPhase 的 sheriffPostponedToDay2
//      分支，直接跳過重新問候選人起立、跳過政見發表，沿用原本還活著、沒退水的候選人）；
//      如果隔天競選過程中再有人自爆，第二爆警徽才會真正流失。
//    不在競選期間（已經選出警長、或本局根本沒開放警長競選）呼叫這個函式直接什麼都不做，
//    這次自爆單純只是一次普通死亡——如果死的剛好是現任警長，警徽傳承交給既有的
//    jgRoomCheckAndSetPendingBadge 判斷，不歸這裡管。呼叫端傳入的 rd 是呼叫當下的房間
//    文件快取，跟其餘自爆流程（白狼王／血月使者）一致，不特地重新讀一次最新狀態。──
async function jgRoomMaybeApplyBadgeSwallow(rd, night, mySeatNum){
  if(!rd||rd.phase!=='sheriff'||rd.sheriffWinnerSeatNum||!rd.sheriffPhase) return;
  const db=window.jgFirebaseDb;
  const isFirstBlow=rd.badgeMode==='double'&&!rd.sheriffFirstBlowDone;
  const fields={ sheriffCandidates: arrayRemove(window.jgFirebaseUid) };
  if(isFirstBlow){
    fields.sheriffFirstBlowDone=true;
    fields.sheriffFirstBlowSeatNum=mySeatNum;
    fields.sheriffPostponedToDay2=true;
    await jgRoomAppendNightLog(night, (mySeatNum||'?')+'號 自爆（雙爆吞警徽・第一爆，警徽保留，競選延到隔天繼續）');
  } else {
    fields.sheriffWinnerSeatNum=null;
    await jgRoomAppendNightLog(night, (mySeatNum||'?')+'號 自爆，吞掉警徽，本局無警長');
  }
  await setDoc(doc(db,'rooms',jgRoomCode),fields,{ merge:true });
}
// ── 一般可自爆的狼（狼人／黑狼王／已覺醒加入狼窩的狼弟）：白天發言任何時候都可以自爆，
//    不像白狼王能帶人、也不像血月使者要求輪到自己發言才能按——參考本機法官助手「發言
//    階段狼人可隨時自爆」的規則。白狼王／血月使者已經各自有專屬按鈕跟流程（見上面兩段），
//    這裡只涵蓋沒有額外特殊效果的狼隊角色，共用同一套「自爆吞警徽」判斷
//    （jgRoomMaybeApplyBadgeSwallow）。──
const JG_ROOM_WOLF_SELFBLOW_ROLES=new Set(['wolf','wolfking','wolfbrother_y']);
function jgRoomAppendWolfSelfBlowButton(){
  if(document.getElementById('jg-room-wolfblow-btn')) return;
  const btn=document.createElement('button');
  btn.id='jg-room-wolfblow-btn';
  btn.textContent='狼人自爆';
  btn.onclick=function(){ window.jgRoomWolfSelfBlowStart(); };
  btn.style.cssText='position:fixed;bottom:70px;left:8px;z-index:250;width:auto;margin:0;padding:8px 14px;border-radius:20px;font-size:12px;font-weight:700;border:1px solid var(--wolf,#b83828);background:var(--wolf,#b83828);color:#fff;box-shadow:0 1px 6px rgba(0,0,0,0.2);cursor:pointer;display:none;';
  document.body.appendChild(btn);
}
function jgRoomRemoveWolfSelfBlowButton(){
  const btn=document.getElementById('jg-room-wolfblow-btn');
  if(btn) btn.remove();
}
function jgRoomUpdateWolfSelfBlowButton(){
  const btn=document.getElementById('jg-room-wolfblow-btn');
  if(!btn) return;
  const rd=jgRoomLatestRoomDoc||{};
  const me=jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid);
  const roleOk=JG_ROOM_WOLF_SELFBLOW_ROLES.has(jgMyRole)&&(jgMyRole!=='wolfbrother_y'||(me&&me.wolfbrotherJoinedPack));
  // 警長競選期間（還沒選出警長）也可以自爆——自爆吞警徽規則本身的一部分，不管現在輪到
  // 誰發言，任何符合資格的狼都能隨時自爆（跟白狼王按鈕在 sheriff 階段也會出現同一個道理）。
  const inSheriffCampaign=rd.phase==='sheriff'&&!rd.sheriffWinnerSeatNum&&!!rd.sheriffPhase;
  const eligible=roleOk&&me&&me.alive!==false&&!rd.votingActive
    &&(rd.phase==='day-open'||inSheriffCampaign)
    &&!(rd.pendingShootUids&&rd.pendingShootUids.length)
    &&!rd.pendingBadgeUid&&!rd.dayVoteLastWordsUid
    &&!(rd.dayVotePkPendingUids&&rd.dayVotePkPendingUids.length);
  btn.style.display=eligible?'block':'none';
}
window.jgRoomWolfSelfBlowStart=function(){
  if(!confirm('確定要自爆嗎？不能開槍帶人，會跳過投票直接進入夜晚，無法反悔。')) return;
  window.jgRoomWolfSelfBlowConfirm();
};
// 自爆不能開槍帶人、跳過投票，直接標記自己死亡，接續跟白狼王/血月使者一樣的
// 「警徽→勝負→遺言」判斷鏈——一般自爆沒有專屬的特殊效果，遺言比照白狼王處理
// （90秒，講完自動接下一夜），跟血月使者（沒有遺言）不一樣。
window.jgRoomWolfSelfBlowConfirm=async function(){
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  const night=rd.night||1;
  const me=jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid);
  const mySeat=me?me.seatNum:null;
  await setDoc(doc(db,'rooms',jgRoomCode,'players',window.jgFirebaseUid),{ alive:false },{ merge:true });
  await jgRoomAppendNightLog(night, (mySeat||'?')+'號 自爆');
  await jgRoomMaybeApplyBadgeSwallow(rd, night, mySeat);
  await setDoc(doc(db,'rooms',jgRoomCode),{ phase:'day-open', sheriffPhase:null },{ merge:true });
  await jgRoomApplyCupidCascade();
  if(await jgRoomCheckAndSetPendingBadge()){
    await jgRoomRefreshAndRenderCurrent();
    return;
  }
  if(await jgRoomMaybeDeclareWin()){
    await jgRoomRefreshAndRenderCurrent();
    return;
  }
  await jgRoomStartDayVoteLastWords(window.jgFirebaseUid, mySeat);
  await jgRoomRefreshAndRenderCurrent();
};

// 每次畫面重畫都呼叫一次，更新按鈕文字（開/關）跟顯示與否（板子不支援語音就整個藏起來）。
function jgRoomUpdateVoiceToggleButton(){
  const btn=document.getElementById('jg-room-voice-btn');
  if(!btn) return;
  // 發牌模式（mode:'deal'）不是真的在進行遊戲、沒有夜晚/白天流程可以念，跟
  // jgRoomVoiceMaybeNarrate 的判斷一致，這裡也要藏起來，不能讓按鈕在發牌畫面憑空出現。
  const isDeal=jgRoomLatestRoomDoc&&jgRoomLatestRoomDoc.mode==='deal';
  if(isDeal||!jgRoomVoiceSupported()){ btn.style.display='none'; return; }
  btn.style.display='block';
  btn.textContent='法官語音：'+(jgRoomVoiceGetPref()?'開':'關');
}
// 跟右上角「確認自己身分」按鈕一樣，只在「連線房間」分頁顯示，切到其他分頁先藏起來
// ——由 core.js 的 switchTab() 呼叫，跟 jgRoomSetIdentityButtonVisible 是同一組。
window.jgRoomSetVoiceButtonVisible=function(visible){
  const btn=document.getElementById('jg-room-voice-btn');
  if(!btn) return;
  if(!visible){ btn.style.display='none'; return; }
  jgRoomUpdateVoiceToggleButton();
};
// ── 右下角「💬 聊天」文字聊天室：只在白天（day-open／警長競選／投票中）出現，夜晚整個
//    藏起來讓給睜眼操作，不會跟夜晚的操作畫面搶版面。預設收合成一顆小按鈕，點開才展開
//    捲動視窗＋輸入框，不展開時幾乎不佔畫面空間（跟語音通話那條固定貼底的長條不一樣，
//    這裡刻意做成「不點就幾乎看不到」，因為使用者要求「不要影響到頁面」）。訊息本身存在
//    rooms/{code}/chat 子集合，同一場遊戲的白天彼此接續（不會因為天黑就清掉），只有
//    房主重新分配身分、開始新的一場（jgRoomAssignRoles）才會整個清空，見 jgRoomResetChat。──
let jgRoomChatTabVisible=true; // 目前是不是在「連線房間」分頁（切到其他分頁要整個藏起來）
function jgRoomAppendChatWidget(){
  if(document.getElementById('jg-room-chat-widget')) return; // 已經加過了，不要重複加
  const wrap=document.createElement('div');
  wrap.id='jg-room-chat-widget';
  wrap.style.cssText='position:fixed;right:8px;bottom:70px;z-index:250;display:none;text-align:right;';
  wrap.innerHTML=
    '<div id="jg-room-chat-panel" style="display:none;width:230px;max-width:66vw;background:var(--bg2);border:1px solid var(--border);border-radius:10px;box-shadow:0 2px 12px rgba(0,0,0,0.18);margin-bottom:6px;overflow:hidden;text-align:left;">'
    +'<div id="jg-room-chat-msgs" style="max-height:180px;overflow-y:auto;padding:8px;font-size:12.5px;line-height:1.5;word-break:break-word;"></div>'
    +'<div style="display:flex;border-top:1px solid var(--border);">'
    +'<input id="jg-room-chat-input" type="text" maxlength="200" placeholder="輸入訊息…" style="flex:1;border:none;padding:8px;font-size:12.5px;background:transparent;min-width:0;">'
    +'<button style="width:auto;margin:0;padding:8px 12px;border:none;border-radius:0;" onclick="jgRoomSendChat()">送出</button>'
    +'</div></div>'
    +'<button id="jg-room-chat-toggle" onclick="jgRoomToggleChatExpand()" style="width:auto;margin:0;padding:8px 14px;border-radius:20px;font-size:12px;font-weight:600;border:1px solid var(--border);background:var(--bg2);color:var(--text2);box-shadow:0 1px 6px rgba(0,0,0,0.15);cursor:pointer;display:inline-flex;align-items:center;gap:5px;">'
    +'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-4-1L3 20l1.05-3.15A8.38 8.38 0 0 1 3.5 12.5 8.5 8.5 0 0 1 12 4a8.38 8.38 0 0 1 9 7.5z"></path></svg>'
    +'聊天</button>';
  document.body.appendChild(wrap);
  const input=document.getElementById('jg-room-chat-input');
  if(input) input.addEventListener('keydown',(ev)=>{ if(ev.key==='Enter') window.jgRoomSendChat(); });
}
function jgRoomRemoveChatWidget(){
  const wrap=document.getElementById('jg-room-chat-widget');
  if(wrap) wrap.remove();
}
function jgRoomScrollChatToBottom(){
  const box=document.getElementById('jg-room-chat-msgs');
  if(box) box.scrollTop=box.scrollHeight;
}
function jgRoomRenderChatMessages(){
  const box=document.getElementById('jg-room-chat-msgs');
  if(!box) return;
  const wasAtBottom=box.scrollHeight-box.scrollTop-box.clientHeight<20;
  box.innerHTML=jgRoomLatestChatMsgs.length
    ? jgRoomLatestChatMsgs.map(m=>
        '<div style="margin-bottom:4px;"><b>'+String(m.name||'？').replace(/</g,'&lt;')+'：</b>'+String(m.text||'').replace(/</g,'&lt;')+'</div>'
      ).join('')
    : '<div style="color:var(--text3);">還沒有人發言</div>';
  if(wasAtBottom) jgRoomScrollChatToBottom();
}
// 房間文件每次更新都呼叫一次：只有「已經開始遊戲（有 phase）」且「不是發牌模式」且
// 「現在不是夜晚」才顯示，天黑（phase==='night'）就整個藏起來，收合狀態也重置，避免
// 白天展開著、一到晚上畫面上還卡著一個攤開的聊天視窗。
function jgRoomUpdateChatVisibility(){
  const wrap=document.getElementById('jg-room-chat-widget');
  if(!wrap) return;
  const rd=jgRoomLatestRoomDoc||{};
  const isDeal=rd.mode==='deal';
  const started=!!rd.phase;
  const isNight=rd.phase==='night';
  const show=jgRoomChatTabVisible&&started&&!isDeal&&!isNight;
  wrap.style.display=show?'block':'none';
  if(!show){
    jgRoomChatExpanded=false;
    const panel=document.getElementById('jg-room-chat-panel');
    if(panel) panel.style.display='none';
  }
}
window.jgRoomToggleChatExpand=function(){
  jgRoomChatExpanded=!jgRoomChatExpanded;
  const panel=document.getElementById('jg-room-chat-panel');
  if(panel) panel.style.display=jgRoomChatExpanded?'block':'none';
  if(jgRoomChatExpanded) jgRoomScrollChatToBottom();
};
// 跟右上角「確認自己身分」、左上角「法官語音」同一組——只在「連線房間」分頁顯示，切到
// 其他分頁（例如切去看排行榜）先整個藏起來，由 core.js 的 switchTab() 呼叫。
window.jgRoomSetChatWidgetVisible=function(visible){
  jgRoomChatTabVisible=visible;
  jgRoomUpdateChatVisibility();
};
window.jgRoomSendChat=async function(){
  const input=document.getElementById('jg-room-chat-input');
  if(!input||!jgRoomCode) return;
  const text=input.value.trim().slice(0,200);
  if(!text) return;
  input.value='';
  const db=window.jgFirebaseDb;
  const me=jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid);
  try{
    await addDoc(collection(db,'rooms',jgRoomCode,'chat'),{
      uid: window.jgFirebaseUid,
      seatNum: me?me.seatNum:null,
      name: me?(me.seatNum+'號 '+me.name):'？',
      text: text,
      ts: serverTimestamp()
    });
  }catch(err){
    alert('訊息送出失敗：'+(err&&err.message?err.message:String(err)));
  }
};
// 房主重新分配身分（開始新的一場）時清空聊天室——每一場的對話不要延續到下一場；同一場
// 遊戲裡白天跟白天之間則照使用者要求接續，不要在天黑時清掉。
async function jgRoomResetChat(){
  if(!jgRoomCode) return;
  const db=window.jgFirebaseDb;
  try{
    const snap=await getDocs(collection(db,'rooms',jgRoomCode,'chat'));
    await Promise.all(snap.docs.map(d=>deleteDoc(d.ref)));
  }catch(err){
    console.error('清空聊天室失敗', err);
  }
}
window.jgRoomToggleVoice=function(){
  const next=!jgRoomVoiceGetPref();
  jgRoomVoiceSetPref(next);
  if(!next&&typeof window!=='undefined'&&window.speechSynthesis) window.speechSynthesis.cancel();
  if(next){
    // 剛打開時，把上次記住的狀態清掉，讓目前這個狀態立刻念一次，使用者不用等到下一次
    // 狀態變化才第一次聽到語音。
    jgRoomVoiceState={ key:null, night:null, step:null };
    jgRoomVoiceMaybeNarrate(jgRoomLatestRoomDoc);
  }
  jgRoomUpdateVoiceToggleButton();
  jgRoomRenderCurrentPhase();
};
