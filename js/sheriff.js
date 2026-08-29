// ═══════════════════════════════════════════
// js/sheriff.js
// 警長競選全流程（候選、發言、退水、投票、PK、發言方向、警徽交接）
// ═══════════════════════════════════════════

let jgSheriffAudioEl=null;
function jgSheriffAudioPlay(){
  if(!jgSheriffAudioEl) jgSheriffAudioEl=new Audio('sheriff_start.mp3');
  jgSheriffAudioEl.play();
}
function jgSheriffAudioPause(){
  if(jgSheriffAudioEl) jgSheriffAudioEl.pause();
}
function jgSheriffAudioReplay(){
  if(!jgSheriffAudioEl) jgSheriffAudioEl=new Audio('sheriff_start.mp3');
  jgSheriffAudioEl.currentTime=0;
  jgSheriffAudioEl.play();
}

// ── 即時票型紀錄（公開同步到 Google 試算表，讓玩家在遊戲進行中就能看到票型） ──
// 部署好 Google Apps Script 網頁應用程式後，把拿到的網址貼在這裡（結尾通常是 /exec）。
// 留空的話，同步功能整個不會執行（不會出現任何錯誤，只是安靜地跳過），公開票型區塊也
// 會提示還沒設定。部署步驟請見對話中法官給的教學。
function jgFormatSheriffBlock(){
  if(!jgSheriffCampaignHappened && !jgSheriffSelfDestruct) return ''; // 沒有人上警，不輸出這個區塊
  let candidatesNums=null, startNum=null, dirLabel=null, withdrawals=[], hanTiaoNotes=[];
  const round1Votes=[], pkVotes=[];
  let round1Abstain=null, pkAbstain=null, noSheriffNote=null, autoElectReason=null;
  jgSheriffLogLines.forEach(l=>{
    let m;
    if((m=l.match(/^候選人：(.+)號$/))) candidatesNums=m[1];
    else if((m=l.match(/發言順序：.*（(逆時針|順時針)，從\s*(\d+)\s*號開始）/))){ dirLabel=m[1]; startNum=m[2]; }
    else if((m=l.match(/^退水：(\d+)號$/))) withdrawals.push(m[1]);
    else if((m=l.match(/^悍跳預言家號碼：(.+)$/))) hanTiaoNotes.push(m[1]);
    else if((m=l.match(/^PK警長票(\d+)：(.+)$/))) pkVotes.push([m[1],m[2]]);
    else if((m=l.match(/^警長票(\d+)：(.+)$/))) round1Votes.push([m[1],m[2]]);
    else if((m=l.match(/^PK棄票：(.+)$/))) pkAbstain=m[1];
    else if((m=l.match(/^棄票：(.+)$/))) round1Abstain=m[1];
    else if(l.startsWith('全數 0 票')||l.startsWith('PK 後再度平票')) noSheriffNote=l;
    // 免投票自動當選有兩種不同情境，文字紀錄要分開講清楚是哪一種：
    // 「自始至終只有一人上警」——一路走完發言，發言結束後才直接當選（見 jgSheriffSpeechGoVote）；
    // 「退到只剩一人」——原本不只一位候選人，中途有人退水，退到只剩一位才直接當選
    // （見 jgSheriffHandleWithdrawResolution／jgRenderSheriffVote 的保險判斷）。
    else if(l.startsWith('僅 ')&&l.includes('一人上警')) autoElectReason='onlyOne';
    else if((l.startsWith('其餘候選人全數退水')||l.startsWith('候選人只剩'))&&l.includes('自動當選')) autoElectReason='reducedToOne';
  });
  let out='**警長競選\n';
  if(candidatesNums){
    let head='>候選人：'+candidatesNums+'號';
    if(startNum) head+='（'+startNum+' 號開始'+(dirLabel||'')+'發表政見）';
    out+=head+'\n';
  }
  if(withdrawals.length>0) out+='>退水：'+withdrawals.join('、')+'號\n';
  if(hanTiaoNotes.length>0) hanTiaoNotes.forEach(note=>{ out+='>悍跳預言家號碼：'+note+'\n'; });
  if(round1Votes.length>0){
    out+='>投票\n';
    round1Votes.forEach(([t,vs])=>{
      out+='--警長票'+t+'：'+vs+((pkVotes.length===0&&jgSheriffElectedNum==t)?'（當選警長）':'')+'\n';
    });
    if(round1Abstain) out+='--棄票：'+round1Abstain+'\n';
  }
  if(pkVotes.length>0){
    out+='>PK\n';
    pkVotes.forEach(([t,vs])=>{
      out+='--警長票'+t+'：'+vs+(jgSheriffElectedNum==t?'（當選警長）':'')+'\n';
    });
    if(pkAbstain) out+='--棄票：'+pkAbstain+'\n';
  }
  if(jgSheriffSelfDestruct) out+='>'+(jgSheriffSelfDestructNum||'x')+'號 自爆'+(jgSheriffSelfDestructBroughtNum?'帶'+jgSheriffSelfDestructBroughtNum:'')+'吞警徽，本局無警長\n';
  else if(jgSheriffElectedNum && round1Votes.length===0 && pkVotes.length===0){
    if(autoElectReason==='onlyOne') out+='>只一人上警，不需投票，'+jgSheriffElectedNum+'號自動當選警長\n';
    else if(autoElectReason==='reducedToOne') out+='>候選人退到只剩一人，'+jgSheriffElectedNum+'號自動當選警長（不需投票）\n';
    else out+='>'+jgSheriffElectedNum+'號自動當選警長（候選人退到只剩一人／自始至終只有一人，不需投票）\n';
  }
  else if(!jgSheriffElectedNum && noSheriffNote) out+='>'+noSheriffNote+'\n';
  else if(!jgSheriffElectedNum && jgSheriffElectionDone && round1Votes.length===0 && pkVotes.length===0) out+='>平票或全數退水，本局無警長\n';
  return out;
}

