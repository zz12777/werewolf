'use strict';
// ═══════════════════════════════════════════
// js/room/deal.js
// 發牌房：分配身分之後，玩家手機上的「遊戲資訊」畫面，以及房主（法官）端的同步。
//   ・玩家：一開始先看一次自己的身分（按「記住了」收起來），之後畫面只顯示號碼與姓名名單、
//     警長競選資訊（上警、發言順序、退水、票型、當選警長）、每天白天的投票票型；自己的身分改成
//     按右上角「確認自己身分」才看得到。上警的人有「退水」按鈕，按了法官那邊會自動退水。
//   ・幸運兒、情侶：法官在法官助手按下確認後，只有本人的手機會跳出放大版提醒。
//   ・房主：法官助手（js/deal-sync.js）把目前的公開資訊整理好，呼叫這裡的
//     jgRoomDealPublish 寫進房間文件 publicInfo；私人提醒用 jgRoomDealSendPrivate 寫進
//     那個人自己的 secrets 文件 privateNotices。
// 畫面元件（名單、警長資訊、私人提醒）跟連線房間共用 js/room/public-info.js。
// 檔案總覽見 js/room/core.js 開頭。
// ═══════════════════════════════════════════

let jgRoomDealMySecret=null;        // 自己 secrets 文件的最新內容（role、privateNotices）
let jgRoomDealSecretSubCode=null;   // 目前在監聽哪個房間的 secrets（換房間才重新訂閱）
let jgRoomDealWithdrawPending=false; // 已經按了退水、還在等法官處理

function jgRoomDealRoleSeenKey(){ return 'jgDealRoleSeen_'+jgRoomCode+'_'+(window.jgFirebaseUid||''); }
function jgRoomDealRoleSeen(){ try{ return localStorage.getItem(jgRoomDealRoleSeenKey())==='1'; }catch(e){ return false; } }
window.jgRoomDealMarkRoleSeen=function(){
  try{ localStorage.setItem(jgRoomDealRoleSeenKey(),'1'); }catch(e){}
  jgRoomRenderDealMyRole();
};

// 自己的私人提醒（幸運兒、情侶）清單，依寫入時間排序。
function jgRoomDealMyNotices(){
  const map=(jgRoomDealMySecret&&jgRoomDealMySecret.privateNotices)||{};
  return Object.keys(map).map(k=>Object.assign({key:k}, map[k])).sort((a,b)=>(a.at||0)-(b.at||0));
}

// 分配身分之後的玩家畫面（房主自己切到這個分頁也是看這個，只是沒有身分）。
function jgRoomRenderDealMyRole(){
  const root=document.getElementById('jg-room-content');
  if(!root) return;
  const db=window.jgFirebaseDb;
  if(jgRoomDealSecretSubCode!==jgRoomCode){
    if(jgRoomUnsubDealMyRole) jgRoomUnsubDealMyRole();
    jgRoomDealSecretSubCode=jgRoomCode;
    jgRoomDealMySecret=null;
    jgRoomUnsubDealMyRole=onSnapshot(doc(db,'rooms',jgRoomCode,'secrets',window.jgFirebaseUid),(snap)=>{
      jgRoomDealMySecret=snap.exists()?snap.data():null;
      if(jgRoomDealMySecret){
        jgMyRole=jgRoomDealMySecret.role||null;
        jgMySeatNum=jgRoomDealMySecret.seatNum!=null?Number(jgRoomDealMySecret.seatNum):jgMySeatNum;
      }
      jgRoomRenderDealMyRole();
    });
  }
  const rd=jgRoomLatestRoomDoc||{};
  const me=jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid);
  const mySeat=me&&me.seatNum!=null?Number(me.seatNum):null;
  if(mySeat!=null) jgMySeatNum=mySeat;
  // 還沒拿到自己的身分（剛分配、資料還在路上）：座位玩家先顯示等待。
  if(mySeat!=null&&!jgRoomDealMySecret){
    root.innerHTML='<div class="info" style="text-align:center;margin-top:40px;">身分分配中，請稍候...</div>';
    return;
  }
  const info=rd.publicInfo||null;
  // 第一次：大字顯示自己的身分，按「記住了」之後收起來，之後只能從右上角按鈕看。
  if(mySeat!=null&&!jgRoomDealRoleSeen()){
    const role=jgRoomDealMySecret.role;
    const roleName=(typeof RNAME!=='undefined'&&RNAME[role])||role;
    root.innerHTML=`
      <div style="text-align:center;padding:50px 20px;">
        <div style="font-size:72px;line-height:1;">${jgRoomRoleIconGuess(role)}</div>
        <div style="font-size:30px;font-weight:800;margin-top:16px;">${mySeat}號，你的身分是：${roleName}</div>
        <button class="primary" style="margin-top:18px;" onclick="jgRoomDealMarkRoleSeen()">記住了，進入遊戲畫面</button>
      </div>`;
    return;
  }
  const players=(info&&info.players&&info.players.length)?info.players
    :jgRoomDealSeatedPlayers().map(p=>({num:p.seatNum, name:p.name}));
  const sh=info&&info.sheriff;
  // 法官處理完（我已經不在候選人裡，或已經記成退水）就不再顯示「等待中」。
  if(jgRoomDealWithdrawPending&&(!sh||!sh.canWithdraw||!(sh.candidates||[]).map(Number).includes(mySeat))) jgRoomDealWithdrawPending=false;
  jgRoomAnnounceNewWithdrawals('deal_'+jgRoomCode, sh&&sh.withdrawn);
  // 只有自己看得到的標籤（情侶、感染者），由法官助手寫在自己的 secrets 文件裡。
  const priv=(jgRoomDealMySecret&&jgRoomDealMySecret.privateTags)||null;
  root.innerHTML=`
    <div class="nbanner"><h1>房間 ${jgRoomCode}</h1>
      ${mySeat!=null?'':'<p class="sub" style="text-align:center;margin-top:6px;">你是房主，請在「法官の助手」分頁主持</p>'}</div>
    <div class="section-title" style="margin-top:14px;">玩家名單</div>
    ${jgRoomNameGridHtml(players.map(p=>Object.assign({}, p, {tags:jgRoomNameTags(p.num, sh, priv)})), mySeat)}
    ${jgRoomSheriffInfoHtml(sh, mySeat, 'jgRoomDealWithdraw()', jgRoomDealWithdrawPending)}
    ${jgRoomDayVotesHtml(info&&info.dayVotes)}
  `;
  // 私人提醒：沒看過的自動跳出來（一次一則，按「知道了」之後再看下一則）。
  const unseen=jgRoomDealMyNotices().find(n=>!jgRoomNoticeSeen(n.key, n.main));
  if(unseen) jgRoomShowPrivateNotice(unseen, 'jgRoomRenderDealMyRole()');
}

