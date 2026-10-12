'use strict';
// ═══════════════════════════════════════════
// js/room/core.js
// 連線房間：多支手機共用一個房號，即時同步玩家名單、隨機分配身分（只有自己看得到自己的牌），
// 夜晚、白天、投票、勝負全自動進行。
//
// 連線房間的程式拆成 js/room/ 底下這幾個一般 script 檔，依 index.html 的順序用 defer 載入
// （排在 js/firebase-init.js 之後，所以載入時 Firestore 已經準備好），共用同一個全域範圍，
// 互相看得到彼此的變數與函式。Firestore 的 doc／setDoc／getDoc… 由 js/firebase-init.js
// 掛到 window 上提供。要給 HTML onclick 呼叫的函式一律寫成 window.jgRoomXxx=function。
//
//   core.js          共用核心：房間狀態變數、計時器、建立／加入房間、發牌房、身分按鈕、
//                    進入房間後的監聽、畫面總機（jgRoomRenderCurrentPhase）、玩家狀態格子
//   night-flow.js    夜晚流程：分配身分、夜晚步驟順序表、天亮前後的推進、死訊、警徽、
//                    夜槍資格、夜晚死亡結算、情侶殉情
//   win.js           勝負自動判定（規則本身跟法官助手共用 js/game-rules.js，這裡只整理房間資料）
//   widgets.js       法官語音、浮動按鈕（白狼王／血月使者／狼人自爆）、文字聊天室
//   night-basic.js   夜晚共用小工具、文字紀錄、守衛、女巫、狼隊出刀、大廳畫面
//   day.js           警長競選、投票、血月使者最後一擊、放逐、遺言、白天發言順序
//   record.js        上帝視角、遊戲結束畫面、匯出文字紀錄、送出遊玩數據
//   night-shell.js   夜晚畫面總機（依 currentStep 分派）、房主強制推進、預言家、通靈師、獵魔人
//   roles-special.js 夢魘、魔術師、攝夢人、機械狼、邱比特、盜賊、狼兄狼弟、黑市商人、幸運兒、夜槍
//   roles-batch1.js  第一批新增：狼美人、惡靈騎士、騎士、混血兒、唯鄰是從傀儡、邱比特勝負
//   cleanup.js       自動清掉超過一天的舊房間（連同子集合整個刪掉）
//   entry.js         離開房間、從法官助手帶板子建房、連線房間分頁入口、自動重連、邀請連結
//
// 新增角色時：該角色的畫面與動作放進對應批次的 roles-*.js，再到 night-shell.js 的總機、
// night-flow.js 的順序表／死亡結算、win.js 的支援清單補上掛勾。測試在 tests/test_room_logic.js
// （會照 index.html 的順序把這些檔案接起來載入）。
// ═══════════════════════════════════════════

let jgRoomCode=null;       // 目前所在的房號
let jgRoomUnsubPlayers=null; // 玩家名單的即時監聽（換房間/離開時要記得取消）
let jgRoomUnsubMyRole=null;  // 我自己身分的即時監聽
let jgRoomIsHost=false;
let jgRoomComp=null;   // 這個房間鎖定的角色配置（建立房間時就決定好，不會因為加入人數變動而改變）
let jgRoomTotal=null;  // 這個房間需要的總人數
let jgRoomUnsubRoom=null;  // 房間文件本身（phase/currentStep）的即時監聽
let jgMyRole=null;         // 我自己的角色（從 secrets/{uid} 讀到後快取起來，night 畫面判斷要不要顯示操作介面用）
let jgMySeatNum=null;      // 我自己的座位號碼
let jgRoomLatestPlayers=[];  // 玩家名單監聽收到的最新資料
let jgRoomLatestRoomDoc=null; // 房間文件監聽收到的最新資料（phase/currentStep/status...）
let jgRoomTimerInterval=null; // 夜晚操作畫面的倒數計時器（見 jgRoomStartTimer）
let jgRoomUnsubVotes=null;  // 投票結果的即時監聽
let jgRoomLatestVotes=[];   // 目前這一輪（不分投票類型：警長／白天／PK）收到的所有票
let jgRoomUnsubChat=null;   // 文字聊天室的即時監聽
let jgRoomLatestChatMsgs=[]; // 目前收到的所有聊天訊息（依時間排序）
let jgRoomChatExpanded=false; // 聊天小視窗現在是展開還是收合成一顆按鈕

// ── 給 js/voice.js（語音通話，另一個獨立的 ES module）讀取房間狀態用的小工具函式──
// js/voice.js 也是用 <script type="module"> 載入，跟這個檔案是不同的模組作用域，直接讀
// 不到上面這些 let 變數；比起把每個變數都額外掛一份到 window 上（還要記得每個賦值的地方
// 都同步更新），這裡改成只掛幾個「讀取當下值」的函式，voice.js 呼叫的當下永遠拿到最新值。
window.jgRoomGetCode=function(){ return jgRoomCode; };
window.jgRoomGetIsHost=function(){ return jgRoomIsHost; };
window.jgRoomGetPlayers=function(){ return jgRoomLatestPlayers; };
window.jgRoomGetMySeatNum=function(){ return jgMySeatNum; };

// ── 夜晚操作畫面共用的倒數計時器：30 秒倒數，剩 10 秒時把法官台詞閃一次提醒——之後每加
//    一個角色（查驗類、魔術師交換...），畫面上只要放這個計時器＋自己的台詞文字，就能
//    共用同一套倒數/提醒邏輯，不用每個角色各寫一份。──
function jgRoomTimerHtml(seconds, phrase){
  return '<div class="card" style="text-align:center;padding:14px;margin-bottom:10px;">'
    +'<div style="font-size:12px;color:var(--text2);">⏱️ 倒數 <span id="jg-room-countdown">'+seconds+'</span> 秒</div>'
    +'<div class="speech" id="jg-room-script-line" style="margin-top:6px;">「<em>'+phrase+'</em>」</div>'
    +'</div>';
}
// 這支手機自己讀畫面上「你要...」那句台詞念一次——跟 jgRoomVoiceMaybeNarrate 廣播的
// 「XX請睜眼／請閉眼」是兩句不同的話，那句是講給全場聽的公開播報，這句才是實際提示
// 現在該做什麼決定的台詞，比照本機法官助手「開場先講一次，快沒時間了再提醒一次」的
// 做法。用「夜晚＋目前步驟＋台詞內容」當去重 key，避免同一個回合因為別人操作觸發的
// 無關重畫（onSnapshot 監聽器）而反覆重講；步驟或夜晚真的換了，key 自然不同，會正常
// 重講一次。
let jgRoomTimerLastSpokenKey=null;
function jgRoomSpeakScriptLine(){
  if(!jgRoomVoiceGetPref()) return;
  const lineEl=document.getElementById('jg-room-script-line');
  if(!lineEl) return;
  const em=lineEl.querySelector('em');
  const text=(em?em.textContent:lineEl.textContent||'').trim();
  if(!text) return;
  const rd=jgRoomLatestRoomDoc||{};
  const key=(rd.night||0)+':'+(rd.currentStep||'')+':'+text;
  if(key===jgRoomTimerLastSpokenKey) return;
  jgRoomTimerLastSpokenKey=key;
  jgRoomSpeak(text);
}
function jgRoomStartTimer(seconds, onComplete){
  jgRoomStopTimer();
  let remaining=seconds;
  jgRoomSpeakScriptLine();
  jgRoomTimerInterval=setInterval(()=>{
    remaining--;
    const el=document.getElementById('jg-room-countdown');
    if(el) el.textContent=remaining;
    if(remaining===10){
      const line=document.getElementById('jg-room-script-line');
      if(line){
        line.style.animation='none';
        void line.offsetWidth; // 觸發 reflow，讓動畫可以重新播放一次
        line.style.animation='jgRoomFlash 0.5s ease 3';
      }
    }
    if(remaining===5){
      // 剩5秒還沒動作：把同一句台詞再念一次提醒，不用去重 key 擋掉（跟開場那次是同一句話，
      // 但這裡就是要故意再講一次）。
      if(jgRoomVoiceGetPref()){
        const lineEl=document.getElementById('jg-room-script-line');
        const em=lineEl&&lineEl.querySelector('em');
        const text=(em?em.textContent:(lineEl?lineEl.textContent:'')||'').trim();
        if(text) jgRoomSpeak(text);
      }
    }
    if(remaining<=0){
      jgRoomStopTimer();
      if(onComplete) onComplete();
    }
  },1000);
}
function jgRoomStopTimer(){
  if(jgRoomTimerInterval){ clearInterval(jgRoomTimerInterval); jgRoomTimerInterval=null; }
}
// 閃爍動畫用的樣式只要注入一次——這裡沒有另外開一個 css 檔，直接在模組載入時塞一個
// <style> 進 <head>，避免又要去改 style.css 卻忘記同步。
(function jgRoomInjectFlashStyle(){
  if(document.getElementById('jg-room-flash-style')) return;
  const style=document.createElement('style');
  style.id='jg-room-flash-style';
  style.textContent='@keyframes jgRoomFlash{0%,100%{opacity:1;}50%{opacity:0.25;}}';
  document.head.appendChild(style);
})();

// 房號格式：6 碼數字（字串），避免 0 開頭被當成數字弄丟前導 0
function jgRoomGenCode(){
  return String(Math.floor(100000+Math.random()*900000));
}

