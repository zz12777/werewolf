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
let jgRoomComp=null;   // 這個房間鎖定的角色配置（建立房間時就決定好，不會因為加入人數變動而改變）
let jgRoomTotal=null;  // 這個房間需要的總人數
let jgRoomUnsubRoom=null;  // 房間文件本身（phase/currentStep）的即時監聽
let jgMyRole=null;         // 我自己的角色（從 secrets/{uid} 讀到後快取起來，night 畫面判斷要不要顯示操作介面用）
let jgMySeatNum=null;      // 我自己的座位號碼
let jgRoomLatestPlayers=[];  // 玩家名單監聽收到的最新資料
let jgRoomLatestRoomDoc=null; // 房間文件監聽收到的最新資料（phase/currentStep/status...）

// 房號格式：6 碼數字（字串），避免 0 開頭被當成數字弄丟前導 0
function jgRoomGenCode(){
  return String(Math.floor(100000+Math.random()*900000));
}

async function jgRoomWaitAuth(){
  await window.jgFirebaseReady;
  return window.jgFirebaseUid;
}

// ── 建立房間 ──
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
  jgRoomEnterLobby(code);
};

// ── 加入房間 ──
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
  jgRoomWatchMyRole();
}
// 依照房間目前的 phase，決定要顯示大廳畫面還是夜晚操作畫面——玩家名單跟房間狀態是兩條
// 分開的即時監聽，任一邊有更新都要重新判斷一次目前該顯示什麼。
function jgRoomRenderCurrentPhase(){
  const phase=jgRoomLatestRoomDoc&&jgRoomLatestRoomDoc.phase;
  if(phase==='night'){
    jgRoomRenderNightShell();
  } else {
    jgRoomRenderShell();
    jgRoomRenderLobby(jgRoomLatestPlayers);
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

// ── 房主開始遊戲：進入第一夜。預言家跟通靈師不會同時出現在同一場板子，這裡直接判斷
//    板子裡實際有哪一個，跳到那一步就好，不用逼房主多按一次「下一位」；如果兩個都沒有，
//    這一版還沒有其他角色可以示範，currentStep 留空、畫面會顯示對應的提示文字。 ──
window.jgRoomStartNight=async function(){
  if(!jgRoomCode) return;
  const db=window.jgFirebaseDb;
  const firstStep=(jgRoomComp&&jgRoomComp.seer>0)?'seer':((jgRoomComp&&jgRoomComp.medium>0)?'medium':null);
  await setDoc(doc(db,'rooms',jgRoomCode),{ phase:'night', night:1, currentStep:firstStep },{ merge:true });
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
          +'<div class="info" style="font-size:12px;margin-top:6px;">目前只做了預言家的自動化流程當測試，其餘角色還在開發中。</div>';
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

// ── 夜晚畫面：目前做了預言家（查陣營）跟通靈師（查真實身分）兩個角色當示範，展示同一份
//    secrets 資料可以給「只查陣營」跟「查真實身分」兩種不同查驗角色共用。是該角色的人會
//    看到選人查驗的介面，其他人一律看到「夜晚進行中，請安靜等待」，不會透露現在輪到誰。──
async function jgRoomRenderNightShell(){
  const root=document.getElementById('jg-room-content');
  if(!root) return;
  const night=(jgRoomLatestRoomDoc&&jgRoomLatestRoomDoc.night)||1;
  const currentStep=jgRoomLatestRoomDoc&&jgRoomLatestRoomDoc.currentStep;
  let bodyHtml;
  if(jgMyRole==='seer'&&currentStep==='seer'){
    bodyHtml=await jgRoomSeerViewHtml(night);
  } else if(jgMyRole==='medium'&&currentStep==='medium'){
    bodyHtml=await jgRoomMediumViewHtml(night);
  } else {
    bodyHtml='<div class="nbanner" style="margin-top:20px;"><div class="nicon">🌙</div><h1>夜晚進行中</h1>'
      +'<p class="sub" style="text-align:center;margin-top:8px;">請安靜閉眼等待，輪到你操作時畫面會自動出現</p></div>';
  }
  const hostAdvanceHtml=jgRoomIsHost?jgRoomHostAdvanceHtml(currentStep):'';
  root.innerHTML=`<div class="section-title">第 ${night} 夜</div>${bodyHtml}${hostAdvanceHtml}`;
}
// 房主專用提示：預言家跟通靈師不會同時出現在同一場板子，所以這裡不需要「手動推進到下一個
// 角色」的按鈕（board 裡最多就只有這兩者其中一個），只需要在都沒有時顯示對應的提示文字。
function jgRoomHostAdvanceHtml(currentStep){
  if(!currentStep) return '<div class="info" style="font-size:12px;margin-top:20px;text-align:center;">本局板子沒有預言家或通靈師，這一版還沒有其他角色可以示範。</div>';
  return '<div class="info" style="font-size:12px;margin-top:20px;text-align:center;">目前只做了預言家、通靈師其中一種查驗流程當示範（兩者不會同時出現），其餘角色還在開發中。</div>';
}
// 預言家的查驗畫面：先看看這一晚是不是已經查過了（重新整理／斷線重連都要能接續，不能
// 讓他重複查、也不能讓他看不到剛剛已經查到的結果）。
async function jgRoomSeerViewHtml(night){
  const db=window.jgFirebaseDb;
  const checkSnap=await getDoc(doc(db,'rooms',jgRoomCode,'seerChecks',window.jgFirebaseUid));
  if(checkSnap.exists()&&checkSnap.data().night===night){
    const d=checkSnap.data();
    return '<div class="nbanner" style="margin-top:20px;"><div class="nicon">🔮</div><h1>查驗結果</h1>'
      +'<p class="sub" style="text-align:center;margin-top:8px;font-size:20px;font-weight:800;">'+d.targetSeatNum+'號 是 '+(d.team==='wolf'?'壞人':'好人')+'</p></div>'
      +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">請記住這個結果，等待其他人完成夜晚行動</div>';
  }
  const others=jgRoomLatestPlayers.filter(p=>p.uid!==window.jgFirebaseUid);
  const buttons=others.map(p=>
    '<button onclick="jgRoomConfirmCheck(\'seer\',\''+p.uid+'\','+p.seatNum+','+night+')" style="margin:4px;width:auto;display:inline-block;padding:10px 16px;">'+p.seatNum+'號</button>'
  ).join('');
  return '<div class="nbanner" style="margin-top:20px;"><div class="nicon">🔮</div><h1>請選擇查驗對象</h1></div>'
    +'<div style="text-align:center;margin-top:10px;">'+buttons+'</div>';
}
// 查驗結果直接讀 secrets/{targetUid}（全房都讀得到的真實身分，見 jgRoomAssignRoles 的
// 註解），拿到真實角色後，預言家只需要換算成「好人/壞人」顯示——不用另外維護一份陣營資料。
// ── 點號碼不會馬上生效：查驗機會通常整局只有一次（或很珍貴），點錯就沒有回頭路，所以
//    一律先跳出確認視窗，按「確定」才真的送出查驗，取消的話就當作沒點過，可以重新選。──
window.jgRoomConfirmCheck=function(kind, targetUid, targetSeatNum, night){
  if(!confirm('確定要查驗 '+targetSeatNum+'號 嗎？請小心選擇，一旦確認就無法更改。')) return;
  if(kind==='seer') jgRoomSeerCheck(targetUid, targetSeatNum, night);
  else if(kind==='medium') jgRoomMediumCheck(targetUid, targetSeatNum, night);
};

window.jgRoomSeerCheck=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  const secretSnap=await getDoc(doc(db,'rooms',jgRoomCode,'secrets',targetUid));
  const role=secretSnap.exists()?secretSnap.data().role:'villager';
  const team=(typeof WOLF_ROLES!=='undefined'&&WOLF_ROLES.includes(role))?'wolf':'good';
  await setDoc(doc(db,'rooms',jgRoomCode,'seerChecks',window.jgFirebaseUid),{
    night:night, targetUid:targetUid, targetSeatNum:targetSeatNum, team:team
  });
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
    return '<div class="nbanner" style="margin-top:20px;"><div class="nicon">👁️</div><h1>查驗結果</h1>'
      +'<p class="sub" style="text-align:center;margin-top:8px;font-size:20px;font-weight:800;">'+d.targetSeatNum+'號 是 '+d.roleName+'</p></div>'
      +'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">請記住這個結果，等待其他人完成夜晚行動</div>';
  }
  const others=jgRoomLatestPlayers.filter(p=>p.uid!==window.jgFirebaseUid);
  const buttons=others.map(p=>
    '<button onclick="jgRoomConfirmCheck(\'medium\',\''+p.uid+'\','+p.seatNum+','+night+')" style="margin:4px;width:auto;display:inline-block;padding:10px 16px;">'+p.seatNum+'號</button>'
  ).join('');
  return '<div class="nbanner" style="margin-top:20px;"><div class="nicon">👁️</div><h1>請選擇查驗對象</h1></div>'
    +'<div style="text-align:center;margin-top:10px;">'+buttons+'</div>';
}
window.jgRoomMediumCheck=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  const secretSnap=await getDoc(doc(db,'rooms',jgRoomCode,'secrets',targetUid));
  const role=secretSnap.exists()?secretSnap.data().role:'villager';
  const roleName=(typeof RNAME!=='undefined'&&RNAME[role])||role;
  await setDoc(doc(db,'rooms',jgRoomCode,'mediumChecks',window.jgFirebaseUid),{
    night:night, targetUid:targetUid, targetSeatNum:targetSeatNum, roleName:roleName
  });
  jgRoomRenderNightShell();
};

