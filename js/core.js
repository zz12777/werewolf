// ═══════════════════════════════════════════
// js/core.js
// 全域狀態變數與共用工具函式（玩家查找、死亡結算共用邏輯、UI渲染共用函式、存讀檔、即時同步）
// ═══════════════════════════════════════════

// ═══════════════════════════════════
// SHARED DATA
// ═══════════════════════════════════
const RNAME={wolf:'狼人',wolfking:'黑狼王',whitewolf:'白狼王',wolfbeauty:'狼美人',evilknight:'惡靈騎士',gargoyle:'石像鬼',bloodmoon:'血月使者',mechanicalwolf:'機械狼',nightmare:'夢魘',wolfbrother_e:'狼兄',wolfbrother_y:'狼弟',wolfshaman:'狼巫',mask:'假面',villager:'平民',hybrid:'混血兒',cupid:'邱比特',thief:'盜賊',fool:'傻瓜',seer:'預言家',witch:'女巫',hunter:'獵人',guard:'守衛',dreamcatcher:'攝夢人',knight:'騎士',magician:'魔術師',demonhunter:'獵魔人',gravkeeper:'守墓人',medium:'通靈師',blackmarket:'黑市商人',purewhitemaiden:'純白之女',dancer:'舞者',sheriff:'警長',luckyone:'幸運兒'};
const BADGE={wolf:'bw',wolfking:'bw',whitewolf:'bw',wolfbeauty:'bw',evilknight:'bw',gargoyle:'bw',bloodmoon:'bw',villager:'bv',hybrid:'bv',cupid:'bcupid',thief:'bthief',fool:'bv',seer:'bs',witch:'bwt',hunter:'bh',guard:'bg2',mechanicalwolf:'bw',nightmare:'bw',wolfbrother_e:'bw',wolfbrother_y:'bw',wolfshaman:'bw',mask:'bw',medium:'bs',blackmarket:'bwt',purewhitemaiden:'bs',dancer:'bg2'};
const AV={wolf:'av-wolf',wolfking:'av-wolf',whitewolf:'av-wolf',wolfbeauty:'av-wolf',evilknight:'av-wolf',gargoyle:'av-wolf',bloodmoon:'av-wolf',villager:'av-vil',hybrid:'av-vil',cupid:'av-cupid',thief:'av-thief',fool:'av-vil',seer:'av-seer',witch:'av-witch',hunter:'av-hunter',guard:'av-guard',mechanicalwolf:'av-wolf',nightmare:'av-wolf',wolfbrother_e:'av-wolf',wolfbrother_y:'av-wolf',wolfshaman:'av-wolf',mask:'av-wolf',medium:'av-seer',blackmarket:'av-witch',purewhitemaiden:'av-seer',dancer:'av-guard'};

function getComp(n){
  const t={
    6:{wolf:2,villager:2,seer:1,witch:1},
    7:{wolf:2,villager:3,seer:1,witch:1},
    8:{wolf:2,villager:3,seer:1,witch:1,hunter:1},
    9:{wolf:3,villager:3,seer:1,witch:1,hunter:1},
    10:{wolf:3,villager:3,seer:1,witch:1,hunter:1,guard:1},
    11:{wolf:3,villager:4,seer:1,witch:1,hunter:1,guard:1},
    12:{wolf:4,villager:4,seer:1,witch:1,hunter:1,guard:1}
  };
  return t[Math.min(12,Math.max(6,n))]||t[6];
}
function buildPool(c){const p=[];for(const[r,n] of Object.entries(c))for(let i=0;i<n;i++)p.push(r);return p;}
function shuffle(a){let b=[...a];for(let i=b.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];}return b;}

function switchTab(id){
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('on'));
  document.getElementById(id).classList.add('on');
  document.querySelectorAll('.nav-btn').forEach((b,i)=>{
    b.classList.toggle('active',['t-rules','t-guide','t-judge','t-data','t-report'][i]===id);
  });
  if(id==='t-report') jgLoadReportForm();
  if(id==='t-data') pdLoadCloudGames(); // 每次切到「遊玩數據」分頁都重新抓一次雲端最新場次
  if(id==='t-guide') loadGuideArticles(); // 第一次切到「攻略參考」才去抓資料，避免沒用到還耗流量
  window.scrollTo(0,0);
}

// ═══════════════════════════════════
// TAB 3: 人工法官
// ═══════════════════════════════════
let jgTotal=6, jgComp={};
// 「現在開始競選警長」音檔的播放／暫停／重播——共用同一個 Audio 物件，
// 這樣暫停後再按播放才會從暫停的地方接著播，而不是每次都從頭建立新的音檔重播。
const JG_LIVE_SYNC_URL = 'https://script.google.com/macros/s/AKfycbxnTE-iVo8D9GPmP2E6xsbRR4StTZJlbjG6oM6k9mUJlK-PBsX0C73AQNPg4ZRyEJgRiQ/exec';
let jgLiveSessionId=null; // 這一場遊戲的場次代碼（例如 0813_1），開局時產生一次、整場固定不變
let jgLivePollTimer=null; // 目前正在自動輪詢的計時器（切換場次/離開畫面時要記得清掉，避免重複輪詢）

// 產生本場的場次代碼：日期(MMDD) + 這個瀏覽器分頁「今天第幾場」，跟文字紀錄匯出標題共用同一套邏輯，
// 兩邊看到的代碼會一致（例如 0813_1）。
function jgLiveMakeSessionId(){
  const d=new Date();
  return String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0')+'_'+jgGameCount;
}

// 即時票型的「公開過濾版」文字處理：
// 1) 整行拿掉悍跳號碼（悍跳的人可能就是預言家本人假裝的，即時公開會直接暴露誰在悍跳）
// 2) 開槍帶人一律寫成「X號槍帶Y」，不管實際是獵人／黑狼王／機械狼／幸運兒中的哪一個，
//    因為看的人這時候還不知道 X 號是什麼身分，寫出「獵」或「王」等於直接洩漏身分。
//    比對順序刻意把較長的縮寫（幸獵、機獵）放前面，避免被單字的「獵」提前吃掉比對錯誤。
function jgPublicRedact(text){
  return (text||'')
    .split('\n')
    .filter(l=>l.indexOf('悍跳')===-1)
    .join('\n')
    .replace(/(\d+)(?:幸獵|機獵|獵|王)帶/g,'$1槍帶');
}

// 組出目前為止的票型摘要（警長票型 + 每天白天投票），純文字版本，供同步到試算表使用；
// 跟畫面上「投票紀錄」側欄用的是同一份資料來源（jgFormatSheriffBlock／jgFormatDayVoteBlock）。
function jgBuildLiveVoteText(){
  let out='';
  if(jgSheriffCampaignHappened||jgSheriffSelfDestruct){
    const sb=(jgFormatSheriffBlock()||'').replace(/^\*\*警長競選\n/,'').replace(/^>/,'').replace(/\n>/g,'\n');
    if(sb) out+='🎖️ 警長票型\n'+sb+'\n\n';
  }
  const nightNums=Object.keys(jgDayLog).map(Number).sort((a,b)=>a-b);
  nightNums.forEach(n=>{
    const block=jgFormatDayVoteBlock(n);
    if(block) out+='☀️ 第'+n+'天白天投票\n'+block+'\n\n';
  });
  return out.trim();
}

// 同步到試算表：法官端每次投票確認後呼叫。用 text/plain 送出去是刻意的——瀏覽器對
// application/json 的跨網域 POST 會先送一次 OPTIONS 預檢請求，Apps Script 常常接不好；
// 用 text/plain 可以避開預檢，Apps Script 那邊自己把內容當 JSON 字串解析就好。
// mode:'no-cors' 代表我們不讀取、也讀不到回應內容，純粹「送出去、盡量成功」，
// 同步失敗也不影響法官原本的操作，所以刻意不彈任何錯誤視窗打斷法官。
function jgLiveSyncPush(){
  if(!JG_LIVE_SYNC_URL) return;
  if(!jgLiveSessionId) jgLiveSessionId=jgLiveMakeSessionId();
  const text=jgPublicRedact(jgBuildLiveVoteText());
  fetch(JG_LIVE_SYNC_URL,{
    method:'POST',
    mode:'no-cors',
    headers:{'Content-Type':'text/plain'},
    body:JSON.stringify({session:jgLiveSessionId,text:text})
  }).catch(err=>console.error('即時票型同步失敗（不影響遊戲繼續進行）',err));
}

// ── 公開票型區塊：任何人打開這個網頁都看得到，不需要法官權限 ──
// 不再列出「0813_1」這種原始場次代碼給大家選，而是自動判斷「今天最新一場」直接顯示；
// 一旦法官那邊開了下一場（場次代碼變成新的），或是這一場已經公布勝負（見 jgLiveSyncMarkEnded），
// 這裡都會自動切換／覆蓋掉，不會讓舊場次的票型一直留在畫面上。
// 多分頁／多場同時開局互相覆蓋的狀況目前先不處理（機率低，之後有需要再加場次識別）。
let jgLiveCurrentSession=null; // 目前畫面上正在顯示、並持續輪詢的場次代碼

function jgLiveRenderConfigMissing(){
  const el=document.getElementById('jg-live-session-view');
  if(el) el.innerHTML='<div class="info" style="font-size:12px;">法官還沒設定即時同步網址，暫時看不到即時票型。</div>';
}
// 場次代碼格式固定是 MMDD_N（見 jgLiveMakeSessionId），比較「新舊」用 MMDD*1000+N 當排序 key即可，
// 同一天的場次一定是 N 越大越新；跨天的話 MMDD 數字較大的自然排後面（年度交界等極端情況不考慮）。
function jgLiveSessionSortKey(s){
  const m=String(s||'').match(/^(\d{4})_(\d+)$/);
  return m?(parseInt(m[1],10)*1000+parseInt(m[2],10)):-1;
}
function jgLiveTodayPrefix(){
  const d=new Date();
  return String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0');
}
async function jgLiveLoadSessions(){
  if(!JG_LIVE_SYNC_URL){ jgLiveRenderConfigMissing(); return; }
  try{
    const res=await fetch(JG_LIVE_SYNC_URL+'?action=sessions');
    const data=await res.json();
    // 只留「今天」的場次（MMDD 前綴符合今天日期），不然舊的某一天場次也會被挑成「最新」。
    const todaySessions=(data.sessions||[]).filter(s=>s.indexOf(jgLiveTodayPrefix()+'_')===0);
    if(todaySessions.length===0){
      jgLiveCurrentSession=null;
      if(jgLivePollTimer){ clearInterval(jgLivePollTimer); jgLivePollTimer=null; }
      const el=document.getElementById('jg-live-session-view');
      if(el) el.innerHTML='<div class="info" style="font-size:12px;">今天目前還沒有開局，暫時沒有票型可以顯示。</div>';
      return;
    }
    todaySessions.sort((a,b)=>jgLiveSessionSortKey(a)-jgLiveSessionSortKey(b));
    const latest=todaySessions[todaySessions.length-1];
    if(latest===jgLiveCurrentSession) return; // 還是同一場，不用重新啟動輪詢
    jgLiveCurrentSession=latest;
    if(jgLivePollTimer){ clearInterval(jgLivePollTimer); jgLivePollTimer=null; }
    await jgLiveFetchAndShow(latest);
    // 每 8 秒自動重新讀取一次，讓觀眾的畫面能跟上法官那邊最新的票型進度
    jgLivePollTimer=setInterval(()=>jgLiveFetchAndShow(latest),8000);
  }catch(err){
    const el=document.getElementById('jg-live-session-view');
    if(el) el.innerHTML='<div class="info" style="font-size:12px;">讀取失敗，稍後會自動重試。</div>';
  }
}
async function jgLiveFetchAndShow(sessionId){
  const el=document.getElementById('jg-live-session-view');
  if(!el) return;
  try{
    const res=await fetch(JG_LIVE_SYNC_URL+'?action=view&session='+encodeURIComponent(sessionId));
    const data=await res.json();
    const text=data.text||'（這場還沒有票型紀錄）';
    el.innerHTML='<pre style="white-space:pre-wrap;font-size:12.5px;line-height:1.7;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin:0;font-family:inherit;">'+text.replace(/</g,'&lt;')+'</pre>';
  }catch(err){
    el.innerHTML='<div class="info" style="font-size:12px;">讀取失敗，稍後會自動重試。</div>';
  }
}
// 法官公布勝負時呼叫：把這一場的票型內容覆蓋成「本局已結束」的提示，這樣公開畫面不會
// 一直停留在最後一輪投票的樣子；等法官開下一場，jgLiveLoadSessions 會自動偵測到新的場次代碼、
// 換去顯示新場次。
function jgLiveSyncMarkEnded(){
  if(!JG_LIVE_SYNC_URL||!jgLiveSessionId) return;
  fetch(JG_LIVE_SYNC_URL,{
    method:'POST',
    mode:'no-cors',
    headers:{'Content-Type':'text/plain'},
    body:JSON.stringify({session:jgLiveSessionId,text:'🏁 本局已結束'})
  }).catch(err=>console.error('即時票型（結束標記）同步失敗（不影響遊戲繼續進行）',err));
}
// 頁面一打開就先試著載入場次清單（不管使用者現在是不是法官、有沒有在主持遊戲）
document.addEventListener('DOMContentLoaded',()=>{
  jgLiveLoadSessions();
  if(JG_LIVE_SYNC_URL) setInterval(jgLiveLoadSessions,15000); // 定期重新檢查，才看得到新開的場次
});


// Preset name pool for quick player-roster setup (judge can still type a custom name for anyone)
const JG_NAME_PRESET=['陳冠竹','巫嘉軒','鄭文奇','李法順','李想成','陳冠彣','陳玉堂','黃家珮','黃柏寰','何冠岳','謝子凡','王悅謙','孫揚和','蘇祐樂','許逸凡','林芸竹','吳柏霖','陳詩涵','劉謙叡','龔則乾','洪梓睿','黃禹勛','蘇奕安','郭展吟','許綺文','林均豪','潘彥誠','曾冠學','謝伊晨','陳芯錞','劉欣融'];
let jgPlayerNames={}; // num -> name, set via the roster setup page before jgStart()

// ── 文字紀錄匯出 ──
let jgNightLog={}; // night number -> array of "--xx" action lines
let jgDayLog={};   // night number (the night before that day) -> array of "票X：voters" lines
let jgDayMeta={};  // night number -> {start, dir} speaking-order info for that day
let jgDawnDeaths={}; // night number -> {died:[nums truly eliminated], swapped:[nums whose card1 died but card2 continues], notes:{num:'extra text appended after that num's 死亡 entry'}} (died/swapped both empty = 平安夜)
let jgGameCount=1; // increments each new game this session, used in the export section label
let jgHasStartedBefore=false;
const ROLE_ABBR={
  villager:'民', hybrid:'混血', cupid:'邱比特', thief:'盜賊', wolf:'狼', wolfking:'黑狼王', whitewolf:'白狼', wolfbeauty:'狼美', evilknight:'惡靈',
  gargoyle:'石像', bloodmoon:'血月', nightmare:'夢魘', wolfbrother_e:'狼兄', wolfbrother_y:'狼弟', wolfshaman:'狼巫', mask:'假面',
  mechanicalwolf:'機', seer:'預', witch:'巫', hunter:'獵', guard:'守', dreamcatcher:'攝夢', knight:'騎士', magician:'魔術',
  demonhunter:'獵魔', gravkeeper:'守墓', medium:'通', blackmarket:'黑市', purewhitemaiden:'純白', dancer:'舞者', sheriff:'警長', luckyone:'幸運'
};
// Builds a short label for the export header from whichever "special" (non-baseline) roles
// appeared this game — e.g. 通靈師+機械狼 present → "通靈師機械狼".
// 標題固定的角色排列順序（跟角色實際發在幾號玩家身上無關）。
// 直接照法官選板子那個下拉選單列出的順序去排（機械狼+通靈師／攝夢人+夢魘／黑市商人+狼兄狼弟／
// 狼美人+騎士／石像鬼+守墓人／血月使者+獵魔人／魔術師+黑狼王／混血兒+黑狼王+血月……），
// 這樣文字紀錄標題就會跟板子選單的排法完全一致。不在任何預設組合裡的角色（白狼王、惡靈騎士、
// 警長、幸運兒）沒有既定順序可以照抄，就近安插在概念相近的角色旁邊；
// 之後如果排出來的順序覺得怪怪的，直接調整這個陣列裡任兩個角色的先後位置就好。
const GAME_TITLE_ROLE_ORDER=[
  'thief',
  'cupid',
  'mechanicalwolf','medium',
  'dreamcatcher','nightmare',
  'blackmarket','wolfbrother_e','wolfbrother_y',
  'wolfbeauty','knight','evilknight',
  'gargoyle','gravkeeper',
  'hybrid','magician','wolfking','whitewolf','bloodmoon','demonhunter',
  'sheriff','luckyone'
];
function jgAutoGameTitle(){
  const baseline=new Set(['villager','wolf','seer','witch','hunter','guard']);
  const specialRoles=[];
  jgPlayers.forEach(p=>{ if(p.role&&!baseline.has(p.role)&&!specialRoles.includes(p.role)) specialRoles.push(p.role); });
  if(specialRoles.length===0) return '基本板';
  // 固定依照上面的順序排序，不管這些角色實際發在哪個號碼身上，
  // 標題永遠是同一種排列，文字紀錄標題才不會忽左忽右（同一板子一下叫「黑狼王魔術師」一下叫「魔術師黑狼王」）。
  specialRoles.sort((a,b)=>GAME_TITLE_ROLE_ORDER.indexOf(a)-GAME_TITLE_ROLE_ORDER.indexOf(b));
  return specialRoles.map(r=>jgFullRoleName(r)).join('');
}