// ══════════════════════════════════════════
// 機械狼板「記錄玩家身分」手機輸入橋接——法官助手（js/core.js，非 module，看不到這裡的
// Firestore import）在「記錄玩家身分」頁想讓法官改用手機點選（方便拿著手機一個個看牌），
// 就是透過這幾個掛在 window 上的函式，借用連線房間同一套房號機制建一個臨時房間文件來
// 同步，不是真正的連線房間、不會出現在玩家名單流程裡。
//
// 寫入位置特別選用 rooms/{code}/players/{自己的uid} 這個子集合、而不是直接寫房間文件本身
// 的欄位——因為 Firestore 安全規則規定要先是房間成員（自己的 players/{uid} 文件已經存在）
// 才能更新房間文件本身，手機是另一支裝置、匿名登入拿到的是不同 uid，一開始還不是成員，
// 直接寫房間文件會被規則擋下來（permission-denied）。players 子集合「自己的 uid 當文件 ID」
// 這個寫法建立文件只檢查「auth.uid==自己的uid」，不需要先是成員，每個人加入任何一個連線
// 房間時都在用、確定行得通，所以電腦跟手機都借用這個模式各自寫一份自己的紀錄，兩邊都監聽
// 整個子集合、取最新更新時間的那份當作目前的正確答案（反正同一時間只會有一邊在操作，不用
// 處理真的同時輸入衝突的情況）。
//
// 流程結束（法官按下「確認配置」）只停止監聽，不在這裡刪資料：手機那邊也寫了自己的 players
// 文件，這裡先刪房間文件的話，那份就變成找不到的孤兒資料。整個臨時房間（含所有 players）
// 滿一天後由 js/room/cleanup.js 一起清掉。
// ══════════════════════════════════════════
let jgMechAssignLinkCode=null;
let jgMechAssignLinkUid=null;
let jgMechAssignLinkUnsub=null;
let jgMechAssignLinkLocalMap={};
function jgMechAssignPickLatestDoc(snap){
  let latest=null, latestTime=-1;
  snap.forEach(d=>{
    const data=d.data();
    const t=typeof data.updatedAt==='number'?data.updatedAt:0;
    if(t>=latestTime){ latestTime=t; latest=data; }
  });
  return latest;
}
// payload: {total, playerNames:{num:name}, roles:[{id,abbr,name}], assign:{num:roleId|null}}
// onUpdate(assignMap)：手機那邊點選之後，這裡會即時把最新的 assign 物件丟回去給 core.js 套用。
window.jgRoomStartMechAssignLink=async function(payload, onUpdate){
  const db=window.jgFirebaseDb;
  const code=jgRoomGenCode();
  const uid=await jgRoomWaitAuth();
  try{
    await setDoc(doc(db,'rooms',code),{
      mode:'mech-assign', status:'lobby', hostUid:uid, createdAt:serverTimestamp(),
      total: payload.total, playerNames: payload.playerNames||{}, roles: payload.roles||[]
    });
    jgMechAssignLinkLocalMap=Object.assign({}, payload.assign||{});
    await setDoc(doc(db,'rooms',code,'players',uid), {assign: jgMechAssignLinkLocalMap, updatedAt: Date.now()});
  }catch(e){
    alert('建立手機連線失敗，請檢查網路連線後再試一次。\n（錯誤訊息：'+(e&&e.message||e)+'）');
    return null;
  }
  if(jgMechAssignLinkUnsub){ jgMechAssignLinkUnsub(); jgMechAssignLinkUnsub=null; }
  jgMechAssignLinkCode=code;
  jgMechAssignLinkUid=uid;
  jgMechAssignLinkUnsub=onSnapshot(collection(db,'rooms',code,'players'), (snap)=>{
    const latest=jgMechAssignPickLatestDoc(snap);
    if(latest&&latest.assign) onUpdate(latest.assign);
  });
  return code;
};
// 法官在電腦上自己點（而不是手機）的時候，也把結果同步推到 Firestore，這樣手機畫面才會
// 跟著更新——失敗就算了（法官本機狀態已經是對的，連線不穩不該卡住電腦這邊的操作）。
window.jgRoomPushMechAssign=async function(num, role){
  if(!jgMechAssignLinkCode) return;
  jgMechAssignLinkLocalMap[num]=role;
  const db=window.jgFirebaseDb;
  try{
    await setDoc(doc(db,'rooms',jgMechAssignLinkCode,'players',jgMechAssignLinkUid), {assign: jgMechAssignLinkLocalMap, updatedAt: Date.now()});
  }catch(e){ /* best-effort，連線失敗不影響法官繼續在電腦上操作 */ }
};
window.jgRoomStopMechAssignLink=async function(){
  if(jgMechAssignLinkUnsub){ jgMechAssignLinkUnsub(); jgMechAssignLinkUnsub=null; }
  if(jgMechAssignLinkCode){
    jgMechAssignLinkCode=null;
    jgMechAssignLinkUid=null;
    jgMechAssignLinkLocalMap={};
  }
};
// 複製邀請連結：網址帶 ?room=房號，別人點開會自動跳到連線房間分頁、房號也先幫他填好，
// 只要打自己的名字（或直接選座位，發牌房的話）就能加入，不用手動問房號、輸入房號。
window.jgRoomCopyInviteLink=async function(){
  const url=window.location.origin+window.location.pathname+'?room='+jgRoomCode;
  try{
    await navigator.clipboard.writeText(url);
    alert('已複製邀請連結：\n'+url);
  }catch(e){
    // 部分瀏覽器（尤其某些內嵌瀏覽器）不允許網頁直接寫入剪貼簿，退而求其次跳出網址讓
    // 房主自己手動複製。
    prompt('請手動複製這段連結：', url);
  }
};
// 房主解散房間：跟「離開房間」不一樣——離開房間只是這支手機自己退出，房間本身還在，
// 其他人不會受影響；解散房間是房主專屬操作，會讓所有人（含還沒操作的玩家）都被踢出去，
// 整個房間結束。這裡只標記 dissolved:true（讓其他人的畫面收到通知、自己退出），資料
// 本身由 js/room/cleanup.js 在房間建立滿一天後連同子集合整個刪掉。
window.jgRoomDissolve=async function(){
  if(!jgRoomIsHost){ alert('只有房主可以解散房間'); return; }
  if(!confirm('確定要解散這個房間嗎？所有人都會被踢出去，這個動作無法復原。')) return;
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{ dissolved:true },{ merge:true });
  jgRoomLeave();
};

async function jgRoomWaitAuth(){
  await window.jgFirebaseReady;
  return window.jgFirebaseUid;
}
// 加入房間一開始查房號是否存在，原本每個入口各自直接 getDoc、沒有包 try/catch，也沒先等
// 匿名登入完成——只要讀取失敗（登入還沒跑完就被連點、Firestore 規則擋掉、網路不穩…），
// 整段 async function 就直接拋出例外、什麼提示都不會顯示，使用者點了按鈕完全沒反應，
// 還以為按鈕壞掉。統一包成這個小工具：先等登入完成，讀取失敗就跳出明確的錯誤訊息
// （把實際錯誤原因一起顯示出來，方便回報問題時知道到底卡在哪）。
async function jgRoomSafeGetRoomDoc(db, code){
  await jgRoomWaitAuth();
  try{
    return await getDoc(doc(db,'rooms',code));
  }catch(e){
    alert('連線失敗，請檢查網路連線後再試一次。\n（錯誤訊息：'+(e&&e.message||e)+'）');
    return null;
  }
}

