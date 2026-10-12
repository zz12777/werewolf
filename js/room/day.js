'use strict';
// ═══════════════════════════════════════════
// js/room/day.js
// 連線房間：白天：警長競選、投票、血月使者最後一擊、放逐、遺言、白天發言順序。
// 連線房間的程式拆成 js/room/ 底下好幾個一般 script 檔（依 index.html 的順序用 defer 載入，
// 共用同一個全域範圍，互相看得到彼此的變數與函式）；Firestore 函式由 js/firebase-init.js 提供。
// 檔案總覽見 js/room/core.js 開頭。
// ═══════════════════════════════════════════

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
  // 補上明確重新渲染——原本這裡沒有呼叫，完全依賴即時監聽器自己觸發下一次渲染，跟這次
  // 修過的其他好幾個地方是同一類問題：不主動觸發的話，自己按下去的當下畫面不會馬上更新，
  // 要等監聽器自己反應過來，體感上會像「按了沒反應」。
  await jgRoomRefreshAndRenderCurrent();
};
window.jgRoomWithdrawSheriff=async function(){
  if(!confirm('確定要退水嗎？')) return;
  const db=window.jgFirebaseDb;
  // 只從「目前候選人」名單移除，sheriffEverCandidates 不動——退水過的人這輪投票還是不能投。
  await setDoc(doc(db,'rooms',jgRoomCode),{ sheriffCandidates: arrayRemove(window.jgFirebaseUid) },{ merge:true });
  await jgRoomRefreshAndRenderCurrent();
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
    await jgRoomRefreshAndRenderCurrent();
    return;
  }
  const startUid=candidates[Math.floor(Math.random()*candidates.length)];
  const startP=jgRoomLatestPlayers.find(p=>p.uid===startUid);
  const dir=Math.random()<0.5?'順':'逆';
  await setDoc(doc(db,'rooms',jgRoomCode),{
    sheriffPhase:'locked', sheriffSpeechStart: startP?startP.seatNum:null, sheriffSpeechDir:dir
  },{ merge:true });
  await jgRoomRefreshAndRenderCurrent();
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
  let bodyHtml, needsTimer=false, timerSeconds=0, timerCb=null, turnMeta=null;
  if(sp==='joining'){
    const remaining=Math.max(1, Math.ceil(((rd.sheriffJoinDeadline||Date.now())-Date.now())/1000));
    needsTimer=true; timerSeconds=remaining; timerCb=jgRoomLockSheriffJoin;
    bodyHtml=jgRoomTimerHtml(remaining,'候選人請點選競選按鈕')
      +'<div class="section-title" style="margin-top:14px;">目前候選人</div><div class="card">'+candList+'</div>'
      +(isCandidate?'':'<button class="primary" style="margin-top:10px;" onclick="jgRoomJoinSheriff()">參選警長</button>');
  } else if(sp==='locked'){
    const candSeats=candidates.map(uid=>{ const p=jgRoomLatestPlayers.find(pp=>pp.uid===uid); return p?p.seatNum:null; }).filter(n=>n!=null);
    const order=jgRoomCircularOrder(rd.sheriffSpeechStart, rd.sheriffSpeechDir, jgRoomTotal||jgRoomLatestPlayers.length, new Set(candSeats));
    turnMeta=jgRoomSpeechTurnWidgetHtml(rd, order, 'sheriff:'+(rd.night||1));
    bodyHtml='<div class="nbanner" style="margin-top:20px;"><h1>候選人</h1></div>'
      +'<div class="card">'+candList+'</div>'
      +'<div class="info" style="font-size:13px;margin-top:10px;text-align:center;">從 '+rd.sheriffSpeechStart+'號 開始，'+(rd.sheriffSpeechDir==='順'?'順時針':'逆時針')+'發言</div>'
      +(turnMeta?turnMeta.html:'')
      +(isCandidate?'<button style="margin-top:10px;" onclick="jgRoomWithdrawSheriff()">退水</button>':'');
  } else if(sp==='day2resume'){
    // 雙爆吞警徽・第一爆的隔天：不重新問候選人起立、也不用再發言一次（政見昨天已經講過
    // 了），直接沿用昨天還活著、還沒退水的候選人，只留「退水」跟「開始投票」這兩個動作，
    // 過程中如果再有人自爆，這次警徽才會真正流失（見 jgRoomMaybeApplyBadgeSwallow）。
    bodyHtml='<div class="nbanner" style="margin-top:20px;"><h1>警長競選（延續）</h1></div>'
      +'<div class="info-warn" style="font-size:12px;text-align:center;margin-top:6px;">雙爆吞警徽：昨天已經有候選人自爆過（警徽保留），今天繼續競選；過程中如果再有人自爆，警徽才會真正流失。</div>'
      +'<div class="section-title" style="margin-top:14px;">候選人</div><div class="card">'+candList+'</div>'
      +(isCandidate?'<button style="margin-top:10px;" onclick="jgRoomWithdrawSheriff()">退水</button>':'');
  } else {
    bodyHtml='<div class="nbanner" style="margin-top:20px;"><h1>警長競選</h1></div>';
  }
  const hostBtn=(jgRoomIsHost&&(sp==='locked'||sp==='day2resume'))?'<button style="margin-top:14px;" onclick="jgRoomHostStartSheriffVote()">大家都發言完了，開始投票 →</button>':'';
  root.innerHTML=`<div class="section-title">警長競選</div>${bodyHtml}${hostBtn}`;
  if(needsTimer) jgRoomStartTimer(timerSeconds, timerCb); else jgRoomStopTimer();
  jgRoomStartSpeechTurnClock(turnMeta);
}
window.jgRoomHostStartSheriffVote=async function(){
  const rd=jgRoomLatestRoomDoc||{};
  const candidates=rd.sheriffCandidates||[];
  const everCandidates=rd.sheriffEverCandidates||[];
  if(candidates.length<1){ alert('目前沒有候選人（可能都退水了），無法開始投票'); return; }
  await jgRoomStartVoting('sheriff', candidates, everCandidates, '準備投票，投票時間倒數10秒，請於時間內投票');
};