// Builds the full copy-pasteable text-file export described by the judge:
// roster header, then each night/day's abbreviated action log, ending with the result.
function jgUpdateSheriffToggleStyle(){
  const cb=document.getElementById('jg-sheriff-enabled');
  const lb=document.getElementById('jg-sheriff-enabled-label');
  const wrap=document.getElementById('jg-badge-mode-wrap');
  if(!cb||!lb) return;
  if(cb.checked){
    lb.style.background='var(--accent,#2e7d32)';
    lb.style.borderColor='var(--accent,#2e7d32)';
    lb.querySelector('span').style.color='#fff';
    if(wrap) wrap.style.display='';
  } else {
    lb.style.background='rgba(46,125,50,0.08)';
    lb.style.borderColor='var(--accent,#2e7d32)';
    lb.querySelector('span').style.color='';
    if(wrap) wrap.style.display='none';
  }
}
// 法官設定頁：自爆吞警徽規則（single=單爆／double=雙爆），開始主持時會存進 jgBadgeMode
let jgSetupBadgeMode='single';
function jgSetBadgeMode(mode){
  jgSetupBadgeMode=mode;
  const bS=document.getElementById('jg-badge-mode-single'), bD=document.getElementById('jg-badge-mode-double');
  if(bS) bS.classList.toggle('primary',mode==='single');
  if(bD) bD.classList.toggle('primary',mode==='double');
  const desc=document.getElementById('jg-badge-mode-desc');
  if(desc) desc.innerHTML = mode==='double'
    ? '雙爆吞警徽：需要 2 名狼人配合，分兩天操作。首日警上先自爆，警徽暫不流失，直接公佈死訊、進入黑夜；隔天重新競選警長，過程中第二名狼人再次自爆，警徽才真正流失。若最終只有一狼完成自爆，警徽不會流失，警長照常選出。'
    : '單爆吞警徽：只要有狼人在首個白天的警上環節自爆，警徽立刻流失，本局不再有警長。';
}
function jgSheriffLRNums(){
  if(!jgSheriff) return null;
  const total=jgTotal;
  const isAlive=n=>{ const p=jgByNum(n); return p?p.alive:false; };
  let leftNum=jgSheriff;
  do{ leftNum=leftNum-1<1?total:leftNum-1; } while(!isAlive(leftNum) && leftNum!==jgSheriff);
  let rightNum=jgSheriff;
  do{ rightNum=rightNum+1>total?1:rightNum+1; } while(!isAlive(rightNum) && rightNum!==jgSheriff);
  return {leftNum,rightNum};
}
function jgSheriffLRAutoDir(n){
  const lr=jgSheriffLRNums();
  if(!lr) return '順';
  // rightNum 是從警長號碼「遞增」（含跨界從最大號繞回 1 號）找到的鄰居，對應「順時針」；
  // leftNum 是「遞減」（含跨界從 1 號繞回最大號）找到的鄰居，對應「逆時針」。
  // 不能單純比較號碼大小：號碼在跨界（例如警長是最大號、右邊鄰居繞回 1 號）時，
  // 數字上的「較小值」不一定代表逆時針方向，必須直接比對是 leftNum 還是 rightNum。
  if(n===lr.rightNum) return '順';
  if(n===lr.leftNum) return '逆';
  return '順';
}
function jgSheriffLRButtonsHtml(curStart, onClickFnName){
  const lr=jgSheriffLRNums();
  if(!lr) return '';
  return [lr.leftNum,lr.rightNum].map(n=>{
    const sel=curStart===n;
    return '<button type="button" onclick="'+onClickFnName+'('+n+')" style="width:56px;height:56px;border-radius:50%;padding:0;font-size:18px;font-weight:700;'
      +(sel?'background:var(--success,#2e7d32);color:#fff;border-color:transparent;':'')+'">'+n+'</button>';
  }).join('');
}
// 天亮結算畫面裡「警長決定警左警右」用的輕量版picker：只更新自己這個 <div>，
// 絕對不能整個重新 render 'dawn' 這個 step，否則死亡結算（jgApplyDeath 等）會被重跑一次。
function jgDawnSheriffDirPickerHtml(){
  const dm=jgDayMeta[jgNight]||{};
  const curStart=dm.start||null;
  return '<label>警長選警左還是警右？（點選對應號碼，方向自動判定）</label>'
    +'<div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:4px;">'+jgSheriffLRButtonsHtml(curStart,'jgSetDawnSheriffStart')+'</div>';
}
function jgSetDawnSheriffStart(n){
  jgDayMeta[jgNight]=Object.assign({}, jgDayMeta[jgNight], {start:n, dir:jgSheriffLRAutoDir(n)});
  const box=document.getElementById('jg-dawn-sheriff-dir-picker');
  if(box) box.innerHTML=jgDawnSheriffDirPickerHtml();
}

// ═══════════════════════════════════
// 警長競選
// ═══════════════════════════════════

