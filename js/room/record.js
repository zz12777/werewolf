'use strict';
// ═══════════════════════════════════════════
// js/room/record.js
// 連線房間：上帝視角、遊戲結束畫面、匯出文字紀錄、送出遊玩數據。
// 連線房間的程式拆成 js/room/ 底下好幾個一般 script 檔（依 index.html 的順序用 defer 載入，
// 共用同一個全域範圍，互相看得到彼此的變數與函式）；Firestore 函式由 js/firebase-init.js 提供。
// 檔案總覽見 js/room/core.js 開頭。
// ═══════════════════════════════════════════

// ══════════════════════════════════════════
// 死亡玩家的上帝視角：一鍵切換，看到全場每個人的真實身分，加上一份即時更新的文字紀錄
// （格式比照法官助手的夜晚紀錄，簡短一行一行列出來）。只有真的死亡的玩家看得到這個
// 切換按鈕——這個功能需要讀取別人的查驗紀錄（不只是自己的），所以 seerChecks／
// mediumChecks／votes 這幾個子集合的安全規則也要跟著放寬成全房可讀（跟 secrets 一樣的
// 取捨：這是死亡玩家的合法功能，不是後門）。
// ══════════════════════════════════════════
let jgRoomGodViewOn=false;
// 修正過的 bug：這裡原本不管切換後的新狀態是什麼，一律呼叫 jgRoomRenderGodView()——
// 導致按「退出上帝視角」把 jgRoomGodViewOn 改成 false 之後，畫面卻還是重新渲染「上帝
// 視角」本身（因為直接呼叫的就是這個函式），看起來像按了沒反應。改成呼叫
// jgRoomRenderCurrentPhase()，讓它自己依照 jgRoomGodViewOn 的最新值決定要顯示上帝視角
// 還是回到正常畫面。
window.jgRoomToggleGodView=function(){
  jgRoomGodViewOn=!jgRoomGodViewOn;
  jgRoomRenderCurrentPhase();
};
// 「玩家狀態格子＋文字紀錄」這兩塊是上帝視角跟遊戲結束畫面共用的內容（差別只在最上面的
// banner／有沒有「退出上帝視角」按鈕），抽成共用函式，兩邊各自組自己的外層 html 就好，
// 不用維護兩份幾乎一樣的查詢/組字串邏輯。
async function jgRoomBuildGodViewSections(){
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
    const roleName=role?jgRoomDisplayRoleName(role, p.mechWolfLearnedRole):'?';
    // 顏色比照本機法官助手的 BADGE 對照表——民是綠色（bv）、狼隊固定紅色（bw），每個神職
    // 各自有自己的顏色（bs 預言家/通靈師、bwt 女巫/黑市商人、bh 獵人、bg2 守衛...），不是
    // 只靠死活分紅綠兩色；死亡的人再疊加灰底＋一個骷髏圖案（用畫的圖案，不是 emoji），
    // 避免灰底在有些螢幕上不夠明顯看不出來已經出局。
    const badgeCls=(role&&typeof BADGE!=='undefined'&&BADGE[role])||'bv';
    const deadMark=p.alive===false?jgRoomDeadSkullSvg():'';
    return '<div class="pcell'+(p.alive===false?' dead':'')+'"><div class="pnum">'+p.seatNum+'號'+deadMark+'</div>'
      +'<div class="pname">'+p.name+'</div>'
      +'<div class="prole"><span class="badge '+badgeCls+'">'+roleName+'</span></div></div>';
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
    (dLog.extraNotes||[]).forEach(n=>lines.push('>'+n));
    blocks.push({head:'**白天'+ordSuffix(n), lines});
  });

  const logHtml=blocks.length
    ? blocks.map(b=>'<div class="gl-head">'+b.head+'</div>'+b.lines.map(l=>'<div class="gl-sub">'+l+'</div>').join('')).join('')
    : '目前還沒有紀錄';

  return {pgridHtml, logHtml, blocks, roleByUid};
}
async function jgRoomRenderGodView(){
  const root=document.getElementById('jg-room-content');
  if(!root) return;
  const {pgridHtml, logHtml}=await jgRoomBuildGodViewSections();
  root.innerHTML=`
    <div class="nbanner nbanner-god"><h1>上帝視角</h1></div>
    <div class="section-title" style="margin-top:16px;">玩家狀態</div>
    <div class="pgrid">${pgridHtml}</div>
    <div class="section-title" style="margin-top:16px;">文字紀錄</div>
    <div class="godlog">${logHtml}</div>
    <button style="margin-top:14px;" onclick="jgRoomToggleGodView()">← 退出上帝視角</button>
  `;
}
// 遊戲結束畫面：所有人（不用等死亡才能切上帝視角）都直接看到勝負結果＋完整身分／文字
// 紀錄，跟上帝視角共用同一份「玩家狀態＋文字紀錄」內容（jgRoomBuildGodViewSections），
// 只是最上面換成勝負 banner，也不需要「退出」按鈕——遊戲已經結束了，沒有其他畫面可以回去。
async function jgRoomRenderGameOverPhase(){
  const root=document.getElementById('jg-room-content');
  if(!root) return;
  const rd=jgRoomLatestRoomDoc||{};
  const {pgridHtml, logHtml}=await jgRoomBuildGodViewSections();
  const winner=rd.gameOverWinner;
  const winnerLabel=winner==='wolf'?'狼人陣營獲勝':(winner==='good'?'好人陣營獲勝':(winner==='third'?'第三方獲勝':'遊戲結束'));
  const winnerClass=winner==='wolf'?'nbanner-evil':(winner==='good'?'nbanner-good':'');
  root.innerHTML=`
    <div class="nbanner ${winnerClass}"><h1>${winnerLabel}</h1>
      <p class="sub" style="text-align:center;margin-top:8px;">${(rd.gameOverMsg||'').replace(/</g,'&lt;')}</p></div>
    <div style="display:flex;gap:8px;margin-top:14px;">
      <button style="flex:1;" onclick="jgRoomShowExportModal()">匯出文字紀錄</button>
      <button style="flex:1;" onclick="jgRoomSubmitToPlaydata()">送出到遊玩數據</button>
    </div>
    <div class="info" style="font-size:12px;margin-top:8px;">房間資料會在開房滿一天後自動清除，要留存請先匯出文字紀錄、送出遊玩數據。</div>
    <div class="section-title" style="margin-top:16px;">玩家身分</div>
    <div class="pgrid">${pgridHtml}</div>
    <div class="section-title" style="margin-top:16px;">文字紀錄</div>
    <div class="godlog">${logHtml}</div>
  `;
}

