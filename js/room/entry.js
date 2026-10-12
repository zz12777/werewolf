'use strict';
// ═══════════════════════════════════════════
// js/room/entry.js
// 連線房間：離開房間、從法官助手帶板子建房、連線房間分頁入口、自動重連、邀請連結。
// 連線房間的程式拆成 js/room/ 底下好幾個一般 script 檔（依 index.html 的順序用 defer 載入，
// 共用同一個全域範圍，互相看得到彼此的變數與函式）；Firestore 函式由 js/firebase-init.js 提供。
// 檔案總覽見 js/room/core.js 開頭。
// ═══════════════════════════════════════════

window.jgRoomLeave=function(){
  jgRoomStopTimer();
  jgRoomRemoveMyIdentityButton();
  jgRoomRemoveVoiceToggleButton();
  jgRoomRemoveChatWidget();
  jgRoomRemoveWhitewolfButton();
  jgRoomRemoveKnightButton();
  jgRoomRemoveBloodmoonButton();
  jgRoomRemoveWolfSelfBlowButton();
  if(window.jgVoiceOnRoomLeave) window.jgVoiceOnRoomLeave();
  if(jgRoomUnsubPlayers){ jgRoomUnsubPlayers(); jgRoomUnsubPlayers=null; }
  if(jgRoomUnsubMyRole){ jgRoomUnsubMyRole(); jgRoomUnsubMyRole=null; }
  if(jgRoomUnsubRoom){ jgRoomUnsubRoom(); jgRoomUnsubRoom=null; }
  if(jgRoomUnsubVotes){ jgRoomUnsubVotes(); jgRoomUnsubVotes=null; }
  if(jgRoomUnsubChat){ jgRoomUnsubChat(); jgRoomUnsubChat=null; }
  if(jgRoomUnsubDealMyRole){ jgRoomUnsubDealMyRole(); jgRoomUnsubDealMyRole=null; }
  jgRoomDealSecretSubCode=null; jgRoomDealMySecret=null; jgRoomDealWithdrawPending=false;
  jgRoomCode=null; jgRoomComp=null; jgRoomTotal=null; jgRoomIsHost=false;
  jgMyRole=null; jgMySeatNum=null; jgRoomLatestPlayers=[]; jgRoomLatestRoomDoc=null;
  jgRoomLatestVotes=[]; jgRoomGodViewOn=false; jgRoomLatestChatMsgs=[]; jgRoomChatExpanded=false;
  jgRoomSpeechOrderAutoTriedNight=null;
  jgRoomVoiceDayAnnouncedNight=null; jgRoomVoiceSheriffAnnouncedNight=null;
  if(jgRoomSpeechSpinInterval){ clearInterval(jgRoomSpeechSpinInterval); jgRoomSpeechSpinInterval=null; }
  jgRoomSpeechTurnAutoTriedKey=null; jgRoomSpeechTurnRungKey=null;
  if(jgRoomSpeechTurnClockInterval){ clearInterval(jgRoomSpeechTurnClockInterval); jgRoomSpeechTurnClockInterval=null; }
  try{ localStorage.removeItem('jgLastRoomCode'); }catch(e){}
  jgRoomRenderEntry();
};