// Step 1：天亮公布死訊之前，先問誰要上警
function jgRenderSheriffCandidates(){
  const alive=jgAlive().map(p=>p.num).sort((a,b)=>a-b);
  const selHtml=alive.map(n=>{
    const sel=jgSheriffCandidates.includes(n);
    return '<button type="button" onclick="jgToggleSheriffCandidate('+n+')" style="width:44px;height:44px;border-radius:50%;padding:0;font-size:14px;font-weight:700;'
      +(sel?'background:var(--accent);color:#fff;border-color:transparent;':'')+'">'+n+'</button>';
  }).join('');
  // 這個畫面現在只會在第一天（jgSheriffPostponedToDay2 一定還是 false）出現一次；
  // 雙爆吞警徽規則的隔天續選改走 jgRenderSheriffDay2Resume()，不會再回到這裡問候選人起立。
  const badgeBanner = jgBadgeMode==='double'
    ? '<div class="info" style="font-size:12px;">💥 本局採雙爆吞警徽規則：第一次自爆警徽保留、競選延到隔天；再次自爆警徽才會流失。</div>' : '';
  jgShowPg(`
    <h2>警長競選・候選人</h2>
    <div class="speech" style="font-size:16px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">「<em>現在開始競選警長，候選人請起立。</em>」<span style="display:inline-flex;gap:6px;">
      <button type="button" onclick="jgSheriffAudioPlay()" title="播放" style="width:32px;height:32px;padding:0;flex-shrink:0;border-radius:50%;font-size:14px;margin-top:0;">▶️</button>
      <button type="button" onclick="jgSheriffAudioPause()" title="暫停" style="width:32px;height:32px;padding:0;flex-shrink:0;border-radius:50%;font-size:14px;margin-top:0;">⏸️</button>
      <button type="button" onclick="jgSheriffAudioReplay()" title="重播" style="width:32px;height:32px;padding:0;flex-shrink:0;border-radius:50%;font-size:14px;margin-top:0;">🔁</button>
    </span></div>
    <div class="info" style="font-size:12px;">（等候約 5 秒，讓想上警的玩家站起來，再點選以下號碼記錄候選人）</div>
    ${badgeBanner}
    <label>候選人（點選起立的號碼，可複選）</label>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px;">${selHtml}</div>
    <button class="danger" style="margin-top:14px;" onclick="jgSheriffSelfDestructPrompt()">${jgSelfDestructBtnLabel()}</button>
    <button class="primary" style="margin-top:10px;" onclick="jgSaveSheriffCandidates()">候選人已確定 →</button>
  `,'🎖️ 警長競選');
}
function jgToggleSheriffCandidate(n){
  const i=jgSheriffCandidates.indexOf(n);
  if(i>=0) jgSheriffCandidates.splice(i,1); else jgSheriffCandidates.push(n);
  jgRenderSheriffCandidates();
}
function jgSaveSheriffCandidates(){
  // 只標記「這一天」問過候選人，不能兩個 flag 一起設——雙爆模式下，第一天候選人確定時若
  // 連隔天（day2）的 flag 都一起設成 true，會導致隔天重新競選的畫面永遠不會出現。
  if(jgNight===1) jgSheriffCandidatesAsked=true;
  else jgSheriffDay2CandidatesAsked=true;
  if(jgSheriffCandidates.length===0){
    // 沒有人上警，競選視為結束（無警長），直接進入正常的天亮公布
    jgSheriffElectionDone=true;
    jgSheriffFinalNight=jgNight;
    jgGoStep('dawn');
    return;
  }
  jgSheriffCampaignHappened=true;
  jgSheriffLogLines.push('候選人：'+jgSheriffCandidates.slice().sort((a,b)=>a-b).join('、')+'號');
  jgGoStep('sheriff-dawn-placeholder');
}
// 競選過程中任何時候，狼人都可以自爆：
// ・單爆吞警徽規則下，自爆直接吞掉警徽，本局不再有警長。
// ・雙爆吞警徽規則下，第一次自爆警徽先保留、競選延到隔天繼續；隔天競選過程中再次自爆，警徽才真正流失。
// 改成點按鈕選號碼（不用輸入框），並且限制只能選存活的狼人／黑狼王／血月使者——
// 惡靈騎士、石像鬼、狼美人、機械狼、夢魘都不能自爆，夜間已經死亡的狼也不能選（按鈕直接鎖住）。
function jgSheriffSelfDestructPrompt(){
  jgGoStep('sheriff-selfdestruct-pick');
}
function jgSaveSheriffSelfDestruct(){
  const val=(document.getElementById('jg-sheriff-blow-rec')||{}).value?.trim()||'';
  if(!val){ alert('⚠️ 請選擇自爆的玩家號碼！'); return; }
  const p=jgFind(val);
  // 自爆資格只看「是不是還活著、是不是自爆合法的狼隊角色」，不要求一定要是目前的警長候選人——
  // 任何一隻符合資格的狼，不管有沒有參選警長，都可以在警長競選期間（不管誰正在發言）隨時自爆。
  if(!p||!p.alive||!(p.role==='wolf'||p.role==='wolfking'||p.role==='whitewolf'||p.role==='bloodmoon'||p.role==='wolfbrother_y'||p.role==='wolfshaman')){
    alert('⚠️ 這個號碼目前不是存活的狼人／黑狼王／白狼王／血月使者／狼弟／狼巫，不能自爆！');
    return;
  }
  // 注意：這裡故意不擋「昨晚已經被下毒、等一下天亮才會公布死亡」的號碼——這種玩家在天亮公布之前，
  // 場面上仍然算是正常存活、正常參與白天流程的玩家，本來就可以正常自爆；自爆會直接、立刻讓他
  // 出局並成功吞掉警徽進入黑夜，這一爆算數，不會因為他其實已經被毒到就變成無效。
  if(p.role==='whitewolf'){
    // 白狼王自爆可以帶人：先進到帶人選號畫面，選完（jgSaveSheriffSelfDestructWhiteWolfBring）
    // 才真正套用死亡、繼續走下面 jgFinishSheriffSelfDestruct 的吞警徽既有流程。
    jgRecord._sheriffSelfDestructWhiteWolfNum=p.num;
    jgGoStep('sheriff-selfdestruct-whitewolf-bring');
    return;
  }
  jgApplyDeath(p);
  jgFinishSheriffSelfDestruct(p, null);
}
// 白狼王在吞警徽情境下選完帶走的對象後，套用雙方死亡，再走跟其他角色共用的吞警徽收尾流程
function jgSaveSheriffSelfDestructWhiteWolfBring(){
  const num=jgRecord._sheriffSelfDestructWhiteWolfNum;
  const p=jgFind(num);
  if(!p){ jgGoStep('sheriff-selfdestruct-pick'); return; }
  jgApplyDeath(p);
  const val=(document.getElementById('jg-sheriff-whitewolf-blow-rec')||{}).value?.trim()||'';
  let broughtNum=null;
  if(val){ const t=jgFind(val); if(t&&t.alive){ jgApplyDeath(t); broughtNum=val; } }
  jgRecord._sheriffSelfDestructWhiteWolfNum=null;
  jgFinishSheriffSelfDestruct(p, broughtNum);
}
// 吞警徽收尾：不管自爆的是一般狼人／黑狼王／血月使者，還是剛選完帶人對象的白狼王，
// 單爆／雙爆的規則跟後續流程都一樣，共用這一份，broughtNum 只有白狼王才可能非 null。
function jgFinishSheriffSelfDestruct(p, broughtNum){
  const isFirstBlow=jgBadgeMode==='double'&&!jgSheriffFirstBlowDone;
  jgRecord._selfDestructNum=p.num;
  // 自爆的人退出候選名單（跟退水一樣，不會再出現在後續的發言／投票名單裡）
  jgSheriffCandidates=jgSheriffCandidates.filter(x=>x!==p.num);
  // 只標記「這一天」問過候選人，不能兩個 flag 一起設——雙爆模式下，第一天候選人確定時若
  // 連隔天（day2）的 flag 都一起設成 true，會導致隔天重新競選的畫面永遠不會出現。
  if(jgNight===1) jgSheriffCandidatesAsked=true;
  else jgSheriffDay2CandidatesAsked=true;
  jgSheriffCampaignHappened=true;
  if(isFirstBlow){
    // 雙爆吞警徽・第一爆：警徽保留，競選延到隔天繼續，本輪不產生警長結果
    jgSheriffFirstBlowDone=true;
    jgSheriffFirstBlowNum=p.num;
    jgSheriffPostponedToDay2=true;
    jgPushDayLog(p.num+'號 自爆'+(broughtNum?'帶'+broughtNum:'')+'（雙爆吞警徽・第一爆，警徽保留，競選延到隔天繼續）');
    jgRenderRoster();
    // 注意：這裡「不」提前呼叫 jgCheckWin()！自爆只是死了一個人，跟其他死法（狼刀、投票、
    // 開槍……）一樣，都要等進到「天亮」流程、走過死訊公告與遺言之後，才由 dawn 步驟統一判斷
    // 勝負（見下方 jgGoStep('dawn') 對應的畫面，會把 jgRecord._selfDestructNum 併入死亡名單，
    // 一起跑公告／遺言／勝負判定）。之前在這裡提前判斷會導致自爆一結束就直接跳到「狼人勝利」，
    // 整個天亮公告、候選人遺言全部被跳過，玩家一頭霧水看不到自己自爆之後發生了什麼事。
    jgGoStep('dawn');
    return;
  }
  // 單爆吞警徽，或雙爆吞警徽的第二爆：警徽正式流失，本局不再有警長
  jgSheriff=null;
  jgSheriffElectionDone=true;
  jgSheriffFinalNight=jgNight;
  jgSheriffSelfDestruct=true;
  jgSheriffSelfDestructNum=p.num;
  jgSheriffSelfDestructBroughtNum=broughtNum||null;
  jgRenderRoster();
  // 同上：勝負判定一律交給「天亮」流程統一處理（見 jgGoStep('dawn') 對應畫面），
  // 不要在這裡提前呼叫 jgCheckWin()，否則會跳過天亮公告與自爆者的遺言，直接結束遊戲。
  // 雙爆吞警徽的第二爆也是同一套：這一晚（第二夜）的死訊本來就還沒公布過，跟第一爆時一樣，
  // 交給 'dawn' 大 step 把「這次自爆」跟「昨晚死訊／平安夜」一起公告清楚、發表遺言後再天黑。
  jgGoStep('dawn');
}