window.jgRoomLeave=function(){
  if(jgRoomUnsubPlayers){ jgRoomUnsubPlayers(); jgRoomUnsubPlayers=null; }
  if(jgRoomUnsubMyRole){ jgRoomUnsubMyRole(); jgRoomUnsubMyRole=null; }
  if(jgRoomUnsubRoom){ jgRoomUnsubRoom(); jgRoomUnsubRoom=null; }
  jgRoomCode=null; jgRoomComp=null; jgRoomTotal=null; jgRoomIsHost=false;
  jgMyRole=null; jgMySeatNum=null; jgRoomLatestPlayers=[]; jgRoomLatestRoomDoc=null;
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
window.jgRoomRenderEntry=function(){
  const root=document.getElementById('jg-room-content');
  if(!root) return;
  if(window.jgRoomPendingComp){
    jgRoomRenderCreateWithComp(window.jgRoomPendingComp.comp, window.jgRoomPendingComp.total);
    return;
  }
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
      <label style="margin-top:8px;">你的全名</label>
      <input type="text" id="jg-room-name-join" placeholder="輸入你的全名">
      <button class="primary" style="margin-top:10px;" onclick="jgRoomJoin(document.getElementById('jg-room-code-join').value, document.getElementById('jg-room-name-join').value)">🚪 加入房間</button>
    </div>
    <div class="info" style="font-size:12px;margin-top:10px;">目前是第一階段測試：建房、加入、即時看到玩家名單、隨機分配身分（只有自己看得到自己的牌）。遊戲流程自動化跟語音播報還在開發中。</div>
  `;
};
