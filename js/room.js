// ═══════════════════════════════════════════
// js/room.js
// 連線房間：多支手機共用一個房號，即時同步玩家名單、隨機分配身分（只有自己看得到自己的牌）。
// 這是第一階段（房間系統＋身分分配）的實作，遊戲流程自動化跟語音播報留待下一階段。
// 這個檔案是 ES module（用到 Firestore 的 import），跟其餘 <script>（非 module）載入的
// js 檔互相看不到彼此的變數，所以這裡也把要給一般 script 用的函式掛到 window 上。
// ═══════════════════════════════════════════
import {
  doc, setDoc, getDoc, addDoc, collection, onSnapshot, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

let jgRoomCode=null;       // 目前所在的房號
let jgRoomUnsubPlayers=null; // 玩家名單的即時監聽（換房間/離開時要記得取消）
let jgRoomUnsubMyRole=null;  // 我自己身分的即時監聽
let jgRoomIsHost=false;

// 房號格式：6 碼數字（字串），避免 0 開頭被當成數字弄丟前導 0
function jgRoomGenCode(){
  return String(Math.floor(100000+Math.random()*900000));
}

async function jgRoomWaitAuth(){
  await window.jgFirebaseReady;
  return window.jgFirebaseUid;
}

// ── 建立房間 ──
window.jgRoomCreate=async function(hostName){
  const name=(hostName||'').trim();
  if(!name){ alert('請先輸入你的暱稱'); return; }
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
    hostUid:uid, status:'lobby', createdAt:serverTimestamp()
  });
  await setDoc(doc(db,'rooms',code,'players',uid),{
    name:name, seatNum:1, joinedAt:serverTimestamp(), alive:true
  });
  jgRoomIsHost=true;
  jgRoomEnterLobby(code);
};

// ── 加入房間 ──
window.jgRoomJoin=async function(codeRaw, name){
  const code=(codeRaw||'').trim();
  const nm=(name||'').trim();
  if(!/^\d{4,6}$/.test(code)){ alert('請輸入正確的房號（4-6碼數字）'); return; }
  if(!nm){ alert('請先輸入你的暱稱'); return; }
  const uid=await jgRoomWaitAuth();
  const db=window.jgFirebaseDb;
  const roomSnap=await getDoc(doc(db,'rooms',code));
  if(!roomSnap.exists()){ alert('找不到這個房號，請確認房號是否正確'); return; }
  if(roomSnap.data().status!=='lobby'){ alert('這場遊戲已經開始，無法加入'); return; }
  // 算目前已經有幾人，決定這個新玩家的座位號碼（用 getDocs 一次性查詢，不用另外拉監聽）
  const { getDocs } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js");
  const playersSnap=await getDocs(collection(db,'rooms',code,'players'));
  const existing=playersSnap.docs.find(d=>d.id===uid);
  const seatNum=existing?existing.data().seatNum:(playersSnap.size+1);
  await setDoc(doc(db,'rooms',code,'players',uid),{
    name:nm, seatNum:seatNum, joinedAt:serverTimestamp(), alive:true
  });
  jgRoomIsHost=(roomSnap.data().hostUid===uid);
  jgRoomEnterLobby(code);
};

// ── 進入房間等待畫面，開始監聽玩家名單 ──
function jgRoomEnterLobby(code){
  jgRoomCode=code;
  const db=window.jgFirebaseDb;
  if(jgRoomUnsubPlayers) jgRoomUnsubPlayers();
  const q=query(collection(db,'rooms',code,'players'), orderBy('seatNum'));
  jgRoomUnsubPlayers=onSnapshot(q,(snap)=>{
    const players=snap.docs.map(d=>({uid:d.id, ...d.data()}));
    jgRoomRenderLobby(players);
  });
  jgRoomRenderShell();
}

// ── 隨機分配身分（房主操作）：用現有的 getComp/buildPool/shuffle（js/core.js 裡already有），
//    洗牌後把每個人的身分各自寫進只有他自己讀得到的 secrets/{uid} 文件。 ──
window.jgRoomAssignRoles=async function(){
  if(!jgRoomCode) return;
  const db=window.jgFirebaseDb;
  const { getDocs } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js");
  const playersSnap=await getDocs(collection(db,'rooms',jgRoomCode,'players'));
  const players=playersSnap.docs.map(d=>({uid:d.id, ...d.data()})).sort((a,b)=>a.seatNum-b.seatNum);
  if(players.length<6){ alert('至少需要 6 人才能分配身分'); return; }
  const comp=getComp(players.length); // 沿用 js/core.js 既有的板子配置表
  const pool=shuffle(buildPool(comp));
  await Promise.all(players.map((p,i)=>
    setDoc(doc(db,'rooms',jgRoomCode,'secrets',p.uid),{ role:pool[i]||'villager' })
  ));
  await setDoc(doc(db,'rooms',jgRoomCode),{ status:'role-assigned' },{ merge:true });
};