// ══════════════════════════════════════════
// 連線房間發牌（跟上面完整的自動化流程是分開的一套簡化功能）：房主在法官助手設定好板子
// 跟玩家名單（座位號碼對應姓名）之後，開一個「發牌房」，玩家用手機加入，各自認自己是
// 哪個座位（不用重新打名字，因為房主已經先設定好了），到齊後房主按「分配身分」，每支
// 手機只會看到自己的身分（大字，沒有其他操作），房主的裝置則會自動跳回法官助手、繼續
// 用本機原本那套完整功能主持遊戲——這個功能只負責取代實體卡牌，不負責之後的遊戲流程。
// ══════════════════════════════════════════
window.jgRoomDealCreate=async function(hostName, comp, total, presetNames){
  const name=(hostName||'').trim();
  if(!name){ alert('請先輸入你的全名'); return; }
  const uid=await jgRoomWaitAuth();
  const db=window.jgFirebaseDb;
  let code=null;
  for(let i=0;i<5;i++){
    const candidate=jgRoomGenCode();
    const snap=await getDoc(doc(db,'rooms',candidate));
    if(!snap.exists()){ code=candidate; break; }
  }
  if(!code){ alert('房號產生失敗，請再試一次'); return; }
  await setDoc(doc(db,'rooms',code),{
    hostUid:uid, status:'lobby', createdAt:serverTimestamp(), comp:comp, total:total,
    mode:'deal', presetNames:presetNames, dealtDone:false
  });
  jgRoomIsHost=true;
  jgRoomComp=comp; jgRoomTotal=total;
  window.jgRoomPendingComp=null; window.jgRoomPendingDeal=null;
  try{ await jgRoomDealEnsureHostMember(code, name); }catch(e){ console.error('發牌房房主加入成員失敗', e); }
  try{ localStorage.setItem('jgLastRoomCode', code); }catch(e){}
  await jgRoomEnterLobby(code);
};
// 發牌房的房主自己不一定會認領座位，但 Firestore 安全規則規定「自己的 players/{uid}
// 文件存在（是房間成員）」才能寫入 secrets、更新房間文件——房主不是成員的話，按「分配身分」
// 會被規則整個擋下來（PERMISSION_DENIED），畫面上看起來就是按了沒反應。所以房主一建房就先
// 建立一份自己的成員文件（seatNum 是 null，不佔任何座位），跟一般連線房間的加入流程同一種
// 寫法。舊版建立、房主還不是成員的房間，按分配身分時也會先補建一次。已經有文件（例如房主
// 自己也認領了座位）就不動，避免把座位蓋掉。
async function jgRoomDealEnsureHostMember(code, hostName){
  const uid=await jgRoomWaitAuth();
  const db=window.jgFirebaseDb;
  const ref=doc(db,'rooms',code,'players',uid);
  const snap=await getDoc(ref);
  if(snap.exists()) return;
  await setDoc(ref,{ name:(hostName||'房主'), seatNum:null, joinedAt:serverTimestamp(), alive:true });
}
// 發牌房真正佔座位的玩家：排除房主那份 seatNum 為 null 的成員文件。
function jgRoomDealSeatedPlayers(){
  return jgRoomLatestPlayers.filter(p=>p.seatNum!=null);
}
// 加入發牌房：不用打名字，直接從房主預先設好的座位清單裡點選「我是幾號」——
// 一個座位只能被一個人認領，避免兩支手機都宣稱自己是同一號。
window.jgRoomDealClaimSeat=async function(seatNum, seatName){
  const nm=(seatName||'').trim();
  if(!nm){ alert('請先輸入你的全名'); return; }
  if(!confirm('確定你是 '+seatNum+'號 '+nm+' 嗎？')) return;
  const uid=await jgRoomWaitAuth();
  const db=window.jgFirebaseDb;
  const existing=jgRoomLatestPlayers.find(p=>p.seatNum===seatNum);
  if(existing&&existing.uid!==uid){ alert('這個座位已經有人認領了，請確認座位號碼是否正確。'); return; }
  await setDoc(doc(db,'rooms',jgRoomCode,'players',uid),{
    name:nm, seatNum:seatNum, joinedAt:serverTimestamp(), alive:true
  });
  jgRoomIsHost=false; // 加入者一律不是房主（房主是建房的那個人，已經在 jgRoomDealCreate 設過）
  const roomSnap=await getDoc(doc(db,'rooms',jgRoomCode));
  if(roomSnap.exists()) jgRoomIsHost=(roomSnap.data().hostUid===uid);
  try{ localStorage.setItem('jgLastRoomCode', jgRoomCode); }catch(e){}
};
window.jgRoomDealJoin=async function(codeRaw){
  const code=(codeRaw||'').trim();
  if(!/^\d{4,6}$/.test(code)){ alert('請輸入正確的房號（4-6碼數字）'); return; }
  const db=window.jgFirebaseDb;
  const roomSnap=await jgRoomSafeGetRoomDoc(db, code);
  if(!roomSnap) return;
  if(!roomSnap.exists()){ alert('找不到這個房號，請確認房號是否正確'); return; }
  if(roomSnap.data().mode!=='deal'){ alert('這不是發牌房，請確認房號。'); return; }
  const uid=window.jgFirebaseUid;
  jgRoomIsHost=(roomSnap.data().hostUid===uid);
  try{ localStorage.setItem('jgLastRoomCode', code); }catch(e){}
  await jgRoomEnterLobby(code);
};
// 房主分配身分：洗牌、寫進每個座位的 secrets，再把整份「座位→身分」的結果套進本機的
// 法官助手（jgApplyDealtRoles，定義在 js/core.js），直接把房主的畫面切回法官助手繼續
// 主持——玩家手機那邊則靠 dealtDone 這個欄位，各自從 secrets 讀出自己的身分顯示大字。
let jgRoomDealAssigning=false; // 分配身分寫入中，避免連按
window.jgRoomDealAssignRoles=async function(){
  if(!jgRoomCode) return;
  const rd=jgRoomLatestRoomDoc||{};
  const presetNames=rd.presetNames||{};
  const totalSeats=Object.keys(presetNames).length;
  const seated=jgRoomDealSeatedPlayers();
  const claimedSeats=seated.length;
  if(claimedSeats!==totalSeats){
    alert('⚠️ 還有座位沒有人認領（'+claimedSeats+' / '+totalSeats+'），請等所有人都加入再分配身分。');
    return;
  }
  if(!jgRoomComp){ alert('這個房間沒有記錄板子配置，無法分配身分（可能是用舊版連結建立的房間）。'); return; }
  if(jgRoomDealAssigning) return; // 避免連按送出兩次
  jgRoomDealAssigning=true;
  const btn=document.getElementById('jg-deal-assign-btn');
  if(btn){ btn.disabled=true; btn.textContent='分配中...'; }
  const db=window.jgFirebaseDb;
  const players=seated.slice().sort((a,b)=>a.seatNum-b.seatNum);
  const seatRoleMap={};
  let thiefCand1=null, thiefCand2=null;
  try{
    await jgRoomDealEnsureHostMember(jgRoomCode, '房主');
    if(jgRoomComp.thief>0){
      // 跟一般連線房間的邏輯一樣：有盜賊時板子設定的角色總數是「人數+2」，要先抽出2張
      // 候選身分放一邊，剩下人數-1張＋盜賊本身湊成人數張才發給玩家（詳見
      // jgRoomAssignRoles 那邊的完整說明，這裡是同一套邏輯，只是接下來要把結果交給房主
      // 的本機法官助手接手，所以候選身分也要一起傳過去，見 jgApplyDealtRoles）。
      const fullPool=buildPool(jgRoomComp);
      const thiefIdx=fullPool.indexOf('thief');
      fullPool.splice(thiefIdx,1);
      const shuffledRest=shuffle(fullPool.slice());
      thiefCand1=shuffledRest[0]; thiefCand2=shuffledRest[1];
      const pool=shuffle(shuffledRest.slice(2).concat(['thief']));
      await Promise.all(players.map((p,i)=>{
        const role=pool[i]||'villager';
        seatRoleMap[p.seatNum]=role;
        return setDoc(doc(db,'rooms',jgRoomCode,'secrets',p.uid),{ role:role, seatNum:p.seatNum });
      }));
    } else {
      const pool=shuffle(buildPool(jgRoomComp));
      await Promise.all(players.map((p,i)=>{
        const role=pool[i]||'villager';
        seatRoleMap[p.seatNum]=role;
        return setDoc(doc(db,'rooms',jgRoomCode,'secrets',p.uid),{ role:role, seatNum:p.seatNum });
      }));
    }
    await setDoc(doc(db,'rooms',jgRoomCode),{ dealtDone:true, status:'role-assigned' },{ merge:true });
  }catch(e){
    // 寫入失敗（網路不穩、權限被擋）一定要跳出提示，不然畫面上看起來就是按了沒反應。
    jgRoomDealAssigning=false;
    if(btn){ btn.disabled=false; btn.textContent='分配身分（'+claimedSeats+' / '+totalSeats+' 人）'; }
    alert('分配身分失敗，請檢查網路連線後再按一次。\n（錯誤訊息：'+(e&&e.message||e)+'）');
    return;
  }
  jgRoomDealAssigning=false;
  // 房主自己的裝置：直接把這份結果套進本機法官助手，跳回去繼續主持，不用再看發牌房畫面。
  // 有盜賊的話，把已經抽好的 2 張候選一起帶過去，本機才不會又重新抽一次（見
  // jgApplyDealtRoles 裡的說明）。
  if(window.jgApplyDealtRoles) window.jgApplyDealtRoles(seatRoleMap, jgRoomComp, jgRoomTotal, thiefCand1, thiefCand2);
};
function jgRoomRenderDealPhase(){
  const rd=jgRoomLatestRoomDoc||{};
  if(rd.dealtDone){
    jgRoomRenderDealMyRole();
  } else {
    jgRoomRenderDealLobby();
  }
}
function jgRoomRenderDealLobby(){
  const root=document.getElementById('jg-room-content');
  if(!root) return;
  const rd=jgRoomLatestRoomDoc||{};
  const presetNames=rd.presetNames||{};
  const seats=Object.entries(presetNames).map(([num,name])=>({num:parseInt(num), name}));
  const seated=jgRoomDealSeatedPlayers();
  const claimedBySeat={};
  seated.forEach(p=>{ claimedBySeat[p.seatNum]=p; });
  const myUid=window.jgFirebaseUid;
  const myClaimed=seated.some(p=>p.uid===myUid);
  // 房主如果在法官助手設定畫面沒有先填真名，座位姓名會全部是預設的「X號」佔位文字——
  // 這種情況不該讓大家直接盲選一個「1號」「2號」這種號碼（誰也不知道哪個號碼是自己），
  // 應該讓大家自己打全名（打完的全名會存成真正的玩家名字，之後遊玩紀錄／匯入玩家名單才
  // 找得到人）；房主如果有先填好真名，才維持原本「找到自己的名字點下去認領」的體驗。
  const hasRealNames=seats.some(s=>s.name&&s.name!==(s.num+'號'));
  const rows=seats.sort((a,b)=>a.num-b.num).map(s=>{
    const taken=claimedBySeat[s.num];
    const isMine=taken&&taken.uid===myUid;
    if(taken){
      return '<div class="row"><div class="av av-vil">'+s.num+'</div><div class="nm">'+taken.name+'</div>'
        +'<span class="badge '+(isMine?'bv':'bw')+'">'+(isMine?'你':'已認領')+'</span></div>';
    }
    if(hasRealNames){
      return '<div class="row" style="cursor:pointer;" onclick="jgRoomDealClaimSeat('+s.num+',\''+s.name+'\')"><div class="av av-vil">'+s.num+'</div><div class="nm">'+s.name+'</div>'
        +'<span class="badge">點我認領</span></div>';
    }
    // 沒有真名：每個座位旁邊直接放一個輸入框，打完全名按「認領」——這個座位號碼還是要選
    // （發牌房本來就是「洗好牌之後把身分綁在座位上」，座位跟身分是綁定的），只是名字改成
    // 自己打，不用被迫套用「X號」這種看不出是誰的預設名稱。
    return '<div class="row" style="flex-wrap:wrap;gap:6px;"><div class="av av-vil">'+s.num+'</div>'
      +'<input type="text" id="jg-deal-name-'+s.num+'" placeholder="輸入你的全名" style="flex:1;min-width:120px;">'
      +'<button style="width:auto;padding:8px 14px;" onclick="jgRoomDealClaimSeat('+s.num+', document.getElementById(\'jg-deal-name-'+s.num+'\').value)">認領</button></div>';
  }).join('');
  const hostBtn=jgRoomIsHost
    ?'<button class="primary" id="jg-deal-assign-btn" style="margin-top:14px;" onclick="jgRoomDealAssignRoles()"'+(jgRoomDealAssigning?' disabled':'')+'>'+(jgRoomDealAssigning?'分配中...':'分配身分（'+seated.length+' / '+seats.length+' 人）')+'</button>'
    :'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">'+(myClaimed?'已認領座位，等待房主分配身分...':(hasRealNames?'請從上方點選你的姓名':'請選一個座位、輸入你的全名並按認領'))+'</div>';
  root.innerHTML=`
    <div class="nbanner"><h1>房間 ${jgRoomCode}（發牌）</h1></div>
    <button onclick="jgRoomCopyInviteLink()" style="margin-top:8px;">複製邀請連結</button>
    <div class="card" style="margin-top:14px;">${rows}</div>
    ${hostBtn}
    ${jgRoomIsHost?'<button class="ghost" style="margin-top:14px;color:var(--danger,#b91c1c);" onclick="jgRoomDissolve()">解散房間</button>':''}
  `;
}
// 分配完身分後，加入的玩家（不含房主，房主已經跳回法官助手了）只會看到這個畫面：
// 純粹顯示自己的身分，沒有任何操作按鈕——這個房間接下來的遊戲流程完全交給房主用
// 法官助手主持，跟這支手機無關了。
let jgRoomUnsubDealMyRole=null; // 發牌房「我的身分」即時監聽（避免用輪詢，減少延遲）
// 原本這裡是「查一次、沒有的話等1秒再查一次」的輪詢寫法，在網路比較慢的裝置上，等於是
// 額外多等最多1秒才會看到身分——改成真正的即時監聽（onSnapshot），身分一旦寫進資料庫，
// 幾乎是立刻就會反映到畫面上，不用等輪詢的下一輪。
function jgRoomRenderDealMyRole(){
  const root=document.getElementById('jg-room-content');
  if(!root) return;
  root.innerHTML='<div class="info" style="text-align:center;margin-top:40px;">身分分配中，請稍候...</div>';
  const db=window.jgFirebaseDb;
  if(jgRoomUnsubDealMyRole) jgRoomUnsubDealMyRole();
  jgRoomUnsubDealMyRole=onSnapshot(doc(db,'rooms',jgRoomCode,'secrets',window.jgFirebaseUid),(snap)=>{
    if(!snap.exists()) return; // 還沒分配到，保持「請稍候」畫面，等下一次快照推送
    const role=snap.data().role;
    const roleName=(typeof RNAME!=='undefined'&&RNAME[role])||role;
    const icon=jgRoomRoleIconGuess(role);
    root.innerHTML=`
      <div style="text-align:center;padding:60px 20px;">
        <div style="font-size:88px;">${icon}</div>
        <div style="font-size:34px;font-weight:800;margin-top:20px;">你的身分是：${roleName}</div>
      </div>
    `;
  });
}
// 粗略猜一個角色對應的 emoji（沒有的話用預設 🎴）——之後如果角色介紹資料裡本來就有
// icon 欄位可以直接抓來用，這裡先用簡單對照表，涵蓋目前先做的板子＋常見角色。
// 2026/09 補上殭屍板、詭術之境板、大灰狼占卜師板新增的角色，讓發牌功能可以正確顯示 icon。
function jgRoomRoleIconGuess(role){
  const map={wolf:'🐺',wolfking:'👑',whitewolf:'🤍',wolfbeauty:'💋',evilknight:'🖤',gargoyle:'🗿',
    bloodmoon:'🌑',mechanicalwolf:'🤖',bigmechwolf:'🤖',smallmechwolf:'🤖',nightmare:'😱',
    wolfbrother_e:'👬',wolfbrother_y:'👬',wolfshaman:'🔮',mask:'🎭',bigbadwolf:'🐺',
    villager:'🧑‍🌾',seer:'🔮',witch:'🧪',hunter:'🏹',guard:'🛡️',dreamcatcher:'😴',
    knight:'⚔️',magician:'🪄',demonhunter:'🗡️',gravkeeper:'⚰️',medium:'👁️',blackmarket:'🕴️',
    purewhitemaiden:'🕊️',dancer:'💃',littlegirl:'👧',hybrid:'🧬',cupid:'💘',fool:'🃏',
    biggreywolf:'🐺',diviner:'🧿',zombie:'🧟',trickster:'🃏',trickmage:'🎩',sequenceprince:'🔢'};
  return map[role]||'🎴';
}
window.jgRoomRenderCreateDeal=function(comp, total, presetNames){
  const root=document.getElementById('jg-room-content');
  if(!root) return;
  window.jgRoomPendingDeal={comp:comp, total:total, presetNames:presetNames};
  root.innerHTML=`
    <div class="nbanner"><h1>連線房間發牌</h1></div>
    <div class="info" style="font-size:13px;margin-top:10px;">${total} 人局，玩家名單已經照法官助手設定好的座位帶過來了。</div>
    <div class="card" style="margin-top:14px;">
      <label>你的全名（房主）</label>
      <input type="text" id="jg-room-deal-name" placeholder="輸入你的全名">
      <button class="primary" style="margin-top:10px;" onclick="jgRoomDealCreate(document.getElementById('jg-room-deal-name').value, window.jgRoomPendingDeal.comp, window.jgRoomPendingDeal.total, window.jgRoomPendingDeal.presetNames)">建立發牌房</button>
    </div>
    <button class="ghost" style="margin-top:10px;" onclick="switchTab('t-judge')">← 回去重新調整板子</button>
    <button class="ghost" style="margin-top:8px;" onclick="jgRoomCancelPendingCreate()">取消建立房間</button>
  `;
};
// 取消建立房間：清掉「從法官助手帶過來、還沒真的送出建房請求」的暫存設定，回到一般的
// 連線房間入口畫面（建立新房間／輸入房號加入）——不用整頁重新整理就能重來，解決原本
// 「按到一次建立連線房間，就卡在建房確認畫面出不去（除非重新整理）」的問題。這個暫存
// 設定只是 window 上的一個變數，還沒有實際寫進 Firestore、沒有建立任何房間文件，所以
// 純粹清掉變數就好，不用額外清理資料庫。
window.jgRoomCancelPendingCreate=function(){
  window.jgRoomPendingDeal=null;
  window.jgRoomPendingComp=null;
  jgRoomRenderEntry();
};


