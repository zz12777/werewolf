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
  if(!confirm('確定你是 '+seatNum+'號 '+seatName+' 嗎？')) return;
  const uid=await jgRoomWaitAuth();
  const db=window.jgFirebaseDb;
  const existing=jgRoomLatestPlayers.find(p=>p.seatNum===seatNum);
  if(existing&&existing.uid!==uid){ alert('這個座位已經有人認領了，請確認座位號碼是否正確。'); return; }
  await setDoc(doc(db,'rooms',jgRoomCode,'players',uid),{
    name:seatName, seatNum:seatNum, joinedAt:serverTimestamp(), alive:true
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
  const rows=seats.sort((a,b)=>a.num-b.num).map(s=>{
    const taken=claimedBySeat[s.num];
    const isMine=taken&&taken.uid===myUid;
    if(taken){
      return '<div class="row"><div class="av av-vil">'+s.num+'</div><div class="nm">'+s.name+'</div>'
        +'<span class="badge '+(isMine?'bv':'bw')+'">'+(isMine?'你':'已認領')+'</span></div>';
    }
    return '<div class="row" style="cursor:pointer;" onclick="jgRoomDealClaimSeat('+s.num+',\''+s.name+'\')"><div class="av av-vil">'+s.num+'</div><div class="nm">'+s.name+'</div>'
      +'<span class="badge">點我認領</span></div>';
  }).join('');
  const hostBtn=jgRoomIsHost
    ?'<button class="primary" style="margin-top:14px;" onclick="jgRoomDealAssignRoles()">🎴 分配身分（'+jgRoomLatestPlayers.length+' / '+seats.length+' 人）</button>'
    :'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">'+(myClaimed?'已認領座位，等待房主分配身分...':'請從下面點選你的座位')+'</div>';
  root.innerHTML=`
    <div class="nbanner"><div class="nicon">🎴</div><h1>房間 ${jgRoomCode}（發牌）</h1>
      <p class="sub" style="text-align:center;margin-top:6px;">請從下面找到你的座位號碼，點下去認領</p></div>
    <div class="card" style="margin-top:14px;">${rows}</div>
    ${hostBtn}
    <button class="ghost" style="margin-top:14px;" onclick="jgRoomLeave()">離開房間</button>
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
      <button class="ghost" onclick="jgRoomLeave()">離開房間</button>
    `;
  });
}
// 粗略猜一個角色對應的 emoji（沒有的話用預設 🎴）——之後如果角色介紹資料裡本來就有
// icon 欄位可以直接抓來用，這裡先用簡單對照表，涵蓋目前先做的四個板子＋常見角色。
function jgRoomRoleIconGuess(role){
  const map={wolf:'🐺',wolfking:'👑',whitewolf:'🤍',wolfbeauty:'💋',evilknight:'🖤',gargoyle:'🗿',
    bloodmoon:'🌑',mechanicalwolf:'🤖',bigmechwolf:'🤖',smallmechwolf:'🤖',nightmare:'😱',
    wolfbrother_e:'👬',wolfbrother_y:'👬',wolfshaman:'🔮',mask:'🎭',bigbadwolf:'🐺',
    villager:'🧑‍🌾',seer:'🔮',witch:'🧪',hunter:'🏹',guard:'🛡️',dreamcatcher:'😴',
    knight:'⚔️',magician:'🪄',demonhunter:'🗡️',gravkeeper:'⚰️',medium:'👁️',blackmarket:'🕴️',
    purewhitemaiden:'🕊️',dancer:'💃',littlegirl:'👧',hybrid:'🧬',cupid:'💘',fool:'🃏'};
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
      <button class="primary" style="margin-top:10px;" onclick="jgRoomDealCreate(document.getElementById('jg-room-deal-name').value, window.jgRoomPendingDeal.comp, window.jgRoomPendingDeal.total, window.jgRoomPendingDeal.presetNames)">🎴 建立發牌房</button>
    </div>
    <button class="ghost" style="margin-top:10px;" onclick="switchTab('t-judge')">← 回去重新調整板子</button>
  `;
};


// comp/total 是「已經在法官助手設定畫面確認過」的板子配置——房間建立時就把這份配置存進
// 房間文件，之後「隨機分配身分」要照這份配置洗牌，而不是憑加入人數臨時套用預設板子。
window.jgRoomCreate=async function(hostName, comp, total){
  const name=(hostName||'').trim();
  if(!name){ alert('請先輸入你的全名'); return; }
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
  await setDoc(doc(db,'rooms',code),{
    hostUid:uid, status:'lobby', createdAt:serverTimestamp(), comp:comp, total:total
  });
  await setDoc(doc(db,'rooms',code,'players',uid),{
    name:name, seatNum:1, joinedAt:serverTimestamp(), alive:true
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
  const seatNum=existing?existing.data().seatNum:(playersSnap.size+1);
  await setDoc(doc(db,'rooms',code,'players',uid),{
    name:nm, seatNum:seatNum, joinedAt:serverTimestamp(), alive:true
  });
  jgRoomIsHost=(roomSnap.data().hostUid===uid);
  try{ localStorage.setItem('jgLastRoomCode', code); }catch(e){}
  jgRoomEnterLobby(code);
};

// ── 進入房間等待畫面，開始監聽玩家名單 + 房間本身的狀態（phase/currentStep）──
async function jgRoomEnterLobby(code){
  jgRoomCode=code;
  const db=window.jgFirebaseDb;
  const roomSnap=await getDoc(doc(db,'rooms',code));
  if(roomSnap.exists()){
    jgRoomComp=roomSnap.data().comp||null;
    jgRoomTotal=roomSnap.data().total||null;
  }
  if(jgRoomUnsubPlayers) jgRoomUnsubPlayers();
  const q=query(collection(db,'rooms',code,'players'), orderBy('seatNum'));
  jgRoomUnsubPlayers=onSnapshot(q,(snap)=>{
    jgRoomLatestPlayers=snap.docs.map(d=>({uid:d.id, ...d.data()}));
    jgRoomRenderCurrentPhase();
  });
  if(jgRoomUnsubRoom) jgRoomUnsubRoom();
  jgRoomUnsubRoom=onSnapshot(doc(db,'rooms',code),(snap)=>{
    jgRoomLatestRoomDoc=snap.exists()?snap.data():null;
    jgRoomRenderCurrentPhase();
  });
  if(jgRoomUnsubVotes) jgRoomUnsubVotes();
  jgRoomUnsubVotes=onSnapshot(collection(db,'rooms',code,'votes'),(snap)=>{
    jgRoomLatestVotes=snap.docs.map(d=>({uid:d.id, ...d.data()}));
    jgRoomRenderCurrentPhase();
  });
  jgRoomWatchMyRole();
}
// 依照房間目前的 phase，決定要顯示大廳畫面、警長競選、投票，還是夜晚操作畫面——投票是
// 最高優先（不管現在是警長競選還是白天放逐，只要 votingActive 就先顯示投票畫面）；
// 上帝視角則是「死亡玩家自己選擇要不要看」，優先度比投票還高（一旦切換進去，不管房間
// 現在進行到哪一步都維持顯示上帝視角，直到玩家自己按退出）。
function jgRoomRenderCurrentPhase(){
  // 「連線房間發牌」是完全獨立的一套簡化流程（只負責發牌，不走警長/投票/夜晚自動化那些），
  // 用房間文件的 mode==='deal' 判斷要不要整個改走這條路，不跟其餘畫面的邏輯混在一起。
  if(jgRoomLatestRoomDoc&&jgRoomLatestRoomDoc.mode==='deal'){
    jgRoomRenderDealPhase();
    return;
  }
  if(jgRoomGodViewOn){
    jgRoomRenderGodView();
    return;
  }
  if(jgRoomLatestRoomDoc&&jgRoomLatestRoomDoc.votingActive){
    jgRoomRenderVoting();
  } else {
    const phase=jgRoomLatestRoomDoc&&jgRoomLatestRoomDoc.phase;
    if(phase==='sheriff'){
      jgRoomRenderSheriffCampaign();
    } else if(phase==='day-open'){
      jgRoomRenderDayOpen();
    } else if(phase==='night'){
      jgRoomRenderNightShell();
    } else {
      jgRoomRenderShell();
      jgRoomRenderLobby(jgRoomLatestPlayers);
    }
  }
  jgRoomAppendGodViewToggle();
}
// 死亡玩家的畫面最下面補一個「進入上帝視角」按鈕——不管現在房間進行到哪個畫面都會出現
// （只要玩家自己的 alive 是 false），活著的玩家完全看不到這個按鈕。
function jgRoomAppendGodViewToggle(){
  const root=document.getElementById('jg-room-content');
  if(!root) return;
  const me=jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid);
  if(me&&me.alive===false){
    root.insertAdjacentHTML('beforeend','<button style="margin-top:20px;" onclick="jgRoomToggleGodView()">👁️ 進入上帝視角</button>');
  }
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

// ── 房主開始遊戲：進入第一夜。順序是「守衛（若板子有）→ 狼隊出刀 → 女巫（若板子有）→
//    查驗類角色（預言家/通靈師擇一，若板子有）→ 自動接警長競選」。守衛要在狼隊出刀之前
//    先盲守（不知道狼隊會殺誰），女巫則要在狼隊出刀之後才會知道目標，才能決定要不要救。──
window.jgRoomStartNight=async function(){
  if(!jgRoomCode) return;
  const db=window.jgFirebaseDb;
  const firstStep=(jgRoomComp&&jgRoomComp.guard>0)?'guard':'wolf';
  await setDoc(doc(db,'rooms',jgRoomCode),{ phase:'night', night:1, currentStep:firstStep },{ merge:true });
};
// 這一晚查驗階段該輪到誰——板子裡有預言家就輪預言家，沒有的話看有沒有通靈師，兩個都
// 沒有就代表這一晚沒有查驗類角色可以示範，直接留空。
function jgRoomNextCheckStep(){
  if(jgRoomComp&&jgRoomComp.seer>0) return 'seer';
  if(jgRoomComp&&jgRoomComp.medium>0) return 'medium';
  return null;
}
async function jgRoomAdvanceToSheriffCampaign(){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{
    currentStep:null, phase:'sheriff', sheriffPhase:'joining', sheriffCandidates:[], sheriffEverCandidates:[],
    sheriffJoinDeadline: Date.now()+10000
  },{ merge:true });
}
// 查驗類角色結束後（或本來就沒有）要接警長競選，狼刀/女巫結束後則要接查驗類角色（或沒有
// 查驗類角色時直接接警長競選）——共用這個判斷，避免每個地方都要重複寫一次 if/else。
async function jgRoomAdvanceToCheckOrSheriff(){
  const checkStep=jgRoomNextCheckStep();
  if(checkStep){
    const db=window.jgFirebaseDb;
    await setDoc(doc(db,'rooms',jgRoomCode),{ currentStep:checkStep },{ merge:true });
  } else {
    await jgRoomAdvanceToSheriffCampaign();
  }
}
// 狼刀死亡結算：只在「女巫回合結束後」（或板子沒有女巫、狼隊確認完就直接算）呼叫一次。
// 規則：守衛跟女巫的解藥都保到同一個人＝奶穿，還是會死；只有其中一種保護才會活下來；
// 女巫的毒不受任何保護影響，中毒必死（跟法官助手既有的規則一致）。
async function jgRoomResolveNightDeaths(){
  const db=window.jgFirebaseDb;
  const freshSnap=await getDoc(doc(db,'rooms',jgRoomCode));
  const fresh=freshSnap.data()||{};
  const wolfTarget=fresh.wolfKillTargetUid;
  if(wolfTarget){
    const guardedThis=fresh.guardProtectedUid&&fresh.guardProtectedUid===wolfTarget;
    const savedThis=fresh.witchSavedUid&&fresh.witchSavedUid===wolfTarget;
    const overheal=guardedThis&&savedThis;
    if(overheal||(!guardedThis&&!savedThis)){
      await setDoc(doc(db,'rooms',jgRoomCode,'players',wolfTarget),{ alive:false },{ merge:true });
    }
  }
  if(fresh.witchPoisonUid){
    await setDoc(doc(db,'rooms',jgRoomCode,'players',fresh.witchPoisonUid),{ alive:false },{ merge:true });
  }
}

// ── 守衛：狼隊出刀之前先盲守（不知道狼隊會殺誰），保護對象免疫當晚狼刀——除非女巫也
//    同時救了同一個人（奶穿，還是會死）。不能連續兩晚守同一人，這個限制要跨夜記住，
//    存在守衛自己的 players/{uid}.lastGuardTargetUid 上，不會因為換到下一夜就重置。──
async function jgRoomGuardViewHtml(night){
  const rd=jgRoomLatestRoomDoc||{};
  if(rd.guardTargetNight===night&&rd.guardProtectedSeatNum!=null){
    return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><div class="nicon">🛡️</div><h1>已選擇守護</h1>'
      +'<p class="sub" style="text-align:center;margin-top:8px;font-size:20px;font-weight:800;">'+rd.guardProtectedSeatNum+'號</p></div>'
      +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">請記住，等待其他人完成夜晚行動</div>'};
  }
  const me=jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid);
  const lastTarget=me?me.lastGuardTargetUid:null;
  const buttons=jgRoomLatestPlayers.filter(p=>p.uid!==lastTarget).map(p=>
    '<button onclick="jgRoomConfirmCheck(\'guard\',\''+p.uid+'\','+p.seatNum+','+night+')" style="margin:4px;width:auto;display:inline-block;padding:10px 16px;">'+p.seatNum+'號 '+p.name+'</button>'
  ).join('');
  return {needsTimer:true, html:jgRoomTimerHtml(30,'你要守護的對象是？')
    +'<div class="nbanner" style="margin-top:20px;"><div class="nicon">🛡️</div><h1>請選擇守護對象</h1></div>'
    +(lastTarget?'<div class="info" style="font-size:12px;text-align:center;">不能連續兩晚守護同一人，上一晚守護的對象已排除</div>':'')
    +'<div style="text-align:center;margin-top:10px;">'+buttons+'</div>'};
}
window.jgRoomGuardAct=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{
    guardTargetNight:night, guardProtectedUid:targetUid, guardProtectedSeatNum:targetSeatNum
  },{ merge:true });
  await setDoc(doc(db,'rooms',jgRoomCode,'players',window.jgFirebaseUid),{ lastGuardTargetUid:targetUid },{ merge:true });
  await setDoc(doc(db,'rooms',jgRoomCode),{ currentStep:'wolf' },{ merge:true });
  jgRoomRenderNightShell();
};

// ── 女巫：狼隊確認出刀之後才輪到女巫，她會看到狼隊今晚殺了誰，可以選擇用解藥救（自己
//    被殺不能自救）、用毒藥毒任何一人，或都不用；解藥/毒藥各自整局限一次，這個限制要
//    跨夜記住，存在女巫自己的 players/{uid}.witchSaveUsed／witchPoisonUsed 上。這一版
//    簡化成「一晚只能選一種行動」（救、毒、跳過三選一），不支援同一晚又救又毒。──
async function jgRoomWitchViewHtml(night){
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
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
  let html=jgRoomTimerHtml(30,'你要使用解藥或毒藥嗎？')
    +'<div class="nbanner" style="margin-top:20px;"><div class="nicon">🧪</div><h1>狼隊今晚殺了 '+(wolfTargetSeatNum||'（無人）')+'號</h1></div>';
  if(canSaveThis){
    html+='<button class="primary" style="margin-top:10px;width:auto;display:inline-block;padding:10px 16px;" onclick="jgRoomWitchSave('+wolfTargetSeatNum+','+night+')">💊 使用解藥救 '+wolfTargetSeatNum+'號</button>';
  } else if(wolfTargetUid&&saveUsed){
    html+='<div class="info" style="font-size:12px;margin-top:10px;">解藥已經用過了</div>';
  } else if(wolfTargetUid&&wolfTargetUid===window.jgFirebaseUid){
    html+='<div class="info" style="font-size:12px;margin-top:10px;">被殺的是你自己，不能自救</div>';
  }
  if(!poisonUsed){
    const others=jgRoomLatestPlayers.filter(p=>p.uid!==window.jgFirebaseUid);
    const buttons=others.map(p=>
      '<button onclick="jgRoomWitchPoison(\''+p.uid+'\','+p.seatNum+','+night+')" style="margin:4px;width:auto;display:inline-block;padding:8px 14px;">'+p.seatNum+'號 '+p.name+'</button>'
    ).join('');
    html+='<div class="section-title" style="margin-top:16px;">☠️ 使用毒藥</div><div style="text-align:center;">'+buttons+'</div>';
  } else {
    html+='<div class="info" style="font-size:12px;margin-top:10px;">毒藥已經用過了</div>';
  }
  html+='<button style="margin-top:14px;" onclick="jgRoomWitchSkip('+night+')">都不用，跳過</button>';
  return {needsTimer:true, html:html};
}
window.jgRoomWitchSave=async function(targetSeatNum, night){
  if(!confirm('確定要救 '+targetSeatNum+'號 嗎？')) return;
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  await setDoc(doc(db,'rooms',jgRoomCode),{ witchSavedUid: rd.wolfKillTargetUid },{ merge:true });
  await setDoc(doc(db,'rooms',jgRoomCode,'players',window.jgFirebaseUid),{ witchSaveUsed:true },{ merge:true });
  await jgRoomWitchFinish(night, true, null);
};
window.jgRoomWitchPoison=async function(targetUid, targetSeatNum, night){
  if(!confirm('確定要毒 '+targetSeatNum+'號 嗎？')) return;
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{ witchPoisonUid: targetUid },{ merge:true });
  await setDoc(doc(db,'rooms',jgRoomCode,'players',window.jgFirebaseUid),{ witchPoisonUsed:true },{ merge:true });
  await jgRoomWitchFinish(night, false, targetSeatNum);
};
window.jgRoomWitchSkip=async function(night){
  await jgRoomWitchFinish(night, false, null);
};
async function jgRoomWitchFinish(night, saved, poisonedSeatNum){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode,'witchActs',window.jgFirebaseUid),{
    night:night, saved:saved, poisonedSeatNum:poisonedSeatNum
  });
  await jgRoomResolveNightDeaths();
  await jgRoomAdvanceToCheckOrSheriff();
  jgRoomRenderNightShell();
}


// 場上存活的狼隊 uid 清單（含自己）——用來算「全員確認」需要幾票。secrets 全房可讀，
// 房間人數又小，這裡直接整個抓下來、用 WOLF_ROLES 判斷即可，不用另外維護一份陣營索引。
async function jgRoomGetWolfUids(){
  const db=window.jgFirebaseDb;
  const { getDocs } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js");
  const secretsSnap=await getDocs(collection(db,'rooms',jgRoomCode,'secrets'));
  return secretsSnap.docs.filter(d=>typeof WOLF_ROLES!=='undefined'&&WOLF_ROLES.includes(d.data().role)).map(d=>d.id);
}

// ── 狼隊出刀畫面：狼隊必須全員同意同一個目標，才會真的定案。任何一位隊友先提議一個
//    號碼（跳確認視窗，比照查驗類角色），其餘隊友的畫面會即時同步看到「今晚要殺X號」，
//    各自按「確認」表態；任何人都可以按「修改」，會清空目前的提議跟所有人的確認狀態，
//    重新回到選人畫面——藉此確保狼刀是全員同意的結果，不是單一個人說了算。──
async function jgRoomWolfViewHtml(night){
  const wolfUids=await jgRoomGetWolfUids();
  const wolfCount=wolfUids.length;
  const rd=jgRoomLatestRoomDoc||{};
  if(rd.wolfKillNight===night&&rd.wolfKillTargetSeatNum!=null){
    const confirmedBy=rd.wolfKillConfirmedBy||[];
    const iConfirmed=confirmedBy.includes(window.jgFirebaseUid);
    return {needsTimer:true, html: jgRoomTimerHtml(30,'今晚要殺的對象是？')
      +'<div class="nbanner" style="margin-top:20px;"><div class="nicon">🐺</div><h1>今晚要殺 '+rd.wolfKillTargetSeatNum+'號</h1>'
      +'<p class="sub" style="text-align:center;margin-top:8px;">已確認 '+confirmedBy.length+' / '+wolfCount+' 人</p></div>'
      +'<div style="text-align:center;margin-top:10px;">'
      +(iConfirmed?'<div class="info" style="font-size:12px;">你已經確認了，等待其他隊友</div>':'<button class="primary" onclick="jgRoomWolfConfirm()" style="width:auto;display:inline-block;padding:10px 20px;">✅ 確認</button>')
      +'<button onclick="jgRoomWolfModify()" style="margin-left:8px;width:auto;display:inline-block;padding:10px 20px;">✏️ 修改</button>'
      +'</div>'};
  }
  const others=jgRoomLatestPlayers.filter(p=>!wolfUids.includes(p.uid));
  const buttons=others.map(p=>
    '<button onclick="jgRoomWolfPropose(\''+p.uid+'\','+p.seatNum+','+night+')" style="margin:4px;width:auto;display:inline-block;padding:10px 16px;">'+p.seatNum+'號 '+p.name+'</button>'
  ).join('');
  return {needsTimer:true, html: jgRoomTimerHtml(30,'今晚要殺的對象是？')
    +'<div class="nbanner" style="margin-top:20px;"><div class="nicon">🐺</div><h1>請選擇今晚要殺的對象</h1></div>'
    +'<div style="text-align:center;margin-top:10px;">'+buttons+'</div>'};
}
window.jgRoomWolfPropose=async function(targetUid, targetSeatNum, night){
  if(!confirm('確定要殺 '+targetSeatNum+'號 嗎？')) return;
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{
    wolfKillNight:night, wolfKillTargetUid:targetUid, wolfKillTargetSeatNum:targetSeatNum,
    wolfKillProposedBy:window.jgFirebaseUid, wolfKillConfirmedBy:[window.jgFirebaseUid]
  },{ merge:true });
};
window.jgRoomWolfModify=async function(){
  if(!confirm('確定要修改嗎？會清空所有人的確認。')) return;
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{
    wolfKillNight:null, wolfKillTargetUid:null, wolfKillTargetSeatNum:null,
    wolfKillProposedBy:null, wolfKillConfirmedBy:[]
  },{ merge:true });
};
// 用 arrayUnion 而不是「先讀陣列、自己加一個、再整份寫回去」，是為了避免兩位隊友幾乎
// 同時按確認時，其中一人的確認被另一人的寫入覆蓋掉、憑空少一票的競態問題。
window.jgRoomWolfConfirm=async function(){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{
    wolfKillConfirmedBy: arrayUnion(window.jgFirebaseUid)
  },{ merge:true });
  // 讀回最新狀態確認是不是全員到齊了——可能好幾位隊友幾乎同時都判斷「到齊了」，導致
  // currentStep／死亡狀態被重複寫入同一個值，這是無害的，不影響結果。
  const freshSnap=await getDoc(doc(db,'rooms',jgRoomCode));
  const fresh=freshSnap.data()||{};
  const wolfUids=await jgRoomGetWolfUids();
  const confirmedBy=fresh.wolfKillConfirmedBy||[];
  if(confirmedBy.length>=wolfUids.length&&fresh.wolfKillTargetUid){
    const hasWitch=jgRoomComp&&jgRoomComp.witch>0;
    if(hasWitch){
      // 板子有女巫：先不結算死亡，等女巫決定要不要救／毒之後再一起結算
      await setDoc(doc(db,'rooms',jgRoomCode),{ currentStep:'witch' },{ merge:true });
    } else {
      await jgRoomResolveNightDeaths();
      await jgRoomAdvanceToCheckOrSheriff();
    }
  }
};

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
  root.innerHTML=`
    <div class="nbanner">
      <div class="nicon">🎮</div>
      <h1>房間 ${jgRoomCode}</h1>
      <p class="sub" style="text-align:center;margin-top:6px;">把這個房號給朋友，請他們輸入加入</p>
    </div>
    ${jgRoomCompSummaryHtml()}
    <div id="jg-room-my-role"></div>
    <div class="section-title" style="margin-top:16px;">目前玩家</div>
    <div id="jg-room-player-list" class="card"></div>
    <div id="jg-room-host-controls" style="margin-top:14px;"></div>
    <button class="ghost" style="margin-top:14px;" onclick="jgRoomLeave()">離開房間</button>
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
        hostEl.innerHTML='<button class="primary" onclick="jgRoomStartNight()">🌙 開始遊戲（進入第一夜）</button>'
          +'<div class="info" style="font-size:12px;margin-top:6px;">目前做了狼隊出刀＋預言家/通靈師其中一種查驗當示範，警長競選會在夜晚結束後出現。</div>';
      } else {
        hostEl.innerHTML=need
          ? '<button class="primary" '+(ready?'':'disabled')+' onclick="jgRoomAssignRoles()">🎲 隨機分配身分（目前 '+have+' / '+need+' 人'+(ready?'，可以分配了':'）')+'</button>'
          : '<div class="info-warn" style="font-size:12px;">這個房間沒有記錄板子配置，請改用「用這個板子設定建立連線房間」的方式重新建房。</div>';
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
      +(isCandidate?'':'<button class="primary" style="margin-top:10px;" onclick="jgRoomJoinSheriff()">🎖️ 參選警長</button>');
  } else if(sp==='locked'){
    bodyHtml='<div class="nbanner" style="margin-top:20px;"><div class="nicon">🎖️</div><h1>候選人</h1></div>'
      +'<div class="card">'+candList+'</div>'
      +'<div class="info" style="font-size:13px;margin-top:10px;text-align:center;">從 '+rd.sheriffSpeechStart+'號 開始，'+(rd.sheriffSpeechDir==='順'?'順時針':'逆時針')+'發言</div>'
      +(isCandidate?'<button style="margin-top:10px;" onclick="jgRoomWithdrawSheriff()">🚪 退水</button>':'');
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
  await setDoc(doc(db,'rooms',jgRoomCode),{
    votingActive:true, votingType:type, votingCandidates:candidates,
    votingExclude:excludeUids||[], votingRound:round, votingScript:script||'請投票',
    votingDeadline: Date.now()+5000
  },{ merge:true });
};
window.jgRoomCastVote=async function(targetUid, targetSeatNum){
  if(!confirm('確定要投給 '+targetSeatNum+'號 嗎？')) return;
  const db=window.jgFirebaseDb;
  const round=(jgRoomLatestRoomDoc&&jgRoomLatestRoomDoc.votingRound)||1;
  await setDoc(doc(db,'rooms',jgRoomCode,'votes',window.jgFirebaseUid),{
    round:round, targetUid:targetUid, targetSeatNum:targetSeatNum
  });
};
function jgRoomRenderVoting(){
  const root=document.getElementById('jg-room-content');
  if(!root) return;
  const rd=jgRoomLatestRoomDoc||{};
  const round=rd.votingRound||1;
  const myVote=jgRoomLatestVotes.find(v=>v.uid===window.jgFirebaseUid&&v.round===round);
  const excluded=(rd.votingExclude||[]).includes(window.jgFirebaseUid);
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
      +(excluded?'<div class="info" style="font-size:12px;margin-top:8px;text-align:center;">你不能投票這一輪</div>':'')
      +(!myVote&&!excluded&&timeUp?'<div class="info" style="font-size:12px;margin-top:8px;text-align:center;">時間到了，這輪算棄票</div>':'');
  }
  const hostCloseBtn=jgRoomIsHost?'<button style="margin-top:16px;" onclick="jgRoomHostCloseVoting()">公布結果，結束投票 →</button>':'';
  root.innerHTML=`<div class="section-title">投票</div>${bodyHtml}${hostCloseBtn}`;
  // 時間到了強制重新渲染一次（讓還沒投票的人自動切換到棄票／結果畫面），不用另外寫
  // callback 去主動關閉投票——投票視窗會不會真的結束，由房主按「公布結果」決定。
  if(needsTimer) jgRoomStartTimer(timerSeconds, ()=>jgRoomRenderVoting()); else jgRoomStopTimer();
}
// 房主結算投票：算出最高票，平票的話這一版先只顯示「平票」，還沒接 PK 重新投票的流程
// （之後可以在這裡擴充：偵測到平票就自動再開一輪只有平票者的投票）。警長投票結算完後，
// 直接公布「當選警長＋回顧昨晚死訊」，並進入警長自己選發言方向的畫面。
window.jgRoomHostCloseVoting=async function(){
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  const round=rd.votingRound||1;
  const votesThisRound=jgRoomLatestVotes.filter(v=>v.round===round);
  const tally={};
  votesThisRound.forEach(v=>{ tally[v.targetSeatNum]=(tally[v.targetSeatNum]||0)+1; });
  const entries=Object.entries(tally).sort((a,b)=>b[1]-a[1]);
  const isTie=entries.length>1&&entries[0][1]===entries[1][1];
  let resultMsg, winnerSeatNum=null;
  if(!entries.length){
    resultMsg='沒有人投票，本局無警長';
  } else if(isTie){
    resultMsg='平票（'+entries.filter(e=>e[1]===entries[0][1]).map(e=>e[0]+'號').join('、')+'），這一版還沒有自動 PK 重新投票的流程，暫定本局無警長';
  } else {
    winnerSeatNum=entries[0][0];
    resultMsg=winnerSeatNum+'號 當選警長（'+entries[0][1]+' 票）';
  }
  if(rd.votingType==='sheriff'){
    const killedSeatNum=rd.wolfKillTargetSeatNum||null;
    const nightMsg=killedSeatNum?('昨晚 '+killedSeatNum+'號 死了'):'昨晚是平安夜';
    alert('🎖️ '+resultMsg+'\n\n'+nightMsg);
    await setDoc(doc(db,'rooms',jgRoomCode),{
      votingActive:false, sheriffWinnerSeatNum:winnerSeatNum, phase:'day-open',
      sheriffPhase:winnerSeatNum?'pick-direction':null
    },{ merge:true });
  } else {
    alert('🗳️ 投票結果：'+resultMsg);
    await setDoc(doc(db,'rooms',jgRoomCode),{ votingActive:false },{ merge:true });
  }
};