// ── 投票通用元件：candidateUids 是可以被投的對象，excludeUids 是「不能投票」的人
//    （例如警長選舉時候選人自己不能投）。votingRound 每開一輪投票就 +1，避免舊票混進
//    新一輪的統計裡。倒數10秒，時間到不管有沒有投都強制看到結果畫面並鎖定按鈕（沒投＝
//    棄票，這裡不用另外寫一筆「棄票」紀錄，票數統計本來就只算有投的人，沒投的人自然不會
//    被算進去）。
const JG_ROOM_VOTE_DURATION_MS=10000;
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
    votingDeadline: Date.now()+JG_ROOM_VOTE_DURATION_MS,
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
// 投票倒數時間到——不管是還沒投票、還是已經投完/被排除在看計票畫面的手機，都會走到
// 這裡；實際結算交給 jgRoomHostCloseVoting（它自己會重新檢查這輪是不是還沒結算過，
// 好幾支手機幾乎同時倒數到 0 也不會被重複處理兩次）。
async function jgRoomVoteTimerComplete(){
  await jgRoomHostCloseVoting();
}
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
  const timerSeconds=Math.max(1, Math.ceil(((rd.votingDeadline||Date.now())-Date.now())/1000));
  let bodyHtml;
  if(!myVote&&!excluded&&!timeUp){
    const cands=rd.votingCandidates||[];
    const buttons=cands.map(c=>
      '<button onclick="jgRoomCastVote(\''+c.uid+'\','+c.seatNum+')" style="margin:4px;width:auto;display:inline-block;padding:10px 16px;">'+c.seatNum+'號 '+c.name+'</button>'
    ).join('');
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
    // 這裡也放同一張倒數卡片（雖然這支手機已經投完票／不能投），理由是：時間到了必須有
    // 人真的去結算這輪投票，不能只靠「剛好還有人停在投票按鈕畫面」才會觸發——萬一活著
    // 的人全部都已經投完票，大家都在看這個計票畫面，時間到時還是要有人能觸發結算。
    bodyHtml=jgRoomTimerHtml(timerSeconds, '等待這輪投票結束')
      +'<div class="nbanner" style="margin-top:20px;"><h1>即時票數</h1></div>'
      +'<div class="card" style="margin-top:10px;">'+(rows||'<div class="empty">還沒有人投票</div>')+'</div>'
      +(iAmDead?'<div class="info" style="font-size:12px;margin-top:8px;text-align:center;">你已經出局了，不能投票</div>'
        :excluded?'<div class="info" style="font-size:12px;margin-top:8px;text-align:center;">你不能投票這一輪</div>':'')
      +(!myVote&&!excluded&&timeUp?'<div class="info" style="font-size:12px;margin-top:8px;text-align:center;">時間到了，這輪算棄票</div>':'');
  }
  // 手動按鈕保留當備用安全閥（比照夜晚各步驟「卡住了？房主強制往下一步」的精神）——正常
  // 情況時間到了會自動結算、自動公布結果，不需要房主特地按這顆鈕。
  const hostCloseBtn=jgRoomIsHost?'<button style="margin-top:16px;font-size:12px;color:var(--text3);" onclick="jgRoomHostCloseVoting()">⚠️ 卡住了？手動公布結果，結束投票</button>':'';
  root.innerHTML=`<div class="section-title">投票</div>${bodyHtml}${hostCloseBtn}`;
  jgRoomStartTimer(timerSeconds, jgRoomVoteTimerComplete);
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
  const db=window.jgFirebaseDb;
  // 安全閥：重新讀一次資料庫，確認這輪投票還沒被結算過（votingActive 還是 true）——這個
  // 函式現在不只房主手動按的按鈕會呼叫，時間到時任何一支還開著投票/計票畫面的手機都會
  // 自動呼叫（見 jgRoomVoteTimerComplete），這裡擋一下避免好幾支手機幾乎同時倒數到 0、
  // 同一輪投票被重複結算兩次。
  const roomSnap=await getDoc(doc(db,'rooms',jgRoomCode));
  const fresh=roomSnap.data()||{};
  if(!fresh.votingActive){ jgRoomRenderCurrentPhase(); return; }
  jgRoomLatestRoomDoc=fresh;
  const rd=fresh;
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
  // 結果不再用 alert() 彈窗公布——那只有按下「公布結果」的那支手機自己看得到，還會擋住
  // 那支手機的操作；結果本身（當選/無警長/進PK）都會寫進房間文件，所有人的畫面本來就會
  // 透過即時監聽器自動跟著換畫面，不需要再彈一個窗告知。
  if(!entries.length){
    await setDoc(doc(db,'rooms',jgRoomCode),{
      votingActive:false, sheriffWinnerSeatNum:null, sheriffPkRound:false,
      phase:'day-open', sheriffPhase:null
    },{ merge:true });
    return;
  }
  if(top.length>1){
    const tiedSeats=top.map(e=>e.seat);
    if(rd.sheriffPkRound){
      await setDoc(doc(db,'rooms',jgRoomCode),{
        votingActive:false, sheriffWinnerSeatNum:null, sheriffPkRound:false,
        phase:'day-open', sheriffPhase:null
      },{ merge:true });
      return;
    }
    const tiedUids=top.map(e=>e.targetUid);
    await setDoc(doc(db,'rooms',jgRoomCode),{ sheriffPkRound:true },{ merge:true });
    await jgRoomStartVoting('sheriff', tiedUids, tiedUids, '平票（'+tiedSeats.join('、')+'號），PK 重新投票，投票時間倒數10秒，請於時間內投票');
    return;
  }
  const winnerSeatNum=Number(top[0].seat);
  await setDoc(doc(db,'rooms',jgRoomCode),{
    votingActive:false, sheriffWinnerSeatNum:winnerSeatNum, sheriffPkRound:false,
    phase:'day-open', sheriffPhase:'pick-direction'
  },{ merge:true });
}
// PK 候選人的倒序發言順序——比照本機法官助手的 PK 規則：今天原本的發言順序裡，位置排在
// 越後面的人，PK 時越先發言。用 daySpeechStart／daySpeechDir 算出每個 PK 候選人在今天
// 發言順序裡排第幾個（跟 jgRoomAutoSpinSpeechOrder 決定起點用的是同一份方向設定），再依
// 這個「發言順序位置」由大到小排序，回傳一份「X號」字串陣列給畫面直接顯示。
function jgRoomComputePkSpeechOrder(pkSeats, rd){
  const total=jgRoomTotal||jgRoomLatestPlayers.length;
  const start=rd.daySpeechStart, dir=rd.daySpeechDir;
  if(!start||!dir||!total) return pkSeats.map(s=>s+'號'); // 還沒抽過發言順序時，保底照原本座位順序顯示
  const positionOf=(seatNum)=>{
    let n=start, pos=0;
    for(let i=0;i<total;i++){
      if(n===seatNum) return pos;
      n=dir==='逆'?(n-1<1?total:n-1):(n+1>total?1:n+1);
      pos++;
    }
    return 0;
  };
  return pkSeats.slice().sort((a,b)=>positionOf(b)-positionOf(a)).map(s=>s+'號');
}