// Step 2（天亮流程結束、last words 之後）：抽政見發表順序
function jgRenderSheriffSpeechOrder(){
  const cands=jgSheriffCandidates.slice().sort((a,b)=>a-b);
  jgShowPg(`
    <h2>警長競選・政見發表順序</h2>
    <div class="speech">「<em>請抽警長政見發表順序。</em>」</div>
    <div class="info" style="font-size:13px;">候選人：${cands.join('、')}號</div>
    <div class="info" id="jg-sheriff-wheel-wrap"><button onclick="jgSpinSheriffWheel()">🎡 轉動轉盤</button><div id="jg-sheriff-wheel-result"></div></div>
    <button class="primary" style="margin-top:14px;" onclick="jgConfirmSheriffSpeechOrder()">開始政見發表 →</button>
  `,'🎖️ 警長競選');
}
// 轉盤只從候選人號碼裡抽，跟平安夜轉盤同樣的視覺與隨機機制
function jgSpinSheriffWheel(){
  const cands=jgSheriffCandidates.slice();
  if(cands.length===0) return;
  const box=document.getElementById('jg-sheriff-wheel-result');
  let ticks=0;
  const maxTicks=18;
  const timer=setInterval(()=>{
    ticks++;
    const n=cands[Math.floor(Math.random()*cands.length)];
    jgShowBigCard(n+'號', '抽籤中…', true);
    if(ticks>=maxTicks){
      clearInterval(timer);
      const finalNum=cands[Math.floor(Math.random()*cands.length)];
      const dir=Math.random()<0.5?'順':'逆';
      jgSheriffSpeakStart=finalNum;
      jgSheriffSpeakDir=dir;
      const dirLabel=dir==='順'?'順時針 →':'← 逆時針';
      jgShowBigCard(finalNum+'號', dirLabel+' 發言');
      if(box) box.innerHTML='<div class="info-success" style="text-align:center;padding:14px;">'
        +'<div style="font-size:34px;font-weight:800;">'+finalNum+'號</div>'
        +'<div style="font-size:15px;margin-top:4px;">'+dirLabel+' 發言</div></div>';
    }
  },80);
}
function jgConfirmSheriffSpeechOrder(){
  if(jgSheriffSpeakStart==null||!jgSheriffCandidates.includes(jgSheriffSpeakStart)){ alert('請先轉動轉盤決定順序'); return; }
  const dirLabel=jgSheriffSpeakDir==='逆'?'逆時針':'順時針';
  jgSheriffLogLines.push('發言順序：'+jgSheriffSpeechOrderList().join('→')+'（'+dirLabel+'，從 '+jgSheriffSpeakStart+' 號開始）');
  jgGoStep('sheriff-speech');
}