// comp/total 是「已經在法官助手設定畫面確認過」的板子配置——房間建立時就把這份配置存進
// 房間文件，之後「隨機分配身分」要照這份配置洗牌，而不是憑加入人數臨時套用預設板子。
window.jgRoomCreate=async function(hostName, comp, total, usePresetNames, sheriffEnabled, badgeMode){
  const name=(hostName||'').trim();
  if(!comp||!total){ alert('請先從法官助手的設定畫面，配置好板子跟人數再建立房間。'); return; }
  const uid=await jgRoomWaitAuth();
  const db=window.jgFirebaseDb;
  // 房號萬一剛好撞號（機率極低），重抽最多 5 次
  let code=null;
  for(let i=0;i<5;i++){
    const candidate=jgRoomGenCode();
    const snap=await getDoc(doc(db,'rooms',candidate));
    if(!snap.exists()){ code=candidate; break; }
  }
  if(!code){ alert('房號產生失敗，請再試一次'); return; }
  // 房主如果選了「沿用法官助手的座位姓名」，把 jgPlayerNames 整份存進房間文件（presetNames，
  // 跟發牌房是同一套資料結構）——加入房間的人看到的就不是「打你的全名」，而是「點選對應
  // 你自己的座位」，跟發牌房的加入體驗一致（見 jgRoomRenderJoinStep2 的判斷）。房主自己固定
  // 是 1 號座位，所以這裡直接用 presetNames[1] 當房主的名字，不需要另外再打一次——沒有勾選
  // 沿用名單的話，才需要房主自己打全名。
  const presetNames=usePresetNames?{}:null;
  if(presetNames){ for(let i=1;i<=total;i++) presetNames[i]=(typeof jgPlayerNames!=='undefined'&&jgPlayerNames[i])||(i+'號'); }
  const finalHostName=presetNames?presetNames[1]:name;
  if(!finalHostName){ alert('請先輸入你的全名'); return; }
  // playerCount：給 jgRoomJoin（自動排隊入座）用來決定下一個座位號碼的計數器，房主一開始
  // 就佔走 1 號座位，這裡要一起初始化成 1，不然後面第一個真正加入的玩家會跟房主的 1 號座位
  // 算重複。詳見 jgRoomJoin 內的註解。
  await setDoc(doc(db,'rooms',code),Object.assign(
    { hostUid:uid, status:'lobby', createdAt:serverTimestamp(), comp:comp, total:total, sheriffEnabled:!!sheriffEnabled, badgeMode:badgeMode==='double'?'double':'single', playerCount:1,
      boardPreset:(window.jgRoomPendingComp&&window.jgRoomPendingComp.boardPreset)||null },
    presetNames?{presetNames:presetNames}:{}
  ));
  await setDoc(doc(db,'rooms',code,'players',uid),{
    name:finalHostName, seatNum:1, joinedAt:serverTimestamp(), alive:true
  });
  jgRoomIsHost=true;
  window.jgRoomPendingComp=null;
  try{ localStorage.setItem('jgLastRoomCode', code); }catch(e){}
  jgRoomEnterLobby(code);
};