// 把 jgSheriffLogLines（依序累積的候選人／發言順序／退水／各輪投票原始行）
// 整理成分組後的「**警長競選」區塊文字，跟白天流水帳分開、獨立輸出。
function jgExportGameLog(){
  let out='==='+jgAutoGameTitle()+'===\n';
  for(let i=1;i<=jgTotal;i++){
    const p=jgByNum(i);
    const nm=jgPlayerNames[i]||(p?p.name:i+'號');
    out+=i+' '+nm+' '+(p?jgRoleDisplayName(p):'')+'\n';
  }
  const d=new Date();
  const mmdd=String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0');
  out+='====='+mmdd+'_'+jgGameCount+'=====\n';
  const ordSuffix=n=>n===1?'1st':n===2?'2nd':n===3?'3rd':n+'th';
  const nightNums=Object.keys(jgNightLog).map(Number).sort((a,b)=>a-b);
  nightNums.forEach((n,idx)=>{
    if(idx>0) out+='\n';
    out+='**夜晚'+ordSuffix(n)+'\n';
    (jgNightLog[n]||[]).forEach(l=>{ out+='--'+l+'\n'; });
    if(jgSheriffEnabled&&n===(jgSheriffFinalNight||1)){
      const sheriffBlock=jgFormatSheriffBlock();
      if(sheriffBlock) out+='\n'+sheriffBlock;
    }
    if(jgDayLog[n]){
      const meta=jgDayMeta[n];
      const dirLabel=meta&&meta.dir?(meta.dir==='逆'?'逆向':'順向'):'';
      const startLabel=meta&&meta.start?'（'+meta.start+'號'+dirLabel+'開始發言）':'';
      out+='\n**白天'+ordSuffix(n)+startLabel+'\n';
      const dd=jgDawnDeaths[n]||{died:[],swapped:[],notes:{}};
      const ddNotes=dd.notes||{};
      const dparts=[...(dd.died||[]).map(x=>x+'死亡'+(ddNotes[x]?' '+ddNotes[x]:'')), ...(dd.swapped||[]).map(x=>x+'死亡，請使用第二身分'+(ddNotes[x]?' '+ddNotes[x]:''))];
      out+='>'+(dparts.length===0?'平安夜':dparts.join('、'))+'\n';
      jgDayLog[n].forEach(l=>{ out+='>'+l+'\n'; });
    }
  });
  const resultLabel=jgLastWinResult?(jgLastWinResult.winner==='good'?'好人陣營獲勝':(jgLastWinResult.winner==='third'?'第三方獲勝':'邪惡陣營獲勝')):'遊戲結束';
  out+='====='+resultLabel+'=====';
  return out;
}

function jgShowExportModal(){
  const text=jgExportGameLog();
  let modal=document.getElementById('jg-export-modal');
  if(!modal){
    modal=document.createElement('div');
    modal.id='jg-export-modal';
    modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
    document.body.appendChild(modal);
  }
  const safeText=text.replace(/</g,'&lt;');
  modal.innerHTML='<div style="background:var(--bg1,#fff);border-radius:14px;padding:16px;max-width:480px;width:100%;max-height:85vh;display:flex;flex-direction:column;">'
    +'<div style="font-weight:800;margin-bottom:8px;">📋 本局文字紀錄</div>'
    +'<textarea readonly style="flex:1;min-height:300px;font-family:monospace;font-size:12px;white-space:pre;padding:10px;border-radius:8px;">'+safeText+'</textarea>'
    +'<div style="display:flex;gap:8px;margin-top:10px;">'
    +'<button class="primary" style="flex:1;" onclick="jgCopyExportText()">複製文字</button>'
    +'<button style="flex:1;" onclick="document.getElementById(\'jg-export-modal\').remove()">關閉</button>'
    +'</div></div>';
}

// 把白天發生、還沒有票數列可以附加的事件（自爆、決鬥……）直接推進當天的文字紀錄陣列。
function jgCopyExportText(){
  const ta=document.querySelector('#jg-export-modal textarea');
  if(!ta) return;
  ta.select();
  navigator.clipboard?.writeText(ta.value).catch(()=>{});
  try{ document.execCommand('copy'); }catch(e){}
}
// Whether the mechanical wolf's learned 獵人 ability is active tonight/today (usable
// starting the night after it was learned, same rule as its other learned skills). The
// mechanical wolf's own role never changes to 'hunter' — it stays 'mechanicalwolf' with
// jgMechWolfLearned==='hunter' — so anywhere the real hunter's shot-on-death is handled,
// this needs to be checked as an alternate trigger.
function jgApplyDeath(p){
  if(!p) return false;
  if(jgDualIdentityMode&&p.role2&&!p.identity1Dead){
    p.identity1Dead=true;
    p.deadRole1=p.role;
    p.role=p.role2;
    p.role2=null;
    // 換牌＝這個號碼底下換了一個全新的身分／個體：所有「連續兩晚針對同一人」「是否曾被鎖定過」
    // 這類追蹤要以「牌」為單位，不是以「號碼」為單位，所以第一張牌陣亡換牌時，要把跟這個號碼
    // 有關的追蹤記錄清掉，讓第二張牌重新算「第一次」。
    const numStr=p.num.toString();
    if(jgLastGuardTarget&&jgLastGuardTarget.toString()===numStr) jgLastGuardTarget=null;
    if(jgLastMechWolfGuardTarget&&jgLastMechWolfGuardTarget.toString()===numStr) jgLastMechWolfGuardTarget=null;
    if(jgLastDreamcatcherTarget&&jgLastDreamcatcherTarget.toString()===numStr) jgLastDreamcatcherTarget=null;
    if(jgDreamcatcherEverTargeted[numStr]) delete jgDreamcatcherEverTargeted[numStr];
    if(jgLastNightmareTarget&&jgLastNightmareTarget.toString()===numStr) jgLastNightmareTarget=null;
    if(jgLastWolfBeautyCharm&&jgLastWolfBeautyCharm.toString()===numStr) jgLastWolfBeautyCharm=null;
    return false;
  }
  p.alive=false;
  return true;
}
// 某玩家「真的被淘汰」（不是雙身分換牌）時，若他原本的身分是狼美人，觸發魅惑對象殉情。
// wasRole 一定要在呼叫 jgApplyDeath 之前先存好，因為換牌會改掉 p.role。
// 回傳一同殉情的魅惑對象號碼（沒有觸發則回傳 null），方便呼叫端組合法官口白／文字紀錄。
function jgCascadeWolfBeautyDeath(wasRole, trulyDied){
  if(trulyDied&&wasRole==='wolfbeauty'&&jgRecord.wolfbeautyCharm){
    const ct=jgFind(jgRecord.wolfbeautyCharm);
    if(ct&&ct.alive){ jgApplyDeath(ct); return ct.num; }
  }
  return null;
}
// 某玩家「真的被淘汰」時，若他原本的身分是攝夢人，當晚夢遊（所睡）的玩家跟著同死。
function jgCascadeDreamcatcherDeath(wasRole, trulyDied){
  if(trulyDied&&wasRole==='dreamcatcher'&&jgRecord.dreamcatcherTarget){
    const dct=jgFind(jgRecord.dreamcatcherTarget);
    if(dct&&dct.alive) jgApplyDeath(dct);
  }
}
// 雙身分模式的黑狼王例外：黑狼王不管放在卡1或卡2，都可以在狼人睜眼時參與商討殺人，
// 避免黑狼王被鎖在尚未翻開的第二張牌裡、導致狼隊完全沒有夜間刀人能力而一直平安夜。
// 注意：這個例外只影響「能不能參與狼刀決策」，查驗/查身分時仍只看目前生效中的那張牌。
function jgIsWolfPackMember(p){
  if(!p) return false;
  if(WOLF_ROLES.includes(p.role)) return true;
  return !!(jgDualIdentityMode&&p.role2==='wolfking');
}
// 假面本身就是狼隊（跟石像鬼一樣），只是不跟狼隊見面、不知道隊友是誰——這只影響「他自己
// 知不知道誰是隊友」，不影響他的陣營歸屬：預言家查他永遠是狼、他在舞池裡永遠算狼隊，
// 這些都直接吃 jgIsWolfPackMember／WOLF_ROLES 就好，不需要另外特判。
// 真正需要另外處理的是「假面自己什麼時候可以開始帶刀殺人」——這跟他的陣營歸屬是兩件事，
// 見下面 jgMaskCanKill()。
function jgMaskCanKill(mkP){
  if(!mkP) return false;
  return jgPlayers.filter(x=>WOLF_ROLES.includes(x.role)&&x.role!=='mask'&&!x.alive).length===
    jgPlayers.filter(x=>WOLF_ROLES.includes(x.role)&&x.role!=='mask').length;
}
// 專門給「人數統計／勝負判定」使用的狼隊歸屬判斷：情侶若配成「狼狼鏈」，邱比特的勝負
// 跟著狼隊走——好人陣營要獲勝，除了原本的條件，也要連邱比特一起淘汰。但邱比特本人
// 「永遠不會帶狼刀」，不參與狼人殺人決策、不與狼隊一起睜眼，所以只有這個「算不算輸贏」
// 的判定會把他算進狼隊，其餘所有狼隊行動（睡眠順序、殺人目標選擇、陣營顏色顯示、
// 預言家查驗結果——邱比特永遠查出金水——等）完全不受影響，一律照 jgIsWolfPackMember
// 原本的判斷，不要在那些地方誤用這個函式。
function jgIsWolfForWin(p){
  if(jgIsWolfPackMember(p)) return true;
  return !!(p&&p.role==='cupid'&&jgLoverPairType()==='wolf');
}

function jgIsHunterCapable(p){
  if(!p) return false;
  return !!jgHunterCapableTag(p.role, p.num);
}
// 這位玩家「今晚」的獵人/黑狼王開槍技能是不是被封印了——不管他本身是不是真獵人／黑狼王，
// 只要符合以下任一種情況，死亡時都不能開槍帶人（即使同時也被狼刀擊殺）：
// 1) 被夢魘恐懼（本回合技能被封，只影響「這一晚」的死亡結算，跟白天被票出局無關——
//    白天被票是完全獨立的死法，夢魘的封印不會延續過去，一樣可以正常開槍）
// 2) 是攝夢人「連續兩晚夢遊同一人」造成的致死目標——這種死法本質是攝夢人技能直接致死，
//    不是正常的角色技能觸發時機，技能被封印，不能開槍
// 3) 攝夢人自己今晚死亡，連動夢遊對象一起死亡——連動死亡同樣不觸發技能，不能開槍
// 這三種情況都要在「死亡當下」用 p._skillSealed 旗標記錄（見 steps.js 套用這兩種攝夢人死亡的
// 地方），因為 jgRecord.dreamcatcherKillTarget／dreamcatcherTarget 在套用死亡後就會被清空，
// 等到後面判斷能不能開槍時已經讀不到了，必須在套用死亡的當下就把旗標釘在玩家物件上。
function jgHunterSkillSealed(p){
  return !!(p && (jgFeared(p) || p._skillSealed));
}
// 跟 jgIsHunterCapable 判斷邏輯相同，但吃「死前記住的原始身分」而非玩家目前的 role
// （雙身分模式換牌後 role 會變，開槍資格要看死前那張牌），並回傳具體是哪一種資格
// （真獵人／機械狼學到獵人／幸運兒得到獵槍），方便連鎖開槍畫面顯示正確的角色名稱。
function jgHunterCapableTag(role, num){
  if(role==='hunter') return 'hunter';
  if(role==='wolfking') return 'wolfking';
  if(role==='mechanicalwolf'&&jgMechWolfHunterActive()) return 'mechanicalwolf';
  if(jgLuckyOne&&jgLuckyOne.gift==='hunter'&&!jgLuckyOne.used&&jgNight>=jgLuckyOne.startNight&&jgLuckyOne.num===num) return 'luckyone';
  return null;
}
// Builds one player's independent 讚/倒讚 status block — shared by the real hunter's own
// step ('hunter-wake') and the mechanical wolf's own step ('mechanicalwolf-wake', when it has
// learned 獵人), since both use the exact same wolf-kill/guard/poison rules to decide the gesture.
function jgRoleAbbr(p){
  const r=p.role||'villager';
  if(r==='mechanicalwolf') return jgMechWolfLearned?('機械'+(ROLE_ABBR[jgMechWolfLearned]||jgMechWolfLearned)):'機械狼';
  return ROLE_ABBR[r]||r;
}