// 候選人按「退水」：寫進房間文件的請求清單，房主那邊的法官助手收到後自動退水。
window.jgRoomDealWithdraw=async function(){
  if(jgMySeatNum==null) return;
  // 玩家自己按退水要再確認一次（避免誤觸）；法官助手那邊幫人按退水則不用確認。
  if(!confirm(jgMySeatNum+'號 確定要退水嗎？')) return;
  jgRoomDealWithdrawPending=true;
  jgRoomRenderDealMyRole();
  try{
    await setDoc(doc(window.jgFirebaseDb,'rooms',jgRoomCode),{ dealWithdrawReqs:arrayUnion(jgMySeatNum) },{ merge:true });
  }catch(e){
    jgRoomDealWithdrawPending=false;
    jgRoomRenderDealMyRole();
    alert('退水送出失敗，請再按一次，或直接跟法官說。\n（錯誤訊息：'+(e&&e.message||e)+'）');
  }
};

// ── 房主端 ──
// 這個房間現在是不是「房主的法官助手正在主持的發牌房」（code 要跟法官助手記住的一致）。
window.jgRoomDealLinkActive=function(code){
  const rd=jgRoomLatestRoomDoc||{};
  // 不檢查 dealtDone：房主剛按完分配身分時，自己的監聽器可能還沒收到 dealtDone，第一次同步會被漏掉。
  return !!(jgRoomCode&&jgRoomCode===code&&jgRoomIsHost&&rd.mode==='deal');
};
let jgRoomDealLastPublished='';
window.jgRoomDealPublish=async function(info){
  const json=JSON.stringify(info||null);
  if(json===jgRoomDealLastPublished) return; // 沒有變化就不寫，省流量
  jgRoomDealLastPublished=json;
  try{
    await setDoc(doc(window.jgFirebaseDb,'rooms',jgRoomCode),{ publicInfo:info },{ merge:true });
  }catch(e){
    jgRoomDealLastPublished=''; // 寫失敗，下次有變化時再試
    console.warn('發牌房公開資訊同步失敗（不影響法官繼續主持）', e);
  }
};
// 私人提醒：寫進那個座位的玩家自己的 secrets 文件。notice: {key, title, main, note}
window.jgRoomDealSendPrivate=async function(seatNum, notice){
  const p=jgRoomLatestPlayers.find(x=>Number(x.seatNum)===Number(seatNum));
  if(!p) return;
  const entry={}; entry[notice.key]={ title:notice.title, main:notice.main, note:notice.note||'', at:Date.now() };
  try{
    await setDoc(doc(window.jgFirebaseDb,'rooms',jgRoomCode,'secrets',p.uid),{ privateNotices:entry },{ merge:true });
  }catch(e){ console.warn('私人提醒送出失敗', e); }
};
// 只有特定玩家看得到的名單標籤（情侶、感染者）：tags = {lovers:[號碼], infected:[號碼]}。
window.jgRoomDealSetPrivateTags=async function(seatNum, tags){
  const p=jgRoomLatestPlayers.find(x=>Number(x.seatNum)===Number(seatNum));
  if(!p) return;
  try{
    await setDoc(doc(window.jgFirebaseDb,'rooms',jgRoomCode,'secrets',p.uid),{ privateTags:{ lovers:tags.lovers||[], infected:tags.infected||[] } },{ merge:true });
  }catch(e){ console.warn('私人標籤同步失敗', e); }
};
// 房間文件有新的退水請求：交給法官助手處理（js/deal-sync.js 的 jgDealRemoteWithdraw），
// 處理完把請求清掉。只有房主做這件事。
let jgRoomDealHandling=false;
async function jgRoomDealHostHandleRequests(rd){
  if(!jgRoomIsHost||!rd||rd.mode!=='deal'||jgRoomDealHandling) return;
  const reqs=(rd.dealWithdrawReqs||[]).slice();
  if(!reqs.length) return;
  if(typeof window.jgDealRemoteWithdraw!=='function') return;
  jgRoomDealHandling=true;
  try{
    reqs.forEach(n=>{ try{ window.jgDealRemoteWithdraw(Number(n)); }catch(e){ console.error(e); } });
    await setDoc(doc(window.jgFirebaseDb,'rooms',jgRoomCode),{ dealWithdrawReqs:arrayRemove(...reqs) },{ merge:true });
  }catch(e){ console.warn('處理退水請求失敗', e); }
  jgRoomDealHandling=false;
}