// ── 加入房間 ──
// 先查一下房號對應的是「發牌房」還是一般連線房間，走對應的加入流程——發牌房不用打
// 名字（直接從預先設好的座位清單裡選），一般房間才需要打名字自己排隊入座。
window.jgRoomSmartJoin=async function(codeRaw, name){
  const code=(codeRaw||'').trim();
  if(!/^\d{4,6}$/.test(code)){ alert('請輸入正確的房號（4-6碼數字）'); return; }
  const db=window.jgFirebaseDb;
  const roomSnap=await jgRoomSafeGetRoomDoc(db, code);
  if(!roomSnap) return;
  if(!roomSnap.exists()){ alert('找不到這個房號，請確認房號是否正確'); return; }
  if(roomSnap.data().mode==='deal'){
    await jgRoomDealJoin(code);
  } else {
    await jgRoomJoin(code, name);
  }
};
window.jgRoomJoin=async function(codeRaw, name){
  const code=(codeRaw||'').trim();
  const nm=(name||'').trim();
  if(!/^\d{4,6}$/.test(code)){ alert('請輸入正確的房號（4-6碼數字）'); return; }
  if(!nm){ alert('請先輸入你的全名'); return; }
  const db=window.jgFirebaseDb;
  const roomSnap=await jgRoomSafeGetRoomDoc(db, code);
  if(!roomSnap) return;
  const uid=window.jgFirebaseUid;
  if(!roomSnap.exists()){ alert('找不到這個房號，請確認房號是否正確'); return; }
  if(roomSnap.data().status!=='lobby'){ alert('這場遊戲已經開始，無法加入'); return; }
  jgRoomComp=roomSnap.data().comp||null;
  jgRoomTotal=roomSnap.data().total||null;
  const roomRef=doc(db,'rooms',code);
  const playerRef=doc(db,'rooms',code,'players',uid);
  // 座位號碼要唯一分配，但 Firestore 安全規則規定「要先是房間成員（自己的 players/{uid}
  // 文件已經存在）才能更新房間文件本身」（isMember()），沒辦法在單一個 transaction 裡
  // 同時「建立自己的玩家文件」又「更新房間文件的人數計數器」——transaction commit 當下，
  // 規則看到的是「這個 transaction 開始之前」的資料庫狀態，這時候我還不是成員，會被
  // permission-denied 擋下來（這正是上一版的問題）。另外，在 transaction 裡對整個 players
  // 子集合下 query 查詢（tx.get(query(...))）也實測在手機瀏覽器上會直接噴出 SDK 內部錯誤，
  // 一樣要避開。
  // 改成拆兩步：
  // 1) 先用一般寫入建立自己的玩家文件（這一步的規則只檢查「auth.uid==自己的uid」，不需要
  //    先是成員，一定會成功）——這步落地之後，我才正式成為這個房間的成員。
  // 2) 成員身分確立後，才能用 transaction 安全地遞增房間文件上的 playerCount 欄位決定座位
  //    號碼——這個 transaction 只讀寫「單一文件」（房間文件、自己的玩家文件），不是查詢整個
  //    集合，兩人同時加入時 Firestore 會自動序列化處理，保證不會分到同一個座位號碼。
  try{
    const existingSnap=await getDoc(playerRef);
    if(existingSnap.exists()){
      // 已經加入過（重新整理、重新連線）：保留原本座位，只更新名字跟上線時間。
      await setDoc(playerRef,{ name:nm, seatNum:existingSnap.data().seatNum, joinedAt:serverTimestamp(), alive:true });
    } else {
      if(jgRoomTotal){
        const freshRoom=await getDoc(roomRef);
        if(((freshRoom.data()||{}).playerCount||0)>=jgRoomTotal) throw new Error('ROOM_FULL');
      }
      await setDoc(playerRef,{ name:nm, seatNum:null, joinedAt:serverTimestamp(), alive:true });
      await runTransaction(db, async(tx)=>{
        const roomTx=await tx.get(roomRef);
        const seatNum=((roomTx.data()||{}).playerCount||0)+1;
        tx.update(roomRef,{ playerCount:seatNum });
        tx.update(playerRef,{ seatNum:seatNum });
      });
    }
  }catch(e){
    if(e&&e.message==='ROOM_FULL'){ alert('⚠️ 這個房間是 '+jgRoomTotal+' 人局，已經到齊了，無法加入。'); return; }
    alert('加入房間失敗，請檢查網路連線後再試一次。\n（錯誤訊息：'+(e&&e.message||e)+'）');
    return;
  }
  jgRoomIsHost=(roomSnap.data().hostUid===uid);
  try{ localStorage.setItem('jgLastRoomCode', code); }catch(e){}
  jgRoomEnterLobby(code);
};
// 房主如果建房時沿用了法官助手的座位姓名（見 jgRoomCreate 的 presetNames），加入房間的人
// 就不用自己打名字，直接點選「這是不是你」的座位——跟發牌房的加入體驗一致，差別只在這裡
// 之後還是走一般連線房間的自動化流程（發牌房是完全獨立的簡化模式）。座位一旦被別人領走
// 就不能再選（用「這個座位的 uid 是不是已經有別人在用」判斷，不是單純看名字）。
window.jgRoomJoinPresetSeat=async function(codeRaw, seatNum){
  const code=(codeRaw||'').trim();
  const db=window.jgFirebaseDb;
  const roomSnap=await jgRoomSafeGetRoomDoc(db, code);
  if(!roomSnap) return;
  const uid=window.jgFirebaseUid;
  if(!roomSnap.exists()){ alert('找不到這個房號，請確認房號是否正確'); return; }
  const rd=roomSnap.data();
  if(rd.status!=='lobby'){ alert('這場遊戲已經開始，無法加入'); return; }
  const presetNames=rd.presetNames||{};
  jgRoomComp=rd.comp||null;
  jgRoomTotal=rd.total||null;
  // 這裡選位不能靠房間文件上的任何計數／對照表欄位來做 transaction（跟 jgRoomJoin 同樣的
  // 規則限制：還不是房間成員就不能更新房間文件本身，詳見 jgRoomJoin 內的註解），改成單純讀
  // 一次目前的玩家名單，確認這個座位還沒被「別人」佔走，再寫自己的玩家文件——兩支手機同時
  // 點同一個座位這種情況理論上還是有極小機率同時通過檢查，但選座位畫面本來就是依照最新讀到
  // 的名單即時畫成「已反白、不能點」，真的撞在一起的機率非常低，跟自動排隊入座（jgRoomJoin，
  // 更常見好幾人同時連按「加入房間」）不是同一個等級的風險。
  const playerRef=doc(db,'rooms',code,'players',uid);
  try{
    const playersSnap=await getDocs(collection(db,'rooms',code,'players'));
    const takenByOther=playersSnap.docs.find(d=>d.id!==uid&&d.data().seatNum===seatNum);
    if(takenByOther) throw new Error('SEAT_TAKEN');
    await setDoc(playerRef,{
      name: presetNames[seatNum]||(seatNum+'號'), seatNum:seatNum, joinedAt:serverTimestamp(), alive:true
    });
  }catch(e){
    if(e&&e.message==='SEAT_TAKEN'){ alert('這個座位已經有人選走了，請重新整理選別的座位'); return; }
    alert('加入房間失敗，請檢查網路連線後再試一次。\n（錯誤訊息：'+(e&&e.message||e)+'）');
    return;
  }
  jgRoomIsHost=(rd.hostUid===uid);
  try{ localStorage.setItem('jgLastRoomCode', code); }catch(e){}
  jgRoomEnterLobby(code);
};
// ── 加入房間第一步：只需要房號，查完之後才知道要走哪一種第二步（發牌房直接選座位；
//    一般房間如果房主有設定好座位姓名，也是選座位；都沒有的話才需要自己打全名）。──
window.jgRoomCheckCodeThenJoin=async function(codeRaw){
  const code=(codeRaw||'').trim();
  if(!/^\d{4,6}$/.test(code)){ alert('請輸入正確的房號（4-6碼數字）'); return; }
  const db=window.jgFirebaseDb;
  const roomSnap=await jgRoomSafeGetRoomDoc(db, code);
  if(!roomSnap) return;
  if(!roomSnap.exists()){ alert('找不到這個房號，請確認房號是否正確'); return; }
  const rd=roomSnap.data();
  if(rd.mode==='deal'){
    await jgRoomDealJoin(code);
    return;
  }
  if(rd.mode==='mech-assign'){
    await jgRoomRenderMechAssignPicker(code, rd);
    return;
  }
  if(rd.presetNames&&Object.keys(rd.presetNames).length){
    await jgRoomRenderJoinSeatPicker(code, rd);
  } else {
    jgRoomRenderJoinNameInput(code);
  }
};
// 機械狼板「記錄玩家身分」手機輸入畫面：不是真正加入房間，單純顯示跟法官助手「記錄玩家
// 身分」頁一樣的「座位×角色」點選格。寫入方式比照上面 jgRoomStartMechAssignLink 的說明，
// 用自己的 uid 當文件 ID 寫進 rooms/{code}/players/{uid}（不是直接寫房間文件本身），這是
// 連線房間本來就通得過安全規則的寫法；同一個子集合裡電腦跟手機各自一份，兩邊都監聽整個
// 子集合、取最新更新時間的那份當作目前的正確答案。另外用本機快取（jgRoomMechAssignCache）
// 記目前的選取狀態，點擊時先樂觀更新畫面，背景才真的寫 Firestore，不用每次點擊都先等一輪
// 網路往返，操作起來比較跟手。
let jgRoomMechAssignCache={};
let jgRoomMechAssignUid=null;
let jgRoomMechPlayersUnsub=null;
let jgRoomMechRoomUnsub=null;
window.jgRoomRenderMechAssignPicker=async function(code, rd){
  const root=document.getElementById('jg-room-content');
  if(!root) return;
  const db=window.jgFirebaseDb;
  const uid=await jgRoomWaitAuth();
  jgRoomMechAssignUid=uid;
  const total=rd.total||0;
  const names=rd.playerNames||{};
  const roles=rd.roles||[];
  jgRoomMechAssignCache={};
  function renderGrid(){
    let html='';
    for(let i=1;i<=total;i++){
      const cur=jgRoomMechAssignCache[i]||jgRoomMechAssignCache[String(i)]||'';
      const nm=names[i]||names[String(i)]||'';
      html+='<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;">'
        +'<div style="width:32px;height:32px;border-radius:50%;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-weight:800;flex-shrink:0;">'+i+'</div>'
        +(nm?'<div style="width:56px;font-size:12px;color:var(--text2);flex-shrink:0;">'+nm+'</div>':'')
        +'<div id="jg-room-mech-role-'+i+'-grid" style="display:flex;flex-wrap:wrap;gap:6px;flex:1;">'
        +roles.map(r=>{
          const sel=cur===r.id;
          return '<button type="button" data-role="'+r.id+'" onclick="jgRoomMechAssignTap(\''+code+'\','+i+',\''+r.id+'\')" title="'+r.name+'" '
            +'style="width:38px;height:38px;border-radius:50%;padding:0;font-size:13px;font-weight:700;'
            +(sel?'background:var(--success,#2e7d32);color:#fff;border-color:transparent;':'')+'">'+(r.abbr||r.id)+'</button>';
        }).join('')
        +'</div></div>';
    }
    return html;
  }
  root.innerHTML=`
    <div class="nbanner">
      <h1>記錄玩家身分</h1>
      <p class="sub" style="text-align:center;margin-top:6px;">拿著手機看每個人的牌，點選對應角色，電腦畫面會即時同步</p>
    </div>
    <div class="card" style="margin-top:14px;" id="jg-room-mech-assign-body">${renderGrid()}</div>
    <div id="jg-room-mech-assign-note" class="info" style="font-size:12px;margin-top:10px;">法官在電腦上按下「確認配置，進入夜晚」之後，這個畫面會自動停用。</div>
  `;
  if(jgRoomMechPlayersUnsub){ jgRoomMechPlayersUnsub(); jgRoomMechPlayersUnsub=null; }
  if(jgRoomMechRoomUnsub){ jgRoomMechRoomUnsub(); jgRoomMechRoomUnsub=null; }
  jgRoomMechPlayersUnsub=onSnapshot(collection(db,'rooms',code,'players'), (snap)=>{
    const latest=jgMechAssignPickLatestDoc(snap);
    if(!latest||!latest.assign) return;
    jgRoomMechAssignCache=latest.assign;
    const body=document.getElementById('jg-room-mech-assign-body');
    if(body) body.innerHTML=renderGrid();
  });
  jgRoomMechRoomUnsub=onSnapshot(doc(db,'rooms',code), (snap)=>{
    if(snap.exists()) return;
    const note=document.getElementById('jg-room-mech-assign-note');
    if(note) note.innerHTML='<div class="info-success">法官已經在電腦上完成記錄，這個畫面可以關閉了。</div>';
    const body=document.getElementById('jg-room-mech-assign-body');
    if(body) body.querySelectorAll('button').forEach(b=>{ b.disabled=true; b.style.opacity='0.4'; });
  });
};
window.jgRoomMechAssignTap=async function(code, num, role){
  const db=window.jgFirebaseDb;
  const cur=jgRoomMechAssignCache[num]||jgRoomMechAssignCache[String(num)];
  const next=(cur===role)?null:role;
  jgRoomMechAssignCache[num]=next;
  const grid=document.getElementById('jg-room-mech-role-'+num+'-grid');
  if(grid){
    grid.querySelectorAll('button').forEach(b=>{
      const isSel=next&&b.getAttribute('data-role')===next;
      b.style.background=isSel?'var(--success,#2e7d32)':'';
      b.style.color=isSel?'#fff':'';
      b.style.borderColor=isSel?'transparent':'';
    });
  }
  try{
    await setDoc(doc(db,'rooms',code,'players',jgRoomMechAssignUid), {assign: jgRoomMechAssignCache, updatedAt: Date.now()});
  }catch(e){
    alert('同步失敗，請確認網路連線後再試一次。\n（錯誤訊息：'+(e&&e.message||e)+'）');
  }
};
// 房主有設定好座位姓名：列出所有座位，已經被別人選走的變成灰色不能點，其餘的可以點選
// 「這是我」直接加入（跟發牌房選座位的畫面是同樣的邏輯，只是資料來源是 presetNames
// 而不是發牌房自己那組專用欄位）。
window.jgRoomRenderJoinSeatPicker=async function(code, rd){
  const root=document.getElementById('jg-room-content');
  if(!root) return;
  const db=window.jgFirebaseDb;
  const { getDocs } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js");
  const playersSnap=await getDocs(collection(db,'rooms',code,'players'));
  const takenSeats=new Set(playersSnap.docs.map(d=>d.data().seatNum));
  const presetNames=rd.presetNames||{};
  const total=rd.total||Object.keys(presetNames).length;
  const seatsHtml=[];
  for(let i=1;i<=total;i++){
    const taken=takenSeats.has(i);
    seatsHtml.push('<button '+(taken?'disabled':'')+' onclick="jgRoomJoinPresetSeat(\''+code+'\','+i+')" style="margin:4px;width:auto;display:inline-block;padding:10px 16px;'+(taken?'opacity:0.4;':'')+'">'+i+'號 '+(presetNames[i]||(i+'號'))+(taken?'（已加入）':'')+'</button>');
  }
  root.innerHTML=`
    <div class="nbanner">
      
      <h1>請選擇「這是不是你」</h1>
      <p class="sub" style="text-align:center;margin-top:6px;">房主已經先設定好座位姓名，點選對應你自己的座位就能加入</p>
    </div>
    <div style="text-align:center;margin-top:14px;">${seatsHtml.join('')}</div>
    <button class="ghost" style="margin-top:14px;" onclick="jgRoomRenderEntry()">← 重新輸入房號</button>
  `;
};
// 房主沒有設定座位姓名：維持原本的「自己打全名」流程。
window.jgRoomRenderJoinNameInput=function(code){
  const root=document.getElementById('jg-room-content');
  if(!root) return;
  root.innerHTML=`
    <div class="nbanner">
      
      <h1>輸入你的全名</h1>
      <p class="sub" style="text-align:center;margin-top:6px;">房號 ${code}</p>
    </div>
    <div class="card" style="margin-top:14px;">
      <label>你的全名</label>
      <input type="text" id="jg-room-name-join" placeholder="輸入你的全名">
      <button class="primary" style="margin-top:10px;" onclick="jgRoomJoin('${code}', document.getElementById('jg-room-name-join').value)">加入房間</button>
    </div>
    <button class="ghost" style="margin-top:10px;" onclick="jgRoomRenderEntry()">← 重新輸入房號</button>
  `;
};