// Builds this night's "--xx" action-line list for the export log, read from jgRecord
// right before it gets reset. Best-effort: covers guard/機械狼/預言家/狼刀/女巫, which are
// the actions shown in the requested export format.
function jgFormatNightLog(){
  const lines=[];
  // 盜賊是整局第一個睜眼的角色（比邱比特還早，僅第一夜），選擇結果只記錄這一次
  if(jgNight===1 && jgThiefChosen && jgThiefFinalNum){
    const finalAbbr=ROLE_ABBR[jgThiefFinalRole]||jgThiefFinalRole;
    const buriedAbbr=ROLE_ABBR[jgThiefBuriedRole]||jgThiefBuriedRole;
    lines.push('盜 '+buriedAbbr+'or'+finalAbbr+'→'+finalAbbr);
  }
  // 邱比特是整局第一個睜眼的角色（僅第一夜），配對結果只記錄這一次
  if(jgNight===1 && jgCupidChosen && jgLovers && jgLovers.length===2){
    lines.push('邱 '+jgLovers.join('-'));
  }
  const guardP=jgPlayers.find(p=>p.role==='guard');
  const mwP=jgPlayers.find(p=>p.role==='mechanicalwolf');
  const seerP=jgPlayers.find(p=>p.role==='seer');
  const witchP=jgPlayers.find(p=>p.role==='witch');
  const hasWolf=jgPlayers.some(p=>WOLF_ROLES.includes(p.role)&&p.alive);
  // 預言家只會知道好人/狼人，通靈師（含機械狼學到通靈師）會知道具體身分
  const seerCheckResult=(val)=>{
    if(!val) return '';
    const t=jgFind(val);
    return t?(jgSeerAppearsWolf(t)?'(狼)':'(好)'):'';
  };
  const mediumCheckResult=(val)=>{
    if(!val) return '';
    const t=jgFind(val);
    if(!t) return '';
    const abbr=ROLE_ABBR[jgCheckDisplayRole(t.role||'villager')]||'';
    return abbr?'('+abbr+')':'';
  };
  // 該身分的持有者出局後，就不再繼續記錄該角色的行動。
  // 文字紀錄的順序固定依照實際睜眼順序排列（見 jgNightStartNext 一路到 jgNextGodStep 的睜眼流程註解）：
  // 夢魘(恐) → 魔術師(換) → 守衛(守) → 攝夢人(夢) → 狼兄狼弟覺醒刀 → 機械狼 → 狼刀 → 黑市商人(易)
  // → 女巫(救/毒) → 預言家(驗) → 通靈師(通驗，含幸運兒後續行動) → 獵魔人(狩)。
  // 換流用 jgSwapDisplay：法官喊的號碼(raw)跟魔術師換流後實際生效的號碼不同時，寫成「raw→actual」。
  const nmP=jgPlayers.find(p=>p.role==='nightmare');
  if(nmP&&nmP.alive) lines.push('恐 '+(jgRecord.nightmareTarget||'x'));
  const mgP0=jgPlayers.find(p=>p.role==='magician');
  if(mgP0&&mgP0.alive) lines.push('換 '+((jgRecord.magicianA&&jgRecord.magicianB)?(jgRecord.magicianA+'-'+jgRecord.magicianB):'x'));
  if(guardP&&guardP.alive) lines.push('守 '+jgSwapDisplay(jgRecord.guardTargetRaw, jgRecord.guardTarget));
  const dcP=jgPlayers.find(p=>p.role==='dreamcatcher');
  if(dcP&&dcP.alive) lines.push('夢 '+(jgRecord.dreamcatcherTarget||'x')+(jgRecord.dreamcatcherKillTarget?'(連續兩晚致死)':''));
  const wbyP=jgPlayers.find(p=>p.role==='wolfbrother_y');
  if(wbyP&&wbyP.alive&&jgWolfBrotherAwakened&&jgWolfBrotherAwakenedNight===jgNight){
    lines.push('狼弟復仇刀 '+(jgRecord.wolfBrotherAwakenKill||'x'));
  }
  // 守墓人／石像鬼現在排在狼人睜眼之前（見 jgAfterWolfBrotherStep），文字紀錄的順序也跟著調整。
  const gkP=jgPlayers.find(p=>p.role==='gravkeeper');
  if(gkP&&gkP.alive&&jgNight>=2){
    const lp=jgLastVoteOutPlayer?jgByNum(jgLastVoteOutPlayer):null;
    const isWolf3=lp&&WOLF_ROLES.includes(lp.role);
    lines.push('守墓 '+(jgLastVoteOutPlayer||'x')+(jgLastVoteOutPlayer?(isWolf3?'(狼)':'(好)'):''));
  }
  const ggP=jgPlayers.find(p=>p.role==='gargoyle');
  if(ggP&&ggP.alive){
    const v=jgRecord.gargoyleCheck;
    lines.push('石驗 '+(v||'x')+mediumCheckResult(v));
  }
  if(mwP&&mwP.alive){
    const learnedBeforeTonight=jgMechWolfLearned&&jgMechWolfLearnedNight!==null&&jgMechWolfLearnedNight<jgNight;
    if(!learnedBeforeTonight){
      if(jgRecord.mechwolfLearnTarget) lines.push('機學 '+jgRecord.mechwolfLearnTarget);
    } else if(jgMechWolfLearned==='witch'){
      lines.push('機毒 '+(jgRecord.mechWolfPoison||'x'));
    } else if(jgMechWolfLearned==='guard'){
      lines.push('機守 '+(jgRecord.mechWolfGuardTarget||'x'));
    } else if(jgMechWolfLearned==='medium'){
      const v=jgRecord.mechWolfMediumCheck;
      lines.push('機驗 '+(v||'x')+mediumCheckResult(v));
    } else if(jgMechWolfHasBonusKill()){
      if(!jgMechWolfBonusKillUsed||jgRecord.mechWolfBonusKillTarget) lines.push('機刀 '+(jgRecord.mechWolfBonusKillTarget||'x'));
    }
  }
  if(hasWolf) lines.push('刀 '+jgSwapDisplay(jgRecord.wolfKillRaw, jgRecord.wolfKill));
  const wbP3=jgPlayers.find(p=>p.role==='wolfbeauty');
  if(wbP3&&wbP3.alive) lines.push('魅 '+(jgRecord.wolfbeautyCharm||'x'));
  const bmP2=jgPlayers.find(p=>p.role==='blackmarket');
  if(bmP2&&bmP2.alive&&jgRecord.blackmarketTarget!==undefined){
    const skillAbbr={seer:'驗',witch:'毒',hunter:'獵'}[jgRecord.blackmarketSkill]||'';
    lines.push('易 '+(jgRecord.blackmarketTarget||'x')+(jgRecord.blackmarketTarget&&skillAbbr?'('+skillAbbr+')':''));
  }
  // 幸運兒（黑市商人交易產生）依所獲技能記錄行動——現在有自己獨立的睜眼步驟，緊接在黑市商人之後
  if(jgLuckyOne&&jgNight>=jgLuckyOne.startNight){
    const lp=jgByNum(jgLuckyOne.num);
    if(lp&&lp.alive){
      if(jgLuckyOne.gift==='seer'&&jgRecord.luckyoneCheck!==undefined){
        lines.push('幸驗 '+(jgRecord.luckyoneCheck||'x')+seerCheckResult(jgRecord.luckyoneCheck));
      } else if(jgLuckyOne.gift==='witch'&&jgRecord.luckyonePoison!==undefined){
        lines.push('幸毒 '+(jgRecord.luckyonePoison||'x'));
      }
    }
  }
  if(witchP&&witchP.alive){
    // 這裡原本是 if/else if，意味著「救」跟「毒」只會記錄其中一個——只要當晚有刀可以給女巫看
    // （會記錄「救」那一行），就算她這晚同時也用了毒藥，「毒」那一行也會被跳過、完全沒記錄到。
    // 救人跟下毒是女巫同一晚的兩個獨立決定，不是互斥的，要各自獨立判斷是否要記一行。
    if(jgRecord._witchCanShowKilled) lines.push('救 '+(jgRecord.witchSave?jgSwapDisplay(jgRecord.wolfKillRaw, jgRecord.wolfKill):'x'));
    if(jgRecord.witchPoisonRaw||!jgWitchPoisonUsed) lines.push('毒 '+jgSwapDisplay(jgRecord.witchPoisonRaw, jgRecord.witchPoison));
  }
  if(seerP&&seerP.alive){
    const v=jgRecord.seerChecked;
    lines.push('驗 '+jgSwapDisplay(jgRecord.seerCheckedRaw, v)+seerCheckResult(v));
  }
  const mdP=jgPlayers.find(p=>p.role==='medium');
  if(mdP&&mdP.alive){
    const v=jgRecord.mediumCheck;
    lines.push('通驗 '+(v||'x')+mediumCheckResult(v));
  }
  const dhP=jgPlayers.find(p=>p.role==='demonhunter');
  if(dhP&&dhP.alive&&jgNight>=2) lines.push('狩 '+(jgRecord.demonhunterTarget||'x'));
  const wsP=jgPlayers.find(p=>p.role==='wolfshaman');
  if(wsP&&wsP.alive){
    const v=jgRecord.wolfshamanChecked;
    lines.push('巫查 '+jgSwapDisplay(jgRecord.wolfshamanCheckedRaw, v)+(jgRecord.wolfshamanKillTarget?'(致死)':''));
  }
  const pwP=jgPlayers.find(p=>p.role==='purewhitemaiden');
  if(pwP&&pwP.alive){
    const v=jgRecord.purewhitemaidenChecked;
    lines.push('白查 '+jgSwapDisplay(jgRecord.purewhitemaidenCheckedRaw, v)+(jgRecord.purewhitemaidenKillTarget?'(致死)':''));
  }
  const dnP=jgPlayers.find(p=>p.role==='dancer');
  if(dnP&&dnP.alive&&jgNight>=2){
    lines.push(jgRecord.dancerPool?('舞池 '+jgRecord.dancerPool.join('/')+(jgRecord.dancerSelfIn?'(舞者入池)':'')):'舞池 x(人數不足自動跳過)');
  }
  const mkP=jgPlayers.find(p=>p.role==='mask');
  if(mkP&&mkP.alive&&jgNight>=2){
    if(jgRecord.maskKillTarget) lines.push('假面刀 '+jgRecord.maskKillTarget);
    lines.push('假面查 '+(jgRecord.maskCheckTarget||'x'));
    lines.push('假面賜 '+(jgRecord.maskGrantTarget||'x'));
  }
  return lines;
}
// jgPlayers: {num, name, role, alive}
// role starts as null for all; filled in during night-1 wake steps
// after night-1 ends, any null role → villager
let jgPlayers=[];
let jgNight=1, jgWitchSaveUsed=false, jgWitchPoisonUsed=false;
let jgRecord={wolfKill:null,guardTarget:null,witchSave:null,witchPoison:null,seerChecked:null};
let jgLastGuardTarget=null;
let jgLastWolfBeautyCharm=null;
let jgLastNightmareTarget=null;
// 假面舞會板專用狀態：
// jgDancerEverDanced＝整局曾經進過舞池的玩家號碼集合（每位玩家整局只能共舞一次，跨夜持續累積）
// jgLastMaskCheckTarget／jgLastMaskGrantTarget＝假面上一晚查驗／賜予面具的目標（各自獨立，
// 不能連續兩晚指定同一人），只在「假面」這個角色的板子會用到
let jgDancerEverDanced=new Set();
let jgLastMaskCheckTarget=null;
let jgLastMaskGrantTarget=null;
let jgLastDreamcatcherTarget=null;
let jgDreamcatcherEverTargeted={}; // num(string) -> true once ever dreamed, for first-time immunity
let jgMagicianSwapped=[]; // persists across nights
let jgMechWolfLearned=null; // learned role id, once ever
let jgMechWolfBonusKillUsed=false; // learned 'wolf' role: one-time extra kill, consumed once used
let jgMechWolfPoisonUsed=false; // learned 'witch' role: poison is a one-time item, consumed once used (whether or not it lands)
let jgLastMechWolfGuardTarget=null; // learned 'guard' role: can't guard the same person on consecutive nights, same as a real guard
let jgMechWolfGuardUsed=false; // learned 'guard' role: ability is consumed once it successfully blocks a wolf-kill or witch-poison
let jgMechWolfLearnedNight=null; // night number when learned; skill usable from the next night on
let jgWolfBrotherIdDone=false;  // 狼兄狼弟 night-1 mutual ID step completed
let jgWolfBrotherAwakened=false; // 狼弟 has had their one-time awakening kill
let jgWolfBrotherAwakenedNight=null; // night number the awakening kill happened on — the den only opens to 狼弟 starting the NEXT night, not that same night
let jgLastNightPeaceful=false; // true if the most recent night had zero deaths (平安夜)
let jgSpeakDirection=null; // '順'|'逆', established by the peaceful-night wheel, persists for the game
let jgBlackMarketUsed=false; // one-time trade flag
let jgLuckyOne=null; // {num, gift} created by black market dealer
let jgBlackMarketTradeNight=null; // 交易嘗試發生的那一晚（不論成功失敗都會記錄）——決定幸運兒睜眼順序：
// 交易當晚（＝這一晚）幸運兒緊接在黑市商人之後睜眼（走 luckyone-walk）；
// 從下一晚起，幸運兒改成整晚最後一個睜眼（見 jgNextGodStep 尾端插入邏輯）。
// ── 混血兒：第一夜選擇一位支持對象，勝利條件與支持對象相同（自己不知道對方陣營） ──
let jgHybridChosen=false; // 本局是否已完成第一夜的支持對象選擇
let jgHybridTarget=null;  // 支持對象號碼（string）
// ── 邱比特：第一夜指定兩名玩家成為情侶（可鏈自己），整局僅此一次行動 ──
let jgCupidChosen=false;   // 本局是否已完成第一夜的情侶指定
let jgLovers=null;         // [num1, num2]（string 或 number 皆可），未指定則為 null
// ── 盜賊：整局第一個睜眼（比邱比特還早）。開局前（第一夜最開頭）先由系統「轉盤」秘密抽出
// 兩張候選身分牌（只有法官看得到），法官照抽到的結果去實際牌堆裡把那兩張牌拿起來、其餘的牌
// 正常發給大家；到了盜賊睜眼步驟，法官就直接把這兩張已經決定好的候選身分秀給盜賊看，
// 盜賊選一個成為最終真正的身分（若候選中有狼人則強制選狼），另一張候選則「埋」掉，
// 整局都不會有人是那個身分 ──
let jgThiefWheelDone=false;   // 是否已經完成（並確認）盜賊候選轉盤的抽取
let jgThiefWheelCand1=null;   // 轉盤抽到的候選身分 A（role id）
let jgThiefWheelCand2=null;   // 轉盤抽到的候選身分 B（role id）
let jgThiefChosen=false;      // 本局是否已完成盜賊的選擇
let jgThiefFinalNum=null;     // 盜賊玩家的號碼（string）
let jgThiefFinalRole=null;    // 盜賊最終選擇的身分（role id）
let jgThiefBuriedRole=null;   // 被埋掉、整局都不會出現的那個身分（role id）

// ── 警長競選 ──
let jgSheriffEnabled=false;   // 本局是否開放上警競選（設定頁勾選）
let jgSheriff=null;           // 當選警長的號碼（number），無警長則為 null
let jgSheriffElectionDone=false; // 競選流程（不論結果為何）是否已經跑完，避免重複觸發
let jgSheriffCandidatesAsked=false; // 是否已經問過「候選人請起立」（避免每次重新渲染 dawn 都再問一次）
let jgSheriffCampaignHappened=false; // 是否真的有人上警競選過（用來判斷天亮畫面要不要顯示警長結果 banner）
let jgSheriffCandidates=[];   // 目前仍在競選中的候選人號碼（number[]），退水的人會被移除
let jgSheriffWithdrawn=[];    // 已退水的號碼（number[]，只是記錄用）
let jgSheriffSpeakStart=null; // 政見發表的起始候選人號碼
let jgSheriffSpeakDir=null;   // 政見發表方向 '順'|'逆'
let jgSheriffVoteTally={};    // 警長投票：{candidateNum:{voterNum:true}}
let jgSheriffPkRound=false;   // 是否正處於平票 PK 重新發言／投票的回合（PK 回合中不可退水）
let jgSheriffSelfDestruct=false; // 競選過程中是否有狼人自爆（本局不再有警長）
let jgSheriffSelfDestructNum=null; // 自爆吞警徽的玩家號碼，供文字紀錄使用
let jgSheriffSelfDestructBroughtNum=null; // 若自爆的是白狼王，這裡記他帶走的號碼（沒帶人則為 null）
let jgEvilKnightRevengeUsed=false; // 惡靈騎士反傷整局限一次，成功反傷一次後永久失效
let jgLastVoteOutPlayer=null; // 前一個白天投票處死的玩家號碼（守墓人用，獨立變數不受每夜 jgRecord 重置影響）
let jgSheriffLogLines=[]; // 警長競選的候選人／發言順序／退水／各輪投票票型，依序累積，供文字紀錄匯出使用
// 悍跳號碼記錄（排除詐身分）：警上（競選政見發表）跟警下（一般發言討論）都可以選填，
// 不強制填寫；有填的話才會計入文字紀錄，法官不需要就直接留空即可。
// 整場遊戲只需要記錄一次：法官只要在任一個畫面確認送出過一次，之後不管是回到警上競選
// 還是換到後面幾天的發言討論畫面，輸入框都不會再出現。
let jgHanTiaoCommitted=false;      // 整場遊戲是否已經記錄過一次悍跳（一旦 true，全場輸入框都收起來）
let jgHanTiaoSheriffNote='';       // 警上競選期間的悍跳預言家號碼記錄（整場競選共用一欄）
let jgHanTiaoDiscussNotes={};      // 警下一般發言討論的悍跳預言家號碼記錄，依 jgNight 分開存
let jgSheriffElectedNum=null; // 競選當選的警長號碼，當選後固定不變（jgSheriff 之後可能因交接警徽而改變，這個只記錄最初當選者，供文字紀錄使用）
let jgSheriffTransferPending=false; // 警長剛陣亡、尚待法官選擇交接對象（或撕毀警徽）
let jgSheriffTransferDeadNum=null;  // 剛陣亡的警長號碼，供交接畫面與文字紀錄使用
let jgSheriffTransferNextStep=null; // 交接完成後要繼續前往的原定步驟（由 jgGoStep 攔截時記錄）
// ── 自爆吞警徽規則（設定頁選擇：單爆／雙爆） ──
let jgBadgeMode='single';     // 本局採用的自爆吞警徽規則：'single'=單爆吞警徽／'double'=雙爆吞警徽
let jgSheriffFirstBlowDone=false; // 雙爆模式下，是否已經發生過第一次自爆（警徽尚未流失）
let jgSheriffFirstBlowNum=null;   // 第一次自爆（保留警徽）的玩家號碼
let jgSheriffPostponedToDay2=false; // 雙爆模式下，第一次自爆後，警長競選是否延到隔天白天繼續
let jgSheriffDay2CandidatesAsked=false; // 雙爆模式下，隔天是否已經重新問過候選人起立（避免重複詢問）
let jgSheriffFinalNight=null; // 警長競選真正塵埃落定（選出警長／確定無警長）的那個白天，供文字紀錄輸出用
// ── 白天投票放逐：平票 PK ──
let jgVotePkRound=false;    // 是否正處於白天投票平票後的 PK 重新投票回合
let jgVotePkCandidates=[];  // PK 回合中僅平票玩家可被投票（其餘玩家才有投票權）
// PK 發言順序規則：前一輪（一般發言／政見發表）越晚發言的玩家，PK 時越早發言——
// 取前一輪的完整發言順序，篩出這次平票的人，再整個反過來，存成明確的順序陣列。
let jgVotePkOrder=[];       // 白天放逐票 PK 的明確發言順序（number[]）
let jgSheriffPkOrder=[];    // 警長競選票 PK 的明確發言順序（number[]）
// ── 雙身分模式：每位玩家 2 張牌，一次只有一張生效；第一張陣亡才換上第二張 ──
let jgDualIdentityMode=false;
let jgDualAssign={};      // num -> [roleA, roleB], chosen by judge on the assignment page
let jgDualAssignDone=false;
const JG_DUAL_ROLE_POOL=['villager','seer','witch','guard','hunter','knight','wolf','wolfking','dreamcatcher','nightmare'];
let jgStepHistory=[];
let jgStateHistory=[]; // parallel to jgStepHistory: a deep snapshot of mutable game state captured
                        // right BEFORE each step was entered, so jgBack() can genuinely undo — not
                        // just move a pointer — everything that step's logic changed (deaths, used-
                        // item flags, poison/save choices, night counter, logs, etc).
let jgCurrentStep='';
// Track which role slots remain to assign (for seer result lookup)
// Comp-based role counts for reference
let jgRoleCounts={};
// 法官設定頁的身分模式切換（單身分／雙身分）；雙身分時人數改為 4～7 人（8～14 個角色）
let jgSetupDualMode=false;

function jgSetMode(isDual){
  jgSetupDualMode=isDual;
  const cb=document.getElementById('jg-dual-mode'); if(cb) cb.checked=isDual;
  const bS=document.getElementById('jg-mode-single'), bD=document.getElementById('jg-mode-dual');
  if(bS) bS.classList.toggle('primary',!isDual);
  if(bD) bD.classList.toggle('primary',isDual);
  const desc=document.getElementById('jg-dual-mode-desc'); if(desc) desc.style.display=isDual?'':'none';
  // 板子預設只開放單身分板；切到雙身分就強制退回「自訂角色」並隱藏板子選單
  const boardRow=document.getElementById('jg-board-preset-row');
  if(boardRow) boardRow.style.display=isDual?'none':'';
  if(isDual){
    jgBoardPreset='custom';
    const bp=document.getElementById('jg-board-preset'); if(bp) bp.value='custom';
  }
  const countInput=document.getElementById('jg-count');
  const label=document.getElementById('jg-count-label');
  const min=isDual?4:6, max=isDual?7:14;
  let n=min;
  if(countInput){
    countInput.min=min; countInput.max=max;
    n=Math.min(max,Math.max(min,parseInt(countInput.value)||min));
    countInput.value=n;
  }
  if(label) label.textContent=isDual?'玩家人數（4～7，雙身分共 8～14 個角色）':'玩家人數（6～14）';
  jgRolePick=Object.assign({}, isDual?(DEFAULT_COMP_DUAL[n]||DEFAULT_COMP_DUAL[4]):(DEFAULT_COMP[n]||DEFAULT_COMP[6]));
  jgRolePick._init=true;
  jgUpdateComp();
}

function jgUpdateComp(){
  const isDual=jgSetupDualMode;
  const min=isDual?4:6, max=isDual?7:14;
  const n=Math.min(max,Math.max(min,parseInt(document.getElementById('jg-count')?.value)||min));
  if(!jgRolePick._init){
    if(!isDual&&jgBoardPreset!=='custom'){ jgApplyPresetDefaults(n); }
    else { jgRolePick=Object.assign({}, isDual?(DEFAULT_COMP_DUAL[n]||DEFAULT_COMP_DUAL[4]):(DEFAULT_COMP[n]||DEFAULT_COMP[6])); jgRolePick._init=true; }
  }
  const comp=getPickComp(jgRolePick);
  const total=Object.values(comp).reduce((a,b)=>a+b,0);
  const wolves=Object.entries(comp).filter(([k])=>WOLF_ROLES.includes(k)).reduce((s,[,v])=>s+v,0);
  const gods=Object.entries(comp).filter(([k])=>GOD_ROLES.includes(k)).reduce((s,[,v])=>s+v,0);
  const vils=comp.villager||0;
  const hybrids=comp.hybrid||0;
  const cupids=comp.cupid||0;
  const thieves=comp.thief||0;
  const fools=comp.fool||0;
  // 有盜賊時，開局前要多準備 2 張候選身分牌（不算在 n 個玩家裡），所以要選的角色總數
  // 是「玩家人數 + 2」，不是「玩家人數」；沒有盜賊則維持原本 target = n。
  const hasThief=thieves>0;
  const target=isDual?n*2:(hasThief?n+2:n);
  const el=document.getElementById('jg-comp-desc');
  if(el){
    el.textContent=isDual
      ? '共 '+total+' 個角色'+(total!==target?' ⚠️ 需選滿 '+target+' 個角色':'')
      : (hasThief
          ? '玩家 '+n+' 人 · 共 '+total+' 個角色（盜賊需多選 2 個候選身分）· 狼人 '+wolves+' · 神職 '+gods+' · 平民 '+vils+(hybrids>0?' · 混血兒 '+hybrids:'')+(cupids>0?' · 邱比特 '+cupids:'')+(fools>0?' · 傻瓜 '+fools:'')+' · 盜賊 '+thieves+(total!==target?' ⚠️ 需選滿 '+target+' 個角色':'')
          : '共 '+total+' 人 · 狼人 '+wolves+' · 神職 '+gods+' · 平民 '+vils+(hybrids>0?' · 混血兒 '+hybrids:'')+(cupids>0?' · 邱比特 '+cupids:'')+(fools>0?' · 傻瓜 '+fools:'')+(total!==target?' ⚠️ 需選滿 '+target+' 人':''));
  }
  const usePreset=!isDual&&jgBoardPreset!=='custom';
  const pickerEl=document.getElementById('jg-role-picker');
  const presetEl=document.getElementById('jg-preset-picker');
  if(usePreset){
    if(pickerEl) pickerEl.style.display='none';
    if(presetEl) presetEl.style.display='';
    renderPresetPicker();
  } else {
    if(pickerEl) pickerEl.style.display='';
    if(presetEl) presetEl.style.display='none';
    renderRolePicker('jg-role-picker', jgRolePick, target, null);
  }
  jgRenderFoolModeUI();
  jgRenderNightmareModeUI();
}