// ── 從「法官助手」設定畫面帶著已確認的板子設定過來：直接跳到「輸入全名、建立房間」，
//    不用再走一次選板子（板子已經在那邊選好、驗證過人數對得上了）。──
window.jgRoomRenderCreateWithComp=function(comp, total, sheriffEnabled, badgeMode){
  const root=document.getElementById('jg-room-content');
  if(!root) return;
  const prevBoardPreset=(window.jgRoomPendingComp||{}).boardPreset||null;
  window.jgRoomPendingComp={comp:comp, total:total, sheriffEnabled:!!sheriffEnabled, badgeMode:badgeMode||'single', boardPreset:prevBoardPreset};
  const parts=Object.entries(comp).filter(([,v])=>v>0)
    .map(([k,v])=>((typeof RNAME!=='undefined'&&RNAME[k])||k)+'×'+v).join('、');
  // 如果法官助手設定畫面裡已經幫幾個座位填過真名（不是「X號」這種預設佔位名稱），順便問
  // 房主要不要直接沿用這份名單——沿用的話，加入房間的人會看到「這是不是你」的座位清單用
  // 點的，不用再自己打一次全名（跟發牌房本來就有的體驗一致，只是這裡是一般連線房間）。
  const hasPresetNames=typeof jgPlayerNames!=='undefined'&&Object.keys(jgPlayerNames||{}).some(k=>jgPlayerNames[k]&&jgPlayerNames[k]!==(k+'號'));
  root.innerHTML=`
    <div class="nbanner">
      <h1>建立連線房間</h1>
    </div>
    <div class="info" style="font-size:13px;margin-top:10px;">板子設定：${total} 人局，${parts}</div>
    <div class="card" style="margin-top:14px;">
      <label>你的全名（房主）</label>
      <input type="text" id="jg-room-name-create" placeholder="輸入你的全名">
      ${hasPresetNames?'<label style="margin-top:10px;display:flex;align-items:center;gap:8px;"><input type="checkbox" id="jg-room-use-preset-names" checked style="width:auto;"> 沿用法官助手裡已經填好的座位姓名（其他人加入時用點選的，不用自己打名字）</label>':''}
      <div class="info" style="font-size:12px;margin-top:10px;">本局${window.jgRoomPendingComp.sheriffEnabled?'開放':'不開放'}上警競選（跟隨法官助手設定頁的選擇，回去重新調整板子可以改）</div>
      ${window.jgRoomPendingComp.sheriffEnabled?'<div class="info" style="font-size:12px;margin-top:6px;">自爆吞警徽規則：'+(window.jgRoomPendingComp.badgeMode==='double'?'雙爆吞警徽':'單爆吞警徽')+'（跟隨法官助手設定頁的選擇）</div>':''}
      <button class="primary" style="margin-top:10px;" onclick="jgRoomCreate(document.getElementById('jg-room-name-create').value, window.jgRoomPendingComp.comp, window.jgRoomPendingComp.total, ${hasPresetNames?'document.getElementById(\'jg-room-use-preset-names\').checked':'false'}, window.jgRoomPendingComp.sheriffEnabled, window.jgRoomPendingComp.badgeMode)">建立房間</button>
    </div>
    <button class="ghost" style="margin-top:10px;" onclick="switchTab('t-judge')">← 回去重新調整板子</button>
    <button class="ghost" style="margin-top:8px;" onclick="jgRoomCancelPendingCreate()">取消建立房間</button>
  `;
};