// 比照本機法官助手 jgAutoGameTitle() 的「沒有選現成板子時，用場上特殊角色兜標題」規則，
// 連線房間沒有另外記錄板子名稱（建立房間時只存了 comp／total），一律用這個規則從 jgRoomComp
// 兜出來——目前先支援的兩個板子（機械狼＋通靈師／攝夢人＋夢魘）各自的特殊角色固定只有
// 兩個，兜出來的標題會跟本機法官助手選同樣板子時的標題一致（例如「機械狼通靈師」）。
function jgRoomAutoGameTitle(){
  const baseline=new Set(['villager','wolf','seer','witch','hunter','guard']);
  const specialRoles=Object.keys(jgRoomComp||{}).filter(r=>(jgRoomComp[r]||0)>0&&!baseline.has(r));
  if(!specialRoles.length) return '基本板';
  if(typeof GAME_TITLE_ROLE_ORDER!=='undefined'){
    specialRoles.sort((a,b)=>GAME_TITLE_ROLE_ORDER.indexOf(a)-GAME_TITLE_ROLE_ORDER.indexOf(b));
  }
  return specialRoles.map(r=>(typeof jgFullRoleName==='function'?jgFullRoleName(r):((typeof RNAME!=='undefined'&&RNAME[r])||r))).join('');
}
// 組出跟本機法官助手 jgExportGameLog() 同樣格式的純文字紀錄：===板子標題=== → 座號/姓名/
// 身分名單 → =====日期_房號===== → 逐一區塊（警長競選／夜晚／白天，直接借用
// jgRoomBuildGodViewSections() 已經組好的 blocks，格式本來就跟本機法官助手一致）→
// =====結果=====。
async function jgRoomBuildExportText(){
  const rd=jgRoomLatestRoomDoc||{};
  const {blocks, roleByUid}=await jgRoomBuildGodViewSections();
  const title=jgRoomAutoGameTitle();
  let out='==='+title+'===\n';
  jgRoomLatestPlayers.slice().sort((a,b)=>a.seatNum-b.seatNum).forEach(p=>{
    const role=roleByUid[p.uid];
    const roleName=role?jgRoomDisplayRoleName(role, p.mechWolfLearnedRole):'?';
    out+=p.seatNum+' '+p.name+' '+roleName+'\n';
  });
  const d=new Date();
  const mmdd=String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0');
  out+='====='+mmdd+'_'+jgRoomCode+'=====\n';
  blocks.forEach((b,idx)=>{
    if(idx>0) out+='\n';
    out+=b.head+'\n';
    b.lines.forEach(l=>{ out+=l+'\n'; });
  });
  const resultLabel=rd.gameOverWinner==='wolf'?'邪惡陣營獲勝':(rd.gameOverWinner==='good'?'好人陣營獲勝':(rd.gameOverWinner==='third'?'第三方獲勝':'遊戲結束'));
  out+='====='+resultLabel+'=====';
  return out;
}
window.jgRoomShowExportModal=async function(){
  const text=await jgRoomBuildExportText();
  let modal=document.getElementById('jg-room-export-modal');
  if(!modal){
    modal=document.createElement('div');
    modal.id='jg-room-export-modal';
    modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
    document.body.appendChild(modal);
  }
  const safeText=text.replace(/</g,'&lt;');
  modal.innerHTML='<div style="background:var(--bg1,#fff);border-radius:14px;padding:16px;max-width:480px;width:100%;max-height:85vh;display:flex;flex-direction:column;">'
    +'<div style="font-weight:800;margin-bottom:8px;">本局文字紀錄</div>'
    +'<textarea readonly style="flex:1;min-height:300px;font-family:monospace;font-size:12px;white-space:pre;padding:10px;border-radius:8px;">'+safeText+'</textarea>'
    +'<div style="display:flex;gap:8px;margin-top:10px;">'
    +'<button class="primary" style="flex:1;" onclick="jgRoomCopyExportText()">複製文字</button>'
    +'<button style="flex:1;" onclick="document.getElementById(\'jg-room-export-modal\').remove()">關閉</button>'
    +'</div></div>';
};
window.jgRoomCopyExportText=function(){
  const modal=document.getElementById('jg-room-export-modal');
  const ta=modal&&modal.querySelector('textarea');
  if(!ta) return;
  ta.select();
  navigator.clipboard?.writeText(ta.value).catch(()=>{});
  try{ document.execCommand('copy'); }catch(e){}
};
// 送到遊玩數據：跟本機法官助手 pdSubmitGameRecord() 走同一份 Google 表單設定
// （PD_FORM_ACTION_URL／PD_FORM_ENTRIES／PD_SUBMIT_PASSWORD，定義在 js/playdata-core.js，
// 那個檔案是一般 <script>、比這個 module 早載入，可以直接引用），只是玩家清單／文字紀錄
// 要從房間自己的資料組，不能借用本機法官助手那邊 jgPlayers／jgExportGameLog 那一套
// （連線房間走的是完全獨立的一份資料）。
window.jgRoomSubmitToPlaydata=async function(){
  const rd=jgRoomLatestRoomDoc||{};
  if(!rd.gameOverWinner){ alert('目前沒有可送出的對局結果'); return; }
  if(typeof PD_NOT_CONFIGURED==='undefined'||PD_NOT_CONFIGURED(PD_FORM_ACTION_URL)){
    alert('雲端試算表還沒設定好喔～可以先用上面「匯出文字紀錄」複製這場的內容，之後貼給整理資料的人。');
    return;
  }
  const pw=prompt('請輸入密碼以確認送出這場紀錄：');
  if(pw===null) return; // 按取消，什麼都不做
  if(pw!==PD_SUBMIT_PASSWORD){ alert('密碼不對，這場沒有送出。'); return; }
  const {blocks, roleByUid}=await jgRoomBuildGodViewSections();
  const d=new Date();
  const mmdd=String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0');
  const id=mmdd+'_'+jgRoomCode;
  const iso=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const players=jgRoomLatestPlayers.slice().sort((a,b)=>a.seatNum-b.seatNum).map(p=>{
    const role=roleByUid[p.uid];
    return { num:p.seatNum, name:p.name, role:(role?((typeof RNAME!=='undefined'&&RNAME[role])||role):'?') };
  });
  const winner=rd.gameOverWinner==='wolf'?'evil':(rd.gameOverWinner==='third'?'third':'good');
  const resultText=winner==='good'?'好人陣營獲勝':(winner==='third'?'第三方獲勝':'邪惡陣營獲勝');
  const board=jgRoomAutoGameTitle();
  // 文字紀錄只要送出「**警長競選／**夜晚／**白天…」這幾個區塊本身，不要帶最上面的
  // ===板子標題===／座號名單／=====日期_房號===== 這幾行（跟本機法官助手 pdSubmitGameRecord
  // 的做法一致，那幾行資訊已經分別送進 board／players 欄位了，不用在 log 欄位重複一次）；
  // 連線房間的區塊順序是「警長競選在最前面」（跟本機法官助手「警長競選夾在夜晚1st裡面」
  // 順序不同，見 jgRoomBuildGodViewSections 的說明），所以不能沿用本機法官助手那邊「找
  // 第一個 **夜晚 才截斷」的寫法（那樣會把最前面的警長競選區塊漏掉），改成找「第一個
  // 區塊標頭」本身在哪裡出現就從那裡截斷，不管那是警長競選還是夜晚。
  const fullLog=blocks.map((b,idx)=>(idx>0?'\n':'')+b.head+'\n'+b.lines.map(l=>l+'\n').join('')).join('');
  const log=fullLog;
  const body=new URLSearchParams();
  body.append(PD_FORM_ENTRIES.id, id);
  body.append(PD_FORM_ENTRIES.date, iso);
  body.append(PD_FORM_ENTRIES.board, board);
  body.append(PD_FORM_ENTRIES.resultText, resultText);
  body.append(PD_FORM_ENTRIES.winner, winner);
  body.append(PD_FORM_ENTRIES.time, d.toTimeString().slice(0,5));
  body.append(PD_FORM_ENTRIES.players, JSON.stringify(players));
  body.append(PD_FORM_ENTRIES.log, log);
  fetch(PD_FORM_ACTION_URL, {method:'POST', mode:'no-cors', body})
    .then(()=>alert('已送出到遊玩數據！（切到「遊玩數據」分頁重新整理就看得到）'))
    .catch(()=>alert('送出失敗，請檢查網路連線後再試一次'));
};