// 夢魘規則切換（每晚強制恐懼／可以不恐懼）：只有這場板子有選夢魘才顯示。
// 12 人以上局預設「可不恐懼」，12 人以下維持傳統「強制恐懼」；法官手動切過之後
// 就不再依人數自動覆蓋，直到重新整理／重選板子。實際規則差異見 jgSaveNightmare()。
function jgOpenRosterSetup(){
  const isDual=jgSetupDualMode;
  const min=isDual?4:6, max=isDual?7:14;
  const n=Math.min(max,Math.max(min,parseInt(document.getElementById('jg-count')?.value)||min));
  jgTotal=n;
  jgRenderRosterSetupRows();
  document.querySelectorAll('#t-judge .pg').forEach(p=>p.classList.remove('on'));
  document.getElementById('jg-p-roster').classList.add('on');
}

// 每一列：號碼＋姓名輸入框（打一兩個字就用比對出候選人名單，選錯了可以直接手動改字）
// ＋「⇄交換」（跟另一個號碼互換姓名，不用先清空）＋「✕清空」按鈕。
function jgRenderRosterSetupRows(){
  const box=document.getElementById('jg-roster-setup-rows');
  if(!box) return;
  let html='<button type="button" class="ghost" style="margin:0 0 12px;" onclick="jgRosterClearAll()">🗑️ 清空全部姓名</button>';
  for(let i=1;i<=jgTotal;i++){
    const cur=jgPlayerNames[i]||'';
    html+='<div class="rname-row">'
      +'<div class="rname-num">'+i+'</div>'
      +'<div class="rname-field">'
      +'<input type="text" id="jg-roster-input-'+i+'" placeholder="輸入姓名或其中一個字" value="'+cur.replace(/"/g,'&quot;')+'" '
      +'oninput="jgRosterInputChange('+i+')" onfocus="jgRosterInputChange('+i+')" onblur="jgRosterBlur('+i+')" autocomplete="off"/>'
      +'<div class="rname-suggest" id="jg-roster-suggest-'+i+'"></div>'
      +'</div>'
      +'<button type="button" class="rname-btn" onclick="jgRosterClear('+i+')" title="清空這一格">✕</button>'
      +'</div>';
  }
  box.innerHTML=html;
  jgRosterHighlightDup();
}

// 打字比對：輸入的字只要出現在候選姓名裡的任何位置就列為建議（例如打「竹」會同時比對出
// 「陳冠竹」「林芸竹」），法官點一下就套用；找不到或比對錯誤都能直接把輸入框的字改掉。
// 欄位是空的（例如剛點進去還沒打字）時，直接列出完整名單，等同於一個可點選的選單；
// 開始打字後名單會即時篩選縮小，兩種用法可以同時搭配使用。
function jgRosterInputChange(i){
  const inp=document.getElementById('jg-roster-input-'+i);
  const box=document.getElementById('jg-roster-suggest-'+i);
  if(!inp||!box) return;
  const q=inp.value.trim();
  const usedElsewhere={};
  for(let n=1;n<=jgTotal;n++){
    if(n===i) continue;
    const v=(document.getElementById('jg-roster-input-'+n)||{}).value?.trim();
    if(v) usedElsewhere[v]=n;
  }
  const pool=q?JG_NAME_PRESET.filter(nm=>nm.includes(q)):JG_NAME_PRESET;
  if(!pool.length){ box.style.display='none'; box.innerHTML=''; jgRosterHighlightDup(); return; }
  box.innerHTML=pool.map(nm=>{
    const takenBy=usedElsewhere[nm];
    return '<div class="rname-suggest-item'+(takenBy?' dup':'')+'" onclick="jgRosterPick('+i+',\''+nm+'\')">'+nm
      +(takenBy?'<span class="rname-tag">'+takenBy+'號已使用</span>':'')+'</div>';
  }).join('');
  box.style.display='block';
  jgRosterHighlightDup();
}

function jgRosterPick(i, name){
  const inp=document.getElementById('jg-roster-input-'+i);
  if(inp) inp.value=name;
  jgRosterHideSuggest(i);
  jgRosterHighlightDup();
}

function jgRosterHideSuggest(i){
  const box=document.getElementById('jg-roster-suggest-'+i);
  if(box){ box.style.display='none'; box.innerHTML=''; }
}

// 用短延遲讓「點建議項目」的 click 事件能在 blur 隱藏建議清單之前先觸發
function jgRosterBlur(i){
  setTimeout(()=>jgRosterHideSuggest(i),150);
}

// 同姓名只用邊框標紅提醒（不是強制擋下），因為換號碼過程中本來就會短暫重複，
// 讓法官自己決定要不要處理，不用被系統卡住。
function jgRosterHighlightDup(){
  const counts={};
  for(let i=1;i<=jgTotal;i++){
    const v=(document.getElementById('jg-roster-input-'+i)||{}).value?.trim();
    if(v) counts[v]=(counts[v]||0)+1;
  }
  for(let i=1;i<=jgTotal;i++){
    const inp=document.getElementById('jg-roster-input-'+i);
    if(!inp) continue;
    const v=inp.value.trim();
    inp.style.borderColor=(v&&counts[v]>1)?'var(--wolf)':'';
  }
}

function jgRosterClear(i){
  const inp=document.getElementById('jg-roster-input-'+i);
  if(!inp) return;
  inp.value='';
  jgRosterHideSuggest(i);
  jgRosterHighlightDup();
  inp.focus();
}

function jgRosterClearAll(){
  if(!confirm('確定要清空所有已設定的姓名嗎？')) return;
  for(let i=1;i<=jgTotal;i++){
    const inp=document.getElementById('jg-roster-input-'+i);
    if(inp) inp.value='';
    jgRosterHideSuggest(i);
  }
  jgRosterHighlightDup();
}

function jgApplyRosterSetupNames(){
  for(let i=1;i<=jgTotal;i++){
    const inp=document.getElementById('jg-roster-input-'+i);
    if(!inp) continue;
    const v=inp.value.trim();
    if(v) jgPlayerNames[i]=v; else delete jgPlayerNames[i];
  }
}
function jgSaveRosterSetup(){
  jgApplyRosterSetupNames();
  jgCancelRosterSetup();
}
function jgSaveRosterSetupAndStart(){
  jgApplyRosterSetupNames();
  jgCancelRosterSetup();
  jgStart();
}

function jgCancelRosterSetup(){
  document.querySelectorAll('#t-judge .pg').forEach(p=>p.classList.remove('on'));
  document.getElementById('jg-p-setup').classList.add('on');
}

// Renders a <select> of all seat numbers (showing preset/自訂 name if known) for choosing
// who holds a role, instead of typing a bare number blind.
function jgNumSelectHtml(id, curVal, onChangeFn, extraAttr, excludeNums, excludeTitle, excludeTitleFn){
  const cur=curVal?curVal.toString():'';
  const excl=excludeNums?excludeNums.map(n=>n.toString()):[];
  const exclTitle=excludeTitle||'此號碼不能自刀，不可選取';
  let html='<input type="hidden" id="'+id+'" value="'+cur+'"'+(extraAttr?' '+extraAttr:'')+'>'
    +'<div class="numgrid" id="'+id+'-grid" style="display:flex;flex-wrap:wrap;gap:6px;">';
  for(let i=1;i<=jgTotal;i++){
    const label=i+'';
    const sel=cur===i.toString();
    const pl=jgPlayers.find(p=>p.num===i);
    const dead=!!(pl&&!pl.alive);
    const excluded=!dead&&excl.includes(i.toString());
    // 每個被排除的號碼可以各自顯示不同原因（例如「3號 狼兄（本場不能自爆的狼）不能自爆」），
    // 沒提供 excludeTitleFn 時退回原本全部共用同一句話的舊行為。
    const thisTitle=excluded?(excludeTitleFn?excludeTitleFn(i):exclTitle):'';
    html+='<button type="button" data-num="'+i+'"'+((dead||excluded)?' disabled':'')+' onclick="jgNumGridPick(\''+id+'\','+i+(onChangeFn?",'"+onChangeFn+"'":'')+')" '
      +(excluded?'title="'+thisTitle.replace(/"/g,'&quot;')+'" ':'')
      +'style="width:auto;min-width:38px;height:38px;padding:0 8px;margin:0;border-radius:10px;font-size:13px;font-weight:700;'
      +(dead?'background:var(--bg4);color:var(--text3);text-decoration:line-through;':(excluded?'background:var(--bg4);color:var(--text3);opacity:.5;':(sel?'background:var(--success,#2e7d32);color:#fff;border-color:transparent;':'')))+'">'+label+'</button>';
  }
  html+='</div>';
  return html;
}

// 「不能自刀」的狼隊角色（惡靈騎士、狼美人、夢魘——三者的角色說明都寫明「不可自刀」）：
// 狼人／機械狼／石像鬼帶刀選人時，這些號碼一律不能被點選。
// 依號碼給「不能自爆」的具體原因（狼隊角色寫角色名＋原因，非狼隊角色寫另一種提示），
// 讓法官點到鎖住的按鈕時，看到的是「3號 狼兄（本場不能自爆的狼）不能自爆」這種明確訊息，
// 而不是每個號碼都顯示同一句籠統的話。
function jgSelfBlowExcludeReason(num){
  const p=jgFind(num);
  if(!p) return '不可選取';
  const roleName=RNAME[p.role]||p.role;
  const nm=p.name&&p.name!==p.num+'號'?p.num+'號 '+p.name:p.num+'號';
  if(WOLF_ROLES.includes(p.role)) return nm+'　'+roleName+'（本場不能自爆的狼）不能自爆';
  return nm+'　不是狼人陣營，不能自爆';
}

// ═══════════════════════════════════════════
// 發言 90 秒倒數計時器（含警上）：法官畫面上顯示目前輪到誰發言、倒數時間，
// 時間到會播放提示音效（音檔請放在跟 index.html 同一個 GitHub repo 目錄下，
// 檔名 speak time's up.mp3），並提供暫停／開始、重播音效、「過」（換下一位）幾個按鈕。
// 這組變數是純畫面用的暫存狀態，不需要跟著存讀檔存進 jgCaptureState（法官重新整理／
// 上一步的話，重新按「開始」繼續即可，不影響任何遊戲判定邏輯）。
// ═══════════════════════════════════════════
const JG_SPEAK_SECONDS=90;
const JG_SPEAK_AUDIO_SRC="speak_time's_up.mp3";
let jgSpeakTimerOrderKey='';
let jgSpeakTimerIdx=0;
let jgSpeakTimerSec=JG_SPEAK_SECONDS;
let jgSpeakTimerRunning=false;
let jgSpeakTimerHandle=null;
let jgSpeakTimerDone=false;

// 換一批新的發言順序（例如今天的一般發言 vs 警上政見發表 vs PK 發言）時，自動歸零重來；
// 同一批順序內（只是重新 render 同一個畫面）則保留目前進度，不會每次都被重置。
function jgSpeakTimerEnsureOrder(order){
  const key=(order||[]).join(',');
  if(key!==jgSpeakTimerOrderKey){
    jgSpeakTimerOrderKey=key;
    jgSpeakTimerIdx=0;
    jgSpeakTimerSec=JG_SPEAK_SECONDS;
    jgSpeakTimerRunning=false;
    jgSpeakTimerDone=false;
    if(jgSpeakTimerHandle){ clearInterval(jgSpeakTimerHandle); jgSpeakTimerHandle=null; }
  }
}
function jgSpeakTimerFmt(sec){
  const mm=String(Math.floor(sec/60)).padStart(2,'0');
  const ss=String(sec%60).padStart(2,'0');
  return mm+':'+ss;
}
// 產生計時器卡片 HTML，塞進發言／警上政見發表／PK 發言三個畫面的最上方。
// order 是「這一輪」的發言順序（number[]，已經照座位／PK 反轉排好）；沒有人可發言時回傳空字串。
function jgSpeakTimerWidgetHtml(order){
  jgSpeakTimerEnsureOrder(order||[]);
  if(!order||!order.length) return '';
  if(jgSpeakTimerIdx>=order.length) jgSpeakTimerIdx=order.length-1;
  const cur=order[jgSpeakTimerIdx];
  const p=jgFind(cur);
  const nm=p&&p.name&&p.name!==p.num+'號'?p.num+'號 '+p.name:cur+'號';
  const upcoming=order.slice(jgSpeakTimerIdx+1).map(n=>n+'號').join('、');
  return `
    <div class="card" style="text-align:center;padding:16px 14px;margin-bottom:14px;">
      <div style="font-size:12px;color:var(--text2);">⏱️ 目前發言（90 秒倒數）</div>
      <div style="font-size:24px;font-weight:800;margin:4px 0;">${nm}</div>
      <div id="jg-speak-timer-clock" style="font-size:42px;font-weight:800;font-variant-numeric:tabular-nums;color:${jgSpeakTimerDone?'var(--wolf)':'var(--text)'};">${jgSpeakTimerFmt(jgSpeakTimerSec)}</div>
      <div id="jg-speak-timer-uptxt" style="font-size:12px;color:${jgSpeakTimerDone?'#922418':'var(--text3)'};min-height:16px;margin-top:2px;">${jgSpeakTimerDone?'⏰ 時間到':''}</div>
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button type="button" id="jg-speak-timer-toggle-btn" onclick="jgSpeakTimerToggle()" style="flex:1;margin:0;">${jgSpeakTimerRunning?'⏸ 暫停':'▶️ 開始'}</button>
        <button type="button" onclick="jgSpeakTimerReplayAudio()" style="flex:1;margin:0;">🔁 重播音效</button>
        <button type="button" class="primary" onclick="jgSpeakTimerNext()" style="flex:1;margin:0;">過，下一位 →</button>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-top:8px;">${upcoming?'接下來：'+upcoming:'（最後一位）'}</div>
      <audio id="jg-speak-timer-audio" src="${JG_SPEAK_AUDIO_SRC}" preload="auto"></audio>
    </div>`;
}
function jgSpeakTimerTick(){
  if(jgSpeakTimerSec>0){
    jgSpeakTimerSec--;
    const clock=document.getElementById('jg-speak-timer-clock');
    if(clock) clock.textContent=jgSpeakTimerFmt(jgSpeakTimerSec);
  }
  if(jgSpeakTimerSec<=0){
    clearInterval(jgSpeakTimerHandle);
    jgSpeakTimerHandle=null;
    jgSpeakTimerRunning=false;
    jgSpeakTimerDone=true;
    jgSpeakTimerReplayAudio();
    const clock=document.getElementById('jg-speak-timer-clock');
    if(clock) clock.style.color='var(--wolf)';
    const uptxt=document.getElementById('jg-speak-timer-uptxt');
    if(uptxt){ uptxt.textContent='⏰ 時間到'; uptxt.style.color='#922418'; }
    const btn=document.getElementById('jg-speak-timer-toggle-btn');
    if(btn) btn.textContent='▶️ 開始';
  }
}
// 開始／暫停倒數（不影響音效播放狀態）；時間已經到 0 時按「開始」＝重新倒數 90 秒。
function jgSpeakTimerToggle(){
  if(jgSpeakTimerRunning){
    clearInterval(jgSpeakTimerHandle);
    jgSpeakTimerHandle=null;
    jgSpeakTimerRunning=false;
  } else {
    if(jgSpeakTimerSec<=0){
      jgSpeakTimerSec=JG_SPEAK_SECONDS;
      jgSpeakTimerDone=false;
      const clock=document.getElementById('jg-speak-timer-clock');
      if(clock){ clock.style.color='var(--text)'; clock.textContent=jgSpeakTimerFmt(jgSpeakTimerSec); }
      const uptxt=document.getElementById('jg-speak-timer-uptxt');
      if(uptxt) uptxt.textContent='';
    }
    jgSpeakTimerRunning=true;
    jgSpeakTimerHandle=setInterval(jgSpeakTimerTick,1000);
  }
  const btn=document.getElementById('jg-speak-timer-toggle-btn');
  if(btn) btn.textContent=jgSpeakTimerRunning?'⏸ 暫停':'▶️ 開始';
}
// 重播提示音效：只重播聲音，不會重置或影響倒數本身。
function jgSpeakTimerReplayAudio(){
  const audio=document.getElementById('jg-speak-timer-audio');
  if(audio){ try{ audio.currentTime=0; audio.play().catch(()=>{}); }catch(e){} }
}
// 「過」：這位發言結束，換下一位，計時器歸零並直接開始倒數（不用法官再按一次開始）。
function jgSpeakTimerNext(){
  if(jgSpeakTimerHandle){ clearInterval(jgSpeakTimerHandle); jgSpeakTimerHandle=null; }
  jgSpeakTimerDone=false;
  jgSpeakTimerIdx++;
  jgSpeakTimerSec=JG_SPEAK_SECONDS;
  jgSpeakTimerRunning=true;
  jgSpeakTimerHandle=setInterval(jgSpeakTimerTick,1000);
  jgRenderStep(jgCurrentStep);
}

function jgPendingNightDeadNums(){
  const nums=new Set();
  if(jgRecord.wolfKill){
    const guarded=!!((jgRecord.guardTarget&&jgRecord.guardTarget.toString()===jgRecord.wolfKill.toString())
      ||(jgRecord.mechWolfGuardTarget&&jgRecord.mechWolfGuardTarget.toString()===jgRecord.wolfKill.toString()));
    const saved=!!jgRecord.witchSave;
    if(!guarded&&!saved) nums.add(jgRecord.wolfKill.toString());
  }
  if(jgRecord.witchPoison){
    const mechGuarded=!!(jgRecord.mechWolfGuardTarget&&jgRecord.mechWolfGuardTarget.toString()===jgRecord.witchPoison.toString());
    if(!mechGuarded) nums.add(jgRecord.witchPoison.toString());
  }
  if(jgRecord.mechWolfPoison) nums.add(jgRecord.mechWolfPoison.toString());
  if(jgRecord.wolfBrotherAwakenKill) nums.add(jgRecord.wolfBrotherAwakenKill.toString());
  if(jgRecord.mechWolfBonusKillTarget) nums.add(jgRecord.mechWolfBonusKillTarget.toString());
  return [...nums].map(Number);
}
// 依本局實際在場的角色，組出提示文字用的角色名稱（只列出真的存在的，不寫死兩個都列）
function jgNumGridPick(id, num, onChangeFn){
  const hidden=document.getElementById(id);
  if(!hidden) return;
  const already=hidden.value&&parseInt(hidden.value)===num;
  hidden.value=already?'':num.toString();
  const grid=document.getElementById(id+'-grid');
  if(grid){
    grid.querySelectorAll('button').forEach(b=>{
      const isSel=!already&&b.getAttribute('data-num')===num.toString();
      b.style.background=isSel?'var(--success,#2e7d32)':'';
      b.style.color=isSel?'#fff':'';
      b.style.borderColor=isSel?'transparent':'';
    });
  }
  if(onChangeFn&&typeof window[onChangeFn]==='function') window[onChangeFn](id, hidden.value);
}

function jgStart(){
  const isDualStart=jgSetupDualMode;
  const minStart=isDualStart?4:6, maxStart=isDualStart?7:14;
  const n=Math.min(maxStart,Math.max(minStart,parseInt(document.getElementById('jg-count').value)||minStart));
  const compCheck=getPickComp(jgRolePick);
  const compTotal=Object.values(compCheck).reduce((a,b)=>a+b,0);
  // 有盜賊時，開局前要多準備 2 張候選身分牌（不算在玩家人數裡），所以要選滿的角色總數
  // 是「玩家人數 + 2」，不是「玩家人數」。
  const hasThiefStart=!isDualStart&&(compCheck.thief>0);
  const targetTotal=isDualStart?n*2:(hasThiefStart?n+2:n);
  if(compTotal!==targetTotal){
    alert('⚠️ 目前選了 '+compTotal+' 個角色，但玩家人數是 '+n+' 人'+(hasThiefStart?'（有盜賊，需選滿 '+targetTotal+' 個角色，比玩家人數多 2 個）':'（需選滿 '+targetTotal+' 個角色）')+'才能開始，請調整角色數量。');
    return;
  }
  jgTotal=n; jgComp=compCheck; jgRoleCounts={...jgComp};
  jgDualIdentityMode=isDualStart;
  jgDualAssign={};
  jgDualAssignDone=false;
  jgPlayers=[]; jgNight=1;
  jgWitchSaveUsed=false; jgWitchPoisonUsed=false;
  jgRecord={wolfKill:null,guardTarget:null,witchSave:null,witchPoison:null,seerChecked:null,witchPoisoned:false,hunterNightShot:null,witchStepDone:false};
  jgLastGuardTarget=null;
  jgLastWolfBeautyCharm=null;
  jgLastNightmareTarget=null;
  jgDancerEverDanced=new Set();
  jgLastMaskCheckTarget=null;
  jgLastMaskGrantTarget=null;
  jgLastDreamcatcherTarget=null;
  jgDreamcatcherEverTargeted={};
  jgMagicianSwapped=[];
  jgMechWolfLearned=null;
  jgMechWolfBonusKillUsed=false;
  jgMechWolfPoisonUsed=false;
  jgLastMechWolfGuardTarget=null;
  jgMechWolfGuardUsed=false;
  jgMechWolfLearnedNight=null;
  jgWolfBrotherIdDone=false;
  jgWolfBrotherAwakened=false;
  jgWolfBrotherAwakenedNight=null;
  jgMechAssign={};
  jgMechAssignDone=false;
  jgBlackMarketUsed=false;
  jgLuckyOne=null;
  jgBlackMarketTradeNight=null;
  jgHybridChosen=false;
  jgHybridTarget=null;
  jgCupidChosen=false;
  jgLovers=null;
  jgThiefWheelDone=false;
  jgThiefWheelCand1=null;
  jgThiefWheelCand2=null;
  jgThiefChosen=false;
  jgThiefFinalNum=null;
  jgThiefFinalRole=null;
  jgThiefBuriedRole=null;
  jgSheriffEnabled=!!(document.getElementById('jg-sheriff-enabled')||{}).checked;
  jgSheriff=null;
  jgSheriffElectionDone=false;
  jgSheriffCandidatesAsked=false;
  jgSheriffCampaignHappened=false;
  jgSheriffCandidates=[];
  jgSheriffWithdrawn=[];
  jgSheriffSpeakStart=null;
  jgSheriffSpeakDir=null;
  jgSheriffVoteTally={};
  jgSheriffPkRound=false;
  jgSheriffSelfDestruct=false;
  jgSheriffSelfDestructNum=null;
  jgSheriffSelfDestructBroughtNum=null;
  jgBadgeMode=jgSetupBadgeMode;
  jgSheriffFirstBlowDone=false;
  jgSheriffFirstBlowNum=null;
  jgSheriffPostponedToDay2=false;
  jgSheriffDay2CandidatesAsked=false;
  jgSheriffFinalNight=null;
  jgEvilKnightRevengeUsed=false;
  jgLastVoteOutPlayer=null;
  jgLastNightPeaceful=false;
  jgSpeakDirection=null;
  jgHanTiaoCommitted=false;
  jgHanTiaoSheriffNote='';
  jgHanTiaoDiscussNotes={};
  jgNightLog={};
  jgDayLog={};
  jgDayMeta={};
  jgDawnDeaths={};
  jgLastWinResult=null;
  jgVoteTally={};
  jgAbstainVoters={};
  jgVotePkRound=false;
  jgVotePkCandidates=[];
  jgVotePkOrder=[];
  jgSheriffPkOrder=[];
  jgSheriffLogLines=[];
  jgSheriffElectedNum=null;
  jgSheriffTransferPending=false;
  jgSheriffTransferDeadNum=null;
  jgSheriffTransferNextStep=null;
  if(jgHasStartedBefore) jgGameCount++;
  jgHasStartedBefore=true;
  jgLiveSessionId=null; // 新的一場遊戲，場次代碼下次同步時會重新產生（例如從 0813_1 變 0813_2）
  jgStepHistory=[];
  jgStateHistory=[];
  // Pre-fill all players as unknown role (null = unconfirmed, will become villager if never woke)
  for(let i=1;i<=n;i++) jgPlayers.push({num:i, name:jgPlayerNames[i]||`${i}號`, role:null, role2:null, identity1Dead:false, deadRole1:null, alive:true});
  document.querySelectorAll('#t-judge .pg').forEach(p=>p.classList.remove('on'));
  document.getElementById('jg-p-main').classList.add('on');
  const rw=document.getElementById('jg-roster-wrap'); if(rw) rw.style.display='';
  jgRenderRoster();
  // 有盜賊時，發牌之前要先秘密抽出兩張候選身分（法官把抽到的那兩張牌拿起來，剩下的牌
  // 才正常發給大家），所以「盜賊候選轉盤」要排在「發牌・確認身分」之前；沒有盜賊則跟
  // 原本一樣直接進入發牌步驟。
  jgGoStep((jgComp.thief>0&&!jgThiefWheelDone)?'thief-wheel':'deal');
}

function jgHasRole(r){return jgPlayers.some(p=>p.role===r&&p.alive);}
function jgByRole(r){return jgPlayers.filter(p=>p.role===r&&p.alive);}
function jgAlive(){return jgPlayers.filter(p=>p.alive);}
function jgByNum(n){return jgPlayers.find(p=>p.num===n);}

// Assign a role to a player by name or number typed in an input
// Returns the player or null
function jgAssignRole(val, role){
  if(!val) return null;
  const num=parseInt(val);
  let p = isNaN(num)
    ? jgPlayers.find(x=>x.name.includes(val)||val.includes(x.name))
    : jgPlayers.find(x=>x.num===num);
  if(p){ p.role=role; if(p.name===`${p.num}號`) p.name=val.replace(/^\d+號?\s*/,'').trim()||p.name; }
  return p||null;
}

// After night-1 wake steps, seal all unassigned players as villagers
function jgSealVillagers(){
  jgPlayers.forEach(p=>{ if(p.role===null) p.role='villager'; });
}
// After the dawn reveal (and any night-gun resolution) finishes: if this game has a pending
// sheriff election with candidates on the table, go run that; otherwise go straight to discuss.
// 警長競選子流程（候選人／轉盤／政見發表／投票）現在整個發生在「天亮公布死訊」之前，
// 所以真正跑到 dawn 的死亡結算時，競選一定已經結束了，這裡固定回到 discuss 即可。
// 自爆按鈕文字：雙爆模式下第一次自爆時，警徽其實還沒流失（保留到隔天），不能寫「吞警徽，本局無警長」，
// 免得誤導法官；單爆模式，或雙爆模式的第二次自爆，才是警徽真的流失、本局確定沒有警長。
function jgSelfDestructBtnLabel(){
  const isFirstBlow=jgBadgeMode==='double'&&!jgSheriffFirstBlowDone;
  return isFirstBlow?'💥 有狼人自爆（警徽暫不流失，競選延到隔天）':'💥 有狼人自爆（吞警徽，本局無警長）';
}
function jgFeared(p){ return !!(p && jgRecord && jgRecord.nightmareTarget && p.num.toString()===jgRecord.nightmareTarget.toString()); }

// 魔術師換牌：本夜若換了 A/B 兩個號碼，之後（魔術師之後睜眼的角色）任何以「號碼」為目標的
// 夜間技能，實際作用對象都會被重新導向到對方號碼——刀A變成刀到B、查A變成查到B……以此類推。
// 夢魘在魔術師之前就睜眼，其恐懼目標不受這次換牌影響，所以夢魘的選擇不要套用這個函式。
function jgMagicSwapNum(val){
  if(!val) return val;
  const a=jgRecord&&jgRecord.magicianSwapA, b=jgRecord&&jgRecord.magicianSwapB;
  if(!a||!b) return val;
  const s=val.toString();
  if(s===a.toString()) return b.toString();
  if(s===b.toString()) return a.toString();
  return val;
}
// 文字紀錄顯示用：如果因為魔術師換流，法官原本喊的號碼(raw)跟實際生效的號碼(actual)不同，
// 紀錄要同時寫出「raw→actual」，讓事後回顧看得出來是誰真正被影響；沒有換流就只顯示原本號碼。
function jgSwapDisplay(raw, actual){
  const r=raw||actual||'';
  if(!r) return 'x';
  if(actual&&raw&&actual.toString()!==raw.toString()) return raw+'→'+actual;
  return r.toString();
}

// Night 1: as wolf-team identities are tapped in, live-check whether any of them matches
// tonight's nightmare target — if so, the wolf pack can't kill, even before roles are
// permanently saved to jgPlayers (which only happens once the whole page is submitted).
// Night 1: as wolf-team identities are tapped in, (1) prevent two wolf slots from being
// assigned the same number, and (2) live-check whether any of them matches tonight's
// nightmare target — if so, the wolf pack can't kill, even before roles are permanently
// saved to jgPlayers (which only happens once the whole page is submitted).
function jgFind(val){
  if(!val) return null;
  const num=parseInt(val);
  if(!isNaN(num)) return jgPlayers.find(p=>p.num===num)||null;
  return jgPlayers.find(p=>p.name.includes(val)||val.includes(p.name))||null;
}

// Render player name label with number
function jgLabel(p){ return p?`${p.num} 號 ${p.name}`:'（未找到）'; }

function jgShowPg(html, badge){
  let extra='';
  if(jgRecord && jgRecord.nightmareTarget){
    const fp=jgFind(jgRecord.nightmareTarget);
    if(fp && jgCurrentStep===(fp.role+'-wake')){
      const fn=fp.name&&fp.name!==fp.num+'號'?' '+fp.name:'';
      extra='<div class="info-danger" style="margin-bottom:10px;">😈 '+fp.num+'號'+fn+' 已被夢魘恐懼，本回合無法發動夜間技能（法官仍照常詢問手勢，但不執行技能效果）</div>';
    }
  }
  document.getElementById('jg-phase-badge').innerHTML=badge||'';
  document.getElementById('jg-content').innerHTML=extra+html;
  jgRenderRoster();
  document.getElementById('jg-main-scroll').scrollTo(0,0);
  window.scrollTo(0,0);
}

// Render the always-visible roster at bottom
// Mechanical wolf display: once it has learned a skill, show "機械"+learned-role
// (e.g. 機械女巫, 機械通靈師, 機械獵人, 機械狼人, 機械守衛, 機械民) instead of plain "機械狼".
const MECH_LEARN_LABEL={witch:'機械女巫',medium:'機械通靈師',hunter:'機械獵人',guard:'機械守衛',villager:'機械民',
  seer:'機械預言家',dreamcatcher:'機械攝夢人',knight:'機械騎士',magician:'機械魔術師',
  demonhunter:'機械獵魔人',gravkeeper:'機械守墓人',blackmarket:'機械黑市商人',sheriff:'機械警長'};
function jgMechDisplayLabel(learnedRole){
  if(learnedRole==='wolfking') return '機械黑狼王';
  if(WOLF_ROLES.includes(learnedRole)) return '機械狼人';
  return MECH_LEARN_LABEL[learnedRole]||('機械'+jgFullRoleName(learnedRole));
}
// Returns the role label to display for a player, accounting for mechanical-wolf learning.
function jgRoleDisplayName(p){
  if(p.role==='mechanicalwolf') return jgMechWolfLearned?jgMechDisplayLabel(jgMechWolfLearned):'機械狼';
  return RNAME[p.role]||'平民';
}

// Feature: on the first day's discussion, verify that every number's assigned role
// matches the declared game setup (how many wolves / gods / villagers were configured).
// 發言討論階段可能出現的各種主動技能按鈕：白狼王自爆、血月使者自爆、騎士翻牌決鬥、
// 一般狼人／黑狼王自爆。三處發言畫面共用這個函式，避免各自維護一份重複的邏輯。
function jgRenderRoster(){
  jgCheckSheriffDeath();
  // 遊戲結束畫面（jgShowWin）會把玩家狀態面板藏起來；如果法官事後按「上一步」回到還在
  // 進行中的步驟，這裡要記得把面板重新顯示回來，不然「玩家狀態」欄位會整個消失不見。
  const rw=document.getElementById('jg-roster-wrap'); if(rw) rw.style.display='';
  const el=document.getElementById('jg-roster');
  if(!el){ jgRenderVoteHistory(); return; }
  el.innerHTML=jgPlayers.map(p=>{
    const role=p.role||'villager';
    // 女巫解藥／毒藥使用狀況：不管女巫死活、雙身分板與否，只要目前牌面顯示的身分是女巫，
    // 就在她的玩家狀態卡下面加兩個小圈圈給法官自己看，用掉的變灰色
    const potionHtml=(role==='witch')
      ?'<div class="rp-potions">'
        +'<span class="rp-potion-dot'+(jgWitchSaveUsed?' used':'')+'" title="解藥'+(jgWitchSaveUsed?'（已用完）':'（尚未使用）')+'">解</span>'
        +'<span class="rp-potion-dot'+(jgWitchPoisonUsed?' used':'')+'" title="毒藥'+(jgWitchPoisonUsed?'（已用完）':'（尚未使用）')+'">毒</span>'
      +'</div>':'';
    let bodyHtml;
    if(jgDualIdentityMode&&(p.role2||p.deadRole1)){
      // 卡1：陣亡前顯示 p.role；陣亡後顯示 p.deadRole1（轉灰）
      // 卡2：卡1尚未陣亡時顯示 p.role2（尚未生效）；卡1已陣亡後，p.role 已換成卡2內容
      const id1Role=p.identity1Dead?p.deadRole1:p.role;
      const id1Dead=!!p.identity1Dead;
      const id2Role=p.identity1Dead?p.role:p.role2;
      const id2Dead=p.identity1Dead?!p.alive:false;
      const grayStyle='opacity:0.4;text-decoration:line-through;';
      bodyHtml='<div class="rp-role"'+(id1Dead?' style="'+grayStyle+'"':'')+'>'+jgFullRoleName(id1Role)+'</div>'
        +'<div class="rp-role"'+(id2Dead?' style="'+grayStyle+'"':'')+'>'+jgFullRoleName(id2Role)+'</div>';
    } else {
      const rname=p.role?jgRoleDisplayName(p):'?';
      // 黑市商人板：這位玩家是黑市交易產生的「幸運兒」時，角色後面加註一個小標籤 [幸]
      const luckyTag=(jgLuckyOne&&jgLuckyOne.num===p.num)?'<span class="rp-tag-lucky" title="幸運兒">幸</span>':'';
      // 邱比特配對的情侶，法官自己視角加註一個小愛心方便對照（玩家看不到這個標籤）
      const loverTag=(jgLovers&&jgLovers.map(String).includes(p.num.toString()))
        ?'<span class="rp-tag-lover" title="情侶">💘</span>':'';
      // 這位玩家原本是盜賊，選完之後變成別的身分：法官視角加註小標籤方便對照
      const thiefOriginTag=(jgThiefFinalNum&&jgThiefFinalNum.toString()===p.num.toString())?'<span class="rp-tag-lover" style="color:var(--thief);" title="原本是盜賊，選完後變成現在的身分">盜</span>':'';
      // 傻瓜被票出局翻牌自證：不算真正死亡，但用一個顯眼的標籤跟一般存活玩家區分開來，
      // 提醒法官這位玩家只能發言、不能再投票，要等被刀/毒/開槍等「補刀」才會真正出局。
      const foolRevealedTag=p.foolRevealed?'<span class="rp-tag-lover" style="color:var(--gold);" title="傻瓜已翻牌：免於淘汰，但不能再投票，需再被補刀才會真正死亡">🃏已翻牌</span>':'';
      bodyHtml=`<div class="rp-role">${rname}${luckyTag}${loverTag}${thiefOriginTag}${foolRevealedTag}</div>`;
    }
    return `<div class="rp rp-${role} ${p.alive?'':'rp-dead'}">
      <div class="rp-num">${p.num}${jgSheriff===p.num?'<span title="警長" style="margin-left:2px;">🎖️</span>':''}</div>
      <div class="rp-name">${p.name===`${p.num}號`?'—':p.name}</div>
      ${bodyHtml}
      ${potionHtml}
    </div>`;
  }).join('');
  jgRenderVoteHistory();
}

// ── 遊戲進行中即時投票紀錄：整理警長票型（含 PK）跟每天白天投票（含 PK），
// 跟玩家狀態卡一起顯示在旁邊（電腦版）／下方（手機版），方便法官隨時回頭核對，
// 不用等到遊戲結束看完整文字紀錄才知道之前的票型。──
function jgCaptureState(){
  return Object.assign(JSON.parse(JSON.stringify({
    jgPlayers, jgNight, jgWitchSaveUsed, jgWitchPoisonUsed, jgRecord,
    jgLastGuardTarget, jgLastWolfBeautyCharm, jgLastNightmareTarget, jgLastDreamcatcherTarget,
    jgDreamcatcherEverTargeted, jgMagicianSwapped, jgMechWolfLearned, jgMechWolfBonusKillUsed,
    jgMechWolfPoisonUsed, jgMechWolfGuardUsed, jgLastMechWolfGuardTarget,
    jgMechWolfLearnedNight, jgWolfBrotherIdDone, jgWolfBrotherAwakened, jgWolfBrotherAwakenedNight, jgLastNightPeaceful,
    jgSpeakDirection, jgBlackMarketUsed, jgLuckyOne, jgBlackMarketTradeNight, jgNightLog, jgDayLog, jgDayMeta, jgDawnDeaths,
    jgVoteTally, jgLastWinResult, jgRoleCounts, jgMechAssign, jgMechAssignDone,
    jgDualIdentityMode, jgDualAssign, jgDualAssignDone, jgHybridChosen, jgHybridTarget, jgCupidChosen, jgLovers,
    jgThiefWheelDone, jgThiefWheelCand1, jgThiefWheelCand2,
    jgThiefChosen, jgThiefFinalNum, jgThiefFinalRole, jgThiefBuriedRole,
    jgSheriffEnabled, jgSheriff, jgSheriffElectionDone, jgSheriffCandidatesAsked, jgSheriffCampaignHappened, jgSheriffCandidates, jgSheriffWithdrawn,
    jgSheriffSpeakStart, jgSheriffSpeakDir, jgSheriffVoteTally, jgSheriffPkRound, jgSheriffSelfDestruct, jgSheriffSelfDestructNum, jgSheriffSelfDestructBroughtNum,
    jgEvilKnightRevengeUsed, jgLastVoteOutPlayer, jgAbstainVoters,
    jgSheriffLogLines, jgSheriffElectedNum, jgSheriffTransferPending, jgSheriffTransferDeadNum, jgSheriffTransferNextStep,
    jgVotePkRound, jgVotePkCandidates, jgVotePkOrder, jgSheriffPkOrder,
    jgBadgeMode, jgSheriffFirstBlowDone, jgSheriffFirstBlowNum, jgSheriffPostponedToDay2, jgSheriffDay2CandidatesAsked, jgSheriffFinalNight,
    jgHanTiaoSheriffNote, jgHanTiaoDiscussNotes, jgHanTiaoCommitted, jgNightmareForceMode,
    jgLastMaskCheckTarget, jgLastMaskGrantTarget
  })), {
    // Set 不能用 JSON.stringify 序列化（會變成空物件），改用陣列另外存、restore 時再轉回 Set
    jgDancerEverDanced: [...jgDancerEverDanced]
  });
}

function jgRestoreState(snap){
  jgPlayers=snap.jgPlayers;
  jgNight=snap.jgNight;
  jgWitchSaveUsed=snap.jgWitchSaveUsed;
  jgWitchPoisonUsed=snap.jgWitchPoisonUsed;
  jgRecord=snap.jgRecord;
  jgLastGuardTarget=snap.jgLastGuardTarget;
  jgLastWolfBeautyCharm=snap.jgLastWolfBeautyCharm;
  jgLastNightmareTarget=snap.jgLastNightmareTarget;
  jgLastMaskCheckTarget=snap.jgLastMaskCheckTarget;
  jgLastMaskGrantTarget=snap.jgLastMaskGrantTarget;
  jgDancerEverDanced=new Set(snap.jgDancerEverDanced||[]);
  jgLastDreamcatcherTarget=snap.jgLastDreamcatcherTarget;
  jgDreamcatcherEverTargeted=snap.jgDreamcatcherEverTargeted;
  jgMagicianSwapped=snap.jgMagicianSwapped;
  jgMechWolfLearned=snap.jgMechWolfLearned;
  jgMechWolfBonusKillUsed=snap.jgMechWolfBonusKillUsed;
  jgMechWolfPoisonUsed=snap.jgMechWolfPoisonUsed;
  jgLastMechWolfGuardTarget=snap.jgLastMechWolfGuardTarget;
  jgMechWolfGuardUsed=snap.jgMechWolfGuardUsed;
  jgMechWolfLearnedNight=snap.jgMechWolfLearnedNight;
  jgWolfBrotherIdDone=snap.jgWolfBrotherIdDone;
  jgWolfBrotherAwakened=snap.jgWolfBrotherAwakened;
  jgWolfBrotherAwakenedNight=snap.jgWolfBrotherAwakenedNight;
  jgLastNightPeaceful=snap.jgLastNightPeaceful;
  jgSpeakDirection=snap.jgSpeakDirection;
  jgBlackMarketUsed=snap.jgBlackMarketUsed;
  jgLuckyOne=snap.jgLuckyOne;
  jgBlackMarketTradeNight=(snap.jgBlackMarketTradeNight!==undefined)?snap.jgBlackMarketTradeNight:null;
  jgNightLog=snap.jgNightLog;
  jgDayLog=snap.jgDayLog;
  jgDayMeta=snap.jgDayMeta;
  jgDawnDeaths=snap.jgDawnDeaths;
  jgVoteTally=snap.jgVoteTally;
  jgLastWinResult=snap.jgLastWinResult;
  jgRoleCounts=snap.jgRoleCounts;
  jgMechAssign=snap.jgMechAssign;
  jgMechAssignDone=snap.jgMechAssignDone;
  jgDualIdentityMode=snap.jgDualIdentityMode;
  jgDualAssign=snap.jgDualAssign;
  jgDualAssignDone=snap.jgDualAssignDone;
  jgHybridChosen=snap.jgHybridChosen;
  jgHybridTarget=snap.jgHybridTarget;
  jgCupidChosen=!!snap.jgCupidChosen;
  jgLovers=snap.jgLovers||null;
  jgThiefWheelDone=!!snap.jgThiefWheelDone;
  jgThiefWheelCand1=snap.jgThiefWheelCand1||null;
  jgThiefWheelCand2=snap.jgThiefWheelCand2||null;
  jgThiefChosen=!!snap.jgThiefChosen;
  jgThiefFinalNum=snap.jgThiefFinalNum||null;
  jgThiefFinalRole=snap.jgThiefFinalRole||null;
  jgThiefBuriedRole=snap.jgThiefBuriedRole||null;
  jgSheriffEnabled=snap.jgSheriffEnabled;
  jgSheriff=snap.jgSheriff;
  jgSheriffElectionDone=snap.jgSheriffElectionDone;
  jgSheriffCandidatesAsked=snap.jgSheriffCandidatesAsked;
  jgSheriffCampaignHappened=snap.jgSheriffCampaignHappened;
  jgSheriffCandidates=snap.jgSheriffCandidates;
  jgSheriffWithdrawn=snap.jgSheriffWithdrawn;
  jgSheriffSpeakStart=snap.jgSheriffSpeakStart;
  jgSheriffSpeakDir=snap.jgSheriffSpeakDir;
  jgSheriffVoteTally=snap.jgSheriffVoteTally;
  jgSheriffPkRound=snap.jgSheriffPkRound;
  jgSheriffSelfDestruct=snap.jgSheriffSelfDestruct;
  jgSheriffSelfDestructNum=snap.jgSheriffSelfDestructNum;
  jgSheriffSelfDestructBroughtNum=snap.jgSheriffSelfDestructBroughtNum||null;
  jgEvilKnightRevengeUsed=snap.jgEvilKnightRevengeUsed;
  jgLastVoteOutPlayer=snap.jgLastVoteOutPlayer;
  jgAbstainVoters=snap.jgAbstainVoters||{};
  jgSheriffLogLines=snap.jgSheriffLogLines||[];
  jgSheriffElectedNum=snap.jgSheriffElectedNum;
  jgSheriffTransferPending=!!snap.jgSheriffTransferPending;
  jgSheriffTransferDeadNum=snap.jgSheriffTransferDeadNum;
  jgSheriffTransferNextStep=snap.jgSheriffTransferNextStep;
  jgBadgeMode=snap.jgBadgeMode||'single';
  jgSheriffFirstBlowDone=!!snap.jgSheriffFirstBlowDone;
  jgSheriffFirstBlowNum=snap.jgSheriffFirstBlowNum;
  jgSheriffPostponedToDay2=!!snap.jgSheriffPostponedToDay2;
  jgSheriffDay2CandidatesAsked=!!snap.jgSheriffDay2CandidatesAsked;
  jgSheriffFinalNight=snap.jgSheriffFinalNight;
  jgVotePkRound=!!snap.jgVotePkRound;
  jgVotePkCandidates=snap.jgVotePkCandidates||[];
  jgVotePkOrder=snap.jgVotePkOrder||[];
  jgSheriffPkOrder=snap.jgSheriffPkOrder||[];
  jgHanTiaoSheriffNote=snap.jgHanTiaoSheriffNote||'';
  jgHanTiaoDiscussNotes=snap.jgHanTiaoDiscussNotes||{};
  jgHanTiaoCommitted=!!snap.jgHanTiaoCommitted;
  jgNightmareForceMode=snap.jgNightmareForceMode||jgNightmareForceMode||'force';
}

function jgBack(){
  if(jgSpeakTimerHandle){ clearInterval(jgSpeakTimerHandle); jgSpeakTimerHandle=null; jgSpeakTimerRunning=false; }
  if(jgStepHistory.length<=1) return;
  // Drop the step/state we're currently viewing.
  jgStepHistory.pop();
  jgStateHistory.pop();
  // Skip past transitional steps that have no meaningful UI of their own (they immediately
  // forward to a real content step), same as before — but now every pop also restores state,
  // so nothing needs manual re-derivation (night counter, logs, etc all come back naturally
  // from the snapshot instead of being hand-adjusted).
  const skipSteps=['night-start','next-night'];
  while(jgStepHistory.length>1 && skipSteps.includes(jgStepHistory[jgStepHistory.length-1])){
    jgStepHistory.pop();
    jgStateHistory.pop();
  }
  const targetStep=jgStepHistory[jgStepHistory.length-1];
  const snap=jgStateHistory[jgStateHistory.length-1];
  if(targetStep===undefined || snap===undefined) return;
  jgRestoreState(snap);
  jgCurrentStep=targetStep;
  jgRenderRoster();
  jgRenderStep(targetStep);
}

// Alive players list (plain text, for speech boxes)
function jgAliveList(){ return jgAlive().map(p=>`${p.num}號 ${p.name}`).join('　'); }
// Alive players card rows (for display)
function jgAliveRows(){
  return jgAlive().map(p=>{
    const role=p.role||'villager';
    return `<div class="row"><div class="av ${AV[role]}">${p.num}</div><div class="nm">${p.name}</div></div>`;
  }).join('');
}

// Whether we are in first night (roles still being discovered)
function jgIsFirstNight(){ return jgNight===1; }

// 這些步驟本身就是某次死亡「直接連動」而來的下一步（開槍帶人、決鬥、殉情……），
// 必須讓它們照原本順序先跑完，警徽交接不能卡在半路打斷，否則會漏掉開槍等技能發動。
// 等這條連動鏈跑到下一個「塵埃落定」的步驟（天亮／發言／投票／下一夜……）時，才攔截去交接警徽。
function jgGoStep(step){
  // 切換畫面前先停掉發言計時器的倒數（避免離開發言/警上畫面後，計時器還在背景跑、
  // 時間到還在別的畫面偷偷播音效）；進度（第幾位、剩幾秒）保留，回到同一輪發言時還在，
  // 法官只需要重新按一次「開始」繼續倒數。
  if(jgSpeakTimerHandle){ clearInterval(jgSpeakTimerHandle); jgSpeakTimerHandle=null; jgSpeakTimerRunning=false; }
  // 每次切換步驟前都先確認警長是否還活著（不論死因為何），確保交接警徽一定不會被漏掉。
  jgCheckSheriffDeath();
  // 警長剛陣亡、還沒交接警徽：把原本要去的步驟記下來，先攔截去交接警徽畫面，
  // 交接完成後（jgTransferSheriff／jgTearSheriffBadge）再自動繼續原本的流程。
  if(jgSheriffTransferPending&&!JG_SHERIFF_NO_INTERRUPT_STEPS.includes(step)){
    jgSheriffTransferNextStep=step;
    step='sheriff-transfer';
  }
  jgStateHistory.push(jgCaptureState());
  jgStepHistory.push(step);
  jgCurrentStep=step;
  jgRenderStep(step);
}
// 警長是否剛剛真正陣亡（不論死因：投票放逐／夜晚被殺／開槍帶走／決鬥……），
// 由 jgRenderRoster() 統一在每次死亡結算後呼叫檢查，不用逐一修改每個死亡路徑。
function jgLoverPairType(){
  if(!jgLovers||jgLovers.length!==2) return null;
  const p1=jgFind(jgLovers[0]), p2=jgFind(jgLovers[1]);
  if(!p1||!p2) return null;
  const w1=jgIsWolfPackMember(p1), w2=jgIsWolfPackMember(p2);
  if(w1&&w2) return 'wolf';
  if(!w1&&!w2) return 'good';
  return 'third';
}

// 人狼鏈成立時，第三方陣營的完整成員名單（string[] 號碼）：兩位情侶＋邱比特本人
// （若邱比特剛好鏈自己，會自動去重，變成只有 2 人）。
// 只要「人狼鏈」配對成立，邱比特本人就永遠是第三方的一員——好人／狼人陣營要獲勝，
// 除了原本各自的勝利條件，也必須連邱比特一起淘汰，不是只淘汰兩位情侶就算數。
// 這個名單本身不看存活狀態（回傳固定的三人／兩人清單），存活與否交給呼叫端
// （jgCheckWin／jgCheckWinThirdParty）用 jgAlive() 去判斷；只有第三方全滅
// （情侶兩人 + 邱比特都已出局）之後，才會改用一般好人 vs 狼人規則判定。
// 其餘情形（人人鏈／狼狼鏈／尚未配對）回傳空陣列，代表沒有獨立第三方。
function jgLoverThirdPartyMembers(){
  if(jgLoverPairType()!=='third') return [];
  const set=new Set(jgLovers.map(n=>n.toString()));
  const cp=jgPlayers.find(p=>p.role==='cupid');
  if(cp) set.add(cp.num.toString());
  return [...set];
}

// 情侶殉情：其中一人以任何方式死亡（trulyDied=true，不是雙身分換牌）時，另一人立刻跟著
// 殉情死亡。殉情死亡不會觸發任何技能（就算殉情者原本是獵人／黑狼王等具開槍資格的身分，
// 也不能開槍帶人）——這裡只單純套用死亡，呼叫端只需要另外提醒法官「誰跟著殉情了」，
// 不需要、也不應該接到任何連鎖開槍流程。
// wasNum 是剛剛死亡那個人的號碼（string 或 number 皆可）。回傳跟著殉情的對象號碼（number），
// 沒有觸發則回傳 null。
function jgCascadeLoverDeath(wasNum, trulyDied){
  if(!trulyDied||!jgLovers||jgLovers.length!==2||wasNum===undefined||wasNum===null) return null;
  const wasStr=wasNum.toString();
  const loverStrs=jgLovers.map(n=>n.toString());
  if(!loverStrs.includes(wasStr)) return null;
  const otherStr=loverStrs.find(n=>n!==wasStr);
  const other=jgFind(otherStr);
  if(other&&other.alive){ jgApplyDeath(other); other.diedByCascade=true; return other.num; }
  return null;
}

function jgConflictCheck(whoNum, roleId){
  const target=jgByNum(whoNum);
  if(!target||!target.role||target.role===roleId) return true;
  const oldLabel=jgFullRoleName(target.role);
  const newLabel=jgFullRoleName(roleId);
  const ok=confirm('目前 '+whoNum+' 號已是「'+oldLabel+'」，是否要更換為「'+newLabel+'」？');
  if(!ok) return false;
  const mv=prompt('原本 '+whoNum+' 號的「'+oldLabel+'」要換到哪一號？（輸入新號碼；留空＝暫不指定，之後可再手動修正）');
  if(mv){
    const newNum=parseInt(mv);
    if(!isNaN(newNum)&&newNum!==whoNum){
      const dest=jgByNum(newNum);
      if(dest) dest.role=target.role;
    }
  }
  return true;
}

// After "確認身分" (everyone has viewed their card), decide where to go:
// Mechanical-wolf / black-market / gargoyle+gravkeeper boards record every player's
// identity up front (feature request), instead of discovering roles progressively
// during night-1 wake steps. 石像鬼「不與狼隊見面」，這樣才能確保石像鬼的身分不會在
// 跟狼人擠同一畫面時洩露。
function jgProceedToNight(){
  if(jgNight===1 && jgDualIdentityMode && !jgDualAssignDone){
    jgGoStep('dual-assign');
    return;
  }
  if(jgNight===1 && (jgComp.mechanicalwolf>0||jgComp.gargoyle>0) && !jgMechAssignDone){
    jgGoStep('mech-assign');
    return;
  }
  jgGoStep('night-start');
}

// ── 機械狼板：一開始就記錄每位玩家的身分 ──
let jgMechAssign={};   // num -> roleId, chosen by judge on the assignment page
let jgMechAssignDone=false;

function jgRenderMechAssign(){
  const roles=Object.keys(jgComp);
  let html='<h2 style="margin-bottom:8px;">記錄玩家身分</h2>'
    +'<div class="speech">「<em>請所有人舉起手上的牌。</em>」法官依序看牌，記錄每位玩家的身分。</div>'
    +'<div class="info" style="font-size:12px;margin-top:8px;">應配置：'+roles.map(r=>jgFullRoleName(r)+'×'+jgComp[r]).join('　')+'</div>'
    +'<div style="display:flex;flex-direction:column;gap:12px;margin-top:10px;">';
  for(let i=1;i<=jgTotal;i++){
    const cur=jgMechAssign[i]||'';
    const nm=jgPlayerNames[i]||'';
    html+='<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">'
      +'<div style="width:32px;height:32px;border-radius:50%;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-weight:800;flex-shrink:0;">'+i+'</div>'
      +(nm?'<div style="width:56px;font-size:12px;color:var(--text2);flex-shrink:0;">'+nm+'</div>':'')
      +'<div id="jg-mech-role-'+i+'-grid" style="display:flex;flex-wrap:wrap;gap:5px;flex:1;">'
      +roles.map(r=>{
        const sel=cur===r;
        return '<button type="button" data-role="'+r+'" onclick="jgMechAssignPick('+i+',\''+r+'\')" title="'+jgFullRoleName(r)+'" '
          +'style="width:34px;height:34px;border-radius:50%;padding:0;font-size:12px;font-weight:700;'
          +(sel?'background:var(--success,#2e7d32);color:#fff;border-color:transparent;':'')+'">'+(ROLE_ABBR[r]||r)+'</button>';
      }).join('')
      +'</div></div>';
  }
  html+='</div><div id="jg-mech-assign-status" style="margin-top:10px;"></div>'
    +'<button class="primary" style="margin-top:12px;" onclick="jgConfirmMechAssign()">確認配置，進入夜晚 →</button>';
  jgShowPg(html,'📋 身分記錄');
  jgMechAssignUpdateStatus();
}

// Tap a role circle to assign it to a number (tapping the already-selected role clears it)
function jgMechAssignPick(num, role){
  const already=jgMechAssign[num]===role;
  jgMechAssign[num]=already?null:role;
  const grid=document.getElementById('jg-mech-role-'+num+'-grid');
  if(grid){
    grid.querySelectorAll('button').forEach(b=>{
      const isSel=!already&&b.getAttribute('data-role')===role;
      b.style.background=isSel?'var(--success,#2e7d32)':'';
      b.style.color=isSel?'#fff':'';
      b.style.borderColor=isSel?'transparent':'';
    });
  }
  jgMechAssignUpdateStatus();
}

function jgMechAssignUpdateStatus(){
  const box=document.getElementById('jg-mech-assign-status');
  if(!box) return;
  const counts={};
  Object.values(jgMechAssign).forEach(r=>{ if(r) counts[r]=(counts[r]||0)+1; });
  let ok=true;
  const lines=Object.keys(jgComp).map(r=>{
    const want=jgComp[r], got=counts[r]||0;
    if(got!==want) ok=false;
    return jgFullRoleName(r)+' '+got+'/'+want;
  });
  box.innerHTML='<div class="'+(ok?'info-success':'info-warn')+'" style="font-size:12px;">'+lines.join('　')+'</div>';
}

function jgConfirmMechAssign(){
  const counts={};
  Object.values(jgMechAssign).forEach(r=>{ if(r) counts[r]=(counts[r]||0)+1; });
  const mismatch=Object.keys(jgComp).filter(r=>(counts[r]||0)!==jgComp[r])
    .map(r=>jgFullRoleName(r)+'（應'+jgComp[r]+'，目前'+(counts[r]||0)+'）');
  const unassigned=[];
  for(let i=1;i<=jgTotal;i++){ if(!jgMechAssign[i]) unassigned.push(i); }
  if(mismatch.length>0||unassigned.length>0){
    const msg='配置尚未完全對應：'+(mismatch.length?mismatch.join('、'):'')+(unassigned.length?'；尚未指定：'+unassigned.join(',')+' 號':'')+'\n是否仍要繼續？';
    if(!confirm(msg)) return;
  }
  for(let i=1;i<=jgTotal;i++){
    const r=jgMechAssign[i];
    const p=jgByNum(i);
    if(p&&r) p.role=r;
  }
  jgMechAssignDone=true;
  // Wolf-brother identities (if present) were already recorded on this page, so there's
  // no need for the separate night-1 "狼兄狼弟相認" step.
  if(jgComp.wolfbrother_e>0||jgComp.wolfbrother_y>0) jgWolfBrotherIdDone=true;
  jgRenderRoster();
  // Eyes were already closed for the whole card-recording process, so skip the redundant
  // "天黑請閉眼" page and go straight into the first wake step of the night.
  jgRecord={wolfKill:null,guardTarget:null,witchSave:null,witchPoison:null,seerChecked:null,witchPoisoned:false,witchStepDone:false};
  jgGoStep(jgNightStartNext());
}

// ── 雙身分板：一開始就記錄每位玩家的兩張牌 ──
function jgRenderDualAssign(){
  // 只列出法官在設定頁面「共 X 個角色」選過的角色，避免選項過多誤點
  const availableRoles=Object.keys(jgComp).filter(r=>JG_DUAL_ROLE_POOL.includes(r)&&jgComp[r]>0);
  let html='<h2 style="margin-bottom:8px;">記錄玩家身分（雙身分）</h2>'
    +'<div class="speech">「<em>請所有人舉起手上的兩張牌。</em>」法官依序看牌，記錄每位玩家的兩張身分。</div>'
    +'<div class="info" style="font-size:12px;margin-top:8px;">每人 2 張牌：卡1（先生效）／卡2（卡1陣亡後才生效，白天即可換上並繼續發言）</div>'
    +'<div class="info" style="font-size:12px;margin-top:6px;">本局角色：'+availableRoles.map(r=>jgFullRoleName(r)+'×'+jgComp[r]).join('　')+'</div>'
    +'<div style="display:flex;flex-direction:column;gap:14px;margin-top:10px;">';
  for(let i=1;i<=jgTotal;i++){
    const cur=jgDualAssign[i]||[null,null];
    const nm=jgPlayerNames[i]||'';
    html+='<div style="border:1px solid var(--border,#3a3a3a);border-radius:10px;padding:8px;">'
      +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">'
      +'<div style="width:32px;height:32px;border-radius:50%;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-weight:800;flex-shrink:0;">'+i+'</div>'
      +(nm?'<div style="font-size:12px;color:var(--text2);">'+nm+'</div>':'')
      +'</div>';
    [0,1].forEach(slot=>{
      const selRole=cur[slot];
      html+='<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px;">'
        +'<div style="width:34px;font-size:11px;color:var(--text2);flex-shrink:0;">卡'+(slot+1)+'</div>'
        +'<div id="jg-dual-role-'+i+'-'+slot+'-grid" style="display:flex;flex-wrap:wrap;gap:5px;flex:1;">'
        +availableRoles.map(r=>{
          const sel=selRole===r;
          return '<button type="button" data-role="'+r+'" onclick="jgDualAssignPick('+i+','+slot+',\''+r+'\')" title="'+jgFullRoleName(r)+'" '
            +'style="width:32px;height:32px;border-radius:50%;padding:0;font-size:11px;font-weight:700;'
            +(sel?'background:var(--success,#2e7d32);color:#fff;border-color:transparent;':'')+'">'+(ROLE_ABBR[r]||r)+'</button>';
        }).join('')
        +'</div></div>';
    });
    html+='</div>';
  }
  html+='</div><div id="jg-dual-assign-status" style="margin-top:10px;"></div>'
    +'<button class="primary" style="margin-top:12px;" onclick="jgConfirmDualAssign()">確認配置，進入夜晚 →</button>';
  jgShowPg(html,'📋 身分記錄（雙身分）');
  jgDualAssignUpdateStatus();
}

function jgDualAssignPick(num, slot, role){
  const cur=jgDualAssign[num]||[null,null];
  const already=cur[slot]===role;
  cur[slot]=already?null:role;
  jgDualAssign[num]=cur;
  const grid=document.getElementById('jg-dual-role-'+num+'-'+slot+'-grid');
  if(grid){
    grid.querySelectorAll('button').forEach(b=>{
      const isSel=!already&&b.getAttribute('data-role')===role;
      b.style.background=isSel?'var(--success,#2e7d32)':'';
      b.style.color=isSel?'#fff':'';
      b.style.borderColor=isSel?'transparent':'';
    });
  }
  jgDualAssignUpdateStatus();
}

function jgDualAssignUpdateStatus(){
  const box=document.getElementById('jg-dual-assign-status');
  if(!box) return;
  const counts={};
  Object.values(jgDualAssign).forEach(pair=>{
    (pair||[]).forEach(r=>{ if(r) counts[r]=(counts[r]||0)+1; });
  });
  const lines=Object.keys(counts).map(r=>jgFullRoleName(r)+' ×'+counts[r]);
  const unassigned=[];
  for(let i=1;i<=jgTotal;i++){
    const pair=jgDualAssign[i]||[null,null];
    if(!pair[0]||!pair[1]) unassigned.push(i);
  }
  box.innerHTML='<div class="info" style="font-size:12px;">'+(lines.join('　')||'尚未指定任何身分')+'</div>'
    +(unassigned.length?'<div class="info-warn" style="font-size:12px;margin-top:4px;">尚未指定完整兩張牌：'+unassigned.join(',')+' 號</div>':'');
}

function jgConfirmDualAssign(){
  const unassigned=[];
  for(let i=1;i<=jgTotal;i++){
    const pair=jgDualAssign[i]||[null,null];
    if(!pair[0]||!pair[1]) unassigned.push(i);
  }
  if(unassigned.length>0){
    if(!confirm('尚未指定完整兩張牌：'+unassigned.join(',')+' 號\n是否仍要繼續？')) return;
  }
  for(let i=1;i<=jgTotal;i++){
    const pair=jgDualAssign[i]||[null,null];
    const p=jgByNum(i);
    if(!p) continue;
    if(pair[0]) p.role=pair[0];
    if(pair[1]) p.role2=pair[1];
    p.identity1Dead=false;
  }
  jgDualAssignDone=true;
  jgMechAssignDone=true; // dual-assign also pre-records every identity up front, same as mech-assign — reuse its gating so no wake step re-asks "who is X" on night 1
  // Recompute jgComp as the combined pool of all assigned cards, for anything downstream
  // that inspects composition (e.g. GOD_CHAIN visibility checks use jgHasRoleAny at runtime
  // anyway, but this keeps jgComp meaningful for display purposes).
  const counts={};
  jgPlayers.forEach(p=>{ if(p.role) counts[p.role]=(counts[p.role]||0)+1; if(p.role2) counts[p.role2]=(counts[p.role2]||0)+1; });
  jgComp=counts; jgRoleCounts={...counts};
  jgRenderRoster();
  // Eyes were already closed for the whole card-recording process, so skip the redundant
  // "天黑請閉眼" page and go straight into the first wake step of the night.
  jgRecord={wolfKill:null,guardTarget:null,witchSave:null,witchPoison:null,seerChecked:null,witchPoisoned:false,witchStepDone:false};
  jgGoStep(jgNightStartNext());
}

// Shared Chinese role-name lookup (used by big-card reveal and other displays)
function jgFullRoleName(r){
  return RNAME[r]||r;
}

// What an identity-check (通靈師／石像鬼／大字報...) should reveal for a player:
// a 機械狼 that has learned a skill shows purely as that learned role (e.g. "狼人"),
// never a compound "機械狼（已學習：X）" label. Unlearned mechanical wolves still show as 機械狼.
function jgCheckDisplayRole(role){
  if(role==='mechanicalwolf'&&jgMechWolfLearned) return jgMechWolfLearned;
  return role;
}

// Full-screen large-text reveal card — hand the device to a player to read privately
function jgShowBigCard(mainText, subText, hideClose){
  let modal=document.getElementById('jg-bigcard-modal');
  if(!modal){
    modal=document.createElement('div');
    modal.id='jg-bigcard-modal';
    // overflow-y:auto 是關鍵：內容太長（例如兩行候選身分）時改成可以滾動，而不是把「關閉」
    // 按鈕擠到畫面外、完全按不到（flex 置中 + 沒有 overflow 設定時，超出畫面的內容會
    // 上下都被裁掉，看起來就像「怪怪的」、找不到關閉鈕）。
    modal.style.cssText='position:fixed;inset:0;background:#0a0a0a;color:#fff;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;overflow-y:auto;';
    document.body.appendChild(modal);
  }
  modal.innerHTML='<div style="font-size:14vw;font-weight:900;line-height:1.15;word-break:break-word;">'+mainText+'</div>'
    +(subText?'<div style="font-size:8vw;font-weight:800;margin-top:18px;color:#ffd166;">'+subText+'</div>':'')
    +(hideClose?'':'<button onclick="document.getElementById(\'jg-bigcard-modal\').remove()" style="margin-top:48px;padding:14px 36px;font-size:18px;border-radius:12px;border:none;background:#fff;color:#111;font-weight:700;flex-shrink:0;">關閉</button>');
}

// Look up a player by number/name and show their identity as a big card
function jgBigCardFor(val){
  const found=jgFind(val);
  if(!found){ jgShowBigCard('找不到玩家'); return; }
  jgShowBigCard(found.num+'號', jgFullRoleName(jgCheckDisplayRole(found.role||'villager')));
}

// Live-check the mechanical wolf's learn target (also offers a big-card reveal for privacy)
function jgHasRoleAny(roles){ return roles.some(r=>jgPlayers.some(p=>p.role===r)); }

// Decide the very first step after "天黑請閉眼" each night.
// 夢魘必須最先睜眼——因為夢魘可能恐懼到守衛或魔術師，使他們當晚無法使用技能，順序必須先知道恐懼結果。
// 魔術師其次——魔術師交換兩人的號碼牌，之後所有以「號碼」為目標的技能（守衛、狼刀、女巫、預言家…）
// 都應該基於交換後的座位號碼進行，所以必須排在幾乎所有人之前。
// 守衛再其次（不管板子為何，只要有守衛，除了夢魘、魔術師以外都排在守衛之後）。
// 盜賊埋掉某個身分時，這個身分「今晚」還要不要照常被排進夜晚流程裡代喊一次（見
// THIEF_BURIED_STEP_INFO 的畫面本身）。大多數身分本來就是每晚都會被喊，被埋掉的版本
// 也要整局每晚照喊；但邱比特／混血兒／騎士這幾個角色本來就只有第一夜才有睜眼／發動機會，
// 被埋掉的版本比照辦理，只在第一夜代喊一次，之後不再出現。
function jgAnyWolfAlive(){
  return jgPlayers.some(p=>WOLF_ROLES.includes(p.role)&&p.alive);
}
// Where to go once gargoyle is done. If gargoyle just took over the kill (its own wolf
// teammates are all dead, so it chose the target itself on its own screen), the now-empty
// 狼人睜眼／機械狼睜眼 steps have nobody left to wake — skip straight past them, same idea
// as jgAfterMechWolfStep's pack-less-night skip.
function jgCheckBloodMoonFinalWin(){
  const a=jgAlive();
  const ag=a.filter(p=>!jgIsWolfForWin(p));
  const allGods=jgAllGodsForWin();
  const aGod=ag.filter(p=>allGods.includes(p.role));
  const aVil=ag.filter(p=>p.role==='villager'||p.role==='hybrid'||p.role==='cupid');
  if(aVil.length===0&&aGod.length>0) return{winner:'wolf',msg:'血月使者屠邊：所有平民已被淘汰',icon:'🐺'};
  if(aGod.length===0&&aVil.length>0) return{winner:'wolf',msg:'血月使者屠邊：所有神職已被淘汰',icon:'🐺'};
  return{winner:'good',msg:'所有狼人已被淘汰，血月使者最後一擊未能屠邊',icon:'🎉'};
}

function jgTryEarlyEnd(){
  if(jgNight===1) return false;
  const guardSaved=jgRecord.guardTarget&&jgRecord.wolfKill&&(jgRecord.guardTarget.toString()===jgRecord.wolfKill.toString());
  const mechWolfGuardSavesKill=jgRecord.mechWolfGuardTarget&&jgRecord.wolfKill&&(jgRecord.mechWolfGuardTarget.toString()===jgRecord.wolfKill.toString());
  const mechWolfGuardSavesPoison=jgRecord.mechWolfGuardTarget&&jgRecord.witchPoison&&(jgRecord.mechWolfGuardTarget.toString()===jgRecord.witchPoison.toString());
  const guardedByAny=!!(guardSaved||mechWolfGuardSavesKill);
  const ekNum=jgPlayers.find(p=>p.role==='evilknight')?.num;
  const wolfKillIsEK=ekNum&&jgRecord.wolfKill&&(jgRecord.wolfKill.toString()===ekNum.toString());
  const witchP=jgPlayers.find(p=>p.role==='witch');
  const witchSelfKilled=witchP&&jgRecord.wolfKill&&(witchP.num.toString()===jgRecord.wolfKill.toString());
  const witchFearedForEarlyEnd=witchP&&jgFeared(witchP);
  // 女巫這一夜還沒真正做完決定（jgSaveWitch 存檔時才會設 witchStepDone=true）之前，
  // 只要她「解藥」或「毒藥」還有任一項沒用過、有可能改變結果，就不能提前判定輸贏——
  // 之前的寫法只看解藥，若解藥已經在更早的夜晚用掉，就會誤以為她這夜「沒事可做」，
  // 直接跳過她本來還沒被問過的毒藥決定，把遊戲提前判定收掉。
  const witchStepDoneThisNight=!!jgRecord.witchStepDone;
  const witchSaveCouldStillMatter=witchP&&witchP.alive&&!jgWitchSaveUsed&&
    !guardedByAny&&!wolfKillIsEK&&!witchSelfKilled&&jgRecord.wolfKill;
  const witchPoisonCouldStillMatter=witchP&&witchP.alive&&!jgWitchPoisonUsed;
  const witchCanStillAct=!witchFearedForEarlyEnd&&!witchStepDoneThisNight&&
    (witchSaveCouldStillMatter||witchPoisonCouldStillMatter);
  if(witchCanStillAct) return false; // witch hasn't decided yet this night — outcome not certain
  // 狼刀目標若具備開槍資格（真獵人／已學獵人的機械狼／獲得獵槍的幸運兒），死亡不是最終結果——
  // 天亮時他還有機會開槍帶走一名狼人，可能反過來扭轉場面（例如把「狼人已達多數」的假象打破）。
  // 這種情況下不能提前判定勝負、跳過女巫／預言家的睜眼流程，必須照正常順序走完整個黑夜，
  // 讓天亮結算時再依照實際開槍結果決定勝負。
  if(jgRecord.wolfKill&&!wolfKillIsEK){
    const wolfKillVictim=jgFind(jgRecord.wolfKill);
    if(wolfKillVictim&&wolfKillVictim.alive&&jgIsHunterCapable(wolfKillVictim)) return false;
  }

  let deads=[];
  const _dcImmune2=jgRecord.dreamcatcherImmune;
  const wolfKillIsDCImmune=_dcImmune2&&jgRecord.wolfKill&&(jgRecord.wolfKill.toString()===_dcImmune2.toString());
  const poisonIsDCImmune=_dcImmune2&&jgRecord.witchPoison&&(jgRecord.witchPoison.toString()===_dcImmune2.toString());
  const poisonTargetP2=jgRecord.witchPoison?jgFind(jgRecord.witchPoison):null;
  const poisonIsDemonhunter2=!!(poisonTargetP2&&poisonTargetP2.role==='demonhunter');
  // 同守同救（任一種守衛＋女巫解藥同時命中）＝奶穿，實際上仍會死
  const overheal=!!(jgRecord.wolfKill&&guardedByAny&&jgRecord.witchSave&&!wolfKillIsEK&&!wolfKillIsDCImmune);
  if(jgRecord.wolfKill&&!wolfKillIsEK&&!wolfKillIsDCImmune&&(overheal||(!guardedByAny&&!jgRecord.witchSave))) deads.push(jgRecord.wolfKill);
  if(jgRecord.witchPoison&&!mechWolfGuardSavesPoison&&!poisonIsDCImmune&&!poisonIsDemonhunter2) deads.push(jgRecord.witchPoison);
  if(jgRecord.wolfBrotherAwakenKill) deads.push(jgRecord.wolfBrotherAwakenKill);
  if(jgRecord.mechWolfPoison) deads.push(jgRecord.mechWolfPoison);
  if(jgRecord.mechWolfBonusKillTarget) deads.push(jgRecord.mechWolfBonusKillTarget);
  if(jgRecord.demonhunterTarget){
    const t=jgFind(jgRecord.demonhunterTarget);
    if(t){
      if(WOLF_ROLES.includes(t.role)) deads.push(t.num);
      else { const dhp=jgPlayers.find(p=>p.role==='demonhunter'); if(dhp) deads.push(dhp.num); }
    }
  }
  // 惡靈騎士夜間免疫所有夜殺手段（狼刀、女巫毒、狼弟覺醒刀、機械狼額外擊殺等），
  // 這裡的死亡清單只是用來「提前試算」勝負，若把惡靈騎士也算進去，會誤判狼隊已經死了一個人，
  // 導致錯誤地提前跳到天亮、跳過還沒行動的女巫／預言家（例如女巫這一晚毒的正好是惡靈騎士，
  // 毒藥本身對他無效，不該被算作一次真正的擊殺）。跟天亮結算時的過濾邏輯保持一致。
  if(ekNum) deads=deads.filter(d=>d.toString()!==ekNum.toString());
  deads=[...new Set(deads)];
  if(deads.length===0) return false;
  // Simulate applying these deaths without permanently mutating state
  const savedAlive={};
  deads.forEach(d=>{ const p=jgFind(d); if(p){ savedAlive[p.num]=p.alive; p.alive=false; } });
  const win=jgCheckWin();
  Object.keys(savedAlive).forEach(numStr=>{ const p=jgByNum(parseInt(numStr)); if(p) p.alive=savedAlive[numStr]; });
  if(win){
    jgGoStep('dawn');
    return true;
  }
  return false;
}

// 有邱比特時的勝負判定入口：若情侶配成「人狼鏈」，邱比特＋這對情侶會獨立成第三方陣營，
// 只要第三方（情侶兩人＋邱比特）還有人存活，就先走 jgCheckWinThirdParty 判定
// （邱比特本人也算第三方一員，好人／狼人要獲勝必須連他一起淘汰，不是只淘汰兩位情侶）；
// 一旦第三方全滅，才會改用一般好人 vs 狼人規則（jgCheckWinNormal）判定剩下的人。
// 其餘情形（人人鏈／狼狼鏈／沒有邱比特）本來就不會有非空的第三方名單，直接走一般規則。
function jgCheckWin(){
  const tp=jgLoverThirdPartyMembers();
  if(tp.length>0){
    const tpAlive=tp.filter(n=>{ const p=jgFind(n); return p&&p.alive; });
    if(tpAlive.length>0) return jgCheckWinThirdParty(tp, tpAlive);
  }
  return jgCheckWinNormal();
}

// 人狼鏈成立時的專用勝負判定：tp＝third-party 完整名單（情侶兩人＋邱比特），
// tpAlive＝目前還存活的第三方成員號碼。這個函式只會在第三方仍有人存活時被呼叫。
// (1) 第三方屠光其餘所有玩家（others 清空）→ 第三方獲勝。
// (2) 第三方存活人數「大於」場上其餘（非第三方）存活人數時，直接判定第三方獲勝——
//     但這條「要不要嚴格大於」的門檻，會依第三方目前還剩幾個人而不同：
//     · 第三方全員（3人）都還存活時，要嚴格大於才算贏（3:2 算贏，3:3 打平還不算）。
//       全員存活代表最極端的「其餘玩家仍有一定人數優勢」情況，這時候還打平，代表對方
//       還沒被壓制到絕對劣勢，遊戲要繼續。
//     · 第三方只剩 2 人或 1 人時，打平（人數相等）也算贏（例如 2:2、1:1 都算第三方獲勝）——
//       因為第三方人數已經少到這個地步，只要沒被人數優勢的一方壓過去，僵局就是對第三方
//       有利的均勢，直接判定獲勝。
// 其餘情況遊戲繼續（回傳 null）——不管狼人或好人是否已經死絕，只要第三方還在場，
// 就不能提前判定狼人或好人獲勝；必須等第三方（含邱比特）全滅後，才會改用一般規則。
function jgCheckWinThirdParty(tp, tpAlive){
  const a=jgAlive();
  const others=a.filter(p=>!tp.includes(p.num.toString()));
  if(others.length===0){
    return{winner:'third',msg:'邱比特與情侶（第三方陣營）已將其餘玩家屠光',icon:'💘'};
  }
  if(tpAlive.length===3){
    if(tpAlive.length>others.length){
      return{winner:'third',msg:'第三方陣營（邱比特／情侶）存活人數多於其餘玩家，直接判定第三方獲勝',icon:'💘'};
    }
  } else if(tpAlive.length===1||tpAlive.length===2){
    if(tpAlive.length>=others.length){
      return{winner:'third',msg:'第三方陣營（邱比特／情侶）存活人數與其餘玩家打平或更多，直接判定第三方獲勝',icon:'💘'};
    }
  }
  return null;
}

function jgCheckWinNormal(){
  const a=jgAlive();
  const aw=a.filter(p=>jgIsWolfForWin(p)); // all wolf-team alive (incl. hidden 黑狼王 second-card in dual mode; 狼狼鏈時邱比特也算入)
  const ag=a.filter(p=>!jgIsWolfForWin(p)); // all good-team alive
  if(aw.length===0) return{winner:'good',msg:'所有狼人已被淘汰',icon:'🎉'};
  // 機械狼板：機械狼與其餘狼人互不相認、不碰面，狼隊無法憑人數優勢確認勝利，
  // 就算「狼人+機械狼」人數已達多數，仍必須屠民或屠神才算獲勝。
  const hasMechWolfBoard=(jgComp&&jgComp.mechanicalwolf>0);
  // 假面舞會板：假面跟機械狼一樣不與狼隊見面、不知道隊友是誰，狼隊同樣無法憑人數優勢確認
  // 勝利——就算「狼人+假面」人數已達多數，仍必須屠民或屠神才算獲勝。
  const hasMaskBoard=(jgComp&&jgComp.mask>0);
  // 魔術師板：魔術師交換號碼牌可能讓狼人誤殺自己人，狼人也可能因為害怕被交換而自刀，
  // 使得單純看人數打平（狼=好）時情勢其實還不明朗；只有狼隊人數「嚴格多於」好人才算篤定，
  // 打平時要再等一輪，讓刀擊/交換結果沉澱後局勢明確（例：狼3好3不算，狼3好2才算）。
  const hasMagicianBoard=(jgComp&&jgComp.magician>0);
  // 人數打平時，好人陣營是否還有「主動翻盤」的活棋——女巫毒藥或解藥其中一個還沒用完
  // （解藥能延一晚、爭取多一輪等毒藥機會；毒藥能直接毒死一隻狼）、獵魔人還活著（第二晚起
  // 每晚都能主動獵殺）、騎士還活著（白天發言隨時能翻牌決鬥，連投票都不用等）、攝夢人還活著
  // （連續兩晚鎖同一人就能把狼夢死）。這幾個都是好人可以主動發動、狼閃不掉的攻擊手段，
  // 只要還在場，人數打平時就還不能篤定狼贏，得再等一輪確認。
  // 守衛則刻意不算進來：守衛一晚只能守一人、也不能連續兩晚守同一人，只能「拖」，拖不出真正
  // 殺死狼的手段；人數打平時投票也永遠湊不出多數把狼投出去，所以守衛在場不影響「均勢＝狼贏」。
  // 獵人也不算：他是被動角色，只有「狼自己選擇殺他」才會觸發反擊，狼可以直接避開不殺他，
  // 不像女巫/獵魔人/騎士/攝夢人是好人主動、狼躲不掉的變數。
  const hasComebackThreat=ag.some(p=>{
    if(p.role==='witch') return !jgWitchPoisonUsed||!jgWitchSaveUsed;
    if(p.role==='demonhunter') return true;
    if(p.role==='knight') return true;
    if(p.role==='dreamcatcher') return true;
    return false;
  });
  if(!hasMechWolfBoard&&!hasMaskBoard){
    if(hasMagicianBoard||hasComebackThreat){
      if(aw.length>ag.length) return{winner:'wolf',msg:'狼人人數已達多數',icon:'🐺'};
    } else if(aw.length>=ag.length) return{winner:'wolf',msg:'狼人人數已達多數',icon:'🐺'};
  }
  // Wolf wins if all villagers dead or all gods dead
  const allGods=jgAllGodsForWin();
  const aGod=ag.filter(p=>allGods.includes(p.role));
  const aVil=ag.filter(p=>p.role==='villager'||p.role==='hybrid'||p.role==='cupid'); // 混血兒視為平民，狼隊屠民也必須刀死他
  if(aVil.length===0&&aGod.length>0) return{winner:'wolf',msg:'所有平民已被淘汰',icon:'🐺'};
  if(aGod.length===0&&aVil.length>0) return{winner:'wolf',msg:'所有神職已被淘汰',icon:'🐺'};
  return null;
}

let jgLastWinResult=null;
// 血月殘局一鍵宣布：場上只剩「血月＋1神（非騎士）＋1民」時，血月已經穩贏、流程走完也是一樣的
// 結果，這裡讓法官可以直接跳過白天投票／夜晚流程，一鍵公布狼人獲勝。點擊當下重新驗算一次條件，
// 避免畫面顯示之後場上人數又有變動（理論上不太會發生，但保險起見還是重新檢查一次）。
function jgDeclareBloodmoonWin(){
  const alive=jgAlive();
  const wolves=alive.filter(p=>jgIsWolfForWin(p));
  const good=alive.filter(p=>!jgIsWolfForWin(p));
  const allGods=jgAllGodsForWin();
  const gods=good.filter(p=>allGods.includes(p.role));
  const vils=good.filter(p=>p.role==='villager'||p.role==='hybrid'||p.role==='cupid');
  const ok=wolves.length===1&&wolves[0].role==='bloodmoon'&&gods.length===1&&gods[0].role!=='knight'&&vils.length===1;
  if(!ok){ alert('⚠️ 場上狀態已經不符合「血月＋1神（非騎士）＋1民」的殘局條件，請照正常流程繼續走。'); return; }
  jgShowWin({winner:'wolf', msg:'血月殘局：場上僅剩血月＋'+jgFullRoleName(gods[0].role)+'＋1民，好人已無翻盤機會，法官直接公布狼人獲勝', icon:'🌑'});
}
function jgShowWin(res){
  jgLastWinResult=res;
  const isGood=res.winner==='good';
  const isThird=res.winner==='third';
  const winTitle=isThird?'第三方勝利！':(isGood?'好人勝利！':'狼人勝利！');
  const allRows=jgPlayers.map(p=>{
    const role=p.role||'villager';
    return `<div class="row"><div class="av ${p.alive?AV[role]:'av-dead'}">${p.num}</div><div class="nm ${p.alive?'':'dead-nm'}">${p.name}</div><span class="badge ${BADGE[role]}">${jgRoleDisplayName(p)}</span></div>`;
  }).join('');
  // 混血兒：勝負與支持對象同陣營，遊戲結束時額外揭曉他自己有沒有跟著贏
  const hyP=jgPlayers.find(p=>p.role==='hybrid');
  let hybridHtml='';
  if(hyP){
    const targetP=jgHybridTarget?jgFind(jgHybridTarget):null;
    if(targetP){
      const targetIsWolf=jgIsWolfPackMember(targetP);
      const targetTeam=targetIsWolf?'wolf':'good';
      const hyWins=targetTeam===res.winner;
      hybridHtml='<div class="section-title" style="margin-top:16px;">🧬 混血兒</div>'
        +'<div class="'+(hyWins?'info-success':'info-warn')+'" style="font-size:14px;">'
        +hyP.num+'號 混血兒 支持 '+targetP.num+'號（'+(targetIsWolf?'狼人陣營':'好人陣營')+'）→ 混血兒 '+(hyWins?'跟著獲勝 🎉':'並未獲勝')+'</div>';
    } else {
      hybridHtml='<div class="section-title" style="margin-top:16px;">🧬 混血兒</div>'
        +'<div class="info-warn" style="font-size:14px;">'+hyP.num+'號 混血兒 沒有選擇支持對象（或對象已不明），視同未跟到任何一邊。</div>';
    }
  }
  // 邱比特／情侶：揭曉配對結果（人人鏈／狼狼鏈／人狼鏈）以及是否跟著獲勝
  let cupidHtml='';
  if(jgLovers&&jgLovers.length===2){
    const cpP=jgPlayers.find(p=>p.role==='cupid');
    const l1=jgFind(jgLovers[0]), l2=jgFind(jgLovers[1]);
    const pairType=jgLoverPairType();
    const pairLabel=pairType==='third'?'人狼鏈（獨立第三方）':(pairType==='wolf'?'狼狼鏈':(pairType==='good'?'人人鏈':'未知'));
    const pairArrowLabel=pairType==='third'?'獨立第三方':(pairType==='wolf'?'邪惡陣營':(pairType==='good'?'好人陣營':'未知'));
    let followMsg;
    if(pairType==='third'){
      followMsg=(res.winner==='third')?'第三方陣營跟著獲勝 🎉':'第三方陣營並未獲勝';
    } else if(pairType==='wolf'){
      followMsg=(res.winner==='wolf')?'情侶（狼狼鏈）跟著狼人陣營獲勝 🎉':'情侶（狼狼鏈）並未獲勝';
    } else if(pairType==='good'){
      followMsg=(res.winner==='good')?'情侶（人人鏈）跟著好人陣營獲勝 🎉':'情侶（人人鏈）並未獲勝';
    } else {
      followMsg='配對狀態不明，無法判定是否跟著獲勝。';
    }
    // 情侶其中一人死亡，另一人一定會跟著殉情（見 jgCascadeLoverDeath／天亮情侶殉情連動），
    // 不會有「一人死、一人還活著」的中間狀態，所以這裡不再另外標注存活狀態。
    const success=(pairType==='third'&&res.winner==='third')||(pairType==='wolf'&&res.winner==='wolf')||(pairType==='good'&&res.winner==='good');
    cupidHtml='<div class="section-title" style="margin-top:16px;">💘 邱比特與情侶</div>'
      +'<div class="'+(success?'info-success':'info-warn')+'" style="font-size:14px;">'
      +'【邱比特: '+(cpP?cpP.num:'?')+'號、情侶: '+(l1?l1.num:jgLovers[0])+'號、'+(l2?l2.num:jgLovers[1])+'號 -> '+pairArrowLabel+'】<br>'+followMsg+'</div>';
  }
  // 盜賊：遊戲結束時揭曉最終選擇與被埋掉的身分
  let thiefHtml='';
  if(jgThiefChosen&&jgThiefFinalNum){
    const finalName=jgFullRoleName(jgThiefFinalRole||'');
    const buriedName=jgFullRoleName(jgThiefBuriedRole||'');
    thiefHtml='<div class="section-title" style="margin-top:16px;">🎴 盜賊</div>'
      +'<div class="info" style="font-size:14px;">'
      +jgThiefFinalNum+'號 原本是盜賊，「'+finalName+'」&「'+buriedName+'」選擇了「'+finalName+'」</div>';
  }
  document.getElementById('jg-content').innerHTML=`
    <div class="nbanner"><div class="nicon">${res.icon}</div><div class="ntitle">${winTitle}</div><p class="sub" style="text-align:center;">${res.msg}</p></div>
    <div class="section-title">全體身分</div>
    <div class="card">${allRows}</div>
    ${hybridHtml}
    ${cupidHtml}
    ${thiefHtml}
    <div class="section-title" style="margin-top:16px;">勝負判定依據</div>
    <div class="win-bar">
      <div class="win-side win-wolf"><div class="win-count">${jgAlive().filter(p=>jgIsWolfForWin(p)).length}</div><div class="win-label">存活狼人</div></div>
      <div class="win-side win-good"><div class="win-count">${jgAlive().filter(p=>!jgIsWolfForWin(p)).length}</div><div class="win-label">存活好人</div></div>
    </div>
    <button onclick="jgShowExportModal()" style="margin-top:14px;">📋 匯出文字紀錄</button>
    <button onclick="pdSubmitGameRecord()" style="margin-top:8px;">🔒 送出到遊玩數據</button>
    <button class="primary" onclick="jgReset()" style="margin-top:8px;">再玩一局</button>
  `;
  document.getElementById('jg-phase-badge').innerHTML='🏁 遊戲結束';
  const rw=document.getElementById('jg-roster-wrap'); if(rw) rw.style.display='none';
  jgLiveSyncMarkEnded();
  jgShowJudgeEndModal(isThird?'第三方':(isGood?'好人':'狼人'));
}

// 遊戲結束時跳出的法官提醒大框：公布結果＋提醒法官匯出紀錄、上傳遊玩數據
function jgShowJudgeEndModal(winnerLabel){
  let modal=document.getElementById('jg-judge-end-modal');
  if(!modal){
    modal=document.createElement('div');
    modal.id='jg-judge-end-modal';
    modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
    document.body.appendChild(modal);
  }
  modal.innerHTML='<div style="background:var(--bg1,#fff);border-radius:16px;padding:24px 20px;max-width:420px;width:100%;text-align:center;">'
    +'<div style="font-size:17px;font-weight:800;line-height:1.9;">法官公布: 遊戲結束，「'+winnerLabel+'」獲勝<br>'
    +'<div style="font-size:14px;font-weight:600;color:var(--text2);margin-top:10px;line-height:1.9;text-align:left;">'
    +'給法官的提醒:<br>1. 匯出文字紀錄到群組<br>2. 找冠竹或嘉軒以輸入密碼上傳本場記錄到遊玩數據<br>'
    +'</div><div style="margin-top:10px;">法官辛苦了!!</div></div>'
    +'<button class="primary" style="margin-top:16px;" onclick="document.getElementById(\'jg-judge-end-modal\').remove()">我知道了</button>'
    +'</div>';
}

function jgReset(){
  document.querySelectorAll('#t-judge .pg').forEach(p=>p.classList.remove('on'));
  document.getElementById('jg-p-setup').classList.add('on');
  const rw=document.getElementById('jg-roster-wrap'); if(rw) rw.style.display='';
}