// ═══════════════════════════════════════════
// 血月使者被動：「若為最後一個被放逐的狼人，可暫時存活進入黑夜，夜晚再擊殺一名玩家，
// 達屠邊則狼人勝利」——公開讓全場知道（不是像幸運兒那樣只有自己看得到的私密畫面），
// 進入黑夜後只有他一個人有事要做（其他神職這一晚都不用睜眼操作），開完這最後一刀，
// 如果剛好屠邊（殺光所有民或所有神）狼人就贏；沒有的話，他這次「暫留」的緩刑就結束，
// 這時候才真的死亡（此時場上狼人已全滅，好人陣營照正常規則獲勝）。
// ═══════════════════════════════════════════
// 這次要放逐的人是不是「場上最後一個活著的狼人」而且剛好是血月使者——兩個條件都要成立
// 才觸發被動；只是普通狼人被放逐（沒有血月使者，或血月使者不是最後一個）維持原本流程，
// 正常死亡。
async function jgRoomCheckBloodmoonLastStand(uid){
  const db=window.jgFirebaseDb;
  const { getDocs } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js");
  const secretsSnap=await getDocs(collection(db,'rooms',jgRoomCode,'secrets'));
  const roleByUid={}; secretsSnap.docs.forEach(d=>{ roleByUid[d.id]=d.data().role; });
  if(roleByUid[uid]!=='bloodmoon') return false;
  const otherAliveWolves=jgRoomLatestPlayers.filter(p=>p.uid!==uid&&p.alive!==false
    &&typeof WOLF_ROLES!=='undefined'&&WOLF_ROLES.includes(roleByUid[p.uid]));
  return otherAliveWolves.length===0;
}
// 觸發被動：公開記一筆文字紀錄（讓上帝視角、之後複查都看得到這件事發生過），然後直接
// 進入下一夜、指定 currentStep 為 'bloodmoonlaststand'（跳過正常的夜晚步驟順序——這一晚
// 不會有查驗類角色、女巫這些正常流程，只有血月使者一個人的最後一擊）。
async function jgRoomStartBloodmoonLastStand(outUid, outSeatNum){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{ votingActive:false, dayVotePkRound:false },{ merge:true });
  await jgRoomAppendNightLog((jgRoomLatestRoomDoc&&jgRoomLatestRoomDoc.night)||1,
    outSeatNum+'號（血月使者）是本局最後一位狼人，暫留場上，進入黑夜開最後一刀');
  const nextNight=await jgRoomStartNextNight('bloodmoonlaststand', {
    bloodmoonLastStandUid:outUid, bloodmoonLastStandSeatNum:outSeatNum
  });
  jgRoomVoiceSpeakOnce('bloodmoonreveal:'+outUid, outSeatNum+'號是血月使者，是本局最後一位狼人，暫留場上，進入黑夜開最後一刀。');
  jgRoomRenderCurrentPhase();
}
async function jgRoomBloodmoonLastStandViewHtml(night){
  const rd=jgRoomLatestRoomDoc||{};
  const isMe=rd.bloodmoonLastStandUid===window.jgFirebaseUid;
  if(!isMe){
    const hostBtn=jgRoomIsHost
      ?'<div style="text-align:center;margin-top:10px;"><button style="font-size:12px;color:var(--text3);" onclick="jgRoomHostForceBloodmoonLastStand()">⚠️ 卡住了？房主強制結算（當作沒有殺任何人）</button></div>'
      :'';
    return {needsTimer:false, html:'<div class="nbanner nbanner-night" style="margin-top:20px;"><h1>血月使者的最後一擊</h1></div>'
      +'<p class="sub" style="text-align:center;margin-top:8px;">'+rd.bloodmoonLastStandSeatNum+'號是血月使者，暫留場上，正在決定今晚的最後一刀，請安靜等待</p>'
      +hostBtn};
  }
  return {needsTimer:true, html:jgRoomTimerHtml(30,'選擇今晚要殺的對象——這是你最後的機會')
    +'<div class="nbanner nbanner-night" style="margin-top:20px;"><h1>血月使者：最後一擊</h1></div>'
    +'<div class="info-warn" style="text-align:center;margin-top:6px;">你是本局最後一位狼人，剛才的放逐暫時沒有真的生效——選一位玩家開最後一刀，如果殺光所有平民或所有神職，狼人就獲勝；沒有的話，這一刀結束後你就會真正陣亡。</div>'
    +jgRoomNumGridHtml('jg-room-bloodmoon-pick', null)
    +'<div style="text-align:center;"><button class="primary" style="margin-top:10px;" onclick="jgRoomBloodmoonLastStandKillFromGrid('+night+')">開最後一刀</button></div>'};
}
window.jgRoomBloodmoonLastStandKillFromGrid=function(night){
  const hidden=document.getElementById('jg-room-bloodmoon-pick');
  const seatNum=hidden&&hidden.value?parseInt(hidden.value):null;
  if(!seatNum){ alert('請先點選一個號碼'); return; }
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===seatNum);
  if(!p) return;
  if(!confirm('確定要對 '+seatNum+'號 開最後一刀嗎？這是最後機會，確定後無法更改。')) return;
  window.jgRoomBloodmoonLastStandKill(p.uid, seatNum, night);
};
window.jgRoomBloodmoonLastStandKill=async function(targetUid, targetSeatNum, night){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode,'players',targetUid),{ alive:false, diedNight:night },{ merge:true });
  await jgRoomAppendNightLog(night, '血月最後一擊 '+targetSeatNum);
  await jgRoomFinishBloodmoonLastStand();
};
// 房主強制跳過（例如血月使者本人手機沒電、忘記按）：當作這一刀沒有殺任何人，直接讓他
// 真正陣亡、結算勝負。
window.jgRoomHostForceBloodmoonLastStand=async function(){
  if(!confirm('確定要強制跳過血月使者的最後一擊嗎？這會當作沒有殺任何人，直接結算勝負。')) return;
  await jgRoomFinishBloodmoonLastStand();
};
// 不管有沒有真的殺到人，都要「先檢查這一刀有沒有直接達成屠邊」再讓血月使者真正陣亡——
// 這個當下他在資料庫裡都還沒被標記死亡，「狼人是不是已經全滅」不會被誤觸發，只會看到
// 屠民/屠神；沒有達成屠邊的話，他的緩刑到此結束，這時候才真的死亡，「狼人已全滅」這次
// 才會成立，好人陣營獲勝。
async function jgRoomFinishBloodmoonLastStand(){
  const db=window.jgFirebaseDb;
  const roomSnap=await getDoc(doc(db,'rooms',jgRoomCode));
  const rd=roomSnap.data()||{};
  const uid=rd.bloodmoonLastStandUid;
  if(!uid) return; // 已經被別的裝置結算過了
  await setDoc(doc(db,'rooms',jgRoomCode),{ bloodmoonLastStandUid:null },{ merge:true });
  const won=await jgRoomMaybeDeclareWin();
  if(!won){
    await setDoc(doc(db,'rooms',jgRoomCode,'players',uid),{ alive:false },{ merge:true });
    await jgRoomMaybeDeclareWin();
  }
  await jgRoomRefreshAndRenderCurrent();
}
// 放逐投票結算：唯一最高票→真的淘汰（alive:false）、觸發邱比特殉情連動、檢查有沒有開槍
// 資格（獵人/黑狼王/幸運兒獵槍，見 jgRoomCheckShootEligible）；平票→進入 PK；PK 後再度
// 平票、或沒有人投票→無人出局。不管哪種結果，只要沒有人卡在開槍，就直接進入下一夜。
async function jgRoomResolveDayVote(entries, top){
  const db=window.jgFirebaseDb;
  const rd=jgRoomLatestRoomDoc||{};
  // 結果一樣不再用 alert() 彈窗（理由同 jgRoomResolveSheriffVote）——票數/出局/PK 都是寫進
  // 房間文件的共享狀態，所有人的畫面本來就會自動跟著換，需要的口白交給 jgRoomVoiceMaybeNarrate
  // 統一播報（見 dayVoteLastWordsUid 那個分支）。
  if(!entries.length){
    await setDoc(doc(db,'rooms',jgRoomCode),{ votingActive:false, dayVotePkRound:false },{ merge:true });
    await jgRoomStartNextNight();
    return;
  }
  if(top.length>1){
    const tiedSeats=top.map(e=>e.seat);
    if(rd.dayVotePkRound){
      await setDoc(doc(db,'rooms',jgRoomCode),{ votingActive:false, dayVotePkRound:false },{ merge:true });
      await jgRoomStartNextNight();
      return;
    }
    const tiedUids=top.map(e=>e.targetUid);
    // 平票不直接開下一輪投票——先進入「PK」這個獨立的中間畫面，讓 PK 候選人照倒序
    // （比照本機法官助手 PK 的規則：今天發言順序最後面的人先發言）發言完，房主按下去
    // 才真的開放投票，不能讓玩家連反應/發言的時間都沒有就直接被計票。
    await setDoc(doc(db,'rooms',jgRoomCode),{
      dayVotePkRound:true, dayVotePkPendingUids:tiedUids, dayVotePkPendingSeats:tiedSeats
    },{ merge:true });
    jgRoomRenderCurrentPhase();
    return;
  }
  const outSeat=Number(top[0].seat);
  const outUid=top[0].targetUid;
  // 血月使者被動：這次要放逐的剛好是「場上最後一個活著的狼人」而且他是血月使者，不是
  // 真的死掉——公開讓全場知道他暫留場上，直接進入夜晚讓他自己選一人開最後一刀，見
  // jgRoomStartBloodmoonLastStand 的說明。這個檢查要放在真的標記 alive:false 之前。
  if(await jgRoomCheckBloodmoonLastStand(outUid)){
    await jgRoomStartBloodmoonLastStand(outUid, outSeat);
    return;
  }
  await setDoc(doc(db,'rooms',jgRoomCode,'players',outUid),{ alive:false },{ merge:true });
  await jgRoomApplyCupidCascade();
  await setDoc(doc(db,'rooms',jgRoomCode),{ votingActive:false, dayVotePkRound:false },{ merge:true });
  const night=rd.night||1;
  // 狼美人被票出局：昨晚魅惑的對象殉情。
  const wbSeat=await jgRoomWolfbeautyCascade(outUid, null);
  if(wbSeat) await jgRoomAddDayNote(night, outSeat+'號 狼美人出局，被魅惑的 '+wbSeat+'號 殉情');
  const eligible=await jgRoomCheckShootEligible(outUid, night, true);
  if(eligible){
    await setDoc(doc(db,'rooms',jgRoomCode),{ pendingShootUids:[outUid], pendingShootContext:'day' },{ merge:true });
    jgRoomRenderCurrentPhase();
  } else {
    // 沒有開槍資格：如果出局的剛好就是警長本人，要先讓他決定警徽傳給誰，再進遺言／下一夜
    // （見 jgRoomCheckAndSetPendingBadge），有開槍資格的話這個檢查會等 jgRoomShootResolve
    // 決定完開槍之後才做，不會在這裡重複觸發。
    if(await jgRoomCheckAndSetPendingBadge()){
      jgRoomRenderCurrentPhase();
    } else if(await jgRoomMaybeDeclareWin()){
      jgRoomRenderCurrentPhase();
    } else {
      await jgRoomStartDayVoteLastWords(outUid, outSeat);
      jgRoomRenderCurrentPhase();
    }
  }
}
// 房主確認 PK 候選人都發言完畢，正式開放 PK 投票——候選人＝原本平票的那幾位，投票資格
// 排除掉這幾位本人（只有沒參與 PK 的人能投，見 jgRoomStartVoting 的 excludeUids 參數），
// 只能投給 PK 名單裡的人。
window.jgRoomHostStartPkVote=async function(){
  const rd=jgRoomLatestRoomDoc||{};
  const tiedUids=rd.dayVotePkPendingUids||[];
  const tiedSeats=rd.dayVotePkPendingSeats||[];
  if(!tiedUids.length) return;
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{ dayVotePkPendingUids:null, dayVotePkPendingSeats:null },{ merge:true });
  await jgRoomStartVoting('day', tiedUids, tiedUids, '平票（'+tiedSeats.join('、')+'號），PK 重新投票，投票時間倒數10秒，請於時間內投票放逐其中一位');
};
// ── 遺言：白天投票放逐（含PK）確定唯一出局者、槍與警徽都處理完之後，不直接跳下一夜，
//    先讓出局的人發表遺言——90秒倒數，他自己可以提前按「遺言發表完畢」結束，全部人的
//    畫面都看得到同一份共享倒數，時間到了（或他自己按完）都會自動接下一夜，不用等房主
//    另外按按鈕，比照本機法官助手 jgLastWordsBtn 的精神（給遺言，結束後才繼續往下走）。──
async function jgRoomStartDayVoteLastWords(outUid, outSeatNum){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode),{
    dayVoteLastWordsUid: outUid, dayVoteLastWordsSeatNum: outSeatNum,
    dayVoteLastWordsDeadline: Date.now()+90000
  },{ merge:true });
  // 白天被投票放逐（含PK）跟夜晚被刀死法不一樣：放逐是全場都親眼看著投票結果公開發生的，
  // 沒有「死訊還沒公布」這種需要保密的空窗期，所以不用像夜晚死亡那樣等到下一次白天公告
  // 才能看上帝視角——這裡記一個 exiledByVote 旗標，讓 jgRoomGodViewAllowedNow() 對這個人
  // 放行到「發表完遺言之後，不管接下來天黑幾次都能看」，見那裡的說明。
  await setDoc(doc(db,'rooms',jgRoomCode,'players',outUid),{ exiledByVote:true },{ merge:true });
}
// 倒數90秒時間到——跟投票時間到的道理一樣，任何一支還開著這個畫面的手機都可能觸發，
// 用「重新讀一次資料庫，確認這輪遺言還沒被結束過」當安全閥，避免好幾支手機同時倒數到
// 0、重複處理。
async function jgRoomDayVoteLastWordsTimerComplete(){
  const db=window.jgFirebaseDb;
  const roomSnap=await getDoc(doc(db,'rooms',jgRoomCode));
  const fresh=roomSnap.data()||{};
  if(!fresh.dayVoteLastWordsUid){ jgRoomRenderCurrentPhase(); return; }
  await jgRoomFinishDayVoteLastWords();
}
async function jgRoomFinishDayVoteLastWords(){
  const db=window.jgFirebaseDb;
  const roomSnap=await getDoc(doc(db,'rooms',jgRoomCode));
  const fresh=roomSnap.data()||{};
  if(!fresh.dayVoteLastWordsUid){ jgRoomRenderCurrentPhase(); return; } // 已經被別的裝置結束過了
  await setDoc(doc(db,'rooms',jgRoomCode),{
    dayVoteLastWordsUid:null, dayVoteLastWordsSeatNum:null, dayVoteLastWordsDeadline:null
  },{ merge:true });
  await jgRoomStartNextNight();
  jgRoomRenderCurrentPhase();
}
// 出局的人自己按「遺言發表完畢」提前結束——其餘裝置的計時器時間到也會走到同一個結束
// 函式，兩條路徑用同一份安全閥（上面 fresh.dayVoteLastWordsUid 的檢查）避免重複處理。
window.jgRoomFinishDayVoteLastWordsBtn=async function(){
  if(!confirm('確定遺言發表完畢，準備天黑了嗎？')) return;
  await jgRoomFinishDayVoteLastWords();
};
// 幸運兒白天私下確認自己中獎——只寫自己的旗標，不影響任何共享狀態，按完直接照常渲染
// 這一輪原本該顯示的畫面（開槍/警徽/遺言/白天發言……）。
window.jgRoomAckLuckyOneReveal=async function(){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode,'players',window.jgFirebaseUid),{ luckyOneRevealSeen:true },{ merge:true });
  jgRoomRenderCurrentPhase();
};
window.jgRoomAckLoverReveal=async function(){
  const db=window.jgFirebaseDb;
  await setDoc(doc(db,'rooms',jgRoomCode,'players',window.jgFirebaseUid),{ loverRevealSeen:true },{ merge:true });
  jgRoomRenderCurrentPhase();
};

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
  let bodyHtml, needsTimer=false, timerSeconds=20, timerCb=null, needsSpeechSpin=false, turnMeta=null;
  const meForLucky=jgRoomLatestPlayers.find(p=>p.uid===window.jgFirebaseUid);
  if(meForLucky&&meForLucky.luckyOneSkill&&meForLucky.luckyOneGrantedNight!=null&&!meForLucky.luckyOneRevealSeen){
    // 黑市商人交易成功那晚不會立刻告訴他自己中獎，比照本機法官助手「不管交易成功與否，
    // 晚上都走同一套掩護動作」的精神——連線房間改成「白天自己手機上私下顯示」，只有這
    // 支手機自己看得到。用跟發牌房共用的放大版私人提醒（js/room/public-info.js），蓋在
    // 這一輪原本的畫面上面，按「知道了」才收起來，不會卡住任何共享流程。
    const skillLabel={seer:'預言家查驗',witch:'女巫毒藥',hunter:'獵人獵槍'}[meForLucky.luckyOneSkill]||meForLucky.luckyOneSkill;
    const passiveNote=meForLucky.luckyOneSkill==='hunter'
      ?'這是被動能力：之後如果被淘汰（夜裡被刀死或白天被投票出局），會自動跳出開槍畫面讓你選要不要帶人。'
      :'技能會在之後的女巫／預言家步驟自動開放給你操作。';
    jgRoomShowPrivateNotice({key:'luckyone', title:'你是幸運兒', main:'你獲得的是'+skillLabel, note:passiveNote}, 'jgRoomAckLuckyOneReveal()', true);
  }
  // 情侶：白天再提醒一次「誰和誰是情侶」（跟發牌房同一種私人提醒），只有兩位情侶自己看得到。
  if(meForLucky&&(rd.cupidLoverAUid===window.jgFirebaseUid||rd.cupidLoverBUid===window.jgFirebaseUid)&&!meForLucky.loverRevealSeen){
    jgRoomShowPrivateNotice({key:'lovers', title:'你是情侶', main:rd.cupidLoverASeatNum+'號、'+rd.cupidLoverBSeatNum+'號是情侶',
      note:'情侶其中一人死亡，另一人會跟著殉情。'}, 'jgRoomAckLoverReveal()', true);
  }
  if(pendingShoot.length&&rd.pendingShootContext==='day'){
    if(pendingShoot.includes(window.jgFirebaseUid)){
      const night=rd.night||1;
      const r=await jgRoomShootViewHtml(night);
      bodyHtml=r.html; needsTimer=r.needsTimer;
    } else {
      bodyHtml='<div class="nbanner" style="margin-top:20px;"><h1>剛出局的玩家正在決定要不要開槍</h1></div>'
        +'<p class="sub" style="text-align:center;margin-top:8px;">請安靜等待</p>';
    }
  } else if(rd.pendingBadgeUid){
    if(rd.pendingBadgeUid===window.jgFirebaseUid){
      const r=jgRoomBadgeViewHtml();
      bodyHtml=r.html; needsTimer=r.needsTimer;
    } else {
      bodyHtml='<div class="nbanner" style="margin-top:20px;"><h1>警長剛剛陣亡，正在決定警徽要傳給誰</h1></div>'
        +'<p class="sub" style="text-align:center;margin-top:8px;">請安靜等待</p>';
    }
  } else if(rd.dayVotePkPendingUids&&rd.dayVotePkPendingUids.length){
    // 平票進入 PK：候選人照「今天發言順序」倒序發言（最後發言的人先講），講完由房主按
    // 「開始投票」才真的開放投票——跟直接沿用第一輪投票結果、或跳過發言直接開票是兩回事。
    const pkSeats=rd.dayVotePkPendingSeats||[];
    const pkOrder=jgRoomComputePkSpeechOrder(pkSeats, rd);
    bodyHtml='<div class="nbanner" style="margin-top:20px;"><h1>平票（'+pkSeats.join('、')+'號），進入 PK</h1></div>'
      +'<p class="sub" style="text-align:center;margin-top:8px;">請依序發言：'+pkOrder.join(' → ')+'（倒序，最後發言的人先講）</p>'
      +(jgRoomIsHost?'<button class="primary" style="margin-top:16px;" onclick="jgRoomHostStartPkVote()">PK 發言完畢，開始投票 →</button>':'<div class="info" style="font-size:12px;text-align:center;margin-top:10px;">請等待房主開放投票</div>');
  } else if(rd.dayVoteLastWordsUid){
    // 白天投票放逐（含PK）確定唯一出局者、槍/警徽都處理完之後，不直接跳下一夜，先讓
    // 出局的人發表遺言——90秒倒數，他自己也能提前按「遺言發表完畢」結束，時間到
    // （或他自己按完）都會自動接下一夜，不用等房主另外按按鈕。
    const isMe=rd.dayVoteLastWordsUid===window.jgFirebaseUid;
    needsTimer=true;
    timerSeconds=Math.max(1, Math.ceil(((rd.dayVoteLastWordsDeadline||Date.now())-Date.now())/1000));
    timerCb=jgRoomDayVoteLastWordsTimerComplete;
    const seatNum=rd.dayVoteLastWordsSeatNum;
    if(isMe){
      bodyHtml=jgRoomTimerHtml(timerSeconds, seatNum+'號出局，請發表遺言')
        +'<div class="nbanner" style="margin-top:20px;"><h1>發表遺言</h1></div>'
        +'<div style="text-align:center;"><button class="primary" style="margin-top:14px;" onclick="jgRoomFinishDayVoteLastWordsBtn()">遺言發表完畢 →</button></div>';
    } else {
      bodyHtml=jgRoomTimerHtml(timerSeconds, seatNum+'號出局，請發表遺言')
        +'<div class="nbanner" style="margin-top:20px;"><h1>'+seatNum+'號 正在發表遺言</h1></div>'
        +'<p class="sub" style="text-align:center;margin-top:8px;">請安靜等待</p>';
    }
  } else if(rd.sheriffPhase==='pick-direction'&&iAmSheriff){
    const total=jgRoomLatestPlayers.length;
    const leftP=jgRoomLatestPlayers.find(p=>p.seatNum===(jgMySeatNum%total)+1);
    const rightP=jgRoomLatestPlayers.find(p=>p.seatNum===((jgMySeatNum-2+total)%total)+1);
    bodyHtml='<div class="nbanner" style="margin-top:20px;"><h1>請選擇發言方向</h1></div>'
      +'<div style="text-align:center;margin-top:10px;">'
      +(rightP?'<button onclick="jgRoomSheriffPickDirection('+rightP.seatNum+',\'順\')" style="margin:4px;width:auto;display:inline-block;padding:10px 16px;">警右：'+rightP.seatNum+'號 '+rightP.name+'</button>':'')
      +(leftP?'<button onclick="jgRoomSheriffPickDirection('+leftP.seatNum+',\'逆\')" style="margin:4px;width:auto;display:inline-block;padding:10px 16px;">警左：'+leftP.seatNum+'號 '+leftP.name+'</button>':'')
      +'</div>';
  } else if(rd.sheriffPhase==='pick-direction'){
    bodyHtml='<div class="nbanner" style="margin-top:20px;"><h1>警長正在決定發言方向</h1></div>'
      +'<p class="sub" style="text-align:center;margin-top:8px;">請安靜等待</p>';
  } else {
    const dirLabel=rd.daySpeechDir==='順'?'順時針':'逆時針';
    const night=rd.night||1;
    // 死訊改讀 dayLog/{night}.deathLine（見 jgRoomCaptureDeathLine），不要直接看
    // wolfKillTargetSeatNum 這種即時欄位——那個沒有考慮守衛+解藥保下來的情況，會誤報
    // 「其實沒死的人」死亡。
    const dayLogSnap=await getDoc(doc(db,'rooms',jgRoomCode,'dayLog',String(night)));
    const nightMsg=dayLogSnap.exists()?('昨晚 '+dayLogSnap.data().deathLine):'（死訊結算中...）';
    // 白天公開發生的事（騎士決鬥、狼美人殉情…）
    const dayNotes=(dayLogSnap.exists()&&dayLogSnap.data().extraNotes)||[];
    const dayNotesHtml=dayNotes.map(n=>'<div class="info-warn" style="font-size:13px;text-align:center;margin-top:6px;">'+n+'</div>').join('');
    // 發言順序：daySpeechStart 每天都要重新決定（有人死亡就固定從死者下一位活人開始，
    // 平安夜才隨機抽起點；方向一旦決定過，整局都不會再變，見 jgRoomAutoSpinSpeechOrder
    // 的說明）——這裡只有第一天、剛好有選出警長時才會直接有值（警長競選那邊會問要往
    // 左還右發言，見 jgRoomSheriffPickDirection）。其餘情況原本要靠房主按「抽籤」按鈕，
    // 但房主如果剛好死亡、切進上帝視角就按不到這顆按鈕，會卡住整個流程——改成任何一支
    // 裝置畫面渲染到這裡、發現還沒抽籤，就自動觸發一次（jgRoomAutoSpinSpeechOrder 內部
    // 會重新讀一次最新資料庫狀態確認「真的還沒人抽過」才寫入，好幾支手機同時觸發也不會
    // 抽兩次、互相蓋掉）,不用等房主，也不用房主還活著。
    // 抽籤要有明顯在隨機選擇的感覺（比照本機法官助手 jgSpinWheel：畫面上的號碼快速跳動
    // 一陣子才停），不然大家會懷疑「這是不是真的隨機」。這裡的跳動只是每支手機自己本機
    // 播放的視覺效果（用 setInterval 在自己畫面上亂跳號碼），跟真正決定結果的
    // jgRoomAutoSpinSpeechOrder（寫進資料庫、全房共用同一個結果）是兩件事——真正結果
    // 一旦寫進資料庫，這個分支下次重畫就會走 rd.daySpeechStart 那個 if，跳動動畫自然
    // 不會再顯示，也會在 jgRoomStartSpeechSpinAnimation 裡自己停止。
    let speechHtml;
    if(rd.daySpeechStart){
      const aliveSeats=jgRoomLatestPlayers.filter(p=>p.alive!==false).map(p=>p.seatNum);
      const order=jgRoomCircularOrder(rd.daySpeechStart, rd.daySpeechDir, jgRoomTotal||jgRoomLatestPlayers.length, new Set(aliveSeats));
      turnMeta=jgRoomSpeechTurnWidgetHtml(rd, order, 'day:'+night);
      speechHtml='<p class="sub" style="text-align:center;margin-top:8px;">從 '+rd.daySpeechStart+'號 開始，'+dirLabel+'發言</p>'
        +(turnMeta?turnMeta.html:'');
    } else {
      speechHtml='<p class="sub" style="text-align:center;margin-top:8px;">抽籤決定發言順序中…<span id="jg-room-speechspin" style="display:inline-block;margin-left:6px;font-weight:800;font-size:16px;"></span></p>';
      jgRoomAutoSpinSpeechOrder(night);
      needsSpeechSpin=true;
    }
    bodyHtml='<div class="nbanner nbanner-day" style="margin-top:20px;"><h1>白天開始</h1>'
      +'<p class="sub" style="text-align:center;margin-top:8px;">'+nightMsg+'</p></div>'
      +dayNotesHtml
      +speechHtml
      +(jgRoomIsHost?'<button class="primary" style="margin-top:16px;" onclick="jgRoomHostStartDayVote()">大家都發言完了，開始投票放逐 →</button>':'')
      +jgRoomLiveVoteTallyHtml();
  }
  root.innerHTML=`<div class="section-title">白天</div>${bodyHtml}`;
  if(needsTimer) jgRoomStartTimer(timerSeconds, timerCb); else jgRoomStopTimer();
  if(needsSpeechSpin){
    jgRoomStartSpeechSpinAnimation();
  } else {
    if(jgRoomSpeechSpinInterval){ clearInterval(jgRoomSpeechSpinInterval); jgRoomSpeechSpinInterval=null; }
    jgRoomStartSpeechTurnClock(turnMeta);
  }
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
// 自動抽籤決定「今天從幾號開始發言」——跟本機法官助手 jgSpinWheel／jgSpinDirectionOnly
// 同一套規則：方向（順/逆）整局只會決定一次，決定過就不會再變，之後每天只重新抽起點；
// 如果昨晚有人死亡，起點不是隨機的，是固定從「死者的下一個活人」（照已經定好的方向）
// 開始——沒有死人的平安夜才會連起點一起隨機抽。這裡不做本機那種逐格跳動的抽籤動畫
// （連線房間是好幾支手機同步看同一個結果，不是單一台裝置在演戲給大家看），計算完直接
// 寫入最終結果，全部人的畫面會透過即時監聽器一起看到。
// 原本這是房主專用的手動按鈕，但房主如果剛好死亡、切去上帝視角就按不到，會卡住整個
// 流程——改成任何一支裝置畫面渲染到「還沒抽籤」的白天開場畫面，就自動觸發一次；
// jgRoomSpeechOrderAutoTriedNight 這個模組層級變數只是「同一支裝置不用每次重畫都重新
// 讀一次資料庫」的節流，真正防止「好幾支手機同時觸發、抽兩次互相蓋掉」的是函式一開頭
// 那次重新讀取資料庫最新狀態、確認 daySpeechStart 真的還是空的才繼續算下去。
let jgRoomSpeechOrderAutoTriedNight=null;
// 抽籤動畫（比照本機法官助手 jgSpinWheel 的做法：號碼快速跳動一陣子再停）——這裡只是
// 純視覺效果，每支手機各自在自己畫面上跑，跟真正決定結果的 jgRoomAutoSpinSpeechOrder
// 完全獨立，就算好幾支手機同時看到、跳出來的過程不會一樣也沒關係，反正最後大家看到的
// 「真正結果」都是同一份資料庫寫入的值。
let jgRoomSpeechSpinInterval=null;
function jgRoomStartSpeechSpinAnimation(){
  if(jgRoomSpeechSpinInterval) return; // 已經在跳了，不要疊加第二個計時器
  const alive=jgRoomLatestPlayers.filter(p=>p.alive!==false).map(p=>p.seatNum);
  if(!alive.length) return;
  let ticks=0;
  jgRoomSpeechSpinInterval=setInterval(()=>{
    const el=document.getElementById('jg-room-speechspin');
    if(!el){ clearInterval(jgRoomSpeechSpinInterval); jgRoomSpeechSpinInterval=null; return; }
    ticks++;
    const n=alive[Math.floor(Math.random()*alive.length)];
    el.textContent=n+'號';
    if(ticks>=18){ clearInterval(jgRoomSpeechSpinInterval); jgRoomSpeechSpinInterval=null; }
  },80);
}
async function jgRoomAutoSpinSpeechOrder(night){
  if(jgRoomSpeechOrderAutoTriedNight===night) return;
  jgRoomSpeechOrderAutoTriedNight=night;
  const db=window.jgFirebaseDb;
  const freshSnap=await getDoc(doc(db,'rooms',jgRoomCode));
  const rd=freshSnap.exists()?freshSnap.data():{};
  if(rd.daySpeechStart) return; // 已經有其他裝置搶先抽過了
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
}