// ── 進入房間等待畫面，開始監聽玩家名單 + 房間本身的狀態（phase/currentStep）──
// ── 右上角「確認自己身分」浮動按鈕：不管現在畫面切到哪個步驟都固定顯示（用 position:fixed
//    直接掛在 body 上，不是掛在會被整個 innerHTML 換掉的 #jg-room-content 裡面，才不會
//    每次重新渲染畫面就被清掉），點一下用大字報顯示「幾號、什麼身分」，忘記自己是誰的時候
//    隨時可以確認，不用回頭找法官問。──
function jgRoomAppendMyIdentityButton(){
  if(document.getElementById('jg-room-myid-btn')) return; // 已經加過了，不要重複加
  const btn=document.createElement('button');
  btn.id='jg-room-myid-btn';
  btn.textContent='確認自己身分';
  btn.onclick=jgRoomShowMyIdentity;
  // 全站的按鈕預設樣式是 width:100%（鋪滿整行），這裡沒有明確蓋掉 width／margin-top 的話，
  // 固定定位的按鈕會被撐成貼齊視窗左右兩側的一整條長條（這是上次截圖看到的那個 bug 的
  // 真正原因），這裡把該蓋掉的都蓋掉，確保是貼在右上角的小按鈕。top 改成放在導覽列
  // 「下方」而不是導覽列本身的高度範圍內（原本 top:8px 剛好跟導覽列重疊，蓋住「遊玩數據」
  // 「連線房間」那幾個字）——導覽列本身含 logo 大約 56px 高，這裡抓一個安全值讓按鈕貼在
  // 導覽列下緣，不會再互相重疊。
  btn.style.cssText='position:fixed;top:66px;right:8px;z-index:200;width:auto;margin:0;padding:6px 12px;font-size:12px;font-weight:600;border-radius:20px;border:1px solid var(--border);background:var(--bg2);color:var(--text2);cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,0.08);';
  document.body.appendChild(btn);
}
function jgRoomRemoveMyIdentityButton(){
  const btn=document.getElementById('jg-room-myid-btn');
  if(btn) btn.remove();
}
// 這顆按鈕本來是掛在 body 上、不跟著分頁內容一起被清掉，但這也代表切到「角色與規則」
// 「遊玩數據」等其他分頁時，它還是會一直飄在畫面右上角，容易讓人以為那些分頁也需要
// 確認身分。改成用顯示/隱藏控制，只在「連線房間」這個分頁時看得到——由 core.js 的
// switchTab() 切分頁時呼叫這個函式決定要不要顯示，見那邊的呼叫。
window.jgRoomSetIdentityButtonVisible=function(visible){
  const btn=document.getElementById('jg-room-myid-btn');
  if(btn) btn.style.display=visible?'block':'none';
};
// 機械狼學到技能之後，這裡（跟玩家狀態格子、上帝視角）都要比照本機法官助手
// jgRoleDisplayName() 的規則，顯示「機械」＋學到的角色（例如機械民、機械女巫），而不是
// 一直顯示沒有資訊量的「機械狼」——學到的角色存在 players/{uid}.mechWolfLearnedRole
// （見 jgRoomMechWolfLearn），不是存在 secrets，所以 jgRoomLatestPlayers 裡就查得到，
// 不用另外讀資料庫。
// 死亡標記用的骷髏小圖示——畫出來的 SVG 圖案，不是 emoji（emoji 在不同裝置/字型上長相
// 差很多，畫出來的線條圖案比較一致，也比較搭配整個 app 素雅的視覺風格）。
function jgRoomDeadSkullSvg(){
  return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-left:3px;opacity:0.7;">'
    +'<path d="M12 3a7 7 0 0 0-7 7c0 2.8 1.4 4.3 2 5.5V18a1 1 0 0 0 1 1h1v-2h1v2h4v-2h1v2h1a1 1 0 0 0 1-1v-2.5c0.6-1.2 2-2.7 2-5.5a7 7 0 0 0-7-7z"></path>'
    +'<circle cx="9.3" cy="10.5" r="1.1" fill="currentColor" stroke="none"></circle>'
    +'<circle cx="14.7" cy="10.5" r="1.1" fill="currentColor" stroke="none"></circle>'
    +'</svg>';
}
function jgRoomDisplayRoleName(role, mechWolfLearnedRole){
  if(!role) return null;
  const plain=(typeof RNAME!=='undefined'&&RNAME[role])||role;
  if(role!=='mechanicalwolf'||!mechWolfLearnedRole) return plain;
  return (typeof jgMechDisplayLabel==='function')?jgMechDisplayLabel(mechWolfLearnedRole):plain;
}
window.jgRoomShowMyIdentity=function(){
  if(!jgMySeatNum){ alert('還沒有座位資料（可能還在大廳，尚未分配身分）'); return; }
  const me=jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid);
  const roleName=jgMyRole?jgRoomDisplayRoleName(jgMyRole, me&&me.mechWolfLearnedRole):'（尚未分配身分）';
  jgRoomShowBigCard(jgMySeatNum+'號', roleName);
};