// ── 監聽「我自己」的身分（其他人的 secrets 文件，Firestore 安全規則會擋下，讀不到）──
function jgRoomWatchMyRole(){
  const db=window.jgFirebaseDb;
  const uid=window.jgFirebaseUid;
  if(jgRoomUnsubMyRole) jgRoomUnsubMyRole();
  jgRoomUnsubMyRole=onSnapshot(doc(db,'rooms',jgRoomCode,'secrets',uid),(snap)=>{
    const box=document.getElementById('jg-room-my-role');
    if(!box) return;
    if(snap.exists()){
      const role=snap.data().role;
      box.innerHTML='<div class="nbanner" style="margin-top:10px;">'
        +'<div class="nicon">'+(typeof RNAME!=='undefined'&&AV[role]?'🎴':'🎴')+'</div>'
        +'<div class="ntitle">你的身分：'+((typeof RNAME!=='undefined'&&RNAME[role])||role)+'</div>'
        +'</div>';
    } else {
      box.innerHTML='';
    }
  });
}

// ── 畫面渲染 ──
function jgRoomRenderShell(){
  const root=document.getElementById('jg-room-content');
  if(!root) return;
  root.innerHTML=`
    <div class="nbanner">
      <div class="nicon">🎮</div>
      <h1>房間 ${jgRoomCode}</h1>
      <p class="sub" style="text-align:center;margin-top:6px;">把這個房號給朋友，請他們輸入加入</p>
    </div>
    <div id="jg-room-my-role"></div>
    <div class="section-title" style="margin-top:16px;">目前玩家</div>
    <div id="jg-room-player-list" class="card"></div>
    <div id="jg-room-host-controls" style="margin-top:14px;"></div>
    <button class="ghost" style="margin-top:14px;" onclick="jgRoomLeave()">離開房間</button>
  `;
  jgRoomWatchMyRole();
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
    hostEl.innerHTML=jgRoomIsHost
      ? '<button class="primary" onclick="jgRoomAssignRoles()">🎲 隨機分配身分（'+players.length+' 人）</button>'
      : '<div class="info" style="font-size:12px;text-align:center;">等待房主分配身分...</div>';
  }
}

window.jgRoomLeave=function(){
  if(jgRoomUnsubPlayers){ jgRoomUnsubPlayers(); jgRoomUnsubPlayers=null; }
  if(jgRoomUnsubMyRole){ jgRoomUnsubMyRole(); jgRoomUnsubMyRole=null; }
  jgRoomCode=null;
  jgRoomRenderEntry();
};

// ── 進入分頁時預設顯示的「建立／加入房間」畫面 ──
window.jgRoomRenderEntry=function(){
  const root=document.getElementById('jg-room-content');
  if(!root) return;
  root.innerHTML=`
    <div class="nbanner">
      <div class="nicon">🎮</div>
      <h1>連線房間</h1>
      <p class="sub" style="text-align:center;margin-top:6px;">多支手機同時加入同一場，各自的手機只看得到自己的身分</p>
    </div>
    <div class="card" style="margin-top:14px;">
      <label>你的暱稱</label>
      <input type="text" id="jg-room-name-create" placeholder="輸入你的名字">
      <button class="primary" style="margin-top:10px;" onclick="jgRoomCreate(document.getElementById('jg-room-name-create').value)">🏠 建立新房間</button>
    </div>
    <div class="card" style="margin-top:14px;">
      <label>房號</label>
      <input type="text" id="jg-room-code-join" placeholder="輸入房號" inputmode="numeric">
      <label style="margin-top:8px;">你的暱稱</label>
      <input type="text" id="jg-room-name-join" placeholder="輸入你的名字">
      <button class="primary" style="margin-top:10px;" onclick="jgRoomJoin(document.getElementById('jg-room-code-join').value, document.getElementById('jg-room-name-join').value)">🚪 加入房間</button>
    </div>
    <div class="info" style="font-size:12px;margin-top:10px;">目前是第一階段測試：建房、加入、即時看到玩家名單、隨機分配身分（只有自己看得到自己的牌）。遊戲流程自動化跟語音播報還在開發中。</div>
  `;
};