// ═══════════════════════════════════════════
// 發言 90 秒輪流計時器（警長競選政見發表／白天一般發言共用）——比照本機法官助手
// jgSpeakTimerWidgetHtml 的規則：時間到只響鈴提醒（音檔沿用本機同一個 speak_time's_up.mp3），
// 不會自動幫忙跳下一位；發言中的那個人自己按「過，下一位」才會換人，房主另外有一顆
// 「幫他跳過」的按鈕，當作卡住時的備用（例如那個人手機沒電、忘記按）。
// 跟本機版最大的不同：這裡好幾支手機要同步看到同一個「現在輪到誰、還剩幾秒」，所以順序
// 本身（speechTurnOrder/Idx/Deadline）存在房間文件裡，是共用狀態；每支手機畫面上的倒數
// 讀秒動畫則是各自本機用 setInterval 算「離 deadline 還有幾秒」，不用整秒都寫資料庫。
// ═══════════════════════════════════════════
// 從 startSeat 開始、依 dir 方向繞一圈座位（1..total），只留下 includeSet 裡的號碼，
// 回傳依繞行順序排好的陣列——警長競選只留候選人號碼，白天發言留所有活人號碼。
function jgRoomCircularOrder(startSeat, dir, total, includeSet){
  const order=[];
  if(!startSeat||!dir||!total) return order;
  let n=startSeat;
  for(let i=0;i<total;i++){
    if(includeSet.has(n)) order.push(n);
    n=dir==='逆'?(n-1<1?total:n-1):(n+1>total?1:n+1);
  }
  return order;
}
// contextKey 用來分辨「這是不是全新的一輪發言」（警長政見發表跟白天發言各自有自己的
// key，例如 'sheriff:1'／'day:2'）——contextKey 改變就整個重新起算，同一個 key 只會
// 初始化一次（跟 jgRoomAutoSpinSpeechOrder 同一種「先讀最新資料庫狀態確認真的還沒人
// 初始化過」防重複寫入手法）。
let jgRoomSpeechTurnAutoTriedKey=null;
async function jgRoomEnsureSpeechTurn(contextKey, order){
  if(!order.length) return;
  if(jgRoomSpeechTurnAutoTriedKey===contextKey) return;
  jgRoomSpeechTurnAutoTriedKey=contextKey;
  const db=window.jgFirebaseDb;
  const freshSnap=await getDoc(doc(db,'rooms',jgRoomCode));
  const rd=freshSnap.exists()?freshSnap.data():{};
  if(rd.speechTurnContext===contextKey) return; // 已經有其他裝置搶先初始化過這一輪了
  await setDoc(doc(db,'rooms',jgRoomCode),{
    speechTurnContext:contextKey, speechTurnOrder:order, speechTurnIdx:0,
    speechTurnDeadline:Date.now()+90000
  },{ merge:true });
}
// 「過，下一位」／房主「幫他跳過」共用同一個函式——不管是誰按的，效果都是「换下一位、
// 重新倒數 90 秒」，差別只在畫面上按鈕給誰看（見 jgRoomSpeechTurnWidgetHtml）。重新讀一次
// 最新資料庫狀態確認 contextKey 還對得上，避免使用者按到已經換頁的舊按鈕。
window.jgRoomSpeechTurnNext=async function(contextKey){
  const db=window.jgFirebaseDb;
  const freshSnap=await getDoc(doc(db,'rooms',jgRoomCode));
  const rd=freshSnap.exists()?freshSnap.data():{};
  if(rd.speechTurnContext!==contextKey) return;
  const idx=(rd.speechTurnIdx||0)+1;
  await setDoc(doc(db,'rooms',jgRoomCode),{ speechTurnIdx:idx, speechTurnDeadline:Date.now()+90000 },{ merge:true });
};
// 組出計時器卡片 HTML，同時回傳等一下要拿去啟動讀秒動畫的資訊（deadline/contextKey/idx）
// ——呼叫端要在真的把這段 html 寫進 root.innerHTML 之後，才能呼叫
// jgRoomStartSpeechTurnClock，不然抓不到剛渲染出來的 DOM 元素。
function jgRoomSpeechTurnWidgetHtml(rd, order, contextKey){
  jgRoomEnsureSpeechTurn(contextKey, order);
  if(!order.length) return null;
  const live=rd.speechTurnContext===contextKey;
  const turnOrder=live?(rd.speechTurnOrder||order):order;
  const idx=live?(rd.speechTurnIdx||0):0;
  const deadline=live?(rd.speechTurnDeadline||(Date.now()+90000)):(Date.now()+90000);
  if(idx>=turnOrder.length){
    return {html:'<div class="card" style="text-align:center;padding:14px;margin-bottom:10px;"><div class="info" style="font-size:13px;">全部發言完畢</div></div>', deadline:0, contextKey, idx:-1};
  }
  const curSeat=turnOrder[idx];
  const p=jgRoomLatestPlayers.find(pp=>pp.seatNum===curSeat);
  const nm=p?(curSeat+'號 '+p.name):(curSeat+'號');
  const isMe=!!(p&&p.uid===window.jgFirebaseUid);
  const upcoming=turnOrder.slice(idx+1).map(s=>s+'號').join('、');
  const nextBtn=isMe
    ?'<button class="primary" style="margin-top:10px;" onclick="jgRoomSpeechTurnNext(\''+contextKey+'\')">過，下一位 →</button>'
    :'';
  const hostBtn=(jgRoomIsHost&&!isMe)
    ?'<button style="margin-top:8px;font-size:12px;color:var(--text3);" onclick="jgRoomSpeechTurnNext(\''+contextKey+'\')">房主：幫他跳過，換下一位</button>'
    :'';
  const html='<div class="card" style="text-align:center;padding:16px 14px;margin-bottom:10px;">'
    +'<div style="font-size:12px;color:var(--text2);">目前發言（90 秒倒數）</div>'
    +'<div style="font-size:22px;font-weight:800;margin:4px 0;">'+nm+'</div>'
    +'<div id="jg-room-speechturn-clock" style="font-size:38px;font-weight:800;font-variant-numeric:tabular-nums;">01:30</div>'
    +'<div id="jg-room-speechturn-uptxt" style="font-size:12px;color:#922418;min-height:16px;margin-top:2px;"></div>'
    +nextBtn+hostBtn
    +'<div style="font-size:11px;color:var(--text3);margin-top:8px;">'+(upcoming?'接下來：'+upcoming:'（最後一位）')+'</div>'
    +'<audio id="jg-room-speechturn-audio" src="speak_time\'s_up.mp3" preload="auto"></audio>'
    +'</div>';
  return {html, deadline, contextKey, idx};
}
let jgRoomSpeechTurnClockInterval=null;
let jgRoomSpeechTurnRungKey=null; // 記住「哪一輪、第幾位」已經響過鈴，同一位不會被重複響好幾次
function jgRoomStartSpeechTurnClock(meta){
  if(jgRoomSpeechTurnClockInterval){ clearInterval(jgRoomSpeechTurnClockInterval); jgRoomSpeechTurnClockInterval=null; }
  if(!meta||meta.idx<0||!meta.deadline) return; // 全部發言完畢，或沒有發言名單，不用跑計時器
  const tick=()=>{
    const el=document.getElementById('jg-room-speechturn-clock');
    if(!el){ clearInterval(jgRoomSpeechTurnClockInterval); jgRoomSpeechTurnClockInterval=null; return; }
    const remain=Math.max(0, Math.ceil((meta.deadline-Date.now())/1000));
    el.textContent=String(Math.floor(remain/60)).padStart(2,'0')+':'+String(remain%60).padStart(2,'0');
    if(remain<=0){
      el.style.color='var(--wolf)';
      const up=document.getElementById('jg-room-speechturn-uptxt');
      if(up) up.textContent='⏰ 時間到';
      const ringKey=meta.contextKey+':'+meta.idx;
      if(jgRoomSpeechTurnRungKey!==ringKey){
        jgRoomSpeechTurnRungKey=ringKey;
        const audio=document.getElementById('jg-room-speechturn-audio');
        if(audio){ try{ audio.currentTime=0; audio.play().catch(()=>{}); }catch(e){} }
      }
    }
  };
  tick();
  jgRoomSpeechTurnClockInterval=setInterval(tick,1000);
}
// 房主開始放逐投票：候選人＝目前還活著的所有玩家，沒有人被排除在投票資格之外（跟警長
// 競選不同，放逐投票不用先「報名」，活著的人都能投也都能被投）。
window.jgRoomHostStartDayVote=async function(){
  const aliveUids=jgRoomLatestPlayers.filter(p=>p.alive!==false).map(p=>p.uid);
  if(aliveUids.length<2){ alert('存活人數不足，無法投票'); return; }
  await jgRoomStartVoting('day', aliveUids, [], '都發言完畢，準備投票，投票時間倒數10秒，請於時間內投票');
};