// ── 進入分頁時預設顯示的畫面：如果是從設定畫面帶著板子過來，直接顯示建立房間；
//    否則（直接點連線房間分頁）引導先去設定板子，不開放憑空建立沒有板子設定的房間。──
// ── Firebase 的匿名登入本身會記住你是誰（同一支瀏覽器重新整理，底層身分不會變），
//    問題只在於這個 app 原本沒有「記得你剛剛在哪個房間」——重新整理後這個函式會先檢查
//    瀏覽器裡有沒有存過房號，有的話直接嘗試自動重新連回那個房間（用同一個 uid 找回原本
//    的座位／身分），不用重新輸入名字加入；房間不存在了，或這個 uid 從沒加入過那個房間
//    （例如換了無痕視窗），才會退回顯示一般的建立/加入畫面。──
async function jgRoomTryAutoReconnect(){
  let savedCode=null;
  try{ savedCode=localStorage.getItem('jgLastRoomCode'); }catch(e){}
  if(!savedCode) return false;
  const uid=await jgRoomWaitAuth();
  const db=window.jgFirebaseDb;
  const roomSnap=await getDoc(doc(db,'rooms',savedCode));
  if(!roomSnap.exists()){ try{ localStorage.removeItem('jgLastRoomCode'); }catch(e){} return false; }
  const playerSnap=await getDoc(doc(db,'rooms',savedCode,'players',uid));
  if(!playerSnap.exists()){ try{ localStorage.removeItem('jgLastRoomCode'); }catch(e){} return false; }
  jgRoomIsHost=(roomSnap.data().hostUid===uid);
  await jgRoomEnterLobby(savedCode);
  return true;
}
window.jgRoomRenderEntry=async function(){
  const root=document.getElementById('jg-room-content');
  if(!root) return;
  if(window.jgRoomPendingDeal){
    jgRoomRenderCreateDeal(window.jgRoomPendingDeal.comp, window.jgRoomPendingDeal.total, window.jgRoomPendingDeal.presetNames);
    return;
  }
  if(window.jgRoomPendingComp){
    jgRoomRenderCreateWithComp(window.jgRoomPendingComp.comp, window.jgRoomPendingComp.total, window.jgRoomPendingComp.sheriffEnabled, window.jgRoomPendingComp.badgeMode);
    return;
  }
  root.innerHTML='<div class="info" style="text-align:center;margin-top:20px;">連線中...</div>';
  const reconnected=await jgRoomTryAutoReconnect();
  if(reconnected) return;
  root.innerHTML=`
    <div class="nbanner">
      <h1>連線房間</h1>
      <p class="sub" style="text-align:center;margin-top:6px;">多支手機同時加入同一場，各自的手機只看得到自己的身分</p>
    </div>
    <div id="room-entry-grid">
      <div class="card" style="margin-top:14px;">
        <div class="info" style="font-size:13px;">要建立新房間的話，請先到「法官の助手」分頁設定好人數跟板子，設定完會有「建立連線房間」的按鈕。</div>
        <button class="primary" style="margin-top:10px;" onclick="switchTab('t-judge')">前往設定板子 →</button>
      </div>
      <div class="card" style="margin-top:14px;">
        <label>房號</label>
        <input type="text" id="jg-room-code-join" placeholder="輸入房號" inputmode="numeric">
        <button class="primary" style="margin-top:10px;" onclick="jgRoomCheckCodeThenJoin(document.getElementById('jg-room-code-join').value)">加入房間</button>
      </div>
    </div>
    <div class="info" style="font-size:12px;margin-top:10px;">
      <div><b>目前進度</b></div>
      <div style="margin-top:4px;"><b>手機發牌：</b>所有板子都可以用。身分發到各自手機，之後由法官用「法官の助手」主持；玩家手機會即時看到號碼姓名名單、上警號碼、警上發言順序，上警的人可以直接在手機按退水。黑市商人板的幸運兒、邱比特板的情侶，會在自己手機上收到只有自己看得到的提醒。</div>
      <div style="margin-top:4px;"><b>連線房間全自動：</b>預女獵守、機械狼＋通靈師、攝夢人＋夢魘、黑市商人＋狼兄狼弟、魔術師、血月使者＋獵魔人、狼美人＋騎士、惡靈騎士＋守衛、混血兒＋黑／白狼王＋血月、邱比特、唯鄰是從。這些板子的勝負會自動判定（規則跟法官助手同一份）；其他板子還在做，請先用手機發牌。</div>
      <div style="margin-top:4px;">以上功能都還沒經過完整實機測試，可能會有 bug，歡迎回報問題。</div>
    </div>
  `;
  // 如果是從邀請連結點進來的（網址帶 ?room=房號），直接把房號填好，玩家只要打名字就好，
  // 不用自己找房號跟房主要。優先看 window.__jgRoomInviteCode（見下面
  // jgRoomAutoOpenFromInviteLink 的說明——這個函式是 async 的，執行到這裡之前，網址列的
  // ?room= 可能已經被清掉了，所以不能只看網址，要有這個備援）。
  try{
    const urlRoom=(new URLSearchParams(window.location.search).get('room'))||window.__jgRoomInviteCode;
    if(urlRoom){
      const codeInput=document.getElementById('jg-room-code-join');
      if(codeInput) codeInput.value=urlRoom;
    }
  }catch(e){}
};

// ── 邀請連結：如果是帶著 ?room=房號 打開的網址，直接自動切到「連線房間」分頁，
//    不用還要自己找到分頁按鈕點進去——房號已經在 jgRoomRenderEntry 那邊處理過了，
//    這裡只負責「自動跳分頁」這件事。──
(function jgRoomAutoOpenFromInviteLink(){
  try{
    const urlRoom=new URLSearchParams(window.location.search).get('room');
    if(urlRoom&&typeof window.switchTab==='function'){
      // jgRoomRenderEntry() 是 async 的，中間會先 await 一次「有沒有上次留著沒退出的
      // 房間」（jgRoomTryAutoReconnect），這個 await 完成之前，下面幾行會先同步執行完，
      // 把網址列的房號清掉——如果只靠 jgRoomRenderEntry 自己重新讀網址，讀到的時候可能
      // 已經被清空了，房號欄位就會是空的（使用者還是得自己打房號）。這裡先把房號存進一個
      // window 變數當備援，不管非同步渲染跑到哪個時間點，jgRoomRenderEntry 都讀得到。
      window.__jgRoomInviteCode=urlRoom;
      window.switchTab('t-room');
      // 切完分頁之後把網址列的 ?room=房號 清掉（用 replaceState，不會真的重新整理頁面）
      // ——不然瀏覽器重新整理網址列還是帶著同一個房號，每次重新整理都會被這段程式碼再抓
      // 回連線房間分頁，想單純重新整理回法官助手分頁會一直被拉回去，出不去。
      const cleanUrl=window.location.pathname+window.location.hash;
      window.history.replaceState({}, '', cleanUrl);
    }
  }catch(e){}
})();