// 共用：給一份號碼清單、一個起始號碼、一個方向（'順'／'逆'），排出繞圈發言順序。
// 政見發表、平安夜／一般發言都是用同一套「從某號開始，順/逆時針繞一圈」的邏輯，抽出來共用。
function jgOrderFromStart(list, start, dir){
  const arr=list.slice().sort((a,b)=>a-b);
  if(!arr.length||start==null) return arr;
  let startIdx=arr.indexOf(start);
  if(startIdx<0) startIdx=0;
  const ordered=[];
  for(let i=0;i<arr.length;i++){
    const idx=dir==='逆'?(startIdx-i+arr.length*10)%arr.length:(startIdx+i)%arr.length;
    ordered.push(arr[idx]);
  }
  return ordered;
}
// Step 3：依序政見發表，發表完可以退水
// PK 回合（jgSheriffPkRound 為 true）時直接回傳 jgSheriffPkOrder——這是進 PK 那一刻，
// 依照「前一輪發言順序，越晚發言者這輪越早發言」算好、明確存下來的順序，不再用起點/方向繞圈，
// 因為 PK 候選人是原本整圈裡挑出來的一部分，繞圈邏輯無法呈現「整個反過來」的順序。
function jgSheriffSpeechOrderList(){
  if(jgSheriffPkRound && jgSheriffPkOrder.length) return jgSheriffPkOrder.slice();
  const cands=jgSheriffCandidates.slice().sort((a,b)=>a-b);
  return jgOrderFromStart(cands, jgSheriffSpeakStart, jgSheriffSpeakDir);
}
// 當天一般發言討論的完整順序（政見發表之外的白天發言），供白天投票平票進 PK 時
// 回頭算「前一輪發言順序」使用。
function jgDaySpeechOrderList(night){
  const aliveNums=jgAlive().map(p=>p.num);
  const dm=jgDayMeta[night];
  if(!dm||dm.start==null||!dm.dir) return aliveNums.sort((a,b)=>a-b);
  return jgOrderFromStart(aliveNums, dm.start, dm.dir);
}
// 悍跳號碼記錄小工具：警上（競選發言）跟警下（一般發言討論）共用同一種輸入框 HTML，
// 選填、不強制，法官若真的看到有人悍跳（在別人已經跳過同一個神職身分後，還搶著跳同一個身分）
// 才需要記，純粹的「詐身分」（一開始就打算悍跳、佈局好的假跳）不算，留空即可。
// 整場遊戲只需要記一次：一旦法官在任何畫面確認記錄過，這個輸入框就不會再出現。
function jgHanTiaoInputHtml(id, value, updateFn){
  if(jgHanTiaoCommitted) return '';
  return '<div class="info" style="margin-top:10px;padding:10px 14px;">'
    +'<label style="margin:0 0 6px;">🎭 悍跳預言家號碼（排除詐身分・非必填・整場僅需記錄一次）</label>'
    +'<input type="text" id="'+id+'" placeholder="例如：3 （留空表示沒有）" value="'+(value||'').replace(/"/g,'&quot;')+'" '
    +'oninput="'+updateFn+'(this.value)" style="margin:0;">'
    +'</div>';
}
function jgUpdateHanTiaoSheriff(v){ jgHanTiaoSheriffNote=v; }
function jgCommitHanTiaoSheriff(){
  const v=(jgHanTiaoSheriffNote||'').trim();
  if(v&&!jgHanTiaoCommitted){
    jgSheriffLogLines.push('悍跳預言家號碼：'+v);
    jgHanTiaoCommitted=true;
  }
}
function jgUpdateHanTiaoDiscuss(v){ jgHanTiaoDiscussNotes[jgNight]=v; }
function jgCommitHanTiaoDiscuss(){
  const v=(jgHanTiaoDiscussNotes[jgNight]||'').trim();
  if(v&&!jgHanTiaoCommitted){
    jgPushDayLog('悍跳預言家號碼：'+v);
    jgHanTiaoCommitted=true;
  }
}
function jgSheriffSpeechGoVote(){
  jgCommitHanTiaoSheriff();
  // 若自始至終只有這一位候選人上警（沒有其他人退水過），照規則他仍然可以正常發表政見，
  // 但發言結束後不需要投票，直接當選警長。
  if(!jgSheriffPkRound && jgSheriffCandidates.length===1){
    const winner=jgSheriffCandidates[0];
    jgSheriffLogLines.push('僅 '+winner+'號 一人上警，發言結束後自動當選警長（不需投票）');
    jgSheriff=winner; jgSheriffElectedNum=winner; jgSheriffElectionDone=true; jgSheriffFinalNight=jgNight;
    jgRenderRoster();
    alert(winner+'號 是唯一的候選人，直接當選警長，不需要投票。');
    jgGoStep('dawn');
    return;
  }
  jgGoStep('sheriff-vote');
}
function jgSheriffSpeechSelfDestruct(){
  jgCommitHanTiaoSheriff();
  jgSheriffSelfDestructPrompt();
}
function jgDiscussGoVote(){
  jgCommitHanTiaoDiscuss();
  jgGoStep('vote');
}
function jgRenderSheriffSpeech(){
  const ordered=jgSheriffSpeechOrderList();
  const rows=ordered.map(n=>{
    const p=jgFind(n);
    const withdrawn=jgSheriffWithdrawn.includes(n);
    const nm=p&&p.name&&p.name!==p.num+'號'?p.num+'號 '+p.name:n+'號';
    return '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border:1px solid var(--border);border-radius:var(--r-sm);margin-bottom:6px;'
      +(withdrawn?'opacity:0.5;':'')+'">'
      +'<span style="flex:1;'+(withdrawn?'text-decoration:line-through;':'')+'">'+nm+'</span>'
      +(withdrawn?'<span style="font-size:12px;color:var(--text2);">已退水</span>'
        :(jgSheriffPkRound?'':'<button type="button" style="width:auto;margin:0;padding:6px 12px;font-size:12px;" onclick="jgSheriffWithdraw('+n+')">退水</button>'))
      +'</div>';
  }).join('');
  jgShowPg(`
    <h2>警長競選・${jgSheriffPkRound?'平票 PK 發言':'政見發表'}</h2>
    ${jgSpeakTimerWidgetHtml(ordered)}
    <div class="speech">「<em>${jgSheriffPkRound?'平票玩家請再次發言 PK。':'請依序發表警長政見。'}</em>」</div>
    <div style="margin-top:10px;">${rows}</div>
    ${jgSheriffPkRound?'<div class="info-warn" style="font-size:12px;">平票 PK 回合中，此輪不可退水</div>'
      :'<div class="speech" style="margin-top:8px;">「<em>要退水的玩家請坐下。</em>」</div><div class="info" style="font-size:12px;">全部候選人發言結束後宣布上面這句話，想退出競選的候選人這時點選對應「退水」即可</div>'}
    ${jgHanTiaoInputHtml('jg-hantiao-sheriff-input', jgHanTiaoSheriffNote, 'jgUpdateHanTiaoSheriff')}
    <button class="danger" style="margin-top:12px;" onclick="jgSheriffSpeechSelfDestruct()">${jgSelfDestructBtnLabel()}</button>
    <button class="primary" style="margin-top:10px;" onclick="jgSheriffSpeechGoVote()">${jgSheriffPkRound?'PK 發言結束，重新投票 →':'要退水的都退水了，進入投票 →'}</button>
  `,'🎖️ 警長競選');
}
function jgSheriffWithdraw(n){
  if(jgSheriffPkRound) return; // PK 回合中不可退水
  if(!confirm(n+'號 確定要退水嗎？'))  return;
  jgSheriffCandidates=jgSheriffCandidates.filter(x=>x!==n);
  jgSheriffWithdrawn.push(n);
  jgSheriffLogLines.push('退水：'+n+'號');
  if(jgSheriffHandleWithdrawResolution()) return;
  jgRenderSheriffSpeech();
}
// 每次退水後都檢查一次：候選人退到只剩 0 或 1 人時，競選當場就有結果，不用等投票。
// 剩 0 人＝全數退水，本局無警長；剩 1 人＝唯一candidate直接當選，不需要投票——
// 如果他在退水發生的當下還沒輪到他發言（用目前發言計時器停在第幾位來判斷），
// 就直接跳過發言，不必再讓他補講政見。回傳 true 代表已經接管流程（呼叫端不用再往下 render）。
function jgSheriffHandleWithdrawResolution(){
  if(jgSheriffCandidates.length===0){
    jgSheriffLogLines.push('候選人全數退水，本局無警長');
    jgSheriff=null; jgSheriffElectedNum=null; jgSheriffElectionDone=true; jgSheriffFinalNight=jgNight;
    jgRenderRoster();
    alert('⚠️ 候選人全數退水，本局無警長。');
    jgGoStep('dawn');
    return true;
  }
  if(jgSheriffCandidates.length===1){
    const winner=jgSheriffCandidates[0];
    const order=jgSheriffSpeechOrderList();
    const widx=order.indexOf(winner);
    const notYetSpoken=widx>=0 && jgSpeakTimerOrderKey===order.join(',') && widx>=jgSpeakTimerIdx;
    jgSheriffLogLines.push('其餘候選人全數退水，'+winner+'號自動當選警長（不需投票）');
    jgSheriff=winner; jgSheriffElectedNum=winner; jgSheriffElectionDone=true; jgSheriffFinalNight=jgNight;
    jgRenderRoster();
    alert(winner+'號 是最後留下的候選人，'+(notYetSpoken?'不用再發言，':'')+'直接當選警長，不需要投票。');
    jgGoStep('dawn');
    return true;
  }
  return false;
}

// ── 雙爆吞警徽・隔天續選 ──
// 第一爆已經發生、警徽保留到隔天；隔天不重新問候選人起立、也不用再發言一次（政見昨天已經
// 講過了），直接沿用第一天還活著、還沒退水的候選人，進到「要退水的玩家請坐下」這一步，
// 畫面只留 [有狼人自爆] 跟 [進入投票] 兩顆按鈕。
function jgRenderSheriffDay2Resume(){
  const cands=jgSheriffCandidates.slice().sort((a,b)=>a-b);
  const rows=cands.map(n=>{
    const p=jgFind(n);
    const withdrawn=jgSheriffWithdrawn.includes(n);
    const nm=p&&p.name&&p.name!==p.num+'號'?p.num+'號 '+p.name:n+'號';
    return '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border:1px solid var(--border);border-radius:var(--r-sm);margin-bottom:6px;'
      +(withdrawn?'opacity:0.5;':'')+'">'
      +'<span style="flex:1;'+(withdrawn?'text-decoration:line-through;':'')+'">'+nm+'</span>'
      +(withdrawn?'<span style="font-size:12px;color:var(--text2);">已退水</span>'
        :'<button type="button" style="width:auto;margin:0;padding:6px 12px;font-size:12px;" onclick="jgSheriffDay2Withdraw('+n+')">退水</button>')
      +'</div>';
  }).join('');
  jgShowPg(`
    <h2>警長競選・續選</h2>
    <div class="speech" style="font-size:16px;">「<em>天亮請睜眼。</em>」</div>
    <div class="info-warn" style="font-size:12px;margin-top:8px;">💥 雙爆吞警徽：昨天 ${jgSheriffFirstBlowNum} 號已先自爆（警徽保留），今天重新競選；過程中若再有狼人自爆，警徽才會真正流失。</div>
    <div class="speech" style="margin-top:8px;">「<em>要退水的玩家請坐下。</em>」</div>
    <div class="info" style="font-size:12px;">政見昨天已經發表過，今天不再重複發言，想退出競選的候選人直接坐下即可；昨晚的死訊要等這輪續選結束才會公布。</div>
    <div style="margin-top:10px;">${rows||'<div class="info" style="font-size:12px;">候選人都已經退水或陣亡，本局沒有警長。</div>'}</div>
    <button class="danger" style="margin-top:12px;" onclick="jgSheriffSelfDestructPrompt()">${jgSelfDestructBtnLabel()}</button>
    <button class="primary" style="margin-top:10px;" onclick="jgGoStep('sheriff-vote')">進入投票 →</button>
  `,'🎖️ 警長競選');
}
function jgSheriffDay2Withdraw(n){
  if(!confirm(n+'號 確定要退水嗎？')) return;
  jgSheriffCandidates=jgSheriffCandidates.filter(x=>x!==n);
  jgSheriffWithdrawn.push(n);
  jgSheriffLogLines.push('退水：'+n+'號');
  if(jgSheriffHandleWithdrawResolution()) return;
  jgRenderSheriffDay2Resume();
}

// Step 4：無上警的人投票；重用跟放逐投票類似的計票 UI
function jgRenderSheriffVote(){
  jgSheriffVoteTally={};
  const cands=jgSheriffCandidates.slice().sort((a,b)=>a-b);
  if(cands.length===0){
    // 候選人都退水光了，直接沒有警長
    jgSheriff=null; jgSheriffElectionDone=true; jgSheriffFinalNight=jgNight;
    jgGoStep('dawn');
    return;
  }
  if(cands.length===1){
    // 保險：不管是哪個入口走到這一步，只要候選人只剩一位，就直接當選，不跑投票流程
    const winner=cands[0];
    jgSheriffLogLines.push('候選人只剩 '+winner+'號，自動當選警長（不需投票）');
    jgSheriff=winner; jgSheriffElectedNum=winner; jgSheriffElectionDone=true; jgSheriffFinalNight=jgNight;
    jgRenderRoster();
    jgGoStep('dawn');
    return;
  }
  // 有上警過的人（不論現在還在競選還是已經退水）都不能投票，只有從頭到尾都沒上警的人才有投票權
  const voters=jgAlive().map(p=>p.num).filter(n=>!cands.includes(n)&&!jgSheriffWithdrawn.includes(n)).sort((a,b)=>a-b);
  jgShowPg(`
    <h2>警長競選・投票</h2>
    <div class="speech">「<em>沒有上警的玩家，請投票選出警長，3、2、1，請投票。</em>」</div>
    <div style="font-size:12px;color:var(--text2);margin-bottom:6px;">候選人：${cands.join('、')}號；只有從未上警的玩家（${voters.join('、')||'無'}）有投票權</div>
    <!-- 快速輸入投票已停用，改用下方「N號投給」逐一點選 -->
    <div id="jg-sheriff-vote-tally"></div>
    <div id="jg-sheriff-vote-summary" style="margin-top:6px;"></div>
    <button class="danger" style="margin-top:10px;" onclick="jgSheriffSelfDestructPrompt()">${jgSelfDestructBtnLabel()}</button>
    <button class="primary" style="margin-top:10px;" onclick="jgSaveSheriffVote()">確認投票結果 →</button>
  `,'🎖️ 警長競選');
  jgRenderSheriffVoteTally();
}
// 快速輸入投票共用的解析器：白天放逐投票、警長競選投票都用這一份邏輯。
// - 如果輸入裡有逗號（半形或全形）或空白，就照這些分隔符號切開（可以混用，例如「1 2,2」）。
// - 完全沒有分隔符號的話，直接把整串文字當連續輸入解析：'n'/'N' 代表棄票（占一個字元），
//   數字自動判斷是一位數還是兩位數（例如 10~14 號），用「總共要對應幾位投票玩家」加上
//   「數字要落在目前合法的號碼裡」兩個條件回推唯一的切法；切不出合法結果就回傳 null，
//   由呼叫端顯示錯誤、請法官確認輸入或改用逗號／空白分隔。
function jgParseQuickVoteTokens(raw, expectedCount, validTargets){
  const s=(raw||'').trim();
  if(s==='') return null;
  if(/[,，\s]/.test(s)) return s.split(/[,，\s]+/).map(x=>x.trim()).filter(x=>x!=='');
  const memo=new Map();
  function helper(pos,count){
    if(count===expectedCount) return pos===s.length?[]:null;
    if(pos>=s.length) return null;
    const key=pos+'|'+count;
    if(memo.has(key)) return memo.get(key);
    let result=null;
    const ch=s[pos];
    if(ch==='n'||ch==='N'){
      const rest=helper(pos+1,count+1);
      if(rest) result=['n',...rest];
    }
    if(!result&&pos+2<=s.length&&/^\d\d$/.test(s.substr(pos,2))){
      const n=parseInt(s.substr(pos,2),10);
      if(validTargets.has(n)){
        const rest=helper(pos+2,count+1);
        if(rest) result=[String(n),...rest];
      }
    }
    if(!result&&/^\d$/.test(ch)){
      const n=parseInt(ch,10);
      if(validTargets.has(n)){
        const rest=helper(pos+1,count+1);
        if(rest) result=[String(n),...rest];
      }
    }
    memo.set(key,result);
    return result;
  }
  return helper(0,0);
}

// 警長競選投票的快速輸入：跟白天放逐投票同一套邏輯，只是候選人换成警長候選人、
// 沒有獨立的棄票物件（沒被標記給任何候選人就是棄票）。
function jgSheriffVoteQuickInputHtml(){
  const cands=jgSheriffCandidates.slice().sort((a,b)=>a-b);
  const voters=jgAlive().map(p=>p.num).filter(n=>!cands.includes(n)&&!jgSheriffWithdrawn.includes(n)).sort((a,b)=>a-b);
  if(voters.length===0) return '';
  return '<div class="card" style="margin:10px 0;padding:10px 14px;">'
    +'<label style="margin:0 0 4px;">⚡ 快速輸入投票（可連續輸入不用分隔，或用空白／逗號分隔，棄票打 n）</label>'
    +'<div style="font-size:11px;color:var(--text2);margin-bottom:6px;">依序對應：'+voters.join('、')+' 號</div>'
    +'<input type="text" id="jg-sheriff-vote-quick" placeholder="例如：13n442 或 1 3 n 4 4 2" style="margin:0;">'
    +'<button class="primary" style="margin-top:8px;" onclick="jgApplySheriffQuickVote()">套用到下方 →</button>'
    +'</div>';
}
function jgApplySheriffQuickVote(){
  const input=document.getElementById('jg-sheriff-vote-quick');
  if(!input) return;
  const cands=jgSheriffCandidates.slice().sort((a,b)=>a-b);
  const candSet=new Set(cands);
  const voters=jgAlive().map(p=>p.num).filter(n=>!cands.includes(n)&&!jgSheriffWithdrawn.includes(n)).sort((a,b)=>a-b);
  const tokens=jgParseQuickVoteTokens(input.value, voters.length, candSet);
  if(!tokens||tokens.length!==voters.length){
    alert('⚠️ 看不懂這串輸入，請確認：\n· 總共要對應 '+voters.length+' 位投票玩家（'+voters.join('、')+'）\n· 號碼須為目前候選人（'+cands.join('、')+'）\n· 棄票打 n\n也可以改用空白或逗號分隔輸入，例如：3 5 n 2 或 3,5,n,2');
    return;
  }
  const newTally={};
  const errors=[];
  voters.forEach((voter,i)=>{
    const tok=(tokens[i]||'').trim();
    if(tok===''||tok.toLowerCase()==='n'||tok==='棄') return; // 棄票：不用標記給任何候選人
    const t=parseInt(tok,10);
    if(!Number.isFinite(t)||!candSet.has(t)){
      errors.push(voter+'號→「'+tok+'」');
    } else {
      if(!newTally[t]) newTally[t]={};
      newTally[t][voter]=true;
    }
  });
  if(errors.length>0){
    alert('⚠️ 以下輸入無法辨識，請確認號碼是否正確、是否為候選人：\n'+errors.join('\n'));
    return;
  }
  jgSheriffVoteTally=newTally;
  jgRenderSheriffVoteTally();
}
// 改成以「投票者」為主，跟白天放逐投票同一種畫面：一行一個投票玩家，點選他投給哪位候選人。
// 沒有點任何候選人＝棄票（跟原本邏輯一致，這裡不用另外標記）。
function jgRenderSheriffVoteTally(){
  const box=document.getElementById('jg-sheriff-vote-tally');
  if(!box) return;
  const cands=jgSheriffCandidates.slice().sort((a,b)=>a-b);
  const voters=jgAlive().map(p=>p.num).filter(n=>!cands.includes(n)&&!jgSheriffWithdrawn.includes(n)).sort((a,b)=>a-b);
  let html='';
  voters.forEach(voter=>{
    const votedFor=cands.find(t=>jgSheriffVoteTally[t]&&jgSheriffVoteTally[t][voter]);
    html+='<div style="margin-bottom:10px;">'
      +'<div style="font-weight:700;font-size:13px;margin-bottom:4px;">'+voter+' 號 投給</div>'
      +'<div style="display:flex;flex-wrap:wrap;gap:6px;">'
      +cands.map(target=>{
        const sel=votedFor===target;
        return '<button type="button" onclick="jgToggleSheriffVote('+target+','+voter+')" style="width:34px;height:34px;border-radius:50%;padding:0;font-size:12px;margin:0;'
          +(sel?'background:var(--danger,#c0392b);color:#fff;border-color:transparent;':'')
          +'">'+target+'</button>';
      }).join('')
      +'</div></div>';
  });
  box.innerHTML=html||'<div class="info" style="font-size:12px;">目前沒有未上警的玩家可以投票。</div>';
  jgUpdateSheriffVoteTallySummary();
}
function jgToggleSheriffVote(target,voter){
  const turningOn=!(jgSheriffVoteTally[target]&&jgSheriffVoteTally[target][voter]);
  if(turningOn){
    Object.keys(jgSheriffVoteTally).forEach(t=>{ if(jgSheriffVoteTally[t]) delete jgSheriffVoteTally[t][voter]; });
    if(!jgSheriffVoteTally[target]) jgSheriffVoteTally[target]={};
    jgSheriffVoteTally[target][voter]=true;
  } else {
    if(jgSheriffVoteTally[target]) delete jgSheriffVoteTally[target][voter];
  }
  jgRenderSheriffVoteTally();
}
function jgUpdateSheriffVoteTallySummary(){
  const box=document.getElementById('jg-sheriff-vote-summary');
  if(!box) return;
  const counts=jgSheriffCandidates.map(t=>[t,Object.values(jgSheriffVoteTally[t]||{}).filter(Boolean).length]);
  if(counts.every(([,c])=>c===0)){
    box.innerHTML='<div class="info" style="font-size:13px;">目前尚無人得票</div>';
    return;
  }
  counts.sort((a,b)=>b[1]-a[1]);
  const maxCount=counts[0][1];
  const top=counts.filter(([,c])=>c===maxCount).map(([t])=>t);
  const summaryText=counts.map(([t,c])=>t+'號 '+c+'票').join('　');
  let extra;
  if(top.length===1){
    extra='<div class="info-success" style="font-size:13px;">最高票：'+top[0]+'號，將自動當選警長</div>';
  } else if(maxCount===0){
    extra='<div class="info-warn" style="font-size:13px;">目前全數 0 票，若維持到底本局將無警長</div>';
  } else {
    extra='<div class="info-warn" style="font-size:13px;">平票：'+top.join('、')+'號，需 PK 後重新投票</div>';
  }
  box.innerHTML='<div style="font-size:12px;color:var(--text2);">'+summaryText+'</div>'+extra;
}
function jgSaveSheriffVote(){ jgSaveSheriffVoteInner(); jgLiveSyncPush(); }
function jgSaveSheriffVoteInner(){
  const cands=jgSheriffCandidates.slice();
  const voters=jgAlive().map(p=>p.num).filter(n=>!cands.includes(n)&&!jgSheriffWithdrawn.includes(n));
  const counts=cands.map(t=>[t,Object.values(jgSheriffVoteTally[t]||{}).filter(Boolean).length]);
  const maxCount=Math.max(0,...counts.map(([,c])=>c));
  const top=counts.filter(([,c])=>c===maxCount).map(([t])=>t);
  // 文字紀錄：本輪票型；沒有投票（點任何號碼）的合格投票人，直接算棄票
  const votedSet=new Set();
  cands.forEach(t=>{ Object.keys(jgSheriffVoteTally[t]||{}).forEach(v=>{ if(jgSheriffVoteTally[t][v]) votedSet.add(Number(v)); }); });
  const abstainNums=voters.filter(v=>!votedSet.has(v)).sort((a,b)=>a-b);
  const roundTag=jgSheriffPkRound?'PK':'';
  cands.slice().sort((a,b)=>a-b).forEach(t=>{
    const vs=Object.keys(jgSheriffVoteTally[t]||{}).filter(v=>jgSheriffVoteTally[t][v]).map(Number).sort((a,b)=>a-b);
    jgSheriffLogLines.push(roundTag+'警長票'+t+'：'+(vs.join(',')||'無'));
  });
  if(abstainNums.length>0) jgSheriffLogLines.push(roundTag+'棄票：'+abstainNums.join(','));
  if(maxCount===0){
    // 規則 1：都是 0 票，本局無警長
    jgSheriffLogLines.push('全數 0 票，本局無警長');
    jgSheriff=null; jgSheriffElectionDone=true; jgSheriffFinalNight=jgNight;
    jgGoStep('dawn');
    return;
  }
  if(top.length===1){
    jgSheriff=top[0]; jgSheriffElectedNum=top[0]; jgSheriffElectionDone=true; jgSheriffFinalNight=jgNight;
    jgRenderRoster();
    jgGoStep('dawn');
    return;
  }
  // 平票
  if(jgSheriffPkRound){
    // 規則 2：PK 之後再度平票，本局不再有警長
    jgSheriffLogLines.push('PK 後再度平票：'+top.join('、')+'號，本局無警長');
    jgSheriff=null; jgSheriffElectionDone=true; jgSheriffFinalNight=jgNight;
    jgGoStep('dawn');
    return;
  }
  // 第一次平票：進入 PK，候選人限縮為平票者，重新發言（不可退水）後再投一次票
  // PK 發言順序：前一輪（這次政見發表）越晚發言的人，PK 時越早發言——取這一輪的完整發言順序，
  // 篩出平票的人，再整個反過來。
  {
    const prevOrder=jgSheriffSpeechOrderList();
    jgSheriffPkOrder=prevOrder.filter(n=>top.includes(n)).reverse();
  }
  jgSheriffLogLines.push('平票：'+top.join('、')+'號，進入 PK（PK 發言順序：'+jgSheriffPkOrder.join('→')+'）');
  jgSheriffPkRound=true;
  jgSheriffCandidates=top;
  alert('⚠️ 平票：'+top.join('、')+'號，進入 PK。PK 發言順序：'+jgSheriffPkOrder.join('→')+'（前一輪越晚發言者，PK 越早發言），期間不可退水。');
  jgGoStep('sheriff-speech');
}

// ═══════════════════════════════════
// 警長死亡・交接警徽
// ═══════════════════════════════════
function jgRenderSheriffTransfer(){
  const deadNum=jgSheriffTransferDeadNum;
  const dp=jgByNum(deadNum);
  const deadName=dp&&dp.name&&dp.name!==dp.num+'號'?dp.num+'號 '+dp.name:deadNum+'號';
  const aliveNums=jgAlive().map(p=>p.num).sort((a,b)=>a-b);
  jgShowPg(`
    <h2>🎖️ 交接警徽</h2>
    <div class="speech" style="font-size:16px;">「<em>${deadNum}號淘汰，請交接警徽。</em>」</div>
    <div class="info" style="font-size:13px;">${deadName} 是警長，已經陣亡。請警長指定一位存活玩家繼承警徽，或選擇撕毀警徽。</div>
    <label>指定新警長（點選號碼）</label>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px;">${aliveNums.map(n=>'<button type="button" onclick="jgTransferSheriff('+n+')" style="width:44px;height:44px;border-radius:50%;padding:0;font-size:14px;font-weight:700;">'+n+'</button>').join('')||'（無存活玩家）'}</div>
    <button class="danger" style="margin-top:14px;" onclick="jgTearSheriffBadge()">🔥 撕毀警徽（本局往後不再有警長）</button>
  `,'🎖️ 交接警徽');
}
function jgTransferSheriff(n){
  const deadNum=jgSheriffTransferDeadNum;
  jgPushDayLog(deadNum+'號淘汰，警徽傳給'+n+'號');
  jgSheriff=n;
  jgSheriffTransferPending=false;
  jgSheriffTransferDeadNum=null;
  const next=jgSheriffTransferNextStep||'dawn';
  jgSheriffTransferNextStep=null;
  jgRenderRoster();
  jgGoStep(next);
}
function jgTearSheriffBadge(){
  const deadNum=jgSheriffTransferDeadNum;
  if(!confirm(deadNum+'號 確定撕毀警徽嗎？本局往後不再有警長。')) return;
  jgPushDayLog(deadNum+'號淘汰，警徽撕毀，本局往後不再有警長');
  jgSheriff=null;
  jgSheriffTransferPending=false;
  jgSheriffTransferDeadNum=null;
  const next=jgSheriffTransferNextStep||'dawn';
  jgSheriffTransferNextStep=null;
  jgRenderRoster();
  jgGoStep(next);
}



// Lookup player by number or partial name (used in seer/wolf/witch steps)
// True if this player is tonight's nightmare (夢魘) target — their night skill is blocked
const JG_SHERIFF_NO_INTERRUPT_STEPS=['hunter-shot','wolfking-shot','whitewolf-selfblow','sheriff-selfdestruct-whitewolf-bring','wolfbeauty-charm-kill',
  'bloodmoon-last-night','bloodmoon-selfblow','luckyone-hunter-shot','mechhunter-chain-shot','knight-duel','sheriff-transfer'];
function jgCheckSheriffDeath(){
  if(jgSheriffEnabled&&jgSheriff&&!jgSheriffTransferPending){
    const sp=jgByNum(jgSheriff);
    if(sp&&!sp.alive){
      jgSheriffTransferPending=true;
      jgSheriffTransferDeadNum=jgSheriff;
      jgSheriff=null;
    }
  }
}

// 盜賊「埋掉」某個身分時，那個身分對應的睜眼步驟名稱，以及「代喊完之後」該接回原本夜晚
// 流程的哪一步（沿用各角色原本就有的「下一步」函式，跟正常走完該角色動作後的去向完全一致，
// 只是這裡不做任何實際查驗／操作）。沒有列在這裡的身分（例如普通狼人、平民、警長、幸運兒）
// 本來就沒有「單獨」的睜眼喊話環節，不需要代喊。