async function jgRoomEnterLobby(code){
  jgRoomCode=code;
  const db=window.jgFirebaseDb;
  const roomSnap=await getDoc(doc(db,'rooms',code));
  if(roomSnap.exists()){
    jgRoomComp=roomSnap.data().comp||null;
    jgRoomTotal=roomSnap.data().total||null;
  }
  jgRoomAppendMyIdentityButton();
  jgRoomAppendVoiceToggleButton();
  jgRoomAppendChatWidget();
  jgRoomAppendWhitewolfButton();
  jgRoomAppendKnightButton();
  jgRoomAppendBloodmoonButton();
  jgRoomAppendWolfSelfBlowButton();
  // js/voice.js（語音通話）自己的初始化——不是每個人都會用到語音功能，這裡用
  // window 上有沒有掛這個函式來判斷 voice.js 有沒有載入，避免沒載入時報錯。
  if(window.jgVoiceOnRoomEnter) window.jgVoiceOnRoomEnter();
  if(jgRoomUnsubPlayers) jgRoomUnsubPlayers();
  const q=query(collection(db,'rooms',code,'players'), orderBy('seatNum'));
  jgRoomUnsubPlayers=onSnapshot(q,(snap)=>{
    jgRoomLatestPlayers=snap.docs.map(d=>({uid:d.id, ...d.data()}));
    jgRoomRenderCurrentPhase();
  });
  if(jgRoomUnsubChat) jgRoomUnsubChat();
  const chatQ=query(collection(db,'rooms',code,'chat'), orderBy('ts'), limit(300));
  jgRoomUnsubChat=onSnapshot(chatQ,(snap)=>{
    jgRoomLatestChatMsgs=snap.docs.map(d=>({id:d.id, ...d.data()}));
    jgRoomRenderChatMessages();
  });
  if(jgRoomUnsubRoom) jgRoomUnsubRoom();
  jgRoomUnsubRoom=onSnapshot(doc(db,'rooms',code),(snap)=>{
    jgRoomLatestRoomDoc=snap.exists()?snap.data():null;
    // 房間文件被刪掉了（超過一天被自動清理）：跟解散一樣提醒一下、退回建立/加入畫面。
    // 只看伺服器回來的結果（fromCache 的「不存在」可能只是本機快取還沒拿到資料）。
    if(!snap.exists()&&!snap.metadata.fromCache&&jgRoomCode){
      alert('這個房間已經結束並清除了。');
      jgRoomLeave();
      return;
    }
    // 房主解散房間：所有人（含房主自己，如果房主是先按解散再看到這次快照）的監聽都會收到
    // dissolved:true，偵測到就提醒一下、把自己踢回建立/加入畫面——用 jgRoomCode 是否還在
    // 判斷「我是不是已經離開了」，避免房主自己觸發解散後，這裡又重複跳一次提醒。
    if(jgRoomLatestRoomDoc&&jgRoomLatestRoomDoc.dissolved&&jgRoomCode){
      alert('🗑️ 房主已經解散這個房間。');
      jgRoomLeave();
      return;
    }
    // 語音播報跟畫面重畫是兩件事：就算下面的 jgRoomSuppressAutoRender 旗標開著、暫時不
    // 重畫畫面，語音還是要照狀態變化正常念，不然狼隊連續出刀那幾筆中間寫入會讓語音跟著
    // 卡住、漏念步驟。文字聊天室的顯示／隱藏（只在白天出現，夜晚讓給睜眼操作）也是同樣
    // 道理，不能被 suppressAutoRender 卡住。
    jgRoomVoiceMaybeNarrate(jgRoomLatestRoomDoc);
    jgRoomUpdateChatVisibility();
    // 通知 js/voice.js 房間狀態（含 currentStep）可能變了，讓它重新判斷現在是不是狼隊
    // 出刀商議時間、要不要把語音通話裡的狼隊商議聲音隔離起來——理由跟上面兩行一樣，
    // 不能被 suppressAutoRender 卡住。
    if(window.jgVoiceOnRoomStepChange) window.jgVoiceOnRoomStepChange();
    // 有些操作（例如狼隊出刀：寫目標→記文字紀錄→進黑市商人／女巫回合→…）背後其實是好幾筆
    // 連續的資料庫寫入，不是像機械狼學習那樣一次寫完。每一筆寫入都會讓這個監聽器再觸發
    // 一次、整個畫面重畫一次——如果剛好使用者還在同一個選人畫面上（例如另一隻狼隊友的
    // 選人畫面），連續好幾次重畫會讓他剛選好、還沒送出的號碼被畫面重畫成初始狀態，變成
    // 「選了又跳掉」；如果剛好是自己那筆操作觸發到一半的中間狀態，也可能讓畫面在動作真正
    // 結束前就被重畫、看起來像卡住。jgRoomSuppressAutoRender 是這次新增的旗標，讓「一次
    // 操作背後有好幾筆連續寫入」的函式（見 jgRoomWolfPropose）可以先把這個旗標打開，
    // 請監聽器這段期間只更新快取、先不要跟著重畫，等它自己那串操作全部做完，再由它自己
    // 呼叫一次重新渲染，畫面才不會被中途的重畫打斷。
    if(jgRoomSuppressAutoRender) return;
    jgRoomRenderCurrentPhase();
  });
  if(jgRoomUnsubVotes) jgRoomUnsubVotes();
  jgRoomUnsubVotes=onSnapshot(collection(db,'rooms',code,'votes'),(snap)=>{
    // 投票文件的 id 現在是 {voterUid}_{round}（保留每一輪的歷史，不會被下一輪蓋掉），
    // 所以這裡改用文件裡的 voterUid 欄位當作 uid，而不是文件 id 本身——其餘用到
    // jgRoomLatestVotes 裡 .uid 欄位的地方（myVote 判斷、計票、上帝視角）都不用跟著改。
    jgRoomLatestVotes=snap.docs.map(d=>({uid:d.data().voterUid, ...d.data()}));
    jgRoomRenderCurrentPhase();
  });
  jgRoomWatchMyRole();
}
// 依照房間目前的 phase，決定要顯示大廳畫面、警長競選、投票，還是夜晚操作畫面——投票是
// 最高優先（不管現在是警長競選還是白天放逐，只要 votingActive 就先顯示投票畫面）；
// 上帝視角則是「死亡玩家自己選擇要不要看」，優先度比投票還高（一旦切換進去，不管房間
// 現在進行到哪一步都維持顯示上帝視角，直到玩家自己按退出）。
async function jgRoomRenderCurrentPhase(){
  // 「連線房間發牌」是完全獨立的一套簡化流程（只負責發牌，不走警長/投票/夜晚自動化那些），
  // 用房間文件的 mode==='deal' 判斷要不要整個改走這條路，不跟其餘畫面的邏輯混在一起。
  if(jgRoomLatestRoomDoc&&jgRoomLatestRoomDoc.mode==='deal'){
    jgRoomRenderDealPhase();
    return;
  }
  // 遊戲已經自動判定出勝負：不管現在原本走到哪一步，一律優先顯示結束畫面給所有人看
  // （目前只有「機械狼＋通靈師」「攝夢人＋夢魘」這兩個板子會寫入 gameOverWinner，
  // 見 jgRoomMaybeDeclareWin；其餘板子這個欄位永遠是 undefined，行為不受影響）。
  if(jgRoomLatestRoomDoc&&jgRoomLatestRoomDoc.gameOverWinner){
    jgRoomStopTimer();
    await jgRoomRenderGameOverPhase();
    return;
  }
  // 已經在上帝視角裡的人，如果天黑了（或輪到自己發表遺言）就強制退出、回到正常畫面——
  // 不能讓人掛在上帝視角上跨夜偷看，等於變相在夜晚洩漏場上真實身分。
  if(jgRoomGodViewOn&&!jgRoomGodViewAllowedNow()) jgRoomGodViewOn=false;
  if(jgRoomGodViewOn){
    await jgRoomRenderGodView();
    return;
  }
  if(jgRoomLatestRoomDoc&&jgRoomLatestRoomDoc.votingActive){
    jgRoomRenderVoting();
  } else {
    const phase=jgRoomLatestRoomDoc&&jgRoomLatestRoomDoc.phase;
    if(phase==='sheriff'){
      jgRoomRenderSheriffCampaign();
    } else if(phase==='day-open'){
      await jgRoomRenderDayOpen();
    } else if(phase==='night'){
      await jgRoomRenderNightShell();
    } else {
      jgRoomRenderShell();
      jgRoomRenderLobby(jgRoomLatestPlayers);
      return; // 大廳自己已經有一份玩家清單了，不用再疊加一份「玩家狀態」格子
    }
  }
  // 這個函式本身是 async，把 render 分支都 await 過一輪之後才呼叫這兩個「疊加在畫面最下面」
  // 的附加元件，確保它們真的疊加在「最後渲染出來的畫面」上，而不是疊加在還沒渲染完、待會
  // 又會被整個 innerHTML 覆蓋掉的舊畫面（夜晚／白天開場這幾個 render 函式本身是 async，
  // 如果外層用「不等它」的方式呼叫，這兩個附加元件的 insertAdjacentHTML 有可能發生在
  // async 函式最後真正寫入 innerHTML 之前，反而被整個蓋掉、白疊加了——這是這次順手修掉的
  // 既有 race condition）。
  jgRoomAppendGodViewToggle();
  jgRoomUpdateVoiceToggleButton();
  jgRoomUpdateWhitewolfButton();
  jgRoomUpdateKnightButton();
  jgRoomUpdateBloodmoonButton();
  jgRoomUpdateWolfSelfBlowButton();
  jgRoomAppendPlayerStatusFooter();
}
// 死亡玩家的畫面最下面補一個「進入上帝視角」按鈕——夜晚被刀死的人要等到白天正式宣布
// 死訊（含輪到自己發表遺言的話，要先講完）才能進去，不能在夜晚（phase==='night'）或
// 警長競選（第一夜死訊還沒公布，見 jgRoomAdvanceToDayPhase：先抽籤定生死才進競選，
// 警長競選結束才輪到白天公告死訊）就先偷看上帝視角——不然剛死的人會在其他玩家還沒收到
// 死訊公告前，就已經透過語音通話等管道把場上真實身分洩漏出去，等於變相作弊。
// 白天被投票放逐（含PK）的人不受這個限制：投票結果本來就是全場當場公開看著發生的，
// 沒有「死訊還沒公布」這種空窗期需要保密，發表完遺言之後不管接下來天黑幾次都能看
// （見 jgRoomStartDayVoteLastWords 寫入的 exiledByVote 旗標）。
function jgRoomGodViewAllowedNow(){
  const me=jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid);
  if(!me||me.alive!==false) return false;
  const rd=jgRoomLatestRoomDoc||{};
  if(rd.dayVoteLastWordsUid===me.uid) return false; // 自己還沒發表遺言
  if(me.exiledByVote) return true;
  if(rd.phase==='night'||rd.phase==='sheriff') return false;
  return true;
}
function jgRoomAppendGodViewToggle(){
  const root=document.getElementById('jg-room-content');
  if(!root) return;
  if(jgRoomGodViewAllowedNow()){
    root.insertAdjacentHTML('beforeend','<button style="margin-top:20px;" onclick="jgRoomToggleGodView()">進入上帝視角</button>');
  }
}
// 死亡結算（狼刀／女巫毒／攝夢人／血月最後一刀／獵魔人／夜槍……）是夜裡當場就寫入
// alive:false 的，但死訊要等白天公告才能公開——如果玩家狀態格子、其餘角色的選人清單
// 直接讀 alive 欄位，會在天亮公告之前就洩漏「誰死了」給全場看到（甚至讓通靈師這種要
// 查驗還沒死透明消息的人，選人格子上目標直接被畫叉、選不到）。這裡統一判斷「對外能不能
// 顯示為死亡」：白天／非本夜死亡一律照實顯示；還在同一個夜晚、而且是這一晚才死的
// （p.diedNight===這一晚），死訊還沒公布，對外一律當作還活著。真正的遊戲邏輯（例如
// 判斷自己是不是已經死了、能不能出刀/行動）不能用這個函式，要繼續讀真正的 p.alive。
function jgRoomIsPubliclyDead(p, rd){
  if(p.alive!==false) return false;
  if(rd&&rd.phase==='night'&&p.diedNight&&p.diedNight===(rd.night||1)) return false;
  return true;
}
// 底部「玩家狀態」格子：不管現在是白天、投票中、警長競選，還是夜晚，畫面最下面都固定
// 疊加這一排——活著的人只看得到「號碼＋姓名」，刻意不顯示角色／幸運兒標籤／邱比特情侶
// 連結這些會洩漏場上機密的資訊（那些只有上帝視角才看得到，見 jgRoomRenderGodView，死亡
// 才能切換）；死亡的人格子會變灰，跟本機法官助手的玩家狀態欄位一致，而且不管現在是不是
// 正在看上帝視角，這個變灰的視覺效果都一樣（上帝視角有自己另一份完整版本，不會重複疊加
// 這個函式，見下面 jgRoomGodViewOn 的判斷）。
function jgRoomPlayerStatusFooterHtml(){
  const rd=jgRoomLatestRoomDoc||{};
  const cells=jgRoomLatestPlayers.slice().sort((a,b)=>a.seatNum-b.seatNum).map(p=>
    '<div class="pcell'+(jgRoomIsPubliclyDead(p,rd)?' dead':'')+'"><div class="pnum">'+p.seatNum+'號</div><div class="pname">'+p.name+'</div></div>'
  ).join('');
  return '<div class="section-title" style="margin-top:18px;">玩家狀態</div><div class="pgrid">'+cells+'</div>';
}
function jgRoomAppendPlayerStatusFooter(){
  if(jgRoomGodViewOn) return; // 上帝視角已經有自己完整版本的玩家狀態，不要重複疊加
  const root=document.getElementById('jg-room-content');
  if(!root) return;
  root.insertAdjacentHTML('beforeend', jgRoomPlayerStatusFooterHtml());
}