// ── 警長決定警左警右：只有當選警長的那個人看得到左右鄰居的號碼可以點選，其他人看到
//    「警長正在決定發言方向」的等待畫面。點下去之後決定發言起點/方向（之後接白天發言
//    流程時會用到，這一版先把「警長選方向」這個動作做出來）。──
function jgRoomRenderDayOpen(){
  const root=document.getElementById('jg-room-content');
  if(!root) return;
  const rd=jgRoomLatestRoomDoc||{};
  const winnerSeatNum=rd.sheriffWinnerSeatNum;
  const iAmSheriff=jgMySeatNum&&winnerSeatNum&&jgMySeatNum===winnerSeatNum;
  let bodyHtml;
  if(rd.sheriffPhase==='pick-direction'&&iAmSheriff){
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
    bodyHtml='<div class="nbanner" style="margin-top:20px;"><div class="nicon">☀️</div><h1>白天開始</h1></div>'
      +(rd.daySpeechStart?'<p class="sub" style="text-align:center;margin-top:8px;">從 '+rd.daySpeechStart+'號 開始，'+dirLabel+'發言</p>':'')
      +'<div class="info" style="font-size:12px;margin-top:10px;text-align:center;">白天發言/投票流程還在開發中</div>';
  }
  root.innerHTML=`<div class="section-title">白天</div>${bodyHtml}`;
}
window.jgRoomSheriffPickDirection=async function(startSeatNum, dir){
  if(!confirm('確定嗎？')) return;
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{
    sheriffPhase:null, daySpeechStart:startSeatNum, daySpeechDir:dir
  },{ merge:true });
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
  const [secretsSnap, seerSnap, mediumSnap]=await Promise.all([
    getDocs(collection(db,'rooms',jgRoomCode,'secrets')),
    getDocs(collection(db,'rooms',jgRoomCode,'seerChecks')),
    getDocs(collection(db,'rooms',jgRoomCode,'mediumChecks'))
  ]);
  const roleByUid={}; secretsSnap.docs.forEach(d=>{ roleByUid[d.id]=d.data().role; });
  const seatOf=(uid)=>{ const p=jgRoomLatestPlayers.find(pp=>pp.uid===uid); return p?p.seatNum:'?'; };
  const rolesHtml=jgRoomLatestPlayers.map(p=>{
    const role=roleByUid[p.uid];
    const roleName=role?((typeof RNAME!=='undefined'&&RNAME[role])||role):'?';
    return '<div class="row"><div class="av av-vil">'+p.seatNum+'</div><div class="nm">'+p.name+'</div>'
      +'<span class="badge '+(p.alive?'bv':'bw')+'">'+roleName+(p.alive?'':'（已出局）')+'</span></div>';
  }).join('');
  // 文字紀錄：格式比照法官助手（一行一件事），把目前收集得到的資料組成幾行文字，即時更新。
  const rd=jgRoomLatestRoomDoc||{};
  const lines=[];
  if(rd.wolfKillTargetSeatNum) lines.push('刀 '+rd.wolfKillTargetSeatNum+'（已確認 '+(rd.wolfKillConfirmedBy||[]).length+' 人）');
  seerSnap.docs.forEach(d=>{ const v=d.data(); lines.push('驗 '+seatOf(d.id)+'→'+v.targetSeatNum+'（'+(v.team==='wolf'?'壞人':'好人')+'）'); });
  mediumSnap.docs.forEach(d=>{ const v=d.data(); lines.push('通 '+seatOf(d.id)+'→'+v.targetSeatNum+'（'+v.roleName+'）'); });
  const logHtml=lines.length?lines.map(l=>'<div style="font-family:monospace;font-size:13px;padding:2px 0;">'+l+'</div>').join(''):'<div class="empty">目前還沒有紀錄</div>';
  root.innerHTML=`
    <div class="nbanner"><div class="nicon">👁️</div><h1>上帝視角</h1></div>
    <button style="margin-top:10px;" onclick="jgRoomToggleGodView()">← 退出上帝視角</button>
    <div class="section-title" style="margin-top:16px;">全場身分</div>
    <div class="card">${rolesHtml}</div>
    <div class="section-title" style="margin-top:16px;">即時紀錄</div>
    <div class="card">${logHtml}</div>
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
  let bodyHtml, needsTimer=false;
  if(currentStep==='guard'&&jgMyRole==='guard'){
    const r=await jgRoomGuardViewHtml(night); bodyHtml=r.html; needsTimer=r.needsTimer;
  } else if(currentStep==='wolf'&&typeof WOLF_ROLES!=='undefined'&&WOLF_ROLES.includes(jgMyRole)){
    const r=await jgRoomWolfViewHtml(night); bodyHtml=r.html; needsTimer=r.needsTimer;
  } else if(currentStep==='witch'&&jgMyRole==='witch'){
    const r=await jgRoomWitchViewHtml(night); bodyHtml=r.html; needsTimer=r.needsTimer;
  } else if(jgMyRole==='seer'&&currentStep==='seer'){
    const r=await jgRoomSeerViewHtml(night); bodyHtml=r.html; needsTimer=r.needsTimer;
  } else if(jgMyRole==='medium'&&currentStep==='medium'){
    const r=await jgRoomMediumViewHtml(night); bodyHtml=r.html; needsTimer=r.needsTimer;
  } else {
    jgRoomStopTimer();
    bodyHtml='<div class="nbanner" style="margin-top:20px;"><div class="nicon">🌙</div><h1>夜晚進行中</h1>'
      +'<p class="sub" style="text-align:center;margin-top:8px;">請安靜閉眼等待，輪到你操作時畫面會自動出現</p></div>';
  }
  const hostAdvanceHtml=jgRoomIsHost?jgRoomHostAdvanceHtml(currentStep):'';
  root.innerHTML=`<div class="section-title">第 ${night} 夜</div>${bodyHtml}${hostAdvanceHtml}`;
  if(needsTimer) jgRoomStartTimer(30); else jgRoomStopTimer();
}
// 房主專用提示：狼隊出刀完成後，如果板子有查驗類角色（預言家/通靈師擇一）就會先進行查驗，
// 查驗完（或本來就沒有查驗類角色）currentStep 會變成空，這裡改成直接顯示「開始警長競選」
// 按鈕，銜接到白天流程（預言家跟通靈師不會同時出現在同一場板子，不需要「下一位」按鈕）。
function jgRoomHostAdvanceHtml(currentStep){
  if(currentStep==='guard') return '<div class="info" style="font-size:12px;margin-top:20px;text-align:center;">守衛選完之後，會自動往下一步（狼隊出刀）。</div>';
  if(currentStep==='wolf') return '<div class="info" style="font-size:12px;margin-top:20px;text-align:center;">狼隊全員同意目標後，會自動往下一步。</div>';
  if(currentStep==='witch') return '<div class="info" style="font-size:12px;margin-top:20px;text-align:center;">女巫行動完之後，會自動往下一步（查驗類角色，或直接接警長競選）。</div>';
  if(!currentStep) return '<div class="info" style="font-size:12px;margin-top:20px;text-align:center;">這一夜已經結束，正在自動接警長競選...</div>';
  return '<div class="info" style="font-size:12px;margin-top:20px;text-align:center;">目前只做了守衛、狼隊出刀、女巫、預言家、通靈師當示範，其餘角色還在開發中。</div>';
}
// 預言家的查驗畫面：先看看這一晚是不是已經查過了（重新整理／斷線重連都要能接續，不能
// 讓他重複查、也不能讓他看不到剛剛已經查到的結果）。
async function jgRoomSeerViewHtml(night){
  const db=window.jgFirebaseDb;
  const checkSnap=await getDoc(doc(db,'rooms',jgRoomCode,'seerChecks',window.jgFirebaseUid));
  if(checkSnap.exists()&&checkSnap.data().night===night){
    const d=checkSnap.data();
    return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><div class="nicon">🔮</div><h1>查驗結果</h1>'
      +'<p class="sub" style="text-align:center;margin-top:8px;font-size:20px;font-weight:800;">'+d.targetSeatNum+'號 是 '+(d.team==='wolf'?'壞人':'好人')+'</p></div>'
      +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">請記住這個結果，等待其他人完成夜晚行動</div>'};
  }
  const others=jgRoomLatestPlayers.filter(p=>p.uid!==window.jgFirebaseUid);
  const buttons=others.map(p=>
    '<button onclick="jgRoomConfirmCheck(\'seer\',\''+p.uid+'\','+p.seatNum+','+night+')" style="margin:4px;width:auto;display:inline-block;padding:10px 16px;">'+p.seatNum+'號 '+p.name+'</button>'
  ).join('');
  return {needsTimer:true, html:jgRoomTimerHtml(30,'你要查驗的對象是？')
    +'<div class="nbanner" style="margin-top:20px;"><div class="nicon">🔮</div><h1>請選擇查驗對象</h1></div>'
    +'<div style="text-align:center;margin-top:10px;">'+buttons+'</div>'};
}
// 查驗結果直接讀 secrets/{targetUid}（全房都讀得到的真實身分，見 jgRoomAssignRoles 的
// 註解），拿到真實角色後，預言家只需要換算成「好人/壞人」顯示——不用另外維護一份陣營資料。
// ── 點號碼不會馬上生效：查驗機會通常整局只有一次（或很珍貴），點錯就沒有回頭路，所以
//    一律先跳出確認視窗，按「確定」才真的送出查驗，取消的話就當作沒點過，可以重新選。
//    確認文字統一走簡短的「確定要[動作] X號 嗎？」格式，不要加多餘的說明——之後加女巫
//    （救/毒）、魔術師（交換）等角色時，一樣照這個格式：「確定要救 X號 嗎？」「確定要毒
//    X號 嗎？」「確定要交換 X-Y號 嗎？」。──
window.jgRoomConfirmCheck=function(kind, targetUid, targetSeatNum, night){
  const verb=kind==='guard'?'守護':'查驗';
  if(!confirm('確定要'+verb+' '+targetSeatNum+'號 嗎？')) return;
  if(kind==='seer') jgRoomSeerCheck(targetUid, targetSeatNum, night);
  else if(kind==='medium') jgRoomMediumCheck(targetUid, targetSeatNum, night);
  else if(kind==='guard') jgRoomGuardAct(targetUid, targetSeatNum, night);
};

window.jgRoomSeerCheck=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  const secretSnap=await getDoc(doc(db,'rooms',jgRoomCode,'secrets',targetUid));
  const role=secretSnap.exists()?secretSnap.data().role:'villager';
  const team=(typeof WOLF_ROLES!=='undefined'&&WOLF_ROLES.includes(role))?'wolf':'good';
  await setDoc(doc(db,'rooms',jgRoomCode,'seerChecks',window.jgFirebaseUid),{
    night:night, targetUid:targetUid, targetSeatNum:targetSeatNum, team:team
  });
  // 這個示範板子目前只有預言家/通靈師其中一位查驗類角色，查完就代表這一夜的行動結束了，
  // 直接自動接警長競選，不用等房主按按鈕。
  await jgRoomAdvanceToSheriffCampaign();
  jgRoomRenderNightShell();
};

// ── 通靈師的查驗畫面：跟預言家幾乎一模一樣的結構，差別只在查驗結果顯示「完整真實身分」
//    而不是「陣營」——這正是回答「通靈師/石像鬼這種要查真實身分的角色怎麼做」的示範：
//    都是讀同一份 secrets，差別只在查驗角色自己要不要把完整角色名稱顯示出來。──
async function jgRoomMediumViewHtml(night){
  const db=window.jgFirebaseDb;
  const checkSnap=await getDoc(doc(db,'rooms',jgRoomCode,'mediumChecks',window.jgFirebaseUid));
  if(checkSnap.exists()&&checkSnap.data().night===night){
    const d=checkSnap.data();
    return {needsTimer:false, html:'<div class="nbanner" style="margin-top:20px;"><div class="nicon">👁️</div><h1>查驗結果</h1>'
      +'<p class="sub" style="text-align:center;margin-top:8px;font-size:20px;font-weight:800;">'+d.targetSeatNum+'號 是 '+d.roleName+'</p></div>'
      +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">請記住這個結果，等待其他人完成夜晚行動</div>'};
  }
  const others=jgRoomLatestPlayers.filter(p=>p.uid!==window.jgFirebaseUid);
  const buttons=others.map(p=>
    '<button onclick="jgRoomConfirmCheck(\'medium\',\''+p.uid+'\','+p.seatNum+','+night+')" style="margin:4px;width:auto;display:inline-block;padding:10px 16px;">'+p.seatNum+'號 '+p.name+'</button>'
  ).join('');
  return {needsTimer:true, html:jgRoomTimerHtml(30,'你要查驗的對象是？')
    +'<div class="nbanner" style="margin-top:20px;"><div class="nicon">👁️</div><h1>請選擇查驗對象</h1></div>'
    +'<div style="text-align:center;margin-top:10px;">'+buttons+'</div>'};
}
window.jgRoomMediumCheck=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  const secretSnap=await getDoc(doc(db,'rooms',jgRoomCode,'secrets',targetUid));
  const role=secretSnap.exists()?secretSnap.data().role:'villager';
  const roleName=(typeof RNAME!=='undefined'&&RNAME[role])||role;
  await setDoc(doc(db,'rooms',jgRoomCode,'mediumChecks',window.jgFirebaseUid),{
    night:night, targetUid:targetUid, targetSeatNum:targetSeatNum, roleName:roleName
  });
  await jgRoomAdvanceToSheriffCampaign();
  jgRoomRenderNightShell();
};

window.jgRoomLeave=function(){
  jgRoomStopTimer();
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
  root.innerHTML=`
    <div class="nbanner">
      <div class="nicon">🎮</div>
      <h1>建立連線房間</h1>
    </div>
    <div class="info" style="font-size:13px;margin-top:10px;">板子設定：${total} 人局，${parts}</div>
    <div class="card" style="margin-top:14px;">
      <label>你的全名（房主）</label>
      <input type="text" id="jg-room-name-create" placeholder="輸入你的全名">
      <button class="primary" style="margin-top:10px;" onclick="jgRoomCreate(document.getElementById('jg-room-name-create').value, window.jgRoomPendingComp.comp, window.jgRoomPendingComp.total)">🏠 建立房間</button>
    </div>
    <button class="ghost" style="margin-top:10px;" onclick="switchTab('t-judge')">← 回去重新調整板子</button>
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
      <div class="info" style="font-size:13px;">要建立新房間的話，請先到「法官の助手」分頁設定好人數跟板子，設定完會有「用這個板子設定建立連線房間」的按鈕。</div>
      <button class="primary" style="margin-top:10px;" onclick="switchTab('t-judge')">前往設定板子 →</button>
    </div>
    <div class="card" style="margin-top:14px;">
      <label>房號</label>
      <input type="text" id="jg-room-code-join" placeholder="輸入房號" inputmode="numeric">
      <label style="margin-top:8px;">你的全名（一般連線房間才需要，發牌房會直接讓你選座位）</label>
      <input type="text" id="jg-room-name-join" placeholder="輸入你的全名">
      <button class="primary" style="margin-top:10px;" onclick="jgRoomSmartJoin(document.getElementById('jg-room-code-join').value, document.getElementById('jg-room-name-join').value)">🚪 加入房間</button>
    </div>
    <div class="info" style="font-size:12px;margin-top:10px;">目前是第一階段測試：建房、加入、即時看到玩家名單、隨機分配身分（只有自己看得到自己的牌）。遊戲流程自動化跟語音播報還在開發中。</div>
  `;
};
