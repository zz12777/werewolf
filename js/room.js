// ═══════════════════════════════════════════
// js/room.js
// 連線房間：多支手機共用一個房號，即時同步玩家名單、隨機分配身分（只有自己看得到自己的牌）。
// 這是第一階段（房間系統＋身分分配）的實作，遊戲流程自動化跟語音播報留待下一階段。
// 這個檔案是 ES module（用到 Firestore 的 import），跟其餘 <script>（非 module）載入的
// js 檔互相看不到彼此的變數，所以這裡也把要給一般 script 用的函式掛到 window 上。
// ═══════════════════════════════════════════
import {
  doc, setDoc, getDoc, addDoc, collection, onSnapshot, serverTimestamp, query, orderBy, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

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

// ── 夜晚操作畫面共用的倒數計時器：30 秒倒數，剩 10 秒時把法官台詞閃一次提醒——之後每加
//    一個角色（查驗類、魔術師交換...），畫面上只要放這個計時器＋自己的台詞文字，就能
//    共用同一套倒數/提醒邏輯，不用每個角色各寫一份。──
function jgRoomTimerHtml(seconds, phrase){
  return '<div class="card" style="text-align:center;padding:14px;margin-bottom:10px;">'
    +'<div style="font-size:12px;color:var(--text2);">⏱️ 倒數 <span id="jg-room-countdown">'+seconds+'</span> 秒</div>'
    +'<div class="speech" id="jg-room-script-line" style="margin-top:6px;">「<em>'+phrase+'</em>」</div>'
    +'</div>';
}
function jgRoomStartTimer(seconds, onComplete){
  jgRoomStopTimer();
  let remaining=seconds;
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
// 整個房間結束。只標記 dissolved:true，不真的刪除 Firestore 文件（子集合沒辦法從前端
// 一次砍乾淨，留著也無妨，反正房號不會再被使用）。
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
  try{ localStorage.setItem('jgLastRoomCode', code); }catch(e){}
  await jgRoomEnterLobby(code);
};
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
  const roomSnap=await getDoc(doc(db,'rooms',code));
  if(!roomSnap.exists()){ alert('找不到這個房號，請確認房號是否正確'); return; }
  if(roomSnap.data().mode!=='deal'){ alert('這不是發牌房，請確認房號。'); return; }
  const uid=await jgRoomWaitAuth();
  jgRoomIsHost=(roomSnap.data().hostUid===uid);
  try{ localStorage.setItem('jgLastRoomCode', code); }catch(e){}
  await jgRoomEnterLobby(code);
};
// 房主分配身分：洗牌、寫進每個座位的 secrets，再把整份「座位→身分」的結果套進本機的
// 法官助手（jgApplyDealtRoles，定義在 js/core.js），直接把房主的畫面切回法官助手繼續
// 主持——玩家手機那邊則靠 dealtDone 這個欄位，各自從 secrets 讀出自己的身分顯示大字。
window.jgRoomDealAssignRoles=async function(){
  if(!jgRoomCode) return;
  const rd=jgRoomLatestRoomDoc||{};
  const presetNames=rd.presetNames||{};
  const totalSeats=Object.keys(presetNames).length;
  const claimedSeats=jgRoomLatestPlayers.length;
  if(claimedSeats!==totalSeats){
    alert('⚠️ 還有座位沒有人認領（'+claimedSeats+' / '+totalSeats+'），請等所有人都加入再分配身分。');
    return;
  }
  const db=window.jgFirebaseDb;
  const pool=shuffle(buildPool(jgRoomComp));
  const players=jgRoomLatestPlayers.slice().sort((a,b)=>a.seatNum-b.seatNum);
  const seatRoleMap={};
  await Promise.all(players.map((p,i)=>{
    const role=pool[i]||'villager';
    seatRoleMap[p.seatNum]=role;
    return setDoc(doc(db,'rooms',jgRoomCode,'secrets',p.uid),{ role:role, seatNum:p.seatNum });
  }));
  await setDoc(doc(db,'rooms',jgRoomCode),{ dealtDone:true, status:'role-assigned' },{ merge:true });
  // 房主自己的裝置：直接把這份結果套進本機法官助手，跳回去繼續主持，不用再看發牌房畫面。
  if(window.jgApplyDealtRoles) window.jgApplyDealtRoles(seatRoleMap, jgRoomComp, jgRoomTotal);
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
  const claimedBySeat={};
  jgRoomLatestPlayers.forEach(p=>{ claimedBySeat[p.seatNum]=p; });
  const myUid=window.jgFirebaseUid;
  const myClaimed=jgRoomLatestPlayers.some(p=>p.uid===myUid);
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
    ?'<button class="primary" style="margin-top:14px;" onclick="jgRoomDealAssignRoles()">分配身分（'+jgRoomLatestPlayers.length+' / '+seats.length+' 人）</button>'
    :'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">'+(myClaimed?'已認領座位，等待房主分配身分...':(hasRealNames?'請從上方點選你的姓名':'請選一個座位、輸入你的全名並按認領'))+'</div>';
  root.innerHTML=`
    <div class="nbanner"><div class="nicon">🎴</div><h1>房間 ${jgRoomCode}（發牌）</h1></div>
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
    <div class="nbanner"><div class="nicon">🎴</div><h1>連線房間發牌</h1></div>
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
window.jgRoomCreate=async function(hostName, comp, total, usePresetNames){
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
  await setDoc(doc(db,'rooms',code),Object.assign(
    { hostUid:uid, status:'lobby', createdAt:serverTimestamp(), comp:comp, total:total },
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
  const roomSnap=await getDoc(doc(db,'rooms',code));
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
  const uid=await jgRoomWaitAuth();
  const db=window.jgFirebaseDb;
  const roomSnap=await getDoc(doc(db,'rooms',code));
  if(!roomSnap.exists()){ alert('找不到這個房號，請確認房號是否正確'); return; }
  if(roomSnap.data().status!=='lobby'){ alert('這場遊戲已經開始，無法加入'); return; }
  jgRoomComp=roomSnap.data().comp||null;
  jgRoomTotal=roomSnap.data().total||null;
  // 算目前已經有幾人，決定這個新玩家的座位號碼（用 getDocs 一次性查詢，不用另外拉監聽）
  const { getDocs } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js");
  const playersSnap=await getDocs(collection(db,'rooms',code,'players'));
  const existing=playersSnap.docs.find(d=>d.id===uid);
  // 房間設定是幾人局，就只能加入到那個人數——這裡原本只檢查「遊戲開始了沒」，沒檢查
  // 「已經加入的人數是不是已經到齊了」，導致例如6人局可以一直有新的人加進來，超過6人。
  // 已經加入過的人（重新整理、重新連線）不受這個限制，可以照樣回到原本的座位。
  if(!existing&&jgRoomTotal&&playersSnap.size>=jgRoomTotal){
    alert('⚠️ 這個房間是 '+jgRoomTotal+' 人局，已經到齊了，無法加入。');
    return;
  }
  const seatNum=existing?existing.data().seatNum:(playersSnap.size+1);
  await setDoc(doc(db,'rooms',code,'players',uid),{
    name:nm, seatNum:seatNum, joinedAt:serverTimestamp(), alive:true
  });
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
  const uid=await jgRoomWaitAuth();
  const db=window.jgFirebaseDb;
  const roomSnap=await getDoc(doc(db,'rooms',code));
  if(!roomSnap.exists()){ alert('找不到這個房號，請確認房號是否正確'); return; }
  const rd=roomSnap.data();
  if(rd.status!=='lobby'){ alert('這場遊戲已經開始，無法加入'); return; }
  const presetNames=rd.presetNames||{};
  const { getDocs } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js");
  const playersSnap=await getDocs(collection(db,'rooms',code,'players'));
  const existing=playersSnap.docs.find(d=>d.id===uid);
  const seatTaken=playersSnap.docs.find(d=>d.id!==uid&&d.data().seatNum===seatNum);
  if(seatTaken&&!existing){ alert('這個座位已經有人選走了，請重新整理選別的座位'); return; }
  jgRoomComp=rd.comp||null;
  jgRoomTotal=rd.total||null;
  await setDoc(doc(db,'rooms',code,'players',uid),{
    name: presetNames[seatNum]||(seatNum+'號'), seatNum:seatNum, joinedAt:serverTimestamp(), alive:true
  });
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
  const roomSnap=await getDoc(doc(db,'rooms',code));
  if(!roomSnap.exists()){ alert('找不到這個房號，請確認房號是否正確'); return; }
  const rd=roomSnap.data();
  if(rd.mode==='deal'){
    await jgRoomDealJoin(code);
    return;
  }
  if(rd.presetNames&&Object.keys(rd.presetNames).length){
    await jgRoomRenderJoinSeatPicker(code, rd);
  } else {
    jgRoomRenderJoinNameInput(code);
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
      <div class="nicon">🎮</div>
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
      <div class="nicon">🎮</div>
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
window.jgRoomShowMyIdentity=function(){
  if(!jgMySeatNum){ alert('還沒有座位資料（可能還在大廳，尚未分配身分）'); return; }
  const roleName=jgMyRole?((typeof RNAME!=='undefined'&&RNAME[jgMyRole])||jgMyRole):'（尚未分配身分）';
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
  if(jgRoomUnsubPlayers) jgRoomUnsubPlayers();
  const q=query(collection(db,'rooms',code,'players'), orderBy('seatNum'));
  jgRoomUnsubPlayers=onSnapshot(q,(snap)=>{
    jgRoomLatestPlayers=snap.docs.map(d=>({uid:d.id, ...d.data()}));
    jgRoomRenderCurrentPhase();
  });
  if(jgRoomUnsubRoom) jgRoomUnsubRoom();
  jgRoomUnsubRoom=onSnapshot(doc(db,'rooms',code),(snap)=>{
    jgRoomLatestRoomDoc=snap.exists()?snap.data():null;
    // 房主解散房間：所有人（含房主自己，如果房主是先按解散再看到這次快照）的監聽都會收到
    // dissolved:true，偵測到就提醒一下、把自己踢回建立/加入畫面——用 jgRoomCode 是否還在
    // 判斷「我是不是已經離開了」，避免房主自己觸發解散後，這裡又重複跳一次提醒。
    if(jgRoomLatestRoomDoc&&jgRoomLatestRoomDoc.dissolved&&jgRoomCode){
      alert('🗑️ 房主已經解散這個房間。');
      jgRoomLeave();
      return;
    }
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
  jgRoomAppendPlayerStatusFooter();
}
// 死亡玩家的畫面最下面補一個「進入上帝視角」按鈕——不管現在房間進行到哪個畫面都會出現
// （只要玩家自己的 alive 是 false），活著的玩家完全看不到這個按鈕。
function jgRoomAppendGodViewToggle(){
  const root=document.getElementById('jg-room-content');
  if(!root) return;
  const me=jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid);
  if(me&&me.alive===false){
    root.insertAdjacentHTML('beforeend','<button style="margin-top:20px;" onclick="jgRoomToggleGodView()">進入上帝視角</button>');
  }
}
// 底部「玩家狀態」格子：不管現在是白天、投票中、警長競選，還是夜晚，畫面最下面都固定
// 疊加這一排——活著的人只看得到「號碼＋姓名」，刻意不顯示角色／幸運兒標籤／邱比特情侶
// 連結這些會洩漏場上機密的資訊（那些只有上帝視角才看得到，見 jgRoomRenderGodView，死亡
// 才能切換）；死亡的人格子會變灰，跟本機法官助手的玩家狀態欄位一致，而且不管現在是不是
// 正在看上帝視角，這個變灰的視覺效果都一樣（上帝視角有自己另一份完整版本，不會重複疊加
// 這個函式，見下面 jgRoomGodViewOn 的判斷）。
function jgRoomPlayerStatusFooterHtml(){
  const cells=jgRoomLatestPlayers.slice().sort((a,b)=>a.seatNum-b.seatNum).map(p=>
    '<div class="pcell'+(p.alive===false?' dead':'')+'"><div class="pnum">'+p.seatNum+'號</div><div class="pname">'+p.name+'</div></div>'
  ).join('');
  return '<div class="section-title" style="margin-top:18px;">玩家狀態</div><div class="pgrid">'+cells+'</div>';
}
function jgRoomAppendPlayerStatusFooter(){
  if(jgRoomGodViewOn) return; // 上帝視角已經有自己完整版本的玩家狀態，不要重複疊加
  const root=document.getElementById('jg-room-content');
  if(!root) return;
  root.insertAdjacentHTML('beforeend', jgRoomPlayerStatusFooterHtml());
}

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
  const pool=shuffle(buildPool(jgRoomComp));
  await Promise.all(players.map((p,i)=>
    setDoc(doc(db,'rooms',jgRoomCode,'secrets',p.uid),{ role:pool[i]||'villager', seatNum:p.seatNum })
  ));
  await setDoc(doc(db,'rooms',jgRoomCode),{ status:'role-assigned', phase:'lobby' },{ merge:true });
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
const JG_ROOM_NIGHT_STEP_ORDER=['cupid','nightmare','magician','guard','dreamcatcher','wolfbrother','mechwolf','wolf'];
function jgRoomStepPresent(step, night){
  const c=jgRoomComp||{};
  if(step==='cupid') return c.cupid>0&&night===1;
  if(step==='nightmare') return c.nightmare>0;
  if(step==='magician') return c.magician>0;
  if(step==='guard') return c.guard>0;
  if(step==='dreamcatcher') return c.dreamcatcher>0;
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
async function jgRoomStartNextNight(){
  if(!jgRoomCode) return;
  const db=window.jgFirebaseDb;
  const roomSnap=await getDoc(doc(db,'rooms',jgRoomCode));
  const rd=roomSnap.data()||{};
  const nextNight=(rd.night||1)+1;
  const firstStep=jgRoomNextNightStep(null, nextNight);
  await setDoc(doc(db,'rooms',jgRoomCode),{
    phase:'night', night:nextNight, currentStep:firstStep,
    pendingShootUids:[], pendingShootContext:null,
    votingActive:false, dayVotePkRound:false,
    // 發言方向（順/逆）整局只會決定一次，之後每天都沿用同一個方向，不能每晚重設——
    // 只有「今天從幾號開始講」（daySpeechStart）才是每天都要重新決定的，跟本機法官助手
    // 的 jgSpeakDirection（整局唯一）／jgDayMeta[night].start（每天都不同）是同一套規則。
    daySpeechStart:null
  },{ merge:true });
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
// 查驗類角色結束（或本來就沒有）之後，第一夜要接警長競選，第二夜起（本局已經選過警長，
// 不會再選第二次）直接進入白天公告死訊、開放發言／投票放逐——共用這個判斷。
async function jgRoomAdvanceToDayPhase(night){
  const db=window.jgFirebaseDb;
  await jgRoomCaptureDeathLine(night);
  if(night===1){
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
  await add(uidOfSeat(fresh.cupidLoverASeatNum), fresh.cupidLoverASeatNum, '（情侶殉情）');
  await add(uidOfSeat(fresh.cupidLoverBSeatNum), fresh.cupidLoverBSeatNum, '（情侶殉情）');
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
  const checkStep=jgRoomNextCheckStep();
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
  return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><div class="nicon">🎖️</div><h1>你陣亡了，警徽要傳給誰？</h1></div>'
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
  if(role==='hunter'||role==='wolfking') return true;
  const pSnap=await getDoc(doc(db,'rooms',jgRoomCode,'players',uid));
  const p=pSnap.exists()?pSnap.data():null;
  if(!p||p.luckyOneSkill!=='hunter') return false;
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
  const kill=async(uid)=>{ if(uid) await setDoc(doc(db,'rooms',jgRoomCode,'players',uid),{ alive:false },{ merge:true }); };
  // 這一晚「真的死於狼刀／機械狼額外一刀」的人——只有這兩種死法才可能觸發夜槍（見
  // jgRoomCheckShootEligible 的說明），先收集起來，結算完再一起檢查資格、寫進
  // pendingShootUids，避免跟下面的死亡結算穿插在一起、漏算或算重。
  const wolfKillDeathCandidates=[];
  const wolfTarget=fresh.wolfKillTargetUid;
  if(wolfTarget&&!isDreaming(wolfTarget)){
    const guardedThis=fresh.guardProtectedUid&&fresh.guardProtectedUid===wolfTarget;
    const savedThis=fresh.witchSavedUid&&fresh.witchSavedUid===wolfTarget;
    const mechGuardedThis=fresh.mechWolfGuardUid&&fresh.mechWolfGuardNight===night&&fresh.mechWolfGuardUid===wolfTarget;
    const overheal=guardedThis&&savedThis;
    if(overheal||(!guardedThis&&!savedThis&&!mechGuardedThis)){
      await kill(wolfTarget);
      wolfKillDeathCandidates.push(wolfTarget);
    }
  }
  if(fresh.witchPoisonUid&&!isDreaming(fresh.witchPoisonUid)) await kill(fresh.witchPoisonUid);
  // 機械狼學到狼人/黑狼王的額外一刀、學到女巫的毒藥：整局限一次、不可被守衛/解藥阻擋。
  if(fresh.mechWolfBonusKillUid&&fresh.mechWolfBonusKillNight===night&&!isDreaming(fresh.mechWolfBonusKillUid)){
    await kill(fresh.mechWolfBonusKillUid);
    wolfKillDeathCandidates.push(fresh.mechWolfBonusKillUid); // 這也算狼隊的刀，一樣可能觸發夜槍
  }
  if(fresh.mechWolfPoisonUid&&fresh.mechWolfPoisonNight===night&&!isDreaming(fresh.mechWolfPoisonUid)) await kill(fresh.mechWolfPoisonUid);
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
    await setDoc(doc(db,'rooms',jgRoomCode,'players',survivor),{ alive:false },{ merge:true });
  }
}

// ═══════════════════════════════════════════
// 夢魘／魔術師／攝夢人／機械狼——共用的小工具
// ═══════════════════════════════════════════
// 魔術師換流重新導向：如果這一晚魔術師交換了 A/B 兩個號碼，任何角色「原本想指定的目標
// uid」在真正生效（存進資料庫、影響死亡結算）之前，都要先經過這個函式轉換成「對方」的
// uid——跟本機法官助手 jgMagicSwapNum() 是同一套邏輯，只是這裡是用 uid 而不是座位號碼。
// 顯示給操作者自己看的「已選擇 X號」文字，要用他原本點的號碼（raw），不要用轉換後的結果
// ——他自己並不知道號碼被換過，只有天亮結算、跟魔術師板子介紹卡片會提到換流的存在。
// ── 圓點選號按鈕（比照本機法官助手 jgNumSelectHtml／jgNumGridPick 的視覺跟互動方式）：
//    點號碼只是「在這支手機上先選起來、變綠色」，不會馬上送出，要另外按「確認」才會真的
//    寫進資料庫——這樣使用者點錯可以自己改選，不用每點一次都跳出「確定嗎？」的對話框。
function jgRoomNumGridHtml(gridId, curSeatNum, extraDisabledSeats){
  const alive=jgRoomLatestPlayers.slice().sort((a,b)=>a.seatNum-b.seatNum);
  const extraDisabled=new Set(extraDisabledSeats||[]);
  let html='<input type="hidden" id="'+gridId+'" value="'+(curSeatNum||'')+'">'
    +'<div class="numgrid" id="'+gridId+'-grid" style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:14px;">';
  alive.forEach(p=>{
    const dead=p.alive===false||extraDisabled.has(p.seatNum);
    const sel=curSeatNum===p.seatNum;
    html+='<button type="button" data-num="'+p.seatNum+'"'+(dead?' disabled':'')
      +' onclick="jgRoomNumGridPick(\''+gridId+'\','+p.seatNum+')"'
      +' style="width:auto;min-width:42px;height:42px;padding:0 8px;margin:0;border-radius:10px;font-size:14px;font-weight:700;'
      +(dead?'background:var(--bg4);color:var(--text3);text-decoration:line-through;':(sel?'background:var(--success,#2e7d32);color:#fff;border-color:transparent;':''))
      +'">'+p.seatNum+'</button>';
  });
  html+='</div>';
  return html;
}
window.jgRoomNumGridPick=function(gridId, seatNum){
  const hidden=document.getElementById(gridId);
  if(!hidden) return;
  const already=hidden.value&&parseInt(hidden.value)===seatNum;
  hidden.value=already?'':seatNum.toString();
  const grid=document.getElementById(gridId+'-grid');
  if(grid){
    grid.querySelectorAll('button').forEach(b=>{
      const isSel=!already&&b.getAttribute('data-num')===seatNum.toString();
      b.style.background=isSel?'var(--success,#2e7d32)':'';
      b.style.color=isSel?'#fff':'';
      b.style.borderColor=isSel?'transparent':'';
    });
  }
};

// ── 大字報（比照本機法官助手 jgShowBigCard，同樣是黑底滿版、超大字體）：機械狼學到身分
//    這種「一定要讓他看清楚、不會漏看」的重要訊息，用這個顯示會比塞在一般頁面裡的標題
//    醒目很多，手機上一眼就能看到「幾號、什麼身分」。──
function jgRoomShowBigCard(mainText, subText){
  let modal=document.getElementById('jg-room-bigcard-modal');
  if(!modal){
    modal=document.createElement('div');
    modal.id='jg-room-bigcard-modal';
    modal.style.cssText='position:fixed;inset:0;background:#0a0a0a;color:#fff;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;overflow-y:auto;';
    document.body.appendChild(modal);
  }
  modal.innerHTML='<div style="font-size:14vw;font-weight:900;line-height:1.15;word-break:break-word;">'+mainText+'</div>'
    +(subText?'<div style="font-size:8vw;font-weight:800;margin-top:18px;color:#ffd166;">'+subText+'</div>':'')
    +'<button onclick="document.getElementById(\'jg-room-bigcard-modal\').remove()" style="width:auto;margin-top:48px;padding:14px 36px;font-size:18px;border-radius:12px;border:none;background:#fff;color:#111;font-weight:700;flex-shrink:0;">關閉</button>';
}

// ── 夜晚各種行動函式（提議/救人/查驗...）寫完資料庫之後，原本都是直接呼叫
//    jgRoomRenderNightShell() 重新渲染——但那個函式讀的是 jgRoomLatestRoomDoc 這份畫面
//    快取，快取要等即時監聽器（onSnapshot）收到剛剛那筆寫入才會更新。如果監聽器沒有
//    馬上跟上（例如瀏覽器剛跳出 confirm() 對話框、網路狀況不穩），畫面會停在寫入之前的
//    舊狀態，感覺就像卡住、要手動重新整理頁面才會恢復正常（這是這次抓到、確認過的真正
//    問題）。這裡統一改成「自己重新讀一次資料庫最新狀態、更新快取，再交給總機判斷現在
//    真正該顯示哪個畫面」，不要只憑空呼叫 jgRoomRenderNightShell()（那個假設現在還在
//    夜晚，但這個動作也可能剛好是這一夜最後一步、已經進入白天了，用 jgRoomRenderCurrentPhase()
//    才會正確判斷現在到底該顯示夜晚、白天、投票，還是警長競選畫面）。
async function jgRoomRefreshAndRenderCurrent(){
  const db=window.jgFirebaseDb;
  try{
    const freshSnap=await getDoc(doc(db,'rooms',jgRoomCode));
    if(freshSnap.exists()) jgRoomLatestRoomDoc=freshSnap.data();
  }catch(e){
    // 這裡以前是完全吞掉錯誤（catch(e){}），任何讀取失敗（權限被擋、網路問題...）都會
    // 無聲無息地被蓋過去，接下來還是照樣用可能是舊的 jgRoomLatestRoomDoc 硬渲染下去——
    // 這個函式在整個房間系統裡被呼叫超過30次，幾乎每個動作按鈕的最後一步都會呼叫它，
    // 如果真正的問題出在這裡，先前完全看不出任何痕跡。這裡改成至少印到瀏覽器主控台，
        // 方便之後如果還有類似的「按了沒反應」的回報，可以請對方打開主控台看看有沒有這行。
    console.error('jgRoomRefreshAndRenderCurrent 讀取房間資料失敗', e);
  }
  await jgRoomRenderCurrentPhase();
}

function jgRoomEffectiveTarget(rd, night, uid){
  if(!uid) return uid;
  if(rd.magicianSwapNight===night&&rd.magicianSwapAUid&&rd.magicianSwapBUid){
    if(uid===rd.magicianSwapAUid) return rd.magicianSwapBUid;
    if(uid===rd.magicianSwapBUid) return rd.magicianSwapAUid;
  }
  return uid;
}
// 夢魘恐懼：查我自己（目前正在看這個畫面的人）今晚是不是被恐懼了，是的話這個角色今晚
// 完全無法行動（不會看到任何操作介面）。狼隊比較特別——恐懼到「任何一位狼隊友」時，
// 全隊當晚都不能殺人，所以狼隊出刀畫面另外用 rd.nightmareFearedIsWolf 判斷，不是用這個。
function jgRoomAmIFeared(rd, night){
  return !!(rd.nightmareFearedNight===night&&rd.nightmareFearedUid===window.jgFirebaseUid);
}
function jgRoomFearedNoticeHtml(){
  return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><div class="nicon">😱</div><h1>你今晚被恐懼了</h1></div>'
    +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">夢魘今晚恐懼了你，你這一晚無法發動任何技能，請安靜等待。</div>'};
}
// ═══════════════════════════════════════════
// 文字紀錄：格式比照本機法官助手的匯出格式（見 core.js 的 jgFormatNightLog／
// jgExportGameLog），每一晚的行動一發生就存一行進 rooms/{code}/nightLog/{night} 這份文件
// 的 lines 陣列（用 arrayUnion，不會覆蓋之前存的），這樣上帝視角才能捲動看到「歷史上每一
// 晚」發生了什麼，不會因為換到下一夜、房間文件裡那些會被覆寫的即時欄位（wolfKillTargetSeatNum
// 之類）被蓋掉就跟著不見。白天的死訊／警長競選／放逐投票 block 存在 rooms/{code}/dayLog/{night}，
// 讀取時再搭配 votingRoundLog／votes（已經是按輪次分開存的歷史資料，見放逐投票功能那次的
// 修正）組成完整的 block。行的縮寫盡量比照本機格式（恐/換/守/夢/機學/刀/易/救/毒/驗/通驗/
// 邱…），但這裡只實作房間系統目前真的有自動化的角色，本機法官助手支援、房間系統還沒做的
// 角色（狼美人魅惑、惡靈騎士夜間免疫、守墓人查驗…）不會出現在這份紀錄裡。
// ═══════════════════════════════════════════
async function jgRoomAppendNightLog(night, line){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode,'nightLog',String(night)),{ lines: arrayUnion(line) },{ merge:true });
}
async function jgRoomSetDayDeathLine(night, line){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode,'dayLog',String(night)),{ deathLine: line },{ merge:true });
}
// 開槍帶人的結果——分兩種情境，用不同欄位存，因為代表的是不同事件：
// 「夜槍」（context='night'，獵人/黑狼王/幸運兒被狼刀淘汰後開的槍）要補在當晚死訊那一句
// 後面，所以先暫存進 shotNotes 陣列（arrayUnion，可能不只一槍，例如狼刀跟機械狼額外一刀
// 同晚分別命中兩個有資格開槍的人），等 jgRoomCaptureDeathLine 組死訊那一行的時候再讀出來
// 接在後面——槍一定比死訊早結算完（開槍畫面會卡住流程，一定要等槍決定完才會往下走進入
// jgRoomAdvanceToDayPhase／jgRoomCaptureDeathLine，見 jgRoomAdvanceToCheckOrSheriff 的
// pendingShootUids 判斷），所以這裡不用擔心寫入順序顛倒。
// 「白天槍」（context='day'，被放逐投票出局後開的槍）是當天發生的新事件，不是在講昨晚死訊，
// 所以另外存一個欄位 voteShotNote，白天投票 block 顯示的時候單獨列一行。
async function jgRoomAppendShotNoteToDayLog(night, note){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode,'dayLog',String(night)),{ shotNotes: arrayUnion(note) },{ merge:true });
}
async function jgRoomSetDayVoteShotNote(night, note){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode,'dayLog',String(night)),{ voteShotNote: note },{ merge:true });
}
// 邱比特／守衛／攝夢人／狼兄狼弟／機械狼結束後，接下來該往哪一步——用
// jgRoomNextNightStep() 從指定步驟之後開始找，避免各自硬寫下一步名稱、改順序時到處都要
// 跟著改。night 一定要傳進來，邱比特那個「只有第一夜出現」的判斷才會正確。
async function jgRoomAdvanceToWolfOrBeyond(fromStep, night){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{ currentStep:jgRoomNextNightStep(fromStep, night) },{ merge:true });
}

// ── 守衛：狼隊出刀之前先盲守（不知道狼隊會殺誰），保護對象免疫當晚狼刀——除非女巫也
//    同時救了同一個人（奶穿，還是會死）。不能連續兩晚守同一人，這個限制要跨夜記住，
//    存在守衛自己的 players/{uid}.lastGuardTargetUid 上，不會因為換到下一夜就重置。──
async function jgRoomGuardViewHtml(night){
  const rd=jgRoomLatestRoomDoc||{};
  if(jgRoomAmIFeared(rd,night)) return jgRoomFearedNoticeHtml();
  if(rd.guardTargetNight===night&&rd.guardProtectedSeatNum!=null){
    return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><div class="nicon">🛡️</div><h1>已選擇守護</h1>'
      +'<p class="sub" style="text-align:center;margin-top:8px;font-size:20px;font-weight:800;">'+rd.guardProtectedSeatNum+'號</p></div>'
      +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">請記住，等待其他人完成夜晚行動</div>'};
  }
  const me=jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid);
  const lastTarget=me?me.lastGuardTargetUid:null;
  const lastTargetSeat=lastTarget?(jgRoomLatestPlayers.find(p=>p.uid===lastTarget)||{}).seatNum:null;
  return {needsTimer:true, html:jgRoomTimerHtml(20,'你要守護的對象是？')
    +'<div class="nbanner" style="margin-top:20px;"><div class="nicon">🛡️</div><h1>請選擇守護對象</h1></div>'
    +(lastTarget?'<div class="info" style="font-size:12px;text-align:center;">不能連續兩晚守護同一人（'+lastTargetSeat+'號），上一晚守護的對象已排除</div>':'')
    +jgRoomNumGridHtml('jg-room-guard-pick', null)
    +'<div style="text-align:center;"><button class="primary" style="margin-top:14px;" onclick="jgRoomGuardActFromGrid('+night+')">確認</button></div>'};
}
window.jgRoomGuardActFromGrid=function(night){
  const hidden=document.getElementById('jg-room-guard-pick');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seatNum);
  if(!p) return;
  const me=jgRoomLatestPlayers.find(pp=>pp.uid===window.jgFirebaseUid);
  if(me&&me.lastGuardTargetUid===p.uid){ alert('不能連續兩晚守護同一人，請選別人'); return; }
  window.jgRoomGuardAct(p.uid, seatNum, night);
};
window.jgRoomGuardAct=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  const effective=jgRoomEffectiveTarget(rd,night,targetUid);
  await setDoc(doc(db,'rooms',jgRoomCode),{
    guardTargetNight:night, guardProtectedUid:effective, guardProtectedSeatNum:targetSeatNum
  },{ merge:true });
  await setDoc(doc(db,'rooms',jgRoomCode,'players',window.jgFirebaseUid),{ lastGuardTargetUid:targetUid },{ merge:true });
  await jgRoomAppendNightLog(night, '守 '+targetSeatNum);
  await jgRoomAdvanceToWolfOrBeyond('guard', night);
  await jgRoomRefreshAndRenderCurrent();
};

// ── 女巫：狼隊確認出刀之後才輪到女巫，她會看到狼隊今晚殺了誰，可以選擇用解藥救（自己
//    被殺不能自救）、用毒藥毒任何一人，或都不用；解藥/毒藥各自整局限一次，這個限制要
//    跨夜記住，存在女巫自己的 players/{uid}.witchSaveUsed／witchPoisonUsed 上。這一版
//    簡化成「一晚只能選一種行動」（救、毒、跳過三選一），不支援同一晚又救又毒。──
async function jgRoomWitchViewHtml(night){
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  if(jgRoomAmIFeared(rd,night)) return jgRoomFearedNoticeHtml();
  const actSnap=await getDoc(doc(db,'rooms',jgRoomCode,'witchActs',window.jgFirebaseUid));
  if(actSnap.exists()&&actSnap.data().night===night){
    const d=actSnap.data();
    const summary=d.saved?('救了 '+rd.wolfKillTargetSeatNum+'號'):(d.poisonedSeatNum?('毒了 '+d.poisonedSeatNum+'號'):'這晚沒有使用任何藥');
    return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><div class="nicon">🧪</div><h1>已行動</h1>'
      +'<p class="sub" style="text-align:center;margin-top:8px;">'+summary+'</p></div>'
      +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">請記住，等待其他人完成夜晚行動</div>'};
  }
  const me=jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid);
  const saveUsed=!!(me&&me.witchSaveUsed);
  const poisonUsed=!!(me&&me.witchPoisonUsed);
  const wolfTargetUid=rd.wolfKillTargetUid;
  const wolfTargetSeatNum=rd.wolfKillTargetSeatNum;
  const canSaveThis=wolfTargetUid&&!saveUsed&&wolfTargetUid!==window.jgFirebaseUid;
  const targetP=wolfTargetUid?jgRoomLatestPlayers.find(p=>p.uid===wolfTargetUid):null;
  // 畫面樣式比照本機法官助手的女巫睜眼畫面：有人被殺時用醒目的紅色提示框顯示座位＋姓名，
  // 平安夜則只用一行淡淡的文字帶過（見 .killed-box／.killed-label／.killed-num／
  // .killed-name 這幾個既有的 CSS class，本機那邊本來就在用，這裡直接沿用同一套視覺）。
  let html=jgRoomTimerHtml(20,'你要使用解藥或毒藥嗎？');
  if(wolfTargetSeatNum){
    html+='<div class="killed-box"><div class="killed-label">今晚被狼人殺死</div>'
      +'<div class="killed-num">'+wolfTargetSeatNum+'號</div>'
      +(targetP&&targetP.name?'<div class="killed-name">'+targetP.name+'</div>':'')+'</div>'
      +'<div class="speech" style="text-align:center;">「<em>今晚他被殺了，你要使用解藥嗎？</em>」</div>';
  } else {
    html+='<div class="nbanner" style="margin-top:20px;"><div class="nicon">🧪</div><h1>女巫請睜眼</h1></div>'
      +'<div class="speech" style="text-align:center;">「<em>今晚他被殺了，你要使用解藥嗎？</em>」</div>'
      +'<div class="info" style="font-size:12px;text-align:center;margin-top:4px;color:var(--text2);">（今晚無人死亡）</div>';
  }
  if(canSaveThis){
    html+='<div style="text-align:center;margin-top:10px;"><button class="primary" style="width:auto;display:inline-block;padding:10px 16px;" onclick="jgRoomWitchSave('+wolfTargetSeatNum+','+night+')">使用解藥救 '+wolfTargetSeatNum+'號</button></div>';
  } else if(wolfTargetUid&&saveUsed){
    html+='<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">（法官搖頭）解藥用完</div>';
  } else if(wolfTargetUid&&wolfTargetUid===window.jgFirebaseUid){
    html+='<div class="info-warn" style="text-align:center;margin-top:10px;">被殺的是你自己，不能自救（搖頭）</div>';
  }
  html+='<div class="speech" style="text-align:center;margin-top:14px;">「<em>你要使用毒藥嗎？你要毒誰呢？</em>」</div>';
  if(!poisonUsed){
    html+=jgRoomNumGridHtml('jg-room-witch-poison-pick', null)
      +'<div style="text-align:center;"><button class="primary" style="margin-top:10px;" onclick="jgRoomWitchPoisonFromGrid('+night+')">下毒</button></div>';
  } else {
    html+='<div class="info" style="font-size:12px;text-align:center;margin-top:6px;">（法官搖頭）毒藥用完</div>';
  }
  html+='<div style="text-align:center;"><button style="margin-top:14px;" onclick="jgRoomWitchSkip('+night+')">都不用，跳過</button></div>';
  return {needsTimer:true, html:html};
}
window.jgRoomWitchSave=async function(targetSeatNum, night){
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  await setDoc(doc(db,'rooms',jgRoomCode),{ witchSavedUid: rd.wolfKillTargetUid },{ merge:true });
  await setDoc(doc(db,'rooms',jgRoomCode,'players',window.jgFirebaseUid),{ witchSaveUsed:true },{ merge:true });
  await jgRoomAppendNightLog(night, '救 '+targetSeatNum);
  await jgRoomAppendNightLog(night, '毒 x');
  await jgRoomWitchFinish(night, true, null);
};
window.jgRoomWitchPoisonFromGrid=function(night){
  const hidden=document.getElementById('jg-room-witch-poison-pick');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seatNum);
  if(!p) return;
  window.jgRoomWitchPoison(p.uid, seatNum, night);
};
window.jgRoomWitchPoison=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  const effective=jgRoomEffectiveTarget(rd,night,targetUid);
  await setDoc(doc(db,'rooms',jgRoomCode),{ witchPoisonUid: effective },{ merge:true });
  await setDoc(doc(db,'rooms',jgRoomCode,'players',window.jgFirebaseUid),{ witchPoisonUsed:true },{ merge:true });
  if(rd.wolfKillTargetSeatNum) await jgRoomAppendNightLog(night, '救 x');
  await jgRoomAppendNightLog(night, '毒 '+targetSeatNum);
  await jgRoomWitchFinish(night, false, targetSeatNum);
};
window.jgRoomWitchSkip=async function(night){
  const rd=jgRoomLatestRoomDoc||{};
  if(rd.wolfKillTargetSeatNum) await jgRoomAppendNightLog(night, '救 x');
  await jgRoomAppendNightLog(night, '毒 x');
  await jgRoomWitchFinish(night, false, null);
};
async function jgRoomWitchFinish(night, saved, poisonedSeatNum){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode,'witchActs',window.jgFirebaseUid),{
    night:night, saved:saved, poisonedSeatNum:poisonedSeatNum
  });
  await jgRoomResolveNightDeaths();
  await jgRoomAdvanceToCheckOrSheriff();
  await jgRoomRefreshAndRenderCurrent();
}


// 場上存活的狼隊 uid 清單（含自己）——用來算「全員確認」需要幾票。secrets 全房可讀，
// 房間人數又小，這裡直接整個抓下來、用 WOLF_ROLES 判斷即可，不用另外維護一份陣營索引。
// 夢魘、機械狼雖然也算在 WOLF_ROLES 陣營裡，但這兩個角色都「不與狼隊一同睜眼商議」——
// 夢魘有自己獨立的恐懼步驟（排在最前面），機械狼平常也是自己單獨睜眼（見 jgRoomMechWolfViewHtml，
// 只有其餘狼隊友全滅時才會由它自己的畫面接手出刀），這裡把這兩個角色從「狼隊出刀」名單裡
// 排除，避免他們被誤算進「狼隊出刀全員確認」的人數、或被叫去跟大家一起商議刀口。
async function jgRoomGetWolfUids(){
  const db=window.jgFirebaseDb;
  const { getDocs } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js");
  const secretsSnap=await getDocs(collection(db,'rooms',jgRoomCode,'secrets'));
  return secretsSnap.docs.filter(d=>{
    const role=d.data().role;
    if(typeof WOLF_ROLES==='undefined'||!WOLF_ROLES.includes(role)) return false;
    if(role==='nightmare'||role==='mechanicalwolf') return false;
    // 狼弟在正式覺醒、完成復仇刀之前都不算進狼隊出刀名單（見 ALL_ROLES.wolfbrother_y：
    // 「覺醒當晚仍不入狼窩」）——這裡用 wolfbrotherJoinedPack 這個旗標判斷，由狼弟完成
    // 復仇刀那一刻設定（見 window.jgRoomWolfbrotherRevengeKill）。
    if(role==='wolfbrother_y'){
      const p=jgRoomLatestPlayers.find(pp=>pp.uid===d.id);
      return !!(p&&p.wolfbrotherJoinedPack);
    }
    return true;
  // 只算「還活著」的狼隊友——這是這次抓到的真正 bug：之前這裡沒有濾掉死掉的狼隊友，
  // 「全員到齊了嗎」的人數（wolfCount）會把已經死掉、永遠不可能再按確認的隊友也算進去，
  // 狼隊只要死過一個人，活著的狼就算全部按了確認，人數也永遠湊不滿，直接卡死出不去。
  }).filter(d=>{
    const p=jgRoomLatestPlayers.find(pp=>pp.uid===d.id);
    return !p||p.alive!==false; // 找不到玩家資料時保守當作還活著，不要誤判卡住
  }).map(d=>d.id);
}
// 指定「座號最小」的那一位見面狼隊友當作唯一負責操作出刀畫面的人——不只是讓畫面單純
// 一點，更重要的是徹底避開「板子上不只一隻狼、好幾支手機同時都能操作」這整類多人同步
// 問題的根源：只有一支手機真的會寫入資料庫，其他狼隊友的手機完全不會碰觸這筆資料，
// 從結構上就不會有「兩支手機幾乎同時寫入互相干擾」的可能性。
async function jgRoomWolfOperatorUid(){
  const wolfUids=await jgRoomGetWolfUids();
  if(!wolfUids.length) return null;
  let best=null, bestSeat=Infinity;
  wolfUids.forEach(uid=>{
    const p=jgRoomLatestPlayers.find(pp=>pp.uid===uid);
    const seat=p?p.seatNum:Infinity;
    if(seat<bestSeat){ bestSeat=seat; best=uid; }
  });
  return best;
}
// 機械狼獨自帶刀的條件：其餘「真正跟狼隊一起睜眼」的隊友（jgRoomGetWolfUids 排除掉機械狼
// 自己跟夢魘之後剩下的那些人）全部死亡——跟本機法官助手 jgMechWolf2KillEligible／
// jgAfterGargoyleStep 系列判斷同一套邏輯的房間版本。
async function jgRoomMechWolfKillEligible(){
  const otherWolfUids=(await jgRoomGetWolfUids());
  if(otherWolfUids.length===0) return true; // 板子裡根本沒有配置一般狼人，機械狼從一開始就是唯一的刀口來源
  return otherWolfUids.every(uid=>{
    const p=jgRoomLatestPlayers.find(pp=>pp.uid===uid);
    return p&&p.alive===false;
  });
}
// 黑市商人是不是已經交易過（整局限一次）——查 secrets 找出誰是黑市商人，再讀他自己
// player 文件上的 blackmarketUsed 旗標。板子根本沒有黑市商人時回傳 true，讓呼叫端
// 直接把這一步當作「已經沒事可做」跳過。
async function jgRoomBlackmarketUsed(){
  const db=window.jgFirebaseDb;
  const { getDocs } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js");
  const secretsSnap=await getDocs(collection(db,'rooms',jgRoomCode,'secrets'));
  const bmDoc=secretsSnap.docs.find(d=>d.data().role==='blackmarket');
  if(!bmDoc) return true;
  const p=jgRoomLatestPlayers.find(pp=>pp.uid===bmDoc.id);
  return !!(p&&p.blackmarketUsed);
}

// ── 狼隊出刀畫面：任何一位狼隊友選定目標並按下確認，就是最終決定，不用等其他隊友
//    （跟其他單人技能是同一種互動方式）。──
let jgRoomWolfFinalizing=false; // 避免「全員到齊」的結算邏輯被同時觸發兩次（見下方註解）
// 「一次操作背後有好幾筆連續寫入」的函式（狼隊出刀是目前最明顯的例子）用這個旗標暫時
// 請即時監聽器不要跟著每一筆中間寫入重畫畫面（見 jgRoomEnterLobby 裡監聽器的說明），
// 等整串操作都做完再自己呼叫一次重新渲染。務必用 try/finally 包起來，確保不管中途有沒有
// 出錯，這個旗標最後都會被重設回 false，不會讓畫面從此卡死不再跟著監聽器更新。
let jgRoomSuppressAutoRender=false;
let jgRoomNightmareWolfSkipping=false; // 避免「夢魘恐懼到狼隊友、狼隊今晚不能殺人」的自動跳過邏輯被同時觸發兩次
async function jgRoomWolfViewHtml(night){
  const rd=jgRoomLatestRoomDoc||{};
  // 夢魘恐懼到狼隊某位隊友時，狼隊當晚不得殺人——不管是誰的畫面先渲染到，都會觸發這個
  // 自動跳過（idempotent：重複觸發也只是把同樣的值再寫一次，無害），不用等狼隊自己討論。
  if(rd.nightmareFearedNight===night&&rd.nightmareFearedIsWolf){
    if(!jgRoomNightmareWolfSkipping){
      jgRoomNightmareWolfSkipping=true;
      try{
        const db=window.jgFirebaseDb;
        await setDoc(doc(db,'rooms',jgRoomCode),{
          wolfKillNight:night, wolfKillTargetUid:null, wolfKillTargetSeatNum:null
        },{ merge:true });
        await jgRoomAfterKillDecided(night);
      } finally { jgRoomNightmareWolfSkipping=false; }
    }
    return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><div class="nicon">😱</div><h1>狼隊今晚無法殺人</h1></div>'
      +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">夢魘恐懼了狼隊的一位成員，今晚是平安夜，請安靜等待。</div>'};
  }
  // 選人畫面：不再要求「狼隊全員確認」——任何一位狼隊友選定目標、按下確認，當下就是最終
  // 決定，直接往下一步走，不用等其他隊友。跟機械狼接管出刀、其他單人技能是同一種互動
  // 方式。「全員確認」這個額外的同步機制在多人同時操作、網路狀況不穩的真實環境下太容易
  // 出狀況（反覆修都修不完），這裡直接拿掉，改成最簡單可靠的「先選先贏」——如果板子上
  // 不只一隻狼，大家還是要先口頭商量好要殺誰，畫面上不會再另外做「投票/表決」這件事。
  const hostOverrideHtml=jgRoomIsHost
    ?'<div style="text-align:center;margin-top:16px;"><button style="font-size:12px;color:var(--text3);" onclick="jgRoomHostForceAdvanceWolf('+night+')">⚠️ 卡住了？房主強制往下一步</button></div>'
    :'';
  return {needsTimer:true, html: jgRoomTimerHtml(30,'今晚要殺的對象是？')
    +'<div class="nbanner" style="margin-top:20px;"><div class="nicon">🐺</div><h1>請選擇今晚要殺的對象</h1></div>'
    +'<div class="info" style="font-size:12px;text-align:center;">任何一位狼隊友選定並確認後，就是最終決定，會直接往下一步，不用等其他隊友再按一次</div>'
    +jgRoomNumGridHtml('jg-room-wolf-pick', null)
    +'<div style="text-align:center;"><button class="primary" style="margin-top:14px;" onclick="jgRoomWolfProposeFromGrid('+night+')">確認</button></div>'
    +hostOverrideHtml};
}
// 讀圓點號碼格選到的座位，換算成 uid 之後照原本的提議流程送出（見 jgRoomWolfPropose）。
window.jgRoomWolfProposeFromGrid=function(night){
  const hidden=document.getElementById('jg-room-wolf-pick');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seatNum);
  if(!p) return;
  window.jgRoomWolfPropose(p.uid, seatNum, night);
};
// 房主強制把卡住的狼隊出刀步驟往下推進——不管當下有沒有人選好目標，一律當成「今晚沒有
// 選定目標」直接往下一步走（平安夜），寧可讓法官事後用口頭方式確認實際結果，也不要讓
// 整場遊戲卡死在這裡出不去。
window.jgRoomHostForceAdvanceWolf=async function(night){
  if(!confirm('確定要強制跳過狼隊出刀嗎？這會把今晚視為「沒有選定目標」，直接往下一步。')) return;
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{
    wolfKillNight:night, wolfKillTargetUid:null, wolfKillTargetSeatNum:null
  },{ merge:true });
  await jgRoomAfterKillDecided(night);
  await jgRoomRefreshAndRenderCurrent();
};
// 任何一位狼隊友選定目標、按下確認，就是最終決定：寫入目標之後立刻結算，不用等任何人
// 確認。用房間文件本身的 currentStep 當守門員（結算前先重新讀一次，確認「還沒有人結算
// 過」）＋ jgRoomWolfFinalizing 這個旗標，兩層一起擋住「板子上不只一隻狼、兩人幾乎同時
// 按下確認」這種邊緣情況——萬一真的兩邊都通過守門員檢查，jgRoomWolfFinalize() 內部
// 也會再檢查一次 wolfKillTargetUid 是否存在，不會真的把死亡結算跑兩次讓遊戲状態壞掉。
window.jgRoomWolfPropose=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  const effective=jgRoomEffectiveTarget(rd,night,targetUid);
  // 整個函式包一層 try/catch，把任何失敗（例如 Firestore 權限被擋、網路斷線）都用 alert
  // 明確講出來——之前這裡沒有這一層，任何寫入失敗都是「без形消失」，畫面上完全看不出
  // 發生了什麼事，跟真的卡住長得一模一樣，卻是完全不同的問題、需要完全不同的排查方式。
  try{
    // 先確認「現在還輪到狼隊出刀」才寫入目標——板子上不只一隻狼時，如果甲已經選完、遊戲
    // 已經往下一步走了（比如換女巫），乙晚一點才點擊送出，不能讓乙這次遲來的點擊把甲已經
    // 決定、已經記錄進文字紀錄的目標蓋成別的號碼（就算遊戲流程本身因為 currentStep 守門員
    // 不會被推進兩次，這筆資料本身還是不該被蓋掉，不然畫面/紀錄跟實際結算的對象會對不起來）。
    const preCheckSnap=await getDoc(doc(db,'rooms',jgRoomCode));
    const preCheck=preCheckSnap.data()||{};
    if(preCheck.currentStep!=='wolf'){
      // 已經有人決定過、遊戲往下走了：這次點擊不算數，直接帶他看最新畫面。
      jgRoomLatestRoomDoc=preCheck;
      await jgRoomRefreshAndRenderCurrent();
      return;
    }
    // 接下來這一串是好幾筆連續的資料庫寫入（寫目標→可能還有記文字紀錄→進黑市商人／女巫
    // 回合，或直接結算死亡＋往下一步），先把「暫停自動重畫」的旗標打開，避免這幾筆寫入
    // 陸續觸發即時監聽器、把畫面重畫好幾次——這正是「選好的號碼會跳掉」「按了確認看起來
    // 沒反應」這兩個症狀的真正原因：畫面在這串操作真正結束之前，就被中途的某一筆寫入
    // 觸發的監聽器重畫過好幾次。
    jgRoomSuppressAutoRender=true;
    try{
      await setDoc(doc(db,'rooms',jgRoomCode),{
        wolfKillNight:night, wolfKillTargetUid:effective, wolfKillTargetSeatNum:targetSeatNum,
        wolfKillProposedBy:window.jgFirebaseUid
      },{ merge:true });
      if(!jgRoomWolfFinalizing){
        jgRoomWolfFinalizing=true;
        try{
          const freshSnap=await getDoc(doc(db,'rooms',jgRoomCode));
          const fresh=freshSnap.data()||{};
          if(fresh.currentStep==='wolf'){ await jgRoomWolfFinalize(); }
        } finally { jgRoomWolfFinalizing=false; }
      }
    } finally { jgRoomSuppressAutoRender=false; }
    await jgRoomRefreshAndRenderCurrent();
  }catch(err){
    jgRoomSuppressAutoRender=false;
    jgRoomWolfFinalizing=false;
    alert('狼隊出刀時發生錯誤，請把這段文字截圖給法官：\n'+(err&&err.message?err.message:String(err)));
    console.error('jgRoomWolfPropose error', err);
  }
};
// 狼刀目標（不管是狼隊選出的、還是夢魘恐懼導致的平安夜、還是機械狼獨自接管出刀、還是
// 回合（見 ALL_ROLES.blackmarket：黑市商人可以在任一晚交易，這裡簡化成固定排在狼刀之後、
// 女巫之前，法官／房主如果想在更早的夜晚交易，一樣可以正常運作，只是畫面出現的時間點
// 固定，不像本機法官助手可以每晚都問）；沒有黑市商人（或已經用過）就接 jgRoomAfterBlackmarketStep。
async function jgRoomAfterKillDecided(night){
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  const roomSnap=await getDoc(doc(db,'rooms',jgRoomCode));
  const fresh=roomSnap.data()||rd;
  // 狼刀決定的當下（不管是狼隊全員確認、夢魘恐懼導致的平安夜、機械狼接管出刀、還是狼弟
  // 復仇刀，都會走到這裡），把「刀」這一行記進文字紀錄——狼弟復仇刀那晚，狼弟自己的行動
  // 函式已經另外記了一行「狼弟復仇刀 X」，這裡的「刀」是跟本機法官助手一樣，兩行都會出現
  // （同一個目標，記錄角度不同：一個是「誰下的令」，一個是「狼隊今晚刀了誰」）。
  await jgRoomAppendNightLog(night, '刀 '+(fresh.wolfKillTargetSeatNum||'x'));
  const bmPending=jgRoomComp&&jgRoomComp.blackmarket>0&&!(await jgRoomBlackmarketUsed());
  if(bmPending){
    await setDoc(doc(db,'rooms',jgRoomCode),{ currentStep:'blackmarket' },{ merge:true });
    return;
  }
  await jgRoomAfterBlackmarketStep(night);
}
// 黑市商人交易完（或板子沒有黑市商人／已經用過）之後的共用去向：有女巫、或有幸運兒目前
// 持有女巫類（毒藥）技能，就先進女巫回合（等他/她決定要不要救/毒再一起結算死亡），
// 否則直接結算死亡、往下一步（查驗類角色，或直接接警長競選）。
async function jgRoomAfterBlackmarketStep(night){
  const db=window.jgFirebaseDb;
  const hasWitch=(jgRoomComp&&jgRoomComp.witch>0)||!!jgRoomActiveLuckyOne('witch', night);
  if(hasWitch){
    await setDoc(doc(db,'rooms',jgRoomCode),{ currentStep:'witch' },{ merge:true });
  } else {
    await jgRoomResolveNightDeaths();
    await jgRoomAdvanceToCheckOrSheriff();
  }
}
// 死亡結算＋推進下一步：從「按下確認」的當下直接觸發。
async function jgRoomWolfFinalize(){
  const db=window.jgFirebaseDb;
  const freshSnap=await getDoc(doc(db,'rooms',jgRoomCode));
  const fresh=freshSnap.data()||{};
  if(!fresh.wolfKillTargetUid) return;
  await jgRoomAfterKillDecided(fresh.night);
}

// ── 監聽「我自己」的身分（其他人的 secrets 文件，Firestore 安全規則會擋下，讀不到）──
// 除了畫面顯示，也把角色快取進 jgMyRole，讓夜晚畫面可以直接判斷「現在是不是輪到我」。
function jgRoomWatchMyRole(){
  const db=window.jgFirebaseDb;
  const uid=window.jgFirebaseUid;
  if(jgRoomUnsubMyRole) jgRoomUnsubMyRole();
  jgRoomUnsubMyRole=onSnapshot(doc(db,'rooms',jgRoomCode,'secrets',uid),(snap)=>{
    jgMyRole=snap.exists()?snap.data().role:null;
    const me=jgRoomLatestPlayers.find(p=>p.uid===uid);
    if(me) jgMySeatNum=me.seatNum;
    const box=document.getElementById('jg-room-my-role');
    if(box){
      box.innerHTML=jgMyRole
        ?'<div class="nbanner" style="margin-top:10px;"><div class="nicon">🎴</div><div class="ntitle">你的身分：'+((typeof RNAME!=='undefined'&&RNAME[jgMyRole])||jgMyRole)+'</div></div>'
        :'';
    }
    jgRoomRenderCurrentPhase();
  });
}

// ── 畫面渲染 ──
function jgRoomCompSummaryHtml(){
  if(!jgRoomComp||!jgRoomTotal) return '';
  const parts=Object.entries(jgRoomComp).filter(([,v])=>v>0)
    .map(([k,v])=>((typeof RNAME!=='undefined'&&RNAME[k])||k)+'×'+v).join('、');
  return '<div class="info" style="font-size:12px;margin-top:6px;">本房固定板子：'+jgRoomTotal+' 人局，'+parts+'</div>';
}
function jgRoomRenderShell(){
  const root=document.getElementById('jg-room-content');
  if(!root) return;
  // 身分分配完之後，房號就不重要了（房間不再開放新人加入），邀請連結沒有用處，藏起來。
  const roleAssigned=jgRoomLatestRoomDoc&&jgRoomLatestRoomDoc.status==='role-assigned';
  root.innerHTML=`
    <div class="nbanner">
      <div class="nicon">🎮</div>
      <h1>房間 ${jgRoomCode}</h1>
      <p class="sub" style="text-align:center;margin-top:6px;">把這個房號給朋友，請他們輸入加入</p>
    </div>
    ${roleAssigned?'':'<button onclick="jgRoomCopyInviteLink()" style="margin-top:8px;">複製邀請連結</button>'}
    ${jgRoomCompSummaryHtml()}
    <div id="jg-room-my-role"></div>
    <div class="section-title" style="margin-top:16px;">目前玩家</div>
    <div id="jg-room-player-list" class="card"></div>
    <div id="jg-room-host-controls" style="margin-top:14px;"></div>
    ${jgRoomIsHost?'<button class="ghost" style="margin-top:14px;color:var(--danger,#b91c1c);" onclick="jgRoomDissolve()">解散房間</button>':''}
  `;
  // 身分快取（jgMyRole）已經有的話，這裡先補畫一次，不用等下一次 snapshot 觸發才顯示
  const box=document.getElementById('jg-room-my-role');
  if(box&&jgMyRole){
    box.innerHTML='<div class="nbanner" style="margin-top:10px;"><div class="nicon">🎴</div><div class="ntitle">你的身分：'+((typeof RNAME!=='undefined'&&RNAME[jgMyRole])||jgMyRole)+'</div></div>';
  }
}
function jgRoomRenderLobby(players){
  const listEl=document.getElementById('jg-room-player-list');
  if(listEl){
    listEl.innerHTML=players.map(p=>
      `<div class="row"><div class="av av-vil">${p.seatNum}</div><div class="nm">${p.name}</div>${p.uid===window.jgFirebaseUid?'<span class="badge bv">你</span>':''}</div>`
    ).join('')||'<div class="empty">還沒有人加入</div>';
  }
  const hostEl=document.getElementById('jg-room-host-controls');
  if(hostEl){
    const need=jgRoomTotal;
    const have=players.length;
    const ready=need&&have===need;
    const roleAssigned=jgRoomLatestRoomDoc&&jgRoomLatestRoomDoc.status==='role-assigned';
    if(jgRoomIsHost){
      if(roleAssigned){
        hostEl.innerHTML='<button class="primary" onclick="jgRoomStartNight()">開始遊戲（進入第一夜）</button>';
      } else {
        hostEl.innerHTML=need
          ? '<button class="primary" '+(ready?'':'disabled')+' onclick="jgRoomAssignRoles()">'+(ready?'隨機分配身分':'隨機分配身分（目前 '+have+' / '+need+' 人）')+'</button>'
          : '<div class="info-warn" style="font-size:12px;">這個房間沒有記錄板子配置，請改用「建立連線房間」的方式重新建房。</div>';
      }
    } else {
      hostEl.innerHTML=roleAssigned
        ? '<div class="info" style="font-size:12px;text-align:center;">身分已分配，等待房主開始遊戲...</div>'
        : '<div class="info" style="font-size:12px;text-align:center;">目前 '+have+(need?' / '+need:'')+' 人，等待房主分配身分...</div>';
    }
  }
}

// ══════════════════════════════════════════
// 警長競選：完整照這個順序走——
// 1. 開放參選（10秒倒數，候選人自己點按鈕參選）
// 2. 10秒到，鎖定候選名單，隨機抽籤決定候選人裡誰先發言、順/逆時針
// 3. 候選人可以隨時按「退水」
// 4. 房主按「大家都發言完了」，開放投票——只有「從沒上警過」的人能投，投給「未退水」
//    的候選人（退水過的人這輪還是不能投票，用 sheriffEverCandidates 記住完整名單，
//    不會因為退水就從排除名單裡消失）
// 5. 投票 5 秒倒數，時間到沒點選就自動算棄票
// 6. 公布結果：當選警長 ＋ 順便回顧「昨晚是平安夜／X號死了」
// 7. 警長自己的手機出現左右兩個鄰居的號碼，點一個決定發言起點方向
// ══════════════════════════════════════════
window.jgRoomStartSheriffCampaign=async function(){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{
    phase:'sheriff', sheriffPhase:'joining', sheriffCandidates:[], sheriffEverCandidates:[],
    sheriffJoinDeadline: Date.now()+10000
  },{ merge:true });
};
window.jgRoomJoinSheriff=async function(){
  if(!confirm('確定要參選警長嗎？')) return;
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{
    sheriffCandidates: arrayUnion(window.jgFirebaseUid),
    sheriffEverCandidates: arrayUnion(window.jgFirebaseUid)
  },{ merge:true });
};
window.jgRoomWithdrawSheriff=async function(){
  if(!confirm('確定要退水嗎？')) return;
  const db=window.jgFirebaseDb;
  const { arrayRemove } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js");
  // 只從「目前候選人」名單移除，sheriffEverCandidates 不動——退水過的人這輪投票還是不能投。
  await setDoc(doc(db,'rooms',jgRoomCode),{ sheriffCandidates: arrayRemove(window.jgFirebaseUid) },{ merge:true });
};
// 鎖定參選名單、隨機抽籤決定候選人裡誰先發言／方向——任何一位玩家的倒數計時器跑到 0
// 都可能觸發，用 sheriffPhase 檢查避免被觸發兩次、抽籤結果被蓋掉。
window.jgRoomLockSheriffJoin=async function(){
  const db=window.jgFirebaseDb;
  const freshSnap=await getDoc(doc(db,'rooms',jgRoomCode));
  const fresh=freshSnap.data()||{};
  if(fresh.sheriffPhase!=='joining') return;
  const candidates=fresh.sheriffCandidates||[];
  if(!candidates.length){
    // 沒有人參選：直接跳過投票，公布昨晚死訊、進入白天（本局無警長）
    const killedSeatNum=fresh.wolfKillTargetSeatNum||null;
    const nightMsg=killedSeatNum?('昨晚 '+killedSeatNum+'號 死了'):'昨晚是平安夜';
    alert('🎖️ 沒有人參選警長，本局無警長\n\n'+nightMsg);
    await setDoc(doc(db,'rooms',jgRoomCode),{ phase:'day-open', sheriffPhase:null, sheriffWinnerSeatNum:null },{ merge:true });
    return;
  }
  const startUid=candidates[Math.floor(Math.random()*candidates.length)];
  const startP=jgRoomLatestPlayers.find(p=>p.uid===startUid);
  const dir=Math.random()<0.5?'順':'逆';
  await setDoc(doc(db,'rooms',jgRoomCode),{
    sheriffPhase:'locked', sheriffSpeechStart: startP?startP.seatNum:null, sheriffSpeechDir:dir
  },{ merge:true });
};
function jgRoomRenderSheriffCampaign(){
  const root=document.getElementById('jg-room-content');
  if(!root) return;
  const rd=jgRoomLatestRoomDoc||{};
  const sp=rd.sheriffPhase;
  const candidates=rd.sheriffCandidates||[];
  const isCandidate=candidates.includes(window.jgFirebaseUid);
  const candList=candidates.map(uid=>{
    const p=jgRoomLatestPlayers.find(pp=>pp.uid===uid);
    return p?('<div class="row"><div class="av av-vil">'+p.seatNum+'</div><div class="nm">'+p.name+'</div></div>'):'';
  }).join('')||'<div class="empty">還沒有人參選</div>';
  let bodyHtml, needsTimer=false, timerSeconds=0, timerCb=null;
  if(sp==='joining'){
    const remaining=Math.max(1, Math.ceil(((rd.sheriffJoinDeadline||Date.now())-Date.now())/1000));
    needsTimer=true; timerSeconds=remaining; timerCb=jgRoomLockSheriffJoin;
    bodyHtml=jgRoomTimerHtml(remaining,'候選人請點選競選按鈕')
      +'<div class="section-title" style="margin-top:14px;">目前候選人</div><div class="card">'+candList+'</div>'
      +(isCandidate?'':'<button class="primary" style="margin-top:10px;" onclick="jgRoomJoinSheriff()">參選警長</button>');
  } else if(sp==='locked'){
    bodyHtml='<div class="nbanner" style="margin-top:20px;"><div class="nicon">🎖️</div><h1>候選人</h1></div>'
      +'<div class="card">'+candList+'</div>'
      +'<div class="info" style="font-size:13px;margin-top:10px;text-align:center;">從 '+rd.sheriffSpeechStart+'號 開始，'+(rd.sheriffSpeechDir==='順'?'順時針':'逆時針')+'發言</div>'
      +(isCandidate?'<button style="margin-top:10px;" onclick="jgRoomWithdrawSheriff()">退水</button>':'');
  } else {
    bodyHtml='<div class="nbanner" style="margin-top:20px;"><div class="nicon">🎖️</div><h1>警長競選</h1></div>';
  }
  const hostBtn=(jgRoomIsHost&&sp==='locked')?'<button style="margin-top:14px;" onclick="jgRoomHostStartSheriffVote()">大家都發言完了，開始投票 →</button>':'';
  root.innerHTML=`<div class="section-title">警長競選</div>${bodyHtml}${hostBtn}`;
  if(needsTimer) jgRoomStartTimer(timerSeconds, timerCb); else jgRoomStopTimer();
}
window.jgRoomHostStartSheriffVote=async function(){
  const rd=jgRoomLatestRoomDoc||{};
  const candidates=rd.sheriffCandidates||[];
  const everCandidates=rd.sheriffEverCandidates||[];
  if(candidates.length<1){ alert('目前沒有候選人（可能都退水了），無法開始投票'); return; }
  await jgRoomStartVoting('sheriff', candidates, everCandidates, '準備投票，3、2、1，請投票');
};

// ── 投票通用元件：candidateUids 是可以被投的對象，excludeUids 是「不能投票」的人
//    （例如警長選舉時候選人自己不能投）。votingRound 每開一輪投票就 +1，避免舊票混進
//    新一輪的統計裡。5秒倒數，時間到不管有沒有投都強制看到結果畫面（沒投＝棄票，這裡
//    不用另外寫一筆「棄票」紀錄，票數統計本來就只算有投的人，沒投的人自然不會被算進去）。
window.jgRoomStartVoting=async function(type, candidateUids, excludeUids, script){
  const db=window.jgFirebaseDb;
  const candidates=candidateUids.map(uid=>{
    const p=jgRoomLatestPlayers.find(pp=>pp.uid===uid);
    return {uid, seatNum:p?p.seatNum:0, name:p?p.name:''};
  });
  const round=((jgRoomLatestRoomDoc&&jgRoomLatestRoomDoc.votingRound)||0)+1;
  // votingRoundLog：每開一輪投票就記一筆「這輪是第幾輪、什麼類型、投票稿」，永久保留（跟
  // votes 集合一樣是「開新的一輪也不會抹掉舊的」），上帝視角要靠這份清單知道歷史上每一輪
  // 投票分別是警長競選／警長PK／放逐投票／放逐PK，才能把票型整理成有意義的文字記錄。
  await setDoc(doc(db,'rooms',jgRoomCode),{
    votingActive:true, votingType:type, votingCandidates:candidates,
    votingExclude:excludeUids||[], votingRound:round, votingScript:script||'請投票',
    votingDeadline: Date.now()+5000,
    votingRoundLog: arrayUnion({round, type, script:script||'請投票'})
  },{ merge:true });
};
// 每個人的投票要「按輪次分開保存」，不能像以前那樣每個人共用同一份文件（那樣一開新的
// 一輪，上一輪的票就被蓋掉了，上帝視角就沒辦法回顧完整票型）——文件 id 改成
// {自己的uid}_{round}，資料裡另外存一個 voterUid 欄位，讓其餘用到「這票是誰投的」的地方
// 不用跟著改（見下面 onSnapshot 那行，把 voterUid 對應回原本大家在用的 uid 欄位）。
window.jgRoomCastVote=async function(targetUid, targetSeatNum){
  if(!confirm('確定要投給 '+targetSeatNum+'號 嗎？')) return;
  const db=window.jgFirebaseDb;
  const round=(jgRoomLatestRoomDoc&&jgRoomLatestRoomDoc.votingRound)||1;
  await setDoc(doc(db,'rooms',jgRoomCode,'votes',window.jgFirebaseUid+'_'+round),{
    round:round, voterUid:window.jgFirebaseUid, targetUid:targetUid, targetSeatNum:targetSeatNum
  });
};
function jgRoomRenderVoting(){
  const root=document.getElementById('jg-room-content');
  if(!root) return;
  const rd=jgRoomLatestRoomDoc||{};
  const round=rd.votingRound||1;
  const myVote=jgRoomLatestVotes.find(v=>v.uid===window.jgFirebaseUid&&v.round===round);
  const me=jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid);
  const iAmDead=!!(me&&me.alive===false);
  // 已經出局的玩家不能再投票（不管哪一種投票——警長、放逐、PK 都一樣），但還是能看到
  // 即時票數畫面（旁觀），不會被強迫看空白畫面。
  const excluded=iAmDead||(rd.votingExclude||[]).includes(window.jgFirebaseUid);
  const timeUp=Date.now()>=(rd.votingDeadline||0);
  let bodyHtml, needsTimer=false, timerSeconds=0;
  if(!myVote&&!excluded&&!timeUp){
    const cands=rd.votingCandidates||[];
    const buttons=cands.map(c=>
      '<button onclick="jgRoomCastVote(\''+c.uid+'\','+c.seatNum+')" style="margin:4px;width:auto;display:inline-block;padding:10px 16px;">'+c.seatNum+'號 '+c.name+'</button>'
    ).join('');
    needsTimer=true;
    timerSeconds=Math.max(1, Math.ceil(((rd.votingDeadline||Date.now())-Date.now())/1000));
    bodyHtml=jgRoomTimerHtml(timerSeconds, rd.votingScript||'請投票')
      +'<div style="text-align:center;margin-top:10px;">'+buttons+'</div>';
  } else {
    const votesThisRound=jgRoomLatestVotes.filter(v=>v.round===round);
    const tally={};
    votesThisRound.forEach(v=>{
      const key=v.targetSeatNum;
      tally[key]=tally[key]||{count:0, voters:[]};
      tally[key].count++;
      const voterP=jgRoomLatestPlayers.find(p=>p.uid===v.uid);
      tally[key].voters.push(voterP?voterP.seatNum+'號 '+voterP.name:'?');
    });
    const rows=Object.entries(tally).sort((a,b)=>b[1].count-a[1].count)
      .map(([seat,d])=>'<div class="row"><div class="nm">'+seat+'號</div><div>'+d.count+' 票（'+d.voters.join('、')+' 投）</div></div>').join('');
    bodyHtml='<div class="nbanner" style="margin-top:20px;"><div class="nicon">🗳️</div><h1>即時票數</h1></div>'
      +'<div class="card" style="margin-top:10px;">'+(rows||'<div class="empty">還沒有人投票</div>')+'</div>'
      +(iAmDead?'<div class="info" style="font-size:12px;margin-top:8px;text-align:center;">你已經出局了，不能投票</div>'
        :excluded?'<div class="info" style="font-size:12px;margin-top:8px;text-align:center;">你不能投票這一輪</div>':'')
      +(!myVote&&!excluded&&timeUp?'<div class="info" style="font-size:12px;margin-top:8px;text-align:center;">時間到了，這輪算棄票</div>':'');
  }
  const hostCloseBtn=jgRoomIsHost?'<button style="margin-top:16px;" onclick="jgRoomHostCloseVoting()">公布結果，結束投票 →</button>':'';
  root.innerHTML=`<div class="section-title">投票</div>${bodyHtml}${hostCloseBtn}`;
  // 時間到了強制重新渲染一次（讓還沒投票的人自動切換到棄票／結果畫面），不用另外寫
  // callback 去主動關閉投票——投票視窗會不會真的結束，由房主按「公布結果」決定。
  if(needsTimer) jgRoomStartTimer(timerSeconds, ()=>jgRoomRenderVoting()); else jgRoomStopTimer();
}
// 把這一輪的票數（jgRoomLatestVotes 裡符合 round 的那些）依座位號碼加總成一份 tally——
// weightFn(uid) 決定每一票算幾票（警長在放逐投票時算 1.5 票，其餘投票每人都是 1 票，見
// jgRoomHostCloseVoting）。回傳 entries（依權重高到低排序，每筆帶 seat/weight/voterUids/
// targetUid）跟 top（權重並列最高、且大於 0 的那幾筆——用來判斷是「唯一出局」還是「平票」）。
function jgRoomComputeVoteTally(round, weightFn){
  const votesThisRound=jgRoomLatestVotes.filter(v=>v.round===round);
  const tally={};
  votesThisRound.forEach(v=>{
    const w=weightFn?weightFn(v.uid):1;
    const key=v.targetSeatNum;
    tally[key]=tally[key]||{seat:key, weight:0, voterUids:[], targetUid:v.targetUid};
    tally[key].weight+=w;
    tally[key].voterUids.push(v.uid);
  });
  const entries=Object.values(tally).sort((a,b)=>b.weight-a.weight);
  const maxWeight=entries.length?entries[0].weight:0;
  const top=entries.filter(e=>e.weight===maxWeight&&maxWeight>0);
  return {entries, top};
}
// 房主結算投票：警長競選跟白天放逐分開處理（各自的平票/PK/唯一結果規則不太一樣，見
// jgRoomResolveSheriffVote／jgRoomResolveDayVote），但共用同一份加權計票（jgRoomComputeVoteTally）。
// 放逐投票時，如果警長還活著，警長那一票算 1.5 票（跟本機法官助手 jgVoteWeight 一致）；
// 警長競選本身（選警長那一輪）不加權，因為那時候警長都還沒選出來。
window.jgRoomHostCloseVoting=async function(){
  const rd=jgRoomLatestRoomDoc||{};
  const round=rd.votingRound||1;
  if(rd.votingType==='sheriff'){
    const {entries, top}=jgRoomComputeVoteTally(round, null);
    await jgRoomResolveSheriffVote(entries, top);
  } else {
    const sheriffSeat=rd.sheriffWinnerSeatNum;
    const sheriffP=sheriffSeat?jgRoomLatestPlayers.find(p=>p.seatNum===sheriffSeat&&p.alive!==false):null;
    const sheriffUid=sheriffP?sheriffP.uid:null;
    const weightFn=(uid)=>(sheriffUid&&uid===sheriffUid)?1.5:1;
    const {entries, top}=jgRoomComputeVoteTally(round, weightFn);
    await jgRoomResolveDayVote(entries, top);
  }
};
// 警長競選結算：唯一最高票→當選，直接進入警長選發言方向；平票→進入 PK（只有平票的人可以
// 被投，他們自己不能投票），PK 後再度平票→本局無警長；沒有人投票→本局無警長。不管哪一種
// 結果，都要一起公布昨晚的死訊（跟原本的行為一致）。
async function jgRoomResolveSheriffVote(entries, top){
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  const killedSeatNum=rd.wolfKillTargetSeatNum||null;
  const nightMsg=killedSeatNum?('昨晚 '+killedSeatNum+'號 死了'):'昨晚是平安夜';
  if(!entries.length){
    alert('🎖️ 沒有人投票，本局無警長\n\n'+nightMsg);
    await setDoc(doc(db,'rooms',jgRoomCode),{
      votingActive:false, sheriffWinnerSeatNum:null, sheriffPkRound:false,
      phase:'day-open', sheriffPhase:null
    },{ merge:true });
    return;
  }
  if(top.length>1){
    const tiedSeats=top.map(e=>e.seat);
    if(rd.sheriffPkRound){
      alert('🎖️ PK 後再度平票（'+tiedSeats.join('、')+'號），本局無警長\n\n'+nightMsg);
      await setDoc(doc(db,'rooms',jgRoomCode),{
        votingActive:false, sheriffWinnerSeatNum:null, sheriffPkRound:false,
        phase:'day-open', sheriffPhase:null
      },{ merge:true });
      return;
    }
    const tiedUids=top.map(e=>e.targetUid);
    alert('🎖️ 平票（'+tiedSeats.join('、')+'號），進入 PK 重新投票');
    await setDoc(doc(db,'rooms',jgRoomCode),{ sheriffPkRound:true },{ merge:true });
    await jgRoomStartVoting('sheriff', tiedUids, tiedUids, 'PK 重新投票，請投票');
    return;
  }
  const winnerSeatNum=Number(top[0].seat);
  await setDoc(doc(db,'rooms',jgRoomCode),{
    votingActive:false, sheriffWinnerSeatNum:winnerSeatNum, sheriffPkRound:false,
    phase:'day-open', sheriffPhase:'pick-direction'
  },{ merge:true });
  alert('🎖️ '+winnerSeatNum+'號 當選警長（'+top[0].weight+' 票）\n\n'+nightMsg);
}
// 放逐投票結算：唯一最高票→真的淘汰（alive:false）、觸發邱比特殉情連動、檢查有沒有開槍
// 資格（獵人/黑狼王/幸運兒獵槍，見 jgRoomCheckShootEligible）；平票→進入 PK；PK 後再度
// 平票、或沒有人投票→無人出局。不管哪種結果，只要沒有人卡在開槍，就直接進入下一夜。
async function jgRoomResolveDayVote(entries, top){
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  if(!entries.length){
    alert('🗳️ 沒有人投票，無人出局');
    await setDoc(doc(db,'rooms',jgRoomCode),{ votingActive:false, dayVotePkRound:false },{ merge:true });
    await jgRoomStartNextNight();
    return;
  }
  if(top.length>1){
    const tiedSeats=top.map(e=>e.seat);
    if(rd.dayVotePkRound){
      alert('🗳️ PK 後再度平票（'+tiedSeats.join('、')+'號），無人出局');
      await setDoc(doc(db,'rooms',jgRoomCode),{ votingActive:false, dayVotePkRound:false },{ merge:true });
      await jgRoomStartNextNight();
      return;
    }
    const tiedUids=top.map(e=>e.targetUid);
    alert('🗳️ 平票（'+tiedSeats.join('、')+'號），進入 PK 重新投票');
    await setDoc(doc(db,'rooms',jgRoomCode),{ dayVotePkRound:true },{ merge:true });
    await jgRoomStartVoting('day', tiedUids, tiedUids, 'PK 重新投票，請投票放逐其中一位');
    return;
  }
  const outSeat=Number(top[0].seat);
  const outUid=top[0].targetUid;
  await setDoc(doc(db,'rooms',jgRoomCode,'players',outUid),{ alive:false },{ merge:true });
  await jgRoomApplyCupidCascade();
  await setDoc(doc(db,'rooms',jgRoomCode),{ votingActive:false, dayVotePkRound:false },{ merge:true });
  const night=rd.night||1;
  const eligible=await jgRoomCheckShootEligible(outUid, night, true);
  if(eligible){
    alert('🗳️ '+outSeat+'號 出局（'+top[0].weight+' 票）——他/她有開槍資格，正在讓他/她決定要不要帶人');
    await setDoc(doc(db,'rooms',jgRoomCode),{ pendingShootUids:[outUid], pendingShootContext:'day' },{ merge:true });
    jgRoomRenderCurrentPhase();
  } else {
    alert('🗳️ '+outSeat+'號 出局（'+top[0].weight+' 票）');
    // 沒有開槍資格：如果出局的剛好就是警長本人，要先讓他決定警徽傳給誰，再進下一夜
    // （見 jgRoomCheckAndSetPendingBadge），有開槍資格的話這個檢查會等 jgRoomShootResolve
    // 決定完開槍之後才做，不會在這裡重複觸發。
    if(await jgRoomCheckAndSetPendingBadge()){
      jgRoomRenderCurrentPhase();
    } else {
      await jgRoomStartNextNight();
    }
  }
}

// ── 白天：第一夜結束後先讓警長決定發言方向（若有警長），接著是發言＋投票放逐——發言階段
//    這一版不追蹤每個人是誰在發言，只給一個「大家都發言完了」的按鈕讓房主按下去開始投票
//    （跟警長競選發言完、房主按「開始投票」是同一種簡化）；投票結果比照本機法官助手：
//    唯一最高票出局、平票進 PK、PK 後還平票無人出局。被放逐的人是真的淘汰（alive:false），
//    可以切換上帝視角；如果他剛好有開槍資格，會先卡在開槍畫面，決定完才進下一夜。──
async function jgRoomRenderDayOpen(){
  const root=document.getElementById('jg-room-content');
  if(!root) return;
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  const winnerSeatNum=rd.sheriffWinnerSeatNum;
  const iAmSheriff=jgMySeatNum&&winnerSeatNum&&jgMySeatNum===winnerSeatNum;
  const pendingShoot=rd.pendingShootUids||[];
  let bodyHtml, needsTimer=false;
  if(pendingShoot.length&&rd.pendingShootContext==='day'){
    if(pendingShoot.includes(window.jgFirebaseUid)){
      const night=rd.night||1;
      const r=await jgRoomShootViewHtml(night);
      bodyHtml=r.html; needsTimer=r.needsTimer;
    } else {
      bodyHtml='<div class="nbanner" style="margin-top:20px;"><div class="nicon">🔫</div><h1>剛出局的玩家正在決定要不要開槍</h1></div>'
        +'<p class="sub" style="text-align:center;margin-top:8px;">請安靜等待</p>';
    }
  } else if(rd.pendingBadgeUid){
    if(rd.pendingBadgeUid===window.jgFirebaseUid){
      const r=jgRoomBadgeViewHtml();
      bodyHtml=r.html; needsTimer=r.needsTimer;
    } else {
      bodyHtml='<div class="nbanner" style="margin-top:20px;"><div class="nicon">🎖️</div><h1>警長剛剛陣亡，正在決定警徽要傳給誰</h1></div>'
        +'<p class="sub" style="text-align:center;margin-top:8px;">請安靜等待</p>';
    }
  } else if(rd.sheriffPhase==='pick-direction'&&iAmSheriff){
    const total=jgRoomLatestPlayers.length;
    const leftP=jgRoomLatestPlayers.find(p=>p.seatNum===(jgMySeatNum%total)+1);
    const rightP=jgRoomLatestPlayers.find(p=>p.seatNum===((jgMySeatNum-2+total)%total)+1);
    bodyHtml='<div class="nbanner" style="margin-top:20px;"><div class="nicon">🎖️</div><h1>請選擇發言方向</h1></div>'
      +'<div style="text-align:center;margin-top:10px;">'
      +(rightP?'<button onclick="jgRoomSheriffPickDirection('+rightP.seatNum+',\'順\')" style="margin:4px;width:auto;display:inline-block;padding:10px 16px;">警右：'+rightP.seatNum+'號 '+rightP.name+'</button>':'')
      +(leftP?'<button onclick="jgRoomSheriffPickDirection('+leftP.seatNum+',\'逆\')" style="margin:4px;width:auto;display:inline-block;padding:10px 16px;">警左：'+leftP.seatNum+'號 '+leftP.name+'</button>':'')
      +'</div>';
  } else if(rd.sheriffPhase==='pick-direction'){
    bodyHtml='<div class="nbanner" style="margin-top:20px;"><div class="nicon">🎖️</div><h1>警長正在決定發言方向</h1></div>'
      +'<p class="sub" style="text-align:center;margin-top:8px;">請安靜等待</p>';
  } else {
    const dirLabel=rd.daySpeechDir==='順'?'順時針':'逆時針';
    const night=rd.night||1;
    // 死訊改讀 dayLog/{night}.deathLine（見 jgRoomCaptureDeathLine），不要直接看
    // wolfKillTargetSeatNum 這種即時欄位——那個沒有考慮守衛+解藥保下來的情況，會誤報
    // 「其實沒死的人」死亡。
    const dayLogSnap=await getDoc(doc(db,'rooms',jgRoomCode,'dayLog',String(night)));
    const nightMsg=dayLogSnap.exists()?('昨晚 '+dayLogSnap.data().deathLine):'（死訊結算中...）';
    // 發言順序：daySpeechStart 每天都要重新決定（有人死亡就固定從死者下一位活人開始，
    // 平安夜才隨機抽起點；方向一旦決定過，整局都不會再變，見 jgRoomHostSpinSpeechOrder
    // 的說明）——這裡只有第一天、剛好有選出警長時才會直接有值（警長競選那邊會問要往
    // 左還右發言，見 jgRoomSheriffPickDirection），其餘情況都要靠房主按「抽籤」才會有值。
    const speechHtml=rd.daySpeechStart
      ?'<p class="sub" style="text-align:center;margin-top:8px;">從 '+rd.daySpeechStart+'號 開始，'+dirLabel+'發言</p>'
      :(jgRoomIsHost
        ?'<div style="text-align:center;margin-top:10px;"><button onclick="jgRoomHostSpinSpeechOrder()" style="width:auto;display:inline-block;padding:10px 18px;">抽籤決定發言順序</button></div>'
        :'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">請等待房主抽籤決定發言順序</div>');
    bodyHtml='<div class="nbanner" style="margin-top:20px;"><div class="nicon">☀️</div><h1>白天開始</h1>'
      +'<p class="sub" style="text-align:center;margin-top:8px;">'+nightMsg+'</p></div>'
      +speechHtml
      +'<div class="info" style="font-size:12px;margin-top:10px;text-align:center;">請依序發言，討論誰是狼人</div>'
      +(jgRoomIsHost?'<button class="primary" style="margin-top:16px;" onclick="jgRoomHostStartDayVote()">大家都發言完了，開始投票放逐 →</button>':'')
      +jgRoomLiveVoteTallyHtml();
  }
  root.innerHTML=`<div class="section-title">白天</div>${bodyHtml}`;
  if(needsTimer) jgRoomStartTimer(20); else jgRoomStopTimer();
}
// 活著的人在白天畫面（非投票中）也能看到「目前為止」最新一輪投票的即時票型——跟投票進行
// 中看到的計票畫面是同一種資訊，只是投票結束、還沒進下一夜的這段時間也讓大家看得到，不用
// 等死亡才能透過上帝視角回顧。故意只顯示「最新一輪」的票（不是完整歷史），而且只顯示
// 「誰投誰」，不會顯示任何角色/陣營資訊，避免活人看到不該看到的東西（那些只有上帝視角，
// 也就是死亡之後才看得到，見 jgRoomRenderGodView）。
function jgRoomLiveVoteTallyHtml(){
  const rd=jgRoomLatestRoomDoc||{};
  const round=rd.votingRound;
  if(!round) return '';
  const votesThisRound=jgRoomLatestVotes.filter(v=>v.round===round);
  if(!votesThisRound.length) return '';
  const seatOf=(uid)=>{ const p=jgRoomLatestPlayers.find(pp=>pp.uid===uid); return p?p.seatNum:'?'; };
  const byTarget={};
  votesThisRound.forEach(v=>{ (byTarget[v.targetSeatNum]=byTarget[v.targetSeatNum]||[]).push(seatOf(v.uid)); });
  const rows=Object.entries(byTarget).sort((a,b)=>b[1].length-a[1].length)
    .map(([seat,voters])=>'<div class="row"><div class="nm">'+seat+'號</div><div>'+voters.length+' 票（'+voters.join('、')+' 投）</div></div>').join('');
  return '<div class="section-title" style="margin-top:16px;">最新一輪票型</div><div class="card">'+rows+'</div>';
}
window.jgRoomSheriffPickDirection=async function(startSeatNum, dir){
  if(!confirm('確定嗎？')) return;
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{
    sheriffPhase:null, daySpeechStart:startSeatNum, daySpeechDir:dir
  },{ merge:true });
};
// 房主抽籤決定「今天從幾號開始發言」——跟本機法官助手 jgSpinWheel／jgSpinDirectionOnly
// 同一套規則：方向（順/逆）整局只會決定一次，決定過就不會再變，之後每天只重新抽起點；
// 如果昨晚有人死亡，起點不是隨機的，是固定從「死者的下一個活人」（照已經定好的方向）
// 開始——沒有死人的平安夜才會連起點一起隨機抽。這裡不做本機那種逐格跳動的抽籤動畫
// （連線房間是好幾支手機同步看同一個結果，不是單一台裝置在演戲給大家看），房主按一下
// 直接寫入最終結果，全部人的畫面會透過即時監聽器一起看到。
window.jgRoomHostSpinSpeechOrder=async function(){
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  const night=rd.night||1;
  const alive=jgRoomLatestPlayers.filter(p=>p.alive!==false);
  if(!alive.length) return;
  const dayLogSnap=await getDoc(doc(db,'rooms',jgRoomCode,'dayLog',String(night)));
  const deathLine=(dayLogSnap.exists()&&dayLogSnap.data().deathLine)||'';
  const deadNums=[...deathLine.matchAll(/(\d+)號死亡/g)].map(m=>parseInt(m[1]));
  const total=jgRoomTotal||alive.length;
  const aliveSet=new Set(alive.map(p=>p.seatNum));
  let dir=rd.daySpeechDir;
  if(!dir) dir=Math.random()<0.5?'順':'逆';
  let start=null;
  if(deadNums.length){
    // 死者的下一個活人：照方向逐格找，找到活著的座位就是起點（跟死者本人同號碼跳過，
    // 死人不能發言）。
    let n=dir==='逆'?Math.min(...deadNums):Math.max(...deadNums);
    for(let i=0;i<total;i++){
      n=dir==='逆'?(n-1<1?total:n-1):(n+1>total?1:n+1);
      if(aliveSet.has(n)){ start=n; break; }
    }
  }
  if(start===null){
    // 平安夜（或找不到有效起點時的保底）：直接從活人裡隨機抽一個當起點。
    const pool=alive.map(p=>p.seatNum);
    start=pool[Math.floor(Math.random()*pool.length)];
  }
  await setDoc(doc(db,'rooms',jgRoomCode),{ daySpeechStart:start, daySpeechDir:dir },{ merge:true });
};
// 房主開始放逐投票：候選人＝目前還活著的所有玩家，沒有人被排除在投票資格之外（跟警長
// 競選不同，放逐投票不用先「報名」，活著的人都能投也都能被投）。
window.jgRoomHostStartDayVote=async function(){
  const aliveUids=jgRoomLatestPlayers.filter(p=>p.alive!==false).map(p=>p.uid);
  if(aliveUids.length<2){ alert('存活人數不足，無法投票'); return; }
  await jgRoomStartVoting('day', aliveUids, [], '請投票，準備放逐一位玩家');
};

// ══════════════════════════════════════════
// 死亡玩家的上帝視角：一鍵切換，看到全場每個人的真實身分，加上一份即時更新的文字紀錄
// （格式比照法官助手的夜晚紀錄，簡短一行一行列出來）。只有真的死亡的玩家看得到這個
// 切換按鈕——這個功能需要讀取別人的查驗紀錄（不只是自己的），所以 seerChecks／
// mediumChecks／votes 這幾個子集合的安全規則也要跟著放寬成全房可讀（跟 secrets 一樣的
// 取捨：這是死亡玩家的合法功能，不是後門）。
// ══════════════════════════════════════════
let jgRoomGodViewOn=false;
window.jgRoomToggleGodView=function(){
  jgRoomGodViewOn=!jgRoomGodViewOn;
  jgRoomRenderGodView();
};
async function jgRoomRenderGodView(){
  const root=document.getElementById('jg-room-content');
  if(!root) return;
  const db=window.jgFirebaseDb;
  const { getDocs } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js");
  const [secretsSnap, votesSnap, nightLogSnap, dayLogSnap]=await Promise.all([
    getDocs(collection(db,'rooms',jgRoomCode,'secrets')),
    getDocs(collection(db,'rooms',jgRoomCode,'votes')),
    getDocs(collection(db,'rooms',jgRoomCode,'nightLog')),
    getDocs(collection(db,'rooms',jgRoomCode,'dayLog'))
  ]);
  const roleByUid={}; secretsSnap.docs.forEach(d=>{ roleByUid[d.id]=d.data().role; });
  const seatOf=(uid)=>{ const p=jgRoomLatestPlayers.find(pp=>pp.uid===uid); return p?p.seatNum:'?'; };
  const rd=jgRoomLatestRoomDoc||{};

  // ── 玩家狀態格子：號碼／姓名／角色，橫向排列自動換行（跟本機法官助手的玩家狀態欄位
  //    同樣用途，人數一多自然會排成兩排以上）。
  const pgridHtml=jgRoomLatestPlayers.slice().sort((a,b)=>a.seatNum-b.seatNum).map(p=>{
    const role=roleByUid[p.uid];
    const roleName=role?((typeof RNAME!=='undefined'&&RNAME[role])||role):'?';
    return '<div class="pcell'+(p.alive===false?' dead':'')+'"><div class="pnum">'+p.seatNum+'號</div>'
      +'<div class="pname">'+p.name+'</div>'
      +'<div class="prole"><span class="badge '+(p.alive===false?'bw':'bv')+'">'+roleName+(p.alive===false?'（已出局）':'')+'</span></div></div>';
  }).join('');

  // ── 文字紀錄：比照本機法官助手的匯出格式（**夜晚Nst / --行動 / **警長競選 / **白天Nst /
  //    >死訊 / >票X：voters），可以捲動的視窗，即時更新。votes 集合的文件 id 是
  //    {voterUid}_{round}（每一輪都保留，不會被下一輪蓋掉，見放逐投票功能那次的修正），
  //    nightLog／dayLog 兩個集合也是「一發生就寫一筆，不會被下一夜蓋掉」的永久紀錄（見
  //    jgRoomAppendNightLog／jgRoomCaptureDeathLine 的說明）。
  const votesByRound={};
  votesSnap.docs.forEach(d=>{ const v=d.data(); (votesByRound[v.round]=votesByRound[v.round]||[]).push(v); });
  const nightLogByNight={}; nightLogSnap.docs.forEach(d=>{ nightLogByNight[d.id]=(d.data().lines)||[]; });
  const dayLogByNight={}; dayLogSnap.docs.forEach(d=>{ dayLogByNight[d.id]=d.data()||{}; });
  const ordSuffix=n=>n===1?'1st':n===2?'2nd':n===3?'3rd':n+'th';

  // 某一輪投票的計票＋文字（跟 jgRoomComputeVoteTally 用同一份原始票數，但這裡是「讀歷史」
  // 用的，不需要加權——警長 1.5 票是拿來決定「誰出局」用的，文字紀錄只需要如實列出每個人
  // 投給誰，跟本機法官助手的呈現方式一致，加權後的票數判定已經反映在「有沒有出局」這件事
  // 本身，不需要在文字紀錄裡重算一次）。
  function voteRoundLines(round, isLast){
    const vs=votesByRound[round]||[];
    if(!vs.length) return [];
    const byTarget={};
    vs.forEach(v=>{ (byTarget[v.targetSeatNum]=byTarget[v.targetSeatNum]||[]).push(seatOf(v.voterUid)); });
    // 這一輪是不是有「唯一最高票」，有的話才會在後面標成「（X號出局）」——用票數（人次）
    // 判斷就好，不用重算警長加權：加權只是拿來決定「誰真的出局」，這裡的目的只是把票型
    // 如實呈現，跟本機法官助手的文字紀錄呈現方式一致。
    let winnerSeat=null;
    if(isLast){
      const entries=Object.entries(byTarget).sort((a,b)=>b[1].length-a[1].length);
      if(entries.length&&(entries.length===1||entries[0][1].length>entries[1][1].length)) winnerSeat=entries[0][0];
    }
    return Object.entries(byTarget).map(([seat,voters])=>
      '--票'+seat+'：'+voters.join(',')+(winnerSeat===seat?'（'+seat+'號出局）':'')
    );
  }
  function sheriffVoteRoundLines(round, isFinalRound, winnerSeat){
    const vs=votesByRound[round]||[];
    if(!vs.length) return [];
    const byTarget={};
    vs.forEach(v=>{ (byTarget[v.targetSeatNum]=byTarget[v.targetSeatNum]||[]).push(seatOf(v.voterUid)); });
    return Object.entries(byTarget).map(([seat,voters])=>
      '--警長票'+seat+'：'+voters.join(',')+((isFinalRound&&String(winnerSeat)===seat)?'（當選警長）':'')
    );
  }

  const blocks=[]; // 每個 block 是 {head, lines:[]}

  // 警長競選 block：sheriffEverCandidates／sheriffCandidates／sheriffSpeechStart／Dir 這幾個
  // 欄位整局只會設定一次（見 jgRoomAdvanceToSheriffCampaign 只在第一夜結束後呼叫一次，之後
  // 不會再重設），所以可以直接讀房間文件目前的值，不用另外存歷史快照。
  if(rd.sheriffEverCandidates&&rd.sheriffEverCandidates.length){
    const lines=[];
    const everSeats=rd.sheriffEverCandidates.map(seatOf);
    let head='>候選人：'+everSeats.join('、')+'號';
    if(rd.sheriffSpeechStart) head+='（'+rd.sheriffSpeechStart+' 號開始'+(rd.sheriffSpeechDir==='逆'?'逆時針':'順時針')+'發表政見）';
    lines.push(head);
    const finalSeatSet=new Set((rd.sheriffCandidates||[]).map(seatOf));
    const withdrawn=everSeats.filter(s=>!finalSeatSet.has(s));
    if(withdrawn.length) lines.push('>退水：'+withdrawn.join('、')+'號');
    const sheriffRounds=(rd.votingRoundLog||[]).filter(e=>e.type==='sheriff');
    sheriffRounds.forEach((entry,idx)=>{
      const isLast=idx===sheriffRounds.length-1;
      lines.push(idx===0?'>投票':'>PK 重新投票');
      lines.push(...sheriffVoteRoundLines(entry.round, isLast, rd.sheriffWinnerSeatNum));
    });
    if(rd.sheriffWinnerSeatNum==null&&sheriffRounds.length) lines.push('>本局無警長');
    blocks.push({head:'**警長競選', lines});
  }

  // 每一夜＋緊接著的白天，依夜數順序排列——白天投票（放逐）用「依序把 day 型別的 round
  // 分配給對應天數」的簡化規則：votingRoundLog 目前沒有記錄「這個 round 屬於第幾天」，
  // 用「每天最多一組投票＋最多一次 PK，共兩輪」的經驗法則依序分配，多天連續遊玩時仍然
  // 正確（正常玩法一天最多就是這樣），如果之後想要更嚴謹，可以在 jgRoomStartVoting 額外
  // 記一個「這是第幾天」欄位取代這個簡化規則。
  const dayRoundsAll=(rd.votingRoundLog||[]).filter(e=>e.type==='day');
  let dayRoundPtr=0;
  const allNights=new Set([...Object.keys(nightLogByNight), ...Object.keys(dayLogByNight)].map(Number));
  Array.from(allNights).sort((a,b)=>a-b).forEach(n=>{
    const nLines=nightLogByNight[n]||[];
    if(nLines.length) blocks.push({head:'**夜晚'+ordSuffix(n), lines:nLines.map(l=>'--'+l)});
    const dLog=dayLogByNight[n];
    if(!dLog||dLog.deathLine===undefined) return;
    const lines=['>'+dLog.deathLine];
    const grouped=[];
    while(dayRoundPtr<dayRoundsAll.length&&grouped.length<2){
      const entry=dayRoundsAll[dayRoundPtr];
      const vs=votesByRound[entry.round]||[];
      if(!vs.length&&dayRoundPtr===dayRoundsAll.length-1&&rd.votingActive) break; // 這輪還在進行中，先不列入歷史
      grouped.push(entry);
      dayRoundPtr++;
    }
    grouped.forEach((entry,idx)=>{
      lines.push(idx===0?'>投票':'>PK 重新投票');
      lines.push(...voteRoundLines(entry.round, idx===grouped.length-1));
    });
    if(dLog.voteShotNote) lines.push('>'+dLog.voteShotNote);
    blocks.push({head:'**白天'+ordSuffix(n), lines});
  });

  const logHtml=blocks.length
    ? blocks.map(b=>'<div class="gl-head">'+b.head+'</div>'+b.lines.map(l=>'<div class="gl-sub">'+l+'</div>').join('')).join('')
    : '目前還沒有紀錄';

  root.innerHTML=`
    <div class="nbanner"><div class="nicon">👁️</div><h1>上帝視角</h1></div>
    <button style="margin-top:10px;" onclick="jgRoomToggleGodView()">← 退出上帝視角</button>
    <div class="section-title" style="margin-top:16px;">玩家狀態</div>
    <div class="pgrid">${pgridHtml}</div>
    <div class="section-title" style="margin-top:16px;">文字紀錄</div>
    <div class="godlog">${logHtml}</div>
  `;
}

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
  } else if(currentStep==='wolfbrother'&&(jgMyRole==='wolfbrother_e'||jgMyRole==='wolfbrother_y')){
    const r=await jgRoomWolfbrotherViewHtml(night); bodyHtml=r.html; needsTimer=r.needsTimer;
  } else if(currentStep==='mechwolf'&&jgMyRole==='mechanicalwolf'){
    const r=await jgRoomMechWolfViewHtml(night); bodyHtml=r.html; needsTimer=r.needsTimer;
  } else if(currentStep==='wolf'&&typeof WOLF_ROLES!=='undefined'&&WOLF_ROLES.includes(jgMyRole)&&jgMyRole!=='nightmare'&&jgMyRole!=='mechanicalwolf'
    &&!(jgMyRole==='wolfbrother_y'&&!jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid&&p.wolfbrotherJoinedPack))){
    // 板子上如果不只一隻見面狼，只有「座號最小」的那一位（jgRoomWolfOperatorUid）的手機
    // 會顯示真的可以操作的選人畫面；其餘狼隊友只會看到一行提示訊息，不會顯示任何互動
    // 按鈕——這樣從結構上就不會有兩支手機同時寫入資料庫互相干擾的可能性，是目前最簡單、
    // 最不容易出狀況的做法。
    const opUid=await jgRoomWolfOperatorUid();
    if(opUid===window.jgFirebaseUid){
      const r=await jgRoomWolfViewHtml(night); bodyHtml=r.html; needsTimer=r.needsTimer;
    } else {
      const opP=jgRoomLatestPlayers.find(p=>p.uid===opUid);
      bodyHtml='<div class="nbanner" style="margin-top:20px;"><div class="nicon">🐺</div><h1>殺人畫面在 '+(opP?opP.seatNum:'?')+'號 狼隊友手機</h1></div>'
        +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">請等 '+(opP?opP.seatNum:'?')+'號 操作完成，今晚殺了誰會另外出現在紀錄裡</div>';
      needsTimer=false;
    }
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
  } else {
    jgRoomStopTimer();
    bodyHtml='<div class="nbanner" style="margin-top:20px;"><div class="nicon">🌙</div><h1>夜晚進行中</h1>'
      +'<p class="sub" style="text-align:center;margin-top:8px;">請安靜閉眼等待，輪到你操作時畫面會自動出現</p></div>';
  }
  const hostAdvanceHtml=jgRoomIsHost?jgRoomHostAdvanceHtml(currentStep):'';
  root.innerHTML=`<div class="section-title">第 ${night} 夜</div>${bodyHtml}${hostAdvanceHtml}`;
  // 狼人睜眼出刀維持 30 秒（隊友要互相商量，時間比較緊繃），其餘所有夜晚步驟都是 20 秒——
  // 這裡要跟每個步驟自己 HTML 裡用 jgRoomTimerHtml() 顯示出來的秒數對應一致，不然畫面上
  // 寫「倒數20秒」但計時器實際上跑30秒才會觸發自動跳下一步，會對不起來。
  const timerSeconds=(currentStep==='wolf')?30:20;
  if(needsTimer) jgRoomStartTimer(timerSeconds); else jgRoomStopTimer();
}
// 房主專用提示：狼隊出刀完成後，如果板子有查驗類角色（預言家/通靈師擇一）就會先進行查驗，
// 查驗完（或本來就沒有查驗類角色）currentStep 會變成空，這裡改成直接顯示「開始警長競選」
// 按鈕，銜接到白天流程（預言家跟通靈師不會同時出現在同一場板子，不需要「下一位」按鈕）。
function jgRoomHostAdvanceHtml(currentStep){
  if(currentStep==='shoot') return '<div class="info" style="font-size:12px;margin-top:20px;text-align:center;">昨晚有人被狼刀淘汰、而且他持有開槍資格（獵人／黑狼王／幸運兒獵槍），正在等他決定要不要開槍帶人；決定完（或所有有資格的人都決定完）會自動往下一步。</div>';
  if(currentStep==='badge') return '<div class="info" style="font-size:12px;margin-top:20px;text-align:center;">警長剛剛陣亡了，正在等他決定警徽要傳給誰（或摧毀警徽）；決定完會自動往下一步。</div>';
  if(currentStep==='cupid') return '<div class="info" style="font-size:12px;margin-top:20px;text-align:center;">邱比特配對完、兩位情侶也互相確認過身分之後，會自動往下一步。</div>';
  if(currentStep==='nightmare') return '<div class="info" style="font-size:12px;margin-top:20px;text-align:center;">夢魘選完恐懼對象之後，會自動往下一步。</div>';
  if(currentStep==='magician') return '<div class="info" style="font-size:12px;margin-top:20px;text-align:center;">魔術師換完（或選擇不換）之後，會自動往下一步。</div>';
  if(currentStep==='guard') return '<div class="info" style="font-size:12px;margin-top:20px;text-align:center;">守衛選完之後，會自動往下一步。</div>';
  if(currentStep==='dreamcatcher') return '<div class="info" style="font-size:12px;margin-top:20px;text-align:center;">攝夢人選完夢遊對象之後，會自動往下一步。</div>';
  if(currentStep==='wolfbrother') return '<div class="info" style="font-size:12px;margin-top:20px;text-align:center;">第一夜是狼兄狼弟互相確認身分；其餘夜晚平常沒事，只有狼兄陣亡後狼弟覺醒復仇那一晚才需要操作，完成後會自動往下一步。</div>';
  if(currentStep==='wolf') return '<div class="info" style="font-size:12px;margin-top:20px;text-align:center;">任何一位狼隊友選定目標後，會直接往下一步，不用等其他隊友。</div>';
  if(currentStep==='blackmarket') return '<div class="info" style="font-size:12px;margin-top:20px;text-align:center;">黑市商人交易完（或選擇不交易）之後，會自動往下一步。獵人獵槍這項技能目前還沒自動化，請法官／房主用本機工具手動處理。</div>';
  if(currentStep==='witch') return '<div class="info" style="font-size:12px;margin-top:20px;text-align:center;">女巫（或持有女巫毒藥技能的幸運兒）行動完之後，會自動往下一步（查驗類角色，或直接接警長競選）。</div>';
  if(!currentStep) return '<div class="info" style="font-size:12px;margin-top:20px;text-align:center;">這一夜已經結束，正在自動接警長競選...</div>';
  return '<div class="info" style="font-size:12px;margin-top:20px;text-align:center;">目前只做了守衛、狼隊出刀、女巫、預言家、通靈師、夢魘、魔術師、攝夢人、機械狼、邱比特、狼兄狼弟、黑市商人、夜槍（獵人/黑狼王/幸運兒獵槍）當示範，其餘角色還在開發中。</div>';
}
// 預言家的查驗畫面：先看看這一晚是不是已經查過了（重新整理／斷線重連都要能接續，不能
// 讓他重複查、也不能讓他看不到剛剛已經查到的結果）。
async function jgRoomSeerViewHtml(night){
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  if(jgRoomAmIFeared(rd,night)) return jgRoomFearedNoticeHtml();
  const checkSnap=await getDoc(doc(db,'rooms',jgRoomCode,'seerChecks',window.jgFirebaseUid));
  if(checkSnap.exists()&&checkSnap.data().night===night){
    const d=checkSnap.data();
    return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><div class="nicon">🔮</div><h1>查驗結果</h1>'
      +'<p class="sub" style="text-align:center;margin-top:8px;font-size:20px;font-weight:800;">'+d.targetSeatNum+'號 是 '+(d.team==='wolf'?'壞人':'好人')+'</p></div>'
      +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">請記住這個結果，等待其他人完成夜晚行動</div>'};
  }
  const others=jgRoomLatestPlayers.filter(p=>p.uid!==window.jgFirebaseUid);
  return {needsTimer:true, html:jgRoomTimerHtml(20,'你要查驗的對象是？')
    +'<div class="nbanner" style="margin-top:20px;"><div class="nicon">🔮</div><h1>請選擇查驗對象</h1></div>'
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

window.jgRoomSeerCheck=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  const effective=jgRoomEffectiveTarget(rd,night,targetUid);
  const secretSnap=await getDoc(doc(db,'rooms',jgRoomCode,'secrets',effective));
  const role=secretSnap.exists()?secretSnap.data().role:'villager';
  const team=(typeof WOLF_ROLES!=='undefined'&&WOLF_ROLES.includes(role))?'wolf':'good';
  await setDoc(doc(db,'rooms',jgRoomCode,'seerChecks',window.jgFirebaseUid),{
    night:night, targetUid:targetUid, targetSeatNum:targetSeatNum, team:team
  });
  // 真預言家記「驗」，幸運兒（黑市商人給的查驗技能）記「幸驗」——用 jgMyRole 判斷：這個
  // 函式是預言家跟幸運兒共用的（見 jgRoomRenderNightShell 的 dispatch），我自己不是預言家
  // 卻能呼叫到這裡，代表我是持有查驗技能的幸運兒。
  const abbr=(jgMyRole==='seer')?'驗':'幸驗';
  await jgRoomAppendNightLog(night, abbr+' '+targetSeatNum+(team==='wolf'?'(狼)':'(好)'));
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
  const checkSnap=await getDoc(doc(db,'rooms',jgRoomCode,'mediumChecks',window.jgFirebaseUid));
  if(checkSnap.exists()&&checkSnap.data().night===night){
    const d=checkSnap.data();
    return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><div class="nicon">👁️</div><h1>查驗結果</h1>'
      +'<p class="sub" style="text-align:center;margin-top:8px;font-size:20px;font-weight:800;">'+d.targetSeatNum+'號 是 '+d.roleName+'</p></div>'
      +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">請記住這個結果，等待其他人完成夜晚行動</div>'};
  }
  const others=jgRoomLatestPlayers.filter(p=>p.uid!==window.jgFirebaseUid);
  return {needsTimer:true, html:jgRoomTimerHtml(20,'你要查驗的對象是？')
    +'<div class="nbanner" style="margin-top:20px;"><div class="nicon">👁️</div><h1>請選擇查驗對象</h1></div>'
    +jgRoomNumGridHtml('jg-room-medium-pick', null)
    +'<div style="text-align:center;"><button class="primary" style="margin-top:14px;" onclick="jgRoomSubmitCheckFromGrid(\'medium\',\'jg-room-medium-pick\','+night+')">確認</button></div>'};
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
  await jgRoomAdvanceToDayPhase(night);
  await jgRoomRefreshAndRenderCurrent();
};

// ═══════════════════════════════════════════
// 夢魘：全場最先睜眼，恐懼一名玩家（不能選自己），被恐懼的人整晚無法發動任何夜間技能；
// 如果恐懼到的人剛好是狼隊一員，狼隊當晚也不能殺人（見 jgRoomWolfViewHtml 開頭的判斷）。
// 不能連續兩晚恐懼同一人，這個限制存在夢魘自己的 players/{uid}.lastNightmareTargetUid 上，
// 不會因為換到下一夜就重置。夢魘自己的目標不會被魔術師的換流影響（魔術師排在夢魘之後
// 才睜眼，換流生效時夢魘已經選完了），所以這裡不用套用 jgRoomEffectiveTarget。
// ═══════════════════════════════════════════
async function jgRoomNightmareViewHtml(night){
  const rd=jgRoomLatestRoomDoc||{};
  if(rd.nightmareFearedNight===night&&rd.nightmareFearedSeatNum!=null){
    return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><div class="nicon">😈</div><h1>已選擇恐懼</h1>'
      +'<p class="sub" style="text-align:center;margin-top:8px;font-size:20px;font-weight:800;">'+rd.nightmareFearedSeatNum+'號</p></div>'
      +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">請記住，等待其他人完成夜晚行動</div>'};
  }
  const me=jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid);
  const lastTarget=me?me.lastNightmareTargetUid:null;
  const lastTargetSeat=lastTarget?(jgRoomLatestPlayers.find(p=>p.uid===lastTarget)||{}).seatNum:null;
  return {needsTimer:true, html:jgRoomTimerHtml(20,'你要恐懼的對象是？')
    +'<div class="nbanner" style="margin-top:20px;"><div class="nicon">😈</div><h1>請選擇恐懼對象</h1></div>'
    +(lastTarget?'<div class="info" style="font-size:12px;text-align:center;">不能連續兩晚恐懼同一人（'+lastTargetSeat+'號），上一晚的對象已排除</div>':'')
    +jgRoomNumGridHtml('jg-room-nightmare-pick', null)
    +'<div style="text-align:center;"><button class="primary" style="margin-top:14px;" onclick="jgRoomNightmareActFromGrid('+night+')">確認</button></div>'};
}
window.jgRoomNightmareActFromGrid=function(night){
  const hidden=document.getElementById('jg-room-nightmare-pick');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seatNum);
  if(!p) return;
  if(p.uid===window.jgFirebaseUid){ alert('不能恐懼自己，請選別人'); return; }
  const me=jgRoomLatestPlayers.find(pp=>pp.uid===window.jgFirebaseUid);
  if(me&&me.lastNightmareTargetUid===p.uid){ alert('不能連續兩晚恐懼同一人，請選別人'); return; }
  window.jgRoomNightmareAct(p.uid, seatNum, night);
};
window.jgRoomNightmareAct=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  // secrets 全房可讀（見 jgRoomAssignRoles 的說明），夢魘自己的畫面可以直接查目標的真實
  // 身分，用來判斷這一刀是不是恐懼到狼隊自己人（會導致當晚狼隊無法殺人）。
  const secretSnap=await getDoc(doc(db,'rooms',jgRoomCode,'secrets',targetUid));
  const role=secretSnap.exists()?secretSnap.data().role:'villager';
  const isWolf=(typeof WOLF_ROLES!=='undefined'&&WOLF_ROLES.includes(role));
  await setDoc(doc(db,'rooms',jgRoomCode),{
    nightmareFearedNight:night, nightmareFearedUid:targetUid, nightmareFearedSeatNum:targetSeatNum,
    nightmareFearedIsWolf:isWolf
  },{ merge:true });
  await setDoc(doc(db,'rooms',jgRoomCode,'players',window.jgFirebaseUid),{ lastNightmareTargetUid:targetUid },{ merge:true });
  await jgRoomAppendNightLog(night, '恐 '+targetSeatNum);
  await setDoc(doc(db,'rooms',jgRoomCode),{ currentStep:jgRoomNextNightStep('nightmare', night) },{ merge:true });
  await jgRoomRefreshAndRenderCurrent();
};

// ═══════════════════════════════════════════
// 魔術師：夢魘之後、守衛之前最早行動，可以選擇交換兩個玩家的號碼牌（也可以不換）。交換
// 之後，這兩個號碼「當晚」所有以號碼為目標的夜間技能，實際作用對象都會互相對調（見
// jgRoomEffectiveTarget，套用在守衛/狼隊/女巫毒藥/查驗類角色身上）。每個號碼整局最多只能
// 被交換過一次，用過的號碼記在魔術師自己的 players/{uid}.magicianUsedSeats 陣列上。
// 如果魔術師被夢魘恐懼，今晚就不能交換（不會顯示任何交換介面），直接跳過這一步。
// ═══════════════════════════════════════════
async function jgRoomMagicianViewHtml(night){
  const rd=jgRoomLatestRoomDoc||{};
  if(jgRoomAmIFeared(rd,night)) return jgRoomFearedNoticeHtml();
  if(rd.magicianDoneNight===night){
    const summary=(rd.magicianSwapNight===night&&rd.magicianSwapASeatNum!=null)
      ?('交換了 '+rd.magicianSwapASeatNum+'號 與 '+rd.magicianSwapBSeatNum+'號')
      :'這晚沒有交換';
    return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><div class="nicon">🎩</div><h1>已行動</h1>'
      +'<p class="sub" style="text-align:center;margin-top:8px;">'+summary+'</p></div>'
      +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">請記住，等待其他人完成夜晚行動</div>'};
  }
  const me=jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid);
  const usedSeats=(me&&me.magicianUsedSeats)||[];
  const pending=rd.magicianPendingNight===night?rd.magicianPendingUid:null;
  const pendingSeat=rd.magicianPendingNight===night?rd.magicianPendingSeatNum:null;
  if(pending){
    return {needsTimer:true, html:jgRoomTimerHtml(20,'要跟哪個號碼交換？')
      +'<div class="nbanner" style="margin-top:20px;"><div class="nicon">🎩</div><h1>已選 '+pendingSeat+'號，請選另一個要交換的號碼</h1></div>'
      +jgRoomNumGridHtml('jg-room-magician-pick2', null, [...usedSeats, pendingSeat])
      +'<div style="text-align:center;"><button class="primary" style="margin-top:14px;" onclick="jgRoomMagicianConfirmSwapFromGrid('+night+')">確認</button></div>'
      +'<div style="text-align:center;"><button style="margin-top:8px;" onclick="jgRoomMagicianModify()">重新選擇</button></div>'};
  }
  return {needsTimer:true, html:jgRoomTimerHtml(20,'要交換哪兩個號碼？')
    +'<div class="nbanner" style="margin-top:20px;"><div class="nicon">🎩</div><h1>請選擇要交換的第一個號碼（可以不換）</h1></div>'
    +jgRoomNumGridHtml('jg-room-magician-pick1', null, usedSeats)
    +'<div style="text-align:center;"><button class="primary" style="margin-top:14px;" onclick="jgRoomMagicianPickFirstFromGrid('+night+')">確認</button></div>'
    +'<div style="text-align:center;"><button style="margin-top:8px;" onclick="jgRoomMagicianSkip('+night+')">今晚不交換，跳過</button></div>'};
}
window.jgRoomMagicianPickFirstFromGrid=function(night){
  const hidden=document.getElementById('jg-room-magician-pick1');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seatNum);
  if(!p) return;
  window.jgRoomMagicianPickFirst(p.uid, seatNum, night);
};
window.jgRoomMagicianPickFirst=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{
    magicianPendingNight:night, magicianPendingUid:targetUid, magicianPendingSeatNum:targetSeatNum
  },{ merge:true });
  await jgRoomRefreshAndRenderCurrent();
};
window.jgRoomMagicianModify=async function(){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{
    magicianPendingNight:null, magicianPendingUid:null, magicianPendingSeatNum:null
  },{ merge:true });
  await jgRoomRefreshAndRenderCurrent();
};
window.jgRoomMagicianConfirmSwapFromGrid=function(night){
  const hidden=document.getElementById('jg-room-magician-pick2');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seatNum);
  if(!p) return;
  window.jgRoomMagicianConfirmSwap(p.uid, seatNum, night);
};
window.jgRoomMagicianConfirmSwap=async function(targetUid, targetSeatNum, night){
  const rd=jgRoomLatestRoomDoc||{};
  const aUid=rd.magicianPendingUid, aSeat=rd.magicianPendingSeatNum;
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{
    magicianSwapNight:night, magicianSwapAUid:aUid, magicianSwapASeatNum:aSeat,
    magicianSwapBUid:targetUid, magicianSwapBSeatNum:targetSeatNum,
    magicianPendingNight:null, magicianPendingUid:null, magicianPendingSeatNum:null,
    magicianDoneNight:night
  },{ merge:true });
  const me=jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid);
  const usedSeats=(me&&me.magicianUsedSeats)||[];
  await setDoc(doc(db,'rooms',jgRoomCode,'players',window.jgFirebaseUid),{
    magicianUsedSeats:[...usedSeats, aSeat, targetSeatNum]
  },{ merge:true });
  await jgRoomAppendNightLog(night, '換 '+aSeat+'-'+targetSeatNum);
  await jgRoomAdvanceToWolfOrBeyond('magician', night);
  await jgRoomRefreshAndRenderCurrent();
};
window.jgRoomMagicianSkip=async function(night){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{
    magicianSwapNight:null, magicianSwapAUid:null, magicianSwapASeatNum:null,
    magicianSwapBUid:null, magicianSwapBSeatNum:null, magicianDoneNight:night
  },{ merge:true });
  await jgRoomAppendNightLog(night, '換 x');
  await jgRoomAdvanceToWolfOrBeyond('magician', night);
  await jgRoomRefreshAndRenderCurrent();
};

// ═══════════════════════════════════════════
// 攝夢人：排在守衛之後、機械狼／狼隊之前，每晚都必須選擇一名玩家（沒有「跳過」選項）
// 成為夢遊者。夢遊者這一晚免疫狼刀、女巫毒藥、機械狼學到的技能造成的死亡（見
// jgRoomResolveNightDeaths 開頭的 isDreaming 判斷）；但如果連續兩晚選了同一個人，這個人
// 會直接死於夢裡（不受任何保護影響，馬上結算，不用等狼隊/女巫）。攝夢人自己若在夜裡死亡，
// 夢遊者也會一併死去（同樣在 jgRoomResolveNightDeaths 處理）。可以選自己嗎？角色說明沒有
// 特別禁止，這裡不特別排除。
// ═══════════════════════════════════════════
async function jgRoomDreamcatcherViewHtml(night){
  const rd=jgRoomLatestRoomDoc||{};
  if(jgRoomAmIFeared(rd,night)) return jgRoomFearedNoticeHtml();
  if(rd.dreamcatcherTargetNight===night&&rd.dreamcatcherTargetSeatNum!=null){
    return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><div class="nicon">🌙</div><h1>已選擇夢遊對象</h1>'
      +'<p class="sub" style="text-align:center;margin-top:8px;font-size:20px;font-weight:800;">'+rd.dreamcatcherTargetSeatNum+'號</p></div>'
      +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">請記住，等待其他人完成夜晚行動</div>'};
  }
  return {needsTimer:true, html:jgRoomTimerHtml(20,'今晚要夢到誰？')
    +'<div class="nbanner" style="margin-top:20px;"><div class="nicon">🌙</div><h1>請選擇今晚的夢遊對象（每晚必選）</h1></div>'
    +jgRoomNumGridHtml('jg-room-dreamcatcher-pick', null)
    +'<div style="text-align:center;"><button class="primary" style="margin-top:14px;" onclick="jgRoomDreamcatcherActFromGrid('+night+')">確認</button></div>'};
}
window.jgRoomDreamcatcherActFromGrid=function(night){
  const hidden=document.getElementById('jg-room-dreamcatcher-pick');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seatNum);
  if(!p) return;
  window.jgRoomDreamcatcherAct(p.uid, seatNum, night);
};
window.jgRoomDreamcatcherAct=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  const me=jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid);
  const lastTarget=me?me.lastDreamcatcherTargetUid:null;
  const diedInDream=(lastTarget===targetUid);
  await setDoc(doc(db,'rooms',jgRoomCode),{
    dreamcatcherTargetNight:night, dreamcatcherTargetUid:diedInDream?null:targetUid,
    dreamcatcherTargetSeatNum:targetSeatNum, dreamcatcherOwnUid:window.jgFirebaseUid
  },{ merge:true });
  await setDoc(doc(db,'rooms',jgRoomCode,'players',window.jgFirebaseUid),{ lastDreamcatcherTargetUid:targetUid },{ merge:true });
  await jgRoomAppendNightLog(night, '夢 '+targetSeatNum+(diedInDream?'(連續兩晚致死)':''));
  if(diedInDream){
    // 連續兩晚選同一人：這個人直接死於夢裡，跟狼刀/女巫毒藥是分開結算的另一種死因，
    // 不受任何保護影響，馬上生效（不用等這一晚後面的狼隊/女巫回合）。上面那筆
    // dreamcatcherTargetUid 特意寫成 null，是為了避免 jgRoomResolveNightDeaths 的免疫
    // 判斷誤把這個人當成「今晚受保護的夢遊者」（他其實是死於夢裡，不是被保護）。
    await setDoc(doc(db,'rooms',jgRoomCode,'players',targetUid),{ alive:false },{ merge:true });
    await jgRoomApplyCupidCascade();
  }
  await jgRoomAdvanceToWolfOrBeyond('dreamcatcher', night);
  await jgRoomRefreshAndRenderCurrent();
};

// ═══════════════════════════════════════════
// 機械狼：不與狼隊見面，全程自己單獨睜眼，固定排在（真正的）狼隊出刀之前。
// 第一夜：選一名玩家「學習」對方的身分技能。
// 第二夜起：依照學到的身分，開放對應的一次性/每晚技能——
//   學到平民：沒有主動技能，直接跳過。
//   學到狼人/黑狼王：整局限一次的「額外一刀」，不可被守衛/解藥阻擋（見
//     jgRoomResolveNightDeaths 的 mechWolfBonusKillUid）。
//   學到女巫：整局限一次的毒藥（沒有解藥），一樣不可被守衛/解藥阻擋。
//   學到通靈師：每晚查驗一名玩家的具體身分（另存一份 mechwolfChecks，跟真正的通靈師分開）。
//   學到守衛：每晚可以額外守護一人，效果比照真守衛擋狼刀（跟真守衛各自獨立判斷）。
//   學到獵人：被淘汰時可以開槍——這部分跟房間系統目前「獵人開槍」本身還沒自動化的
//     既有限制一樣（見 jgRoomHostAdvanceHtml 的說明），這裡先只記錄身分，開槍請法官
//     line下手動處理，之後獵人自動化做好了會一起補上。
// 除了以上技能之外，任何一晚只要「其餘真正跟狼隊一起睜眼的隊友全部死亡」
// （jgRoomMechWolfKillEligible()），機械狼就會在自己的畫面上多看到一個「今晚由你出刀」的
// 選人畫面，結果直接寫進 wolfKillTargetUid／wolfKillTargetSeatNum，跟一般狼刀走同一套
// 死亡結算/女巫救援流程。
// ═══════════════════════════════════════════
async function jgRoomMechWolfViewHtml(night){
  const rd=jgRoomLatestRoomDoc||{};
  if(jgRoomAmIFeared(rd,night)) return jgRoomFearedNoticeHtml();
  const me=jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid);
  const learned=me?me.mechWolfLearnedRole:null;
  let html='';
  let doneAll=true; // 這一晚是不是已經沒有事情要做了（用來決定要不要顯示「繼續」）
  if(night===1&&!learned){
    if(rd.mechWolfLearnDoneNight===1){
      html+='<div class="nbanner" style="margin-top:20px;"><div class="nicon">🤖</div><h1>已選擇學習對象</h1></div>'
        +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">請記住，等待其他人完成夜晚行動</div>';
    } else {
      const others=jgRoomLatestPlayers.filter(p=>p.uid!==window.jgFirebaseUid);
      const dead=new Set(others.filter(p=>p.alive===false).map(p=>p.seatNum));
      return {needsTimer:true, html:jgRoomTimerHtml(20,'你要學習誰的身分？')
        +'<div class="nbanner" style="margin-top:20px;"><div class="nicon">🤖</div><h1>請選擇今晚要學習的對象</h1></div>'
        +jgRoomNumGridHtml('jg-room-mechwolf-learn-pick', null)
        +'<div style="text-align:center;"><button class="primary" style="margin-top:14px;" onclick="jgRoomMechWolfLearnFromGrid('+night+')">確認</button></div>'};
    }
  } else if(learned){
    const learnedName=(typeof RNAME!=='undefined'&&RNAME[learned])||learned;
    html+='<div class="nbanner" style="margin-top:20px;"><div class="nicon">🤖</div><h1>你學到的身分：'+learnedName+'</h1></div>';
    // 技能要「次晚起」才能用（跟幸運兒拿到技能是同一個道理：學到的當晚，這個身分的能力
    // 還不算正式到位，第一晚只單純告知學到誰、直接給確認按鈕過這一步就好，不能馬上就對
    // 那個學到的技能發動一次）。night===1 的話，不管學到什麼，一律不顯示任何技能操作區塊，
    // 直接落到後面 doneAll 的「確認，沒有其他行動」分支。
    const skillDoneThisNight=rd.mechWolfSkillDoneNight===night;
    if(night===1){
      html+='<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">技能要等下一晚才能開始使用，今晚先確認學到的身分就好</div>';
    } else if(skillDoneThisNight){
      html+='<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">這一晚的技能已經行動過了</div>';
    } else if(learned==='witch'&&!(me&&me.mechWolfPoisonUsed)){
      doneAll=false;
      html+='<div class="section-title" style="margin-top:16px;">使用毒藥（整局限一次）</div>'
        +jgRoomNumGridHtml('jg-room-mechwolf-poison-pick', null)
        +'<div style="text-align:center;"><button class="primary" style="margin-top:10px;" onclick="jgRoomMechWolfPoisonFromGrid('+night+')">下毒</button></div>'
        +'<div style="text-align:center;"><button style="margin-top:8px;" onclick="jgRoomMechWolfSkillSkip('+night+')">這晚不使用，跳過</button></div>';
    } else if((learned==='wolf'||learned==='wolfking')&&!(me&&me.mechWolfBonusKillUsed)){
      doneAll=false;
      html+='<div class="section-title" style="margin-top:16px;">發動額外一刀（整局限一次）</div>'
        +jgRoomNumGridHtml('jg-room-mechwolf-bonuskill-pick', null)
        +'<div style="text-align:center;"><button class="primary" style="margin-top:10px;" onclick="jgRoomMechWolfBonusKillFromGrid('+night+')">確認</button></div>'
        +'<div style="text-align:center;"><button style="margin-top:8px;" onclick="jgRoomMechWolfSkillSkip('+night+')">這晚不使用，跳過</button></div>';
    } else if(learned==='medium'){
      doneAll=false;
      html+='<div class="section-title" style="margin-top:16px;">查驗身分（每晚可用）</div>'
        +jgRoomNumGridHtml('jg-room-mechwolf-medium-pick', null)
        +'<div style="text-align:center;"><button class="primary" style="margin-top:10px;" onclick="jgRoomMechWolfMediumCheckFromGrid('+night+')">確認</button></div>';
    } else if(learned==='guard'){
      doneAll=false;
      const lastTarget=me?me.mechWolfLastGuardTargetUid:null;
      const lastTargetSeat=lastTarget?(jgRoomLatestPlayers.find(p=>p.uid===lastTarget)||{}).seatNum:null;
      html+='<div class="section-title" style="margin-top:16px;">額外守護（每晚可用）</div>'
        +(lastTarget?'<div class="info" style="font-size:12px;text-align:center;">不能連續兩晚守護同一人（'+lastTargetSeat+'號），上一晚的對象已排除</div>':'')
        +jgRoomNumGridHtml('jg-room-mechwolf-guard-pick', null, lastTargetSeat?[lastTargetSeat]:[])
        +'<div style="text-align:center;"><button class="primary" style="margin-top:10px;" onclick="jgRoomMechWolfGuardFromGrid('+night+')">確認</button></div>';
    } else if(learned==='hunter'){
      html+='<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">你學到了獵人：出局時可以開槍帶人，這部分請法官／房主用本機工具手動處理（房間系統的獵人開槍尚未自動化）。</div>';
    } else {
      html+='<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">這個身分這一晚沒有可以使用的主動技能。</div>';
    }
  } else {
    html+='<div class="nbanner" style="margin-top:20px;"><div class="nicon">🤖</div><h1>你目前沒有可用的主動技能</h1></div>';
  }
  const eligible=await jgRoomMechWolfKillEligible();
  if(eligible){
    if(rd.wolfKillNight===night&&rd.wolfKillTargetSeatNum!=null){
      html+='<div class="nbanner" style="margin-top:20px;"><div class="nicon">🐺</div><h1>今晚由你出刀：已選 '+rd.wolfKillTargetSeatNum+'號</h1></div>';
    } else {
      doneAll=false;
      html+='<div class="section-title" style="margin-top:16px;">其餘狼隊已全滅，今晚由你出刀</div>'
        +jgRoomNumGridHtml('jg-room-mechwolf-kill-pick', null)
        +'<div style="text-align:center;"><button class="primary" style="margin-top:10px;" onclick="jgRoomMechWolfKillFromGrid('+night+')">確認</button></div>';
    }
  } else if(doneAll){
    // 這一晚沒有技能可用（或已經用過/沒有主動技能可用），也還沒輪到接管出刀：給一個確認
    // 按鈕讓他明確結束這一步（比起完全自動跳過，讓玩家自己按一下比較符合其餘步驟「需要
    // 互動才推進」的手感）。
    html+='<button class="primary" style="margin-top:14px;" onclick="jgRoomMechWolfSkillSkip('+night+')">確認</button>';
  }
  return {needsTimer:true, html:jgRoomTimerHtml(20,'機械狼請睜眼')+html};
}
window.jgRoomMechWolfLearnFromGrid=function(night){
  const hidden=document.getElementById('jg-room-mechwolf-learn-pick');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seatNum);
  if(!p) return;
  if(p.uid===window.jgFirebaseUid){ alert('不能學習自己的身分，請選別人'); return; }
  window.jgRoomMechWolfLearn(p.uid, seatNum, night);
};
window.jgRoomMechWolfLearn=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  const secretSnap=await getDoc(doc(db,'rooms',jgRoomCode,'secrets',targetUid));
  let role=secretSnap.exists()?secretSnap.data().role:'villager';
  // 學到另一隻機械狼、或狼隊裡不會給機械狼帶來主動技能的角色，一律歸類成「平民」（沒有
  // 主動技能）——跟本機法官助手 jgMechWolfLearn 系列的簡化規則一致，避免出現奇怪的組合。
  if(!['villager','wolf','wolfking','witch','medium','hunter','guard'].includes(role)) role='villager';
  await setDoc(doc(db,'rooms',jgRoomCode),{ mechWolfLearnDoneNight:1 },{ merge:true });
  await setDoc(doc(db,'rooms',jgRoomCode,'players',window.jgFirebaseUid),{
    mechWolfLearnedRole:role, mechWolfLearnedFromSeatNum:targetSeatNum
  },{ merge:true });
  await jgRoomAppendNightLog(night, '機學 '+targetSeatNum);
  // 學到身分要用大字報清楚告知，格式比照本機法官助手：「X號」+ 學到的身分中文名稱，
  // 不能只是塞在頁面標題裡讓他自己瞄到——這是整局唯一一次告知的機會，漏看了會很麻煩。
  const roleName=(typeof RNAME!=='undefined'&&RNAME[role])||role;
  jgRoomShowBigCard(targetSeatNum+'號', '學到「'+roleName+'」');
  // 學完身分之後，如果剛好板子上（或其餘狼隊友都死光了）沒有其他真正的狼隊出刀，機械狼
  // 這時就要自己接管出刀——這種情況一定要「留在」mechwolf 這一步，讓同一個畫面接著顯示
  // 出刀選人（見 jgRoomMechWolfViewHtml 最後那段 eligible 判斷），不能直接跳去 'wolf' 那
  // 一步：'wolf' 步驟的畫面 dispatch 是特別排除機械狼的（機械狼平常不跟狼隊一起睜眼），
  // 如果這裡不管有沒有資格接管、無條件跳去 'wolf'，遇到「板子上只有機械狼、沒有其他狼人」
  // 這種情況就會沒有任何人看得到「wolf」這一步的畫面，整場卡住、誰都按不了下一步。
  const eligible=await jgRoomMechWolfKillEligible();
  if(!eligible) await jgRoomAdvanceToWolfOrBeyond('mechwolf', night);
  await jgRoomRefreshAndRenderCurrent();
};
window.jgRoomMechWolfSkillSkip=async function(night){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{ mechWolfSkillDoneNight:night },{ merge:true });
  // 只有「真的學到某個有主動技能的身分、這一晚技能也已經開放使用（次晚起）、但選擇不用」
  // 才需要記一行 x——第一晚剛學到、技能還沒開放使用的那次「確認」不算「跳過技能」，不用
  // 記錄（避免文字紀錄第一晚出現一行看起來像是「有技能可用卻放棄」的誤導訊息）。
  const me=jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid);
  const learned=me?me.mechWolfLearnedRole:null;
  const skipAbbr={witch:'機毒',wolf:'機刀',wolfking:'機刀',guard:'機守',medium:'機驗'}[learned];
  if(skipAbbr&&night>1) await jgRoomAppendNightLog(night, skipAbbr+' x');
  const eligible=await jgRoomMechWolfKillEligible();
  if(!eligible) await jgRoomAdvanceToWolfOrBeyond('mechwolf', night);
  await jgRoomRefreshAndRenderCurrent();
};
window.jgRoomMechWolfPoisonFromGrid=function(night){
  const hidden=document.getElementById('jg-room-mechwolf-poison-pick');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seatNum);
  if(!p) return;
  window.jgRoomMechWolfPoison(p.uid, seatNum, night);
};
window.jgRoomMechWolfPoison=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  const effective=jgRoomEffectiveTarget(rd,night,targetUid);
  await setDoc(doc(db,'rooms',jgRoomCode),{
    mechWolfPoisonUid:effective, mechWolfPoisonNight:night, mechWolfSkillDoneNight:night
  },{ merge:true });
  await setDoc(doc(db,'rooms',jgRoomCode,'players',window.jgFirebaseUid),{ mechWolfPoisonUsed:true },{ merge:true });
  await jgRoomAppendNightLog(night, '機毒 '+targetSeatNum);
  const eligible=await jgRoomMechWolfKillEligible();
  if(!eligible) await jgRoomAdvanceToWolfOrBeyond('mechwolf', night);
  await jgRoomRefreshAndRenderCurrent();
};
window.jgRoomMechWolfBonusKillFromGrid=function(night){
  const hidden=document.getElementById('jg-room-mechwolf-bonuskill-pick');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seatNum);
  if(!p) return;
  window.jgRoomMechWolfBonusKill(p.uid, seatNum, night);
};
window.jgRoomMechWolfBonusKill=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  const effective=jgRoomEffectiveTarget(rd,night,targetUid);
  await setDoc(doc(db,'rooms',jgRoomCode),{
    mechWolfBonusKillUid:effective, mechWolfBonusKillNight:night, mechWolfSkillDoneNight:night
  },{ merge:true });
  await setDoc(doc(db,'rooms',jgRoomCode,'players',window.jgFirebaseUid),{ mechWolfBonusKillUsed:true },{ merge:true });
  await jgRoomAppendNightLog(night, '機刀 '+targetSeatNum);
  const eligible=await jgRoomMechWolfKillEligible();
  if(!eligible) await jgRoomAdvanceToWolfOrBeyond('mechwolf', night);
  await jgRoomRefreshAndRenderCurrent();
};
window.jgRoomMechWolfGuardFromGrid=function(night){
  const hidden=document.getElementById('jg-room-mechwolf-guard-pick');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seatNum);
  if(!p) return;
  const me=jgRoomLatestPlayers.find(pp=>pp.uid===window.jgFirebaseUid);
  if(me&&me.mechWolfLastGuardTargetUid===p.uid){ alert('不能連續兩晚守護同一人，請選別人'); return; }
  window.jgRoomMechWolfGuard(p.uid, seatNum, night);
};
window.jgRoomMechWolfGuard=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  const effective=jgRoomEffectiveTarget(rd,night,targetUid);
  await setDoc(doc(db,'rooms',jgRoomCode),{
    mechWolfGuardUid:effective, mechWolfGuardNight:night, mechWolfSkillDoneNight:night
  },{ merge:true });
  await setDoc(doc(db,'rooms',jgRoomCode,'players',window.jgFirebaseUid),{ mechWolfLastGuardTargetUid:targetUid },{ merge:true });
  await jgRoomAppendNightLog(night, '機守 '+targetSeatNum);
  const eligible=await jgRoomMechWolfKillEligible();
  if(!eligible) await jgRoomAdvanceToWolfOrBeyond('mechwolf', night);
  await jgRoomRefreshAndRenderCurrent();
};
window.jgRoomMechWolfMediumCheckFromGrid=function(night){
  const hidden=document.getElementById('jg-room-mechwolf-medium-pick');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seatNum);
  if(!p) return;
  window.jgRoomMechWolfMediumCheck(p.uid, seatNum, night);
};
window.jgRoomMechWolfMediumCheck=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  const effective=jgRoomEffectiveTarget(rd,night,targetUid);
  const secretSnap=await getDoc(doc(db,'rooms',jgRoomCode,'secrets',effective));
  const role=secretSnap.exists()?secretSnap.data().role:'villager';
  const roleName=(typeof RNAME!=='undefined'&&RNAME[role])||role;
  const roleAbbr=(typeof ROLE_ABBR!=='undefined'&&ROLE_ABBR[role])||roleName;
  await setDoc(doc(db,'rooms',jgRoomCode,'mechwolfChecks',window.jgFirebaseUid+'_'+night),{
    night:night, targetUid:targetUid, targetSeatNum:targetSeatNum, roleName:roleName
  });
  await setDoc(doc(db,'rooms',jgRoomCode),{ mechWolfSkillDoneNight:night },{ merge:true });
  await jgRoomAppendNightLog(night, '機驗 '+targetSeatNum+'('+roleAbbr+')');
  const eligible=await jgRoomMechWolfKillEligible();
  if(!eligible) await jgRoomAdvanceToWolfOrBeyond('mechwolf', night);
  await jgRoomRefreshAndRenderCurrent();
};
// 機械狼接管出刀：跟一般狼隊出刀共用同一組欄位（wolfKillTargetUid 等），不用另外走一次
// 團隊確認流程（機械狼是唯一決定的人，不用等其他人），直接呼叫 jgRoomAfterKillDecided()。
window.jgRoomMechWolfKillFromGrid=function(night){
  const hidden=document.getElementById('jg-room-mechwolf-kill-pick');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seatNum);
  if(!p) return;
  window.jgRoomMechWolfKill(p.uid, seatNum, night);
};
window.jgRoomMechWolfKill=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  const effective=jgRoomEffectiveTarget(rd,night,targetUid);
  await setDoc(doc(db,'rooms',jgRoomCode),{
    wolfKillNight:night, wolfKillTargetUid:effective, wolfKillTargetSeatNum:targetSeatNum
  },{ merge:true });
  await jgRoomAfterKillDecided(night);
  await jgRoomRefreshAndRenderCurrent();
};

// ═══════════════════════════════════════════
// 邱比特：整局最先睜眼，僅第一夜、僅一次，指定兩名玩家（可以鏈自己）成為情侶。配對結果
// 永久生效：兩人之後只要有一人以任何方式死亡（不管白天投票、夜晚狼刀/毒/夢死等），
// 活著的另一位就要立刻殉情（見 jgRoomApplyCupidCascade，掛在 jgRoomResolveNightDeaths
// 結尾跟攝夢人夢死結算之後）。配對完成後，兩位情侶各自的畫面會先看到一次「情侶互相確認」
// 的提示卡片，兩人都按下確認之後才會真正往下一步走（idempotent 寫法，仿照狼隊「全員確認」
// 那一套，避免兩人幾乎同時按下時互相漏算）。
// ═══════════════════════════════════════════
async function jgRoomCupidViewHtml(night){
  const rd=jgRoomLatestRoomDoc||{};
  if(rd.cupidDoneNight===1&&rd.cupidRevealDone){
    return null; // 配對＋雙方確認都完成了，這一步真的沒事了，交給外層判斷是不是輪到我看情侶揭曉卡片
  }
  if(rd.cupidDoneNight===1){
    return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><div class="nicon">💘</div><h1>已配對完成</h1></div>'
      +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">請記住，等待兩位情侶互相確認身分</div>'};
  }
  const pendingUid=rd.cupidPendingUid;
  if(pendingUid){
    const pendingSeat=rd.cupidPendingSeatNum;
    return {needsTimer:true, html:jgRoomTimerHtml(20,'另一位情侶是誰？')
      +'<div class="nbanner" style="margin-top:20px;"><div class="nicon">💘</div><h1>已選 '+pendingSeat+'號，請選另一位情侶</h1></div>'
      +jgRoomNumGridHtml('jg-room-cupid-pick2', null, [pendingSeat])
      +'<div style="text-align:center;"><button class="primary" style="margin-top:14px;" onclick="jgRoomCupidConfirmPairFromGrid('+night+')">確認</button></div>'
      +'<div style="text-align:center;"><button style="margin-top:8px;" onclick="jgRoomCupidModify()">重新選擇</button></div>'};
  }
  return {needsTimer:true, html:jgRoomTimerHtml(20,'今晚要指定哪兩位玩家成為情侶？')
    +'<div class="nbanner" style="margin-top:20px;"><div class="nicon">💘</div><h1>請選擇第一位情侶（可以選自己）</h1></div>'
    +jgRoomNumGridHtml('jg-room-cupid-pick1', null)
    +'<div style="text-align:center;"><button class="primary" style="margin-top:14px;" onclick="jgRoomCupidPickFirstFromGrid('+night+')">確認</button></div>'};
}
window.jgRoomCupidPickFirstFromGrid=function(night){
  const hidden=document.getElementById('jg-room-cupid-pick1');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seatNum);
  if(!p) return;
  window.jgRoomCupidPickFirst(p.uid, seatNum, night);
};
window.jgRoomCupidPickFirst=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{
    cupidPendingUid:targetUid, cupidPendingSeatNum:targetSeatNum
  },{ merge:true });
  await jgRoomRefreshAndRenderCurrent();
};
window.jgRoomCupidModify=async function(){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{ cupidPendingUid:null, cupidPendingSeatNum:null },{ merge:true });
  await jgRoomRefreshAndRenderCurrent();
};
window.jgRoomCupidConfirmPairFromGrid=function(night){
  const hidden=document.getElementById('jg-room-cupid-pick2');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seatNum);
  if(!p) return;
  window.jgRoomCupidConfirmPair(p.uid, seatNum, night);
};
window.jgRoomCupidConfirmPair=async function(targetUid, targetSeatNum, night){
  const rd=jgRoomLatestRoomDoc||{};
  const aUid=rd.cupidPendingUid, aSeat=rd.cupidPendingSeatNum;
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{
    cupidLoverAUid:aUid, cupidLoverASeatNum:aSeat, cupidLoverBUid:targetUid, cupidLoverBSeatNum:targetSeatNum,
    cupidPendingUid:null, cupidPendingSeatNum:null, cupidDoneNight:1, cupidRevealAckUids:[]
  },{ merge:true });
  await jgRoomAppendNightLog(1, '邱 '+aSeat+'-'+targetSeatNum);
  await jgRoomRefreshAndRenderCurrent();
};
// 兩位情侶各自看到的「互相確認」卡片：只要我是配對到的其中一位、而且還沒按過確認，就會
// 看到這張卡片蓋住原本的夜晚畫面；雙方都按過確認之後，才真的往下一步走（用陣列＋
// arrayUnion 判斷「兩人是否都確認過」，避免兩人幾乎同時按下時互相漏算，跟狼隊「全員
// 確認」那套邏輯一致）。
function jgRoomCupidRevealHtml(rd, night){
  const a=rd.cupidLoverAUid, b=rd.cupidLoverBUid;
  if(!a||!b) return null;
  const myUid=window.jgFirebaseUid;
  if(myUid!==a&&myUid!==b) return null;
  const ackUids=rd.cupidRevealAckUids||[];
  if(ackUids.includes(myUid)) return null; // 我已經確認過了，不用再看這張卡片
  const partnerSeat=(myUid===a)?rd.cupidLoverBSeatNum:rd.cupidLoverASeatNum;
  return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><div class="nicon">💘</div><h1>邱比特配對結果</h1>'
    +'<p class="sub" style="text-align:center;margin-top:8px;font-size:20px;font-weight:800;">你的另一半是 '+partnerSeat+'號</p></div>'
    +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">你們其中一人以任何方式死亡，另一人都會立刻殉情陪葬。</div>'
    +'<button class="primary" style="margin-top:14px;" onclick="jgRoomCupidRevealAck('+night+')">我知道了</button>'};
}
window.jgRoomCupidRevealAck=async function(night){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{ cupidRevealAckUids: arrayUnion(window.jgFirebaseUid) },{ merge:true });
  const freshSnap=await getDoc(doc(db,'rooms',jgRoomCode));
  const fresh=freshSnap.data()||{};
  const ackUids=fresh.cupidRevealAckUids||[];
  if(ackUids.includes(fresh.cupidLoverAUid)&&ackUids.includes(fresh.cupidLoverBUid)&&!fresh.cupidRevealDone){
    await setDoc(doc(db,'rooms',jgRoomCode),{ cupidRevealDone:true },{ merge:true });
    await jgRoomAdvanceToWolfOrBeyond('cupid', night);
  }
  await jgRoomRefreshAndRenderCurrent();
};

// ═══════════════════════════════════════════
// 狼兄狼弟：第一夜兩人先互相確認身分（跟邱比特配對揭曉一樣，用雙方各自確認的卡片），
// 確認完狼兄才跟其餘狼人一同睜眼出刀（回到正常的 wolf 步驟），狼弟這時候還不進狼窩。
// 之後每一晚：狼兄若還活著，這一步只是單純帶過（狼弟這時完全沒有主動技能，直接自動往下
// 一步）；狼兄一旦陣亡，下一晚狼弟要單獨覺醒、被迫殺一人復仇（不可空刀，這一刀直接寫進
// wolfKillTargetUid，跟一般狼刀走同一套死亡結算），復仇完成之後狼弟才正式加入狼窩（見
// jgRoomGetWolfUids 的 wolfbrotherJoinedPack 判斷），從下一晚開始才會出現在正常的
// 狼隊出刀畫面裡，這個 wolfbrother 步驟之後就再也不會出現。
// ═══════════════════════════════════════════
async function jgRoomWolfbrotherIdentities(){
  const db=window.jgFirebaseDb;
  const { getDocs } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js");
  const secretsSnap=await getDocs(collection(db,'rooms',jgRoomCode,'secrets'));
  const eDoc=secretsSnap.docs.find(d=>d.data().role==='wolfbrother_e');
  const yDoc=secretsSnap.docs.find(d=>d.data().role==='wolfbrother_y');
  return { elderUid: eDoc?eDoc.id:null, youngerUid: yDoc?yDoc.id:null };
}
async function jgRoomWolfbrotherViewHtml(night){
  const rd=jgRoomLatestRoomDoc||{};
  if(jgRoomAmIFeared(rd,night)) return jgRoomFearedNoticeHtml();
  const { elderUid, youngerUid }=await jgRoomWolfbrotherIdentities();
  if(!elderUid||!youngerUid){
    // 板子沒有配齊狼兄狼弟兩個角色（理論上不會發生，保險起見直接跳過）
    await jgRoomAdvanceToWolfOrBeyond('wolfbrother', night);
    return {needsTimer:false, html:''};
  }
  const elderSnap=await getDoc(doc(db2(),'rooms',jgRoomCode,'players',elderUid));
  const elderAlive=elderSnap.exists()?(elderSnap.data().alive!==false):true;
  if(night===1&&!rd.wolfbrotherIdRevealDone){
    // 第一夜互認：只有狼兄狼弟兩人看得到這張卡片，其他人一律看「夜晚進行中」。
    const myUid=window.jgFirebaseUid;
    if(myUid!==elderUid&&myUid!==youngerUid){
      return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><div class="nicon">🌙</div><h1>夜晚進行中</h1>'
        +'<p class="sub" style="text-align:center;margin-top:8px;">請安靜閉眼等待，輪到你操作時畫面會自動出現</p></div>'};
    }
    const ackUids=rd.wolfbrotherIdAckUids||[];
    if(ackUids.includes(myUid)){
      return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><div class="nicon">👬</div><h1>已確認身分</h1></div>'
        +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">請記住，等待其他人完成夜晚行動</div>'};
    }
    const myLabel=myUid===elderUid?'狼兄':'狼弟';
    const partnerSeat=jgRoomLatestPlayers.find(p=>p.uid===(myUid===elderUid?youngerUid:elderUid));
    return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><div class="nicon">👬</div><h1>你是'+myLabel+'</h1>'
      +'<p class="sub" style="text-align:center;margin-top:8px;font-size:20px;font-weight:800;">'+(myLabel==='狼兄'?'狼弟':'狼兄')+'是 '+(partnerSeat?partnerSeat.seatNum:'?')+'號</p></div>'
      +'<button class="primary" style="margin-top:14px;" onclick="jgRoomWolfbrotherIdAck('+night+')">我知道了</button>'};
  }
  // 第二夜起：狼兄若已陣亡、狼弟還沒完成覺醒復仇，狼弟要被迫殺一人；其餘情況（狼兄還
  // 活著，或狼弟已經覺醒過、正式加入狼窩了）這一步都沒事可做，顯示確認按鈕直接跳過。
  if(night>=2&&!elderAlive){
    const youngerSnap=await getDoc(doc(db2(),'rooms',jgRoomCode,'players',youngerUid));
    const alreadyJoined=youngerSnap.exists()&&youngerSnap.data().wolfbrotherJoinedPack;
    if(!alreadyJoined){
      if(window.jgFirebaseUid!==youngerUid){
        return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><div class="nicon">🌙</div><h1>夜晚進行中</h1>'
          +'<p class="sub" style="text-align:center;margin-top:8px;">請安靜閉眼等待，輪到你操作時畫面會自動出現</p></div>'};
      }
      return {needsTimer:true, html:jgRoomTimerHtml(20,'狼兄已經陣亡，你要覺醒復仇殺誰？（不可空刀）')
        +'<div class="nbanner" style="margin-top:20px;"><div class="nicon">😡</div><h1>狼弟覺醒：必須殺一人復仇</h1></div>'
        +jgRoomNumGridHtml('jg-room-wolfbrother-revenge-pick', null, [(jgRoomLatestPlayers.find(p=>p.uid===youngerUid)||{}).seatNum])
        +'<div style="text-align:center;"><button class="primary" style="margin-top:14px;" onclick="jgRoomWolfbrotherRevengeKillFromGrid('+night+')">確認</button></div>'};
    }
  }
  await jgRoomAdvanceToWolfOrBeyond('wolfbrother', night);
  return {needsTimer:false, html:''};
}
window.jgRoomWolfbrotherIdAck=async function(night){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{ wolfbrotherIdAckUids: arrayUnion(window.jgFirebaseUid) },{ merge:true });
  const { elderUid, youngerUid }=await jgRoomWolfbrotherIdentities();
  const freshSnap=await getDoc(doc(db,'rooms',jgRoomCode));
  const fresh=freshSnap.data()||{};
  const ackUids=fresh.wolfbrotherIdAckUids||[];
  if(elderUid&&youngerUid&&ackUids.includes(elderUid)&&ackUids.includes(youngerUid)&&!fresh.wolfbrotherIdRevealDone){
    await setDoc(doc(db,'rooms',jgRoomCode),{ wolfbrotherIdRevealDone:true },{ merge:true });
    await jgRoomAdvanceToWolfOrBeyond('wolfbrother', night);
  }
  await jgRoomRefreshAndRenderCurrent();
};
window.jgRoomWolfbrotherRevengeKillFromGrid=function(night){
  const hidden=document.getElementById('jg-room-wolfbrother-revenge-pick');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seatNum);
  if(!p) return;
  window.jgRoomWolfbrotherRevengeKill(p.uid, seatNum, night);
};
window.jgRoomWolfbrotherRevengeKill=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  const effective=jgRoomEffectiveTarget(rd,night,targetUid);
  await setDoc(doc(db,'rooms',jgRoomCode,'players',window.jgFirebaseUid),{ wolfbrotherJoinedPack:true },{ merge:true });
  await setDoc(doc(db,'rooms',jgRoomCode),{
    wolfKillNight:night, wolfKillTargetUid:effective, wolfKillTargetSeatNum:targetSeatNum
  },{ merge:true });
  await jgRoomAppendNightLog(night, '狼弟復仇刀 '+targetSeatNum);
  await jgRoomAfterKillDecided(night);
  await jgRoomRefreshAndRenderCurrent();
};
// 拿 Firestore db 實例的小工具，避免在同一段程式碼裡重複打 window.jgFirebaseDb。
function db2(){ return window.jgFirebaseDb; }

// ═══════════════════════════════════════════
// 黑市商人：狼隊出刀之後（避免跟狼刀同時進行時弄錯存活狀態）、女巫之前，整局限一次的
// 交易機會。選一名玩家＋選一項技能（預言家查驗／女巫毒藥／獵人獵槍）：對方是好人，交易
// 成功，對方變成「幸運兒」，從下一晚（查驗/毒藥）或下一個白天（獵槍）起可以使用；對方是
// 狼人，交易失敗，黑市商人自己死亡（結算在 jgRoomResolveNightDeaths，見 blackmarketFailUid）。
// 幸運兒的獵槍技能目前無法自動化（跟房間系統既有的「獵人開槍」限制一樣，請法官／房主用
// 本機工具手動處理），查驗／毒藥則會在之後對應的 seer／witch 步驟自動開放給幸運兒操作
// （見 jgRoomActiveLuckyOne／jgRoomMyActiveLuckyOneSkill）。
// ═══════════════════════════════════════════
async function jgRoomBlackmarketViewHtml(night){
  const rd=jgRoomLatestRoomDoc||{};
  if(jgRoomAmIFeared(rd,night)) return jgRoomFearedNoticeHtml();
  const me=jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid);
  if(me&&me.blackmarketUsed){
    await jgRoomAfterBlackmarketStep(night);
    return {needsTimer:false, html:''};
  }
  if(rd.blackmarketDoneNight===night){
    return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><div class="nicon">💰</div><h1>已行動</h1></div>'
      +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">請記住，等待其他人完成夜晚行動</div>'};
  }
  const pendingUid=rd.blackmarketPendingUid;
  if(pendingUid){
    const pendingSeat=rd.blackmarketPendingSeatNum;
    return {needsTimer:true, html:jgRoomTimerHtml(20,'要給對方哪一項技能？')
      +'<div class="nbanner" style="margin-top:20px;"><div class="nicon">💰</div><h1>已選 '+pendingSeat+'號，要給哪項技能？</h1></div>'
      +'<div style="text-align:center;margin-top:10px;">'
      +'<button onclick="jgRoomBlackmarketTrade(\'seer\','+night+')" style="margin:4px;">預言家查驗</button>'
      +'<button onclick="jgRoomBlackmarketTrade(\'witch\','+night+')" style="margin:4px;">女巫毒藥</button>'
      +'<button onclick="jgRoomBlackmarketTrade(\'hunter\','+night+')" style="margin:4px;">獵人獵槍</button>'
      +'</div>'
      +'<button style="margin-top:14px;" onclick="jgRoomBlackmarketModify()">重新選擇</button>'};
  }
  return {needsTimer:true, html:jgRoomTimerHtml(20,'今晚要交易嗎？')
    +'<div class="nbanner" style="margin-top:20px;"><div class="nicon">💰</div><h1>請選擇交易對象（整局限一次）</h1></div>'
    +jgRoomNumGridHtml('jg-room-blackmarket-pick', null, [(jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid)||{}).seatNum])
    +'<div style="text-align:center;"><button class="primary" style="margin-top:14px;" onclick="jgRoomBlackmarketPickTargetFromGrid('+night+')">確認</button></div>'
    +'<div style="text-align:center;"><button style="margin-top:8px;" onclick="jgRoomBlackmarketSkip('+night+')">今晚不交易，跳過</button></div>'};
}
window.jgRoomBlackmarketPickTargetFromGrid=function(night){
  const hidden=document.getElementById('jg-room-blackmarket-pick');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seatNum);
  if(!p) return;
  window.jgRoomBlackmarketPickTarget(p.uid, seatNum, night);
};
window.jgRoomBlackmarketPickTarget=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{
    blackmarketPendingUid:targetUid, blackmarketPendingSeatNum:targetSeatNum
  },{ merge:true });
  await jgRoomRefreshAndRenderCurrent();
};
window.jgRoomBlackmarketModify=async function(){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{ blackmarketPendingUid:null, blackmarketPendingSeatNum:null },{ merge:true });
  await jgRoomRefreshAndRenderCurrent();
};
window.jgRoomBlackmarketSkip=async function(night){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode,'players',window.jgFirebaseUid),{ blackmarketUsed:false },{ merge:true });
  await setDoc(doc(db,'rooms',jgRoomCode),{ blackmarketDoneNight:night },{ merge:true });
  await jgRoomAppendNightLog(night, '易 x');
  await jgRoomAfterBlackmarketStep(night);
  await jgRoomRefreshAndRenderCurrent();
};
window.jgRoomBlackmarketTrade=async function(skill, night){
  const rd=jgRoomLatestRoomDoc||{};
  const targetUid=rd.blackmarketPendingUid, targetSeatNum=rd.blackmarketPendingSeatNum;
  const skillLabel=skill==='seer'?'預言家查驗':(skill==='witch'?'女巫毒藥':'獵人獵槍');
  const db=window.jgFirebaseDb;
  const secretSnap=await getDoc(doc(db,'rooms',jgRoomCode,'secrets',targetUid));
  const role=secretSnap.exists()?secretSnap.data().role:'villager';
  const isWolf=(typeof WOLF_ROLES!=='undefined'&&WOLF_ROLES.includes(role));
  const skillAbbr={seer:'驗',witch:'毒',hunter:'獵'}[skill]||'';
  await setDoc(doc(db,'rooms',jgRoomCode,'players',window.jgFirebaseUid),{ blackmarketUsed:true },{ merge:true });
  if(isWolf){
    await setDoc(doc(db,'rooms',jgRoomCode),{
      blackmarketFailUid:window.jgFirebaseUid, blackmarketFailNight:night,
      blackmarketPendingUid:null, blackmarketPendingSeatNum:null, blackmarketDoneNight:night
    },{ merge:true });
  } else {
    await setDoc(doc(db,'rooms',jgRoomCode,'players',targetUid),{
      luckyOneSkill:skill, luckyOneGrantedNight:night
    },{ merge:true });
    await setDoc(doc(db,'rooms',jgRoomCode),{
      blackmarketPendingUid:null, blackmarketPendingSeatNum:null, blackmarketDoneNight:night
    },{ merge:true });
  }
  await jgRoomAppendNightLog(night, '易 '+targetSeatNum+(skillAbbr?'('+skillAbbr+')':''));
  await jgRoomAfterBlackmarketStep(night);
  await jgRoomRefreshAndRenderCurrent();
};

// ═══════════════════════════════════════════
// 幸運兒（黑市商人交易來的）拿到「女巫毒藥」技能：只有毒藥、沒有解藥，整局限一次——跟
// jgRoomWitchViewHtml 幾乎一樣，但拿掉救人那一半，且直接沿用 jgRoomWitchFinish／
// witchActs（用自己的 uid 存，不會跟真正的女巫互相干擾）。
// ═══════════════════════════════════════════
async function jgRoomLuckyOneWitchViewHtml(night){
  const rd=jgRoomLatestRoomDoc||{};
  if(jgRoomAmIFeared(rd,night)) return jgRoomFearedNoticeHtml();
  const db=window.jgFirebaseDb;
  const actSnap=await getDoc(doc(db,'rooms',jgRoomCode,'witchActs',window.jgFirebaseUid));
  if(actSnap.exists()&&actSnap.data().night===night){
    const d=actSnap.data();
    return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><div class="nicon">☠️</div><h1>已行動</h1>'
      +'<p class="sub" style="text-align:center;margin-top:8px;">'+(d.poisonedSeatNum?('毒了 '+d.poisonedSeatNum+'號'):'這晚沒有使用毒藥')+'</p></div>'
      +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">請記住，等待其他人完成夜晚行動</div>'};
  }
  return {needsTimer:true, html:jgRoomTimerHtml(20,'你要使用毒藥嗎？')
    +'<div class="nbanner" style="margin-top:20px;"><div class="nicon">☠️</div><h1>你是幸運兒：使用毒藥（整局限一次）</h1></div>'
    +jgRoomNumGridHtml('jg-room-luckyonewitch-pick', null)
    +'<div style="text-align:center;"><button class="primary" style="margin-top:10px;" onclick="jgRoomLuckyOneWitchPoisonFromGrid('+night+')">下毒</button></div>'
    +'<div style="text-align:center;"><button style="margin-top:8px;" onclick="jgRoomLuckyOneWitchSkip('+night+')">今晚不用，跳過</button></div>'};
}
window.jgRoomLuckyOneWitchPoisonFromGrid=function(night){
  const hidden=document.getElementById('jg-room-luckyonewitch-pick');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seatNum);
  if(!p) return;
  window.jgRoomLuckyOneWitchPoison(p.uid, seatNum, night);
};
window.jgRoomLuckyOneWitchPoison=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  const effective=jgRoomEffectiveTarget(rd,night,targetUid);
  await setDoc(doc(db,'rooms',jgRoomCode),{ witchPoisonUid:effective },{ merge:true });
  await setDoc(doc(db,'rooms',jgRoomCode,'players',window.jgFirebaseUid),{ luckyOneWitchUsed:true },{ merge:true });
  await jgRoomAppendNightLog(night, '幸毒 '+targetSeatNum);
  await jgRoomWitchFinish(night, false, targetSeatNum);
};
window.jgRoomLuckyOneWitchSkip=async function(night){
  await jgRoomAppendNightLog(night, '幸毒 x');
  await jgRoomWitchFinish(night, false, null);
};

// ═══════════════════════════════════════════
// 夜槍：獵人、黑狼王、持有獵槍技能的幸運兒，被狼刀（含機械狼學到狼人/黑狼王的額外一刀）
// 淘汰時，可以開槍帶走一名玩家（留空不帶）——女巫毒殺、黑市商人交易失敗、攝夢人夢遊被動
// 連死、邱比特殉情這些死法都不算，見 jgRoomCheckShootEligible／jgRoomResolveNightDeaths
// 的說明。有資格的名單存在房間文件的 pendingShootUids（陣列，理論上大多數情況只有一人，
// 但同一晚機械狼額外一刀跟正常狼刀分別命中兩個都有開槍資格的人時，可能同時有兩人待決定），
// 每個人決定完（開槍或跳過）就從陣列移除，陣列清空後才會真的往下一步走。
// ═══════════════════════════════════════════
async function jgRoomShootViewHtml(night){
  const myUid=window.jgFirebaseUid;
  return {needsTimer:true, html:jgRoomTimerHtml(20,'你被淘汰了，要開槍帶走一名玩家嗎？')
    +'<div class="nbanner" style="margin-top:20px;"><div class="nicon">🔫</div><h1>你被淘汰了，可以開槍帶走一人</h1></div>'
    +jgRoomNumGridHtml('jg-room-shoot-pick', null, [(jgRoomLatestPlayers.find(p=>p.uid===myUid)||{}).seatNum])
    +'<div style="text-align:center;"><button class="primary" style="margin-top:14px;" onclick="jgRoomShootActFromGrid('+night+')">開槍</button></div>'
    +'<div style="text-align:center;"><button style="margin-top:8px;" onclick="jgRoomShootSkip('+night+')">不開槍</button></div>'};
}
window.jgRoomShootActFromGrid=function(night){
  const hidden=document.getElementById('jg-room-shoot-pick');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seatNum);
  if(!p) return;
  window.jgRoomShootAct(p.uid, seatNum, night);
};
window.jgRoomShootAct=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  const me=jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid);
  const mySeat=me?me.seatNum:'?';
  const secretSnap=await getDoc(doc(db,'rooms',jgRoomCode,'secrets',window.jgFirebaseUid));
  const myRole=secretSnap.exists()?secretSnap.data().role:null;
  const abbr=myRole==='wolfking'?'王':(myRole==='hunter'?'獵':'幸獵');
  // 攝夢人的夢遊者一樣免疫夜槍（見 ALL_ROLES.dreamcatcher：「不會死於攝夢人以外的夜間
  // 技能(狼刀、巫毒、夜槍)」）——槍還是算開出去了（技能用掉），只是這一槍沒有打死人。
  const isDreaming=rd.dreamcatcherTargetNight===night&&rd.dreamcatcherTargetUid===targetUid;
  let note;
  if(!isDreaming){
    await setDoc(doc(db,'rooms',jgRoomCode,'players',targetUid),{ alive:false },{ merge:true });
    await jgRoomApplyCupidCascade();
    note='（'+mySeat+abbr+'帶'+targetSeatNum+'）';
  } else {
    note='（'+mySeat+abbr+'帶'+targetSeatNum+'，被夢遊免疫擋下）';
  }
  if(rd.pendingShootContext==='day') await jgRoomSetDayVoteShotNote(night, note);
  else await jgRoomAppendShotNoteToDayLog(night, note);
  await jgRoomShootResolve(night);
};
window.jgRoomShootSkip=async function(night){
  await jgRoomShootResolve(night);
};
async function jgRoomShootResolve(night){
  const db=window.jgFirebaseDb;
  const { arrayRemove } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js");
  await setDoc(doc(db,'rooms',jgRoomCode),{ pendingShootUids: arrayRemove(window.jgFirebaseUid) },{ merge:true });
  const freshSnap=await getDoc(doc(db,'rooms',jgRoomCode));
  const fresh=freshSnap.data()||{};
  if(!(fresh.pendingShootUids||[]).length){
    // 夜裡被狼刀淘汰觸發的夜槍，決定完接回原本的夜晚流程（查驗類角色／警長競選，那條路徑
    // 已經內建警徽檢查了，見 jgRoomAdvanceToCheckOrSheriff）；白天被投票放逐觸發的槍，決定
    // 完除了要檢查警長是不是也被這一槍帶走（jgRoomCheckAndSetPendingBadge），沒有的話才
    // 真的進入下一夜。
    if(fresh.pendingShootContext==='day'){
      if(!(await jgRoomCheckAndSetPendingBadge())){
        await jgRoomStartNextNight();
      }
    } else {
      await jgRoomAdvanceToCheckOrSheriff();
    }
  }
  // 用 jgRoomRenderCurrentPhase() 而不是直接呼叫 jgRoomRenderNightShell()：白天投票放逐
  // 觸發的槍，這個當下 phase 還是 'day-open'（見 jgRoomRenderDayOpen 開頭的槍決判斷），
  // 要交給總機判斷現在真正該顯示哪個畫面，不能寫死成夜晚畫面。
  jgRoomRenderCurrentPhase();
}

window.jgRoomLeave=function(){
  jgRoomStopTimer();
  jgRoomRemoveMyIdentityButton();
  if(jgRoomUnsubPlayers){ jgRoomUnsubPlayers(); jgRoomUnsubPlayers=null; }
  if(jgRoomUnsubMyRole){ jgRoomUnsubMyRole(); jgRoomUnsubMyRole=null; }
  if(jgRoomUnsubRoom){ jgRoomUnsubRoom(); jgRoomUnsubRoom=null; }
  if(jgRoomUnsubVotes){ jgRoomUnsubVotes(); jgRoomUnsubVotes=null; }
  if(jgRoomUnsubDealMyRole){ jgRoomUnsubDealMyRole(); jgRoomUnsubDealMyRole=null; }
  jgRoomCode=null; jgRoomComp=null; jgRoomTotal=null; jgRoomIsHost=false;
  jgMyRole=null; jgMySeatNum=null; jgRoomLatestPlayers=[]; jgRoomLatestRoomDoc=null;
  jgRoomLatestVotes=[]; jgRoomGodViewOn=false;
  try{ localStorage.removeItem('jgLastRoomCode'); }catch(e){}
  jgRoomRenderEntry();
};

// ── 從「法官助手」設定畫面帶著已確認的板子設定過來：直接跳到「輸入全名、建立房間」，
//    不用再走一次選板子（板子已經在那邊選好、驗證過人數對得上了）。──
window.jgRoomRenderCreateWithComp=function(comp, total){
  const root=document.getElementById('jg-room-content');
  if(!root) return;
  window.jgRoomPendingComp={comp:comp, total:total};
  const parts=Object.entries(comp).filter(([,v])=>v>0)
    .map(([k,v])=>((typeof RNAME!=='undefined'&&RNAME[k])||k)+'×'+v).join('、');
  // 如果法官助手設定畫面裡已經幫幾個座位填過真名（不是「X號」這種預設佔位名稱），順便問
  // 房主要不要直接沿用這份名單——沿用的話，加入房間的人會看到「這是不是你」的座位清單用
  // 點的，不用再自己打一次全名（跟發牌房本來就有的體驗一致，只是這裡是一般連線房間）。
  const hasPresetNames=typeof jgPlayerNames!=='undefined'&&Object.keys(jgPlayerNames||{}).some(k=>jgPlayerNames[k]&&jgPlayerNames[k]!==(k+'號'));
  root.innerHTML=`
    <div class="nbanner">
      <div class="nicon">🎮</div>
      <h1>建立連線房間</h1>
    </div>
    <div class="info" style="font-size:13px;margin-top:10px;">板子設定：${total} 人局，${parts}</div>
    <div class="card" style="margin-top:14px;">
      <label>你的全名（房主）</label>
      <input type="text" id="jg-room-name-create" placeholder="輸入你的全名">
      ${hasPresetNames?'<label style="margin-top:10px;display:flex;align-items:center;gap:8px;"><input type="checkbox" id="jg-room-use-preset-names" checked style="width:auto;"> 沿用法官助手裡已經填好的座位姓名（其他人加入時用點選的，不用自己打名字）</label>':''}
      <button class="primary" style="margin-top:10px;" onclick="jgRoomCreate(document.getElementById('jg-room-name-create').value, window.jgRoomPendingComp.comp, window.jgRoomPendingComp.total, ${hasPresetNames?'document.getElementById(\'jg-room-use-preset-names\').checked':'false'})">建立房間</button>
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
    jgRoomRenderCreateWithComp(window.jgRoomPendingComp.comp, window.jgRoomPendingComp.total);
    return;
  }
  root.innerHTML='<div class="info" style="text-align:center;margin-top:20px;">連線中...</div>';
  const reconnected=await jgRoomTryAutoReconnect();
  if(reconnected) return;
  root.innerHTML=`
    <div class="nbanner">
      <div class="nicon">🎮</div>
      <h1>連線房間</h1>
      <p class="sub" style="text-align:center;margin-top:6px;">多支手機同時加入同一場，各自的手機只看得到自己的身分</p>
    </div>
    <div class="card" style="margin-top:14px;">
      <div class="info" style="font-size:13px;">要建立新房間的話，請先到「法官の助手」分頁設定好人數跟板子，設定完會有「建立連線房間」的按鈕。</div>
      <button class="primary" style="margin-top:10px;" onclick="switchTab('t-judge')">前往設定板子 →</button>
    </div>
    <div class="card" style="margin-top:14px;">
      <label>房號</label>
      <input type="text" id="jg-room-code-join" placeholder="輸入房號" inputmode="numeric">
      <button class="primary" style="margin-top:10px;" onclick="jgRoomCheckCodeThenJoin(document.getElementById('jg-room-code-join').value)">加入房間</button>
    </div>
    <div class="info" style="font-size:12px;margin-top:10px;">
      <div>目前進度：</div>
      <ul style="margin:6px 0 6px 18px;padding:0;">
        <li>📱 手機發牌：全部板子都可用（只負責把身分發到手機上，之後交給法官用本機工具主持）。</li>
        <li>🌐 連線房間全自動（含夜晚技能結算、白天警長競選／放逐投票／PK、被淘汰後的獵人/黑狼王/幸運兒開槍、上帝視角票型紀錄）：僅限機械狼＋通靈師、攝夢人＋夢魘、魔術師＋黑/白狼王、黑市商人＋狼兄狼弟、邱比特這五個板子，其餘板子請改用手機發牌＋本機主持；就算是這五個板子，連線房間目前也還不會自動判定勝負，要由法官／房主自己看場上情況宣布。</li>
      </ul>
      <div>⚠️ 以上功能都還沒經過完整實機測試，可能會有 bug，歡迎回報問題。</div>
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
