// ═══════════════════════════════════════════
// js/tour.js
// 法官の助手的新手導覽與演練：
//   ・導覽：在設定頁依序框出「遊戲基本設定 → 選擇板子 → 開始主持」，旁邊是說明，按「下一步」往下看。
//   ・演練：用 6 人預女獵守（基本板）照劇本實際主持一場，從發牌、兩個晚上、白天發言投票，
//     一直到好人勝利。每一步只框出要按的按鈕，其他按鈕暫時按不了（避免走偏後提示對不上），
//     想自己操作隨時可以按「離開演練」。
//   演練時不會送出任何資料（即時票型、遊玩數據都會跳過，見 js/core.js 的 jgTourPractice 判斷）。
// 公開版第一次打開法官の助手會自動問要不要看導覽；兩個版本在設定頁上方都有「導覽／演練」按鈕可以重看。
// 畫面：最下面一條固定的說明面板（#jg-tour），要按的東西加 .tour-hl 外框。
// ═══════════════════════════════════════════

const JG_TOUR_SEEN_KEY='jgTourSeen';
let jgTour=null; // {mode:'offer'|'tour'|'practice', idx, doneInfo:{}, lastKey}
let jgTourTimer=null;
let jgTourSeenMem=false; // 瀏覽器不能存 localStorage（例如無痕模式）時，至少這次開著的頁面記得看過了

// ── 小工具 ──
function jgTourVal(id){ const el=document.getElementById(id); return el?String(el.value||''):''; }
function jgTourGrid(id, n){ return '#'+id+'-grid button[data-num="'+n+'"]'; }
function jgTourOnclick(code){ return '[onclick="'+code+'"]'; }
function jgTourVoted(target, voter){ return typeof jgVoteTally!=='undefined'&&!!(jgVoteTally[target]&&jgVoteTally[target][voter]); }
function jgTourOnSetup(){ const s=document.getElementById('jg-p-setup'); return !!(s&&s.classList.contains('on')); }
function jgTourInGame(){ const m=document.getElementById('jg-p-main'); return !!(m&&m.classList.contains('on')); }

// ── 導覽（設定頁）──
const JG_TOUR_SETUP=[
  {sel:'.jg-sec-basic', title:'遊戲基本設定', text:'先填玩家人數。要競選警長就勾「上警局」。玩家名單可以不填，直接用號碼主持也可以。'},
  {sel:'.jg-sec-board', title:'選擇板子', text:'選好板子，下面會列出這個板子的角色，點一下可以加選或取消。上面的框框會告訴你人數對不對。'},
  {sel:'.jg-start-btn', title:'開始主持', text:'設定好就按「開始主持」。之後助手會一步一步告訴你要唸什麼口白、記錄每個人做了什麼，最後自動判斷勝負。'}
];

// ── 演練劇本：6 人預女獵守。身分固定：1號、4號 狼人；3號 預言家；5號 女巫；2號、6號 平民。──
// 每個 key＝「步驟@第幾晚」，items 依序做，第一個還沒完成的就是現在要按的。
const JG_TOUR_PRACTICE_ROLES='1號、4號 狼人；3號 預言家；5號 女巫；2號、6號 平民';
const JG_TOUR_SCRIPT={
  'setup':[
    {sel:'.jg-start-btn', text:'這場演練用 6 人預女獵守（基本板）：狼人 2、平民 2、預言家、女巫，不競選警長。已經幫你設定好了，按「開始主持」。', done:()=>!jgTourOnSetup()}
  ],
  'deal@1':[
    {sel:jgTourOnclick('jgProceedToNight()'), text:'實際主持時先發身分牌，讓大家看自己的身分。這場的身分是：'+JG_TOUR_PRACTICE_ROLES+'。發完、大家閉眼後按下去。'}
  ],
  'night-start@1':[
    {sel:jgTourOnclick('jgGoStep(jgNightStartNext())'), text:'唸出框框裡的口白「天黑請閉眼」，確認大家都閉眼了再按。'}
  ],
  'wolf-wake@1':[
    {sel:jgTourGrid('jg-wolf-who-0',1), text:'唸「狼人請睜眼」。第一晚要記下狼人是誰：第 1 隻狼點 1。', done:()=>jgTourVal('jg-wolf-who-0')==='1'},
    {sel:jgTourGrid('jg-wolf-who-1',4), text:'第 2 隻狼點 4。', done:()=>jgTourVal('jg-wolf-who-1')==='4'},
    {sel:jgTourGrid('jg-wolf-rec',6), text:'狼人用手勢指出今晚要殺的人。這場他們選 6 號，點 6。', done:()=>jgTourVal('jg-wolf-rec')==='6'},
    {sel:jgTourOnclick('jgSaveWolf()'), text:'唸「狼人請閉眼」，按「已紀錄，下一步」。'}
  ],
  'witch-wake@1':[
    {sel:jgTourGrid('jg-witch-who',5), text:'唸「女巫請睜眼」，記下女巫是誰：點 5。', done:()=>jgTourVal('jg-witch-who')==='5'},
    {sel:'#jg-btn-save-yes', text:'法官用手比 6 號告訴女巫他被殺了。女巫決定救他，按「救人」。毒藥這晚不用。', done:()=>typeof jgRecord!=='undefined'&&jgRecord.witchSave===true},
    {sel:jgTourOnclick('jgSaveWitch()'), text:'唸「女巫請閉眼」，按「已紀錄，下一步」。'}
  ],
  'seer-wake@1':[
    {sel:jgTourGrid('jg-seer-who',3), text:'唸「預言家請睜眼」，記下預言家：點 3。', done:()=>jgTourVal('jg-seer-who')==='3'},
    {sel:jgTourGrid('jg-seer-target-input',1), text:'預言家指 1 號要查驗，點 1。畫面會顯示 1 號是狼人，法官比手勢告訴預言家。', done:()=>jgTourVal('jg-seer-target-input')==='1'},
    {sel:jgTourOnclick('jgSaveSeer()'), text:'唸「預言家請閉眼」，按「已查驗，下一步」。'}
  ],
  'dawn@1':[
    {sel:'#jg-content button.primary', text:'天亮了！6 號被女巫救回來，所以唸「昨晚是平安夜」。按「開始發言」。'}
  ],
  'discuss@1':[
    {sel:jgTourOnclick('jgSpinWheel()'), text:'白天要決定從誰開始發言，按「轉動轉盤」抽一個號碼。', done:()=>!!document.getElementById('jg-speak-timer-toggle-btn')},
    {sel:jgTourOnclick('jgDiscussGoVote()'), text:'實際主持時，每個人發言可以按「開始」計時，講完按「過，下一位」。演練直接按「發言結束，進入投票」。'}
  ],
  'vote@1':[
    {sel:jgTourOnclick('jgToggleVote(1,2)'), text:'唸「準備投票，3、2、1」，大家同時指向要放逐的人。在「2 號」那一列點 1：2 號投給 1 號。', done:()=>jgTourVoted(1,2)},
    {sel:jgTourOnclick('jgToggleVote(1,3)'), text:'預言家 3 號也投 1 號。', done:()=>jgTourVoted(1,3)},
    {sel:jgTourOnclick('jgToggleVote(1,5)'), text:'5 號投 1 號。', done:()=>jgTourVoted(1,5)},
    {sel:jgTourOnclick('jgToggleVote(1,6)'), text:'6 號投 1 號。', done:()=>jgTourVoted(1,6)},
    {sel:jgTourOnclick('jgToggleVote(3,1)'), text:'狼人 1 號反過來投 3 號。', done:()=>jgTourVoted(3,1)},
    {sel:jgTourOnclick('jgToggleVote(3,4)'), text:'狼人 4 號也投 3 號。', done:()=>jgTourVoted(3,4)},
    {sel:jgTourOnclick('jgSaveVote()'), text:'1 號 4 票最高，按「確認投票結果」。投票紀錄會自動記在旁邊。'}
  ],
  'vote-last-words@1':[
    {sel:jgTourOnclick("jgGoStep('next-night')"), text:'1 號被放逐，發表遺言。遺言講完按「遺言結束，天黑」。'}
  ],
  'night-start@2':[
    {sel:jgTourOnclick('jgGoStep(jgNightStartNext())'), text:'第二晚。一樣唸「天黑請閉眼」，按下去。'}
  ],
  'wolf-wake@2':[
    {sel:jgTourGrid('jg-wolf-rec',3), text:'狼人身分第一晚記過了，這次只要記刀口。剩下的 4 號狼人選 3 號，點 3。', done:()=>jgTourVal('jg-wolf-rec')==='3'},
    {sel:jgTourOnclick('jgSaveWolf()'), text:'按「已紀錄，下一步」。'}
  ],
  'witch-wake@2':[
    {sel:jgTourGrid('jg-witch-poison-rec',4), text:'解藥第一晚用掉了，法官搖頭。女巫決定毒 4 號，點 4。', done:()=>jgTourVal('jg-witch-poison-rec')==='4'},
    {sel:jgTourOnclick('jgSaveWitch()'), text:'按「已紀錄，下一步」。'}
  ]
};
// 照劇本走不到的步驟（不應該發生，保險用）：給一句通用說明。
const JG_TOUR_STEP_HELP={
  'night-start':'唸「天黑請閉眼」，確認大家閉眼後按下一步。',
  'wolf-wake':'記下狼人是誰和今晚的刀口，再按下一步。',
  'witch-wake':'記下女巫是誰、要不要用解藥和毒藥，再按下一步。',
  'seer-wake':'記下預言家和查驗的對象，畫面會顯示結果。',
  'dawn':'唸出昨晚的結果。',
  'discuss':'依序發言，發言結束後進入投票。',
  'vote':'記下每個人投給誰，再按確認投票結果。'
};

function jgTourPracticeKey(){
  if(jgTourOnSetup()) return 'setup';
  if(!jgTourInGame()) return '';
  return (typeof jgCurrentStep!=='undefined'?jgCurrentStep:'')+'@'+(typeof jgNight!=='undefined'?jgNight:1);
}
// 演練目前要按的東西：{key, item, idx, total}；結束了回傳 {end:true}。
function jgTourPracticeNow(){
  // 主持結束會先跳「法官公布：遊戲結束」視窗，等法官按「我知道了」再顯示演練完成。
  if(document.getElementById('jg-judge-end-modal')) return {wait:true};
  if(typeof jgLastWinResult!=='undefined'&&jgLastWinResult&&jgTourInGame()) return {end:true};
  // 全螢幕大字卡（例如轉盤抽出從幾號開始發言）：先給大家看，再按「關閉」。
  if(document.getElementById('jg-bigcard-modal')){
    return {key:jgTourPracticeKey(), item:{sel:'#jg-bigcard-modal button', text:'這張大字卡是給所有玩家看的：從幾號開始、往哪個方向發言。大家看到後按「關閉」。'}, idx:'card'};
  }
  const key=jgTourPracticeKey();
  const items=JG_TOUR_SCRIPT[key];
  if(!items) return {key, item:null};
  for(let i=0;i<items.length;i++){
    const it=items[i];
    if(!it.done||!it.done()) return {key, item:it, idx:i, total:items.length};
  }
  return {key, item:items[items.length-1], idx:items.length-1, total:items.length};
}
const JG_TOUR_PRACTICE_ORDER=Object.keys(JG_TOUR_SCRIPT);

// ── 畫面 ──
function jgTourPanel(){
  let el=document.getElementById('jg-tour');
  if(!el){
    el=document.createElement('div');
    el.id='jg-tour';
    el.setAttribute('role','dialog');
    el.setAttribute('aria-live','polite');
    document.body.appendChild(el);
  }
  return el;
}
function jgTourClearHl(){ document.querySelectorAll('.tour-hl').forEach(e=>e.classList.remove('tour-hl')); }
function jgTourHighlight(sel, scroll){
  jgTourClearHl();
  if(!sel) return null;
  // 優先挑畫面上看得到的那個（同一個選擇器可能有藏起來的元素）
  const all=[...document.querySelectorAll(sel)];
  const el=all.find(e=>e.offsetParent!==null)||all[0]||null;
  if(el){
    el.classList.add('tour-hl');
    if(scroll){ try{ el.scrollIntoView({block:'center', behavior:'smooth'}); }catch(e){ el.scrollIntoView(); } }
  }
  return el;
}
function jgTourRender(){
  if(!jgTour){ jgTourClose(); return; }
  const panel=jgTourPanel();
  document.body.classList.add('tour-on');
  let head='', body='', btns='', sel=null, key='';
  if(jgTour.mode==='offer'){
    key='offer';
    head='第一次使用法官の助手嗎？';
    body='可以先看 30 秒的導覽，或用 6 人基本板實際演練一場（大約 3 分鐘，從發牌一路到遊戲結束）。';
    btns='<button class="primary" onclick="jgTourStart()">看導覽</button><button onclick="jgTourStartPractice()">演練一場</button><button class="ghost" onclick="jgTourClose(true)">不用了</button>';
  } else if(jgTour.mode==='tour'){
    const s=JG_TOUR_SETUP[jgTour.idx];
    key='tour'+jgTour.idx;
    sel=s.sel;
    head='導覽 '+(jgTour.idx+1)+'／'+JG_TOUR_SETUP.length+'：'+s.title;
    body=s.text;
    btns=jgTour.idx<JG_TOUR_SETUP.length-1
      ?'<button class="primary" onclick="jgTourNext()">下一步</button><button class="ghost" onclick="jgTourClose(true)">關閉</button>'
      :'<button class="primary" onclick="jgTourStartPractice()">演練一場</button><button class="ghost" onclick="jgTourClose(true)">完成</button>';
  } else if(jgTour.mode==='practice'){
    const now=jgTourPracticeNow();
    if(now.wait){
      key='wait';
      head='遊戲結束';
      body='唸出「法官公布」的內容，然後按「我知道了」。';
    } else if(now.end){
      key='end';
      head='演練完成';
      body='第二晚女巫毒死最後一隻狼，所有狼人都出局，好人勝利！助手會在每一刀、每一票之後自動檢查勝負。實際主持時，照著這個流程按就好了。';
      btns='<button class="primary" onclick="jgTourFinishPractice()">完成</button>';
    } else if(now.item){
      const stepNo=Math.max(0, JG_TOUR_PRACTICE_ORDER.indexOf(now.key))+1;
      key='p:'+now.key+':'+now.idx;
      sel=now.item.sel;
      head='演練 '+stepNo+'／'+JG_TOUR_PRACTICE_ORDER.length;
      body=now.item.text;
      btns='<button class="ghost" onclick="jgTourClose(true)">離開演練</button>';
    } else {
      key='p:'+now.key;
      head='演練';
      body=JG_TOUR_STEP_HELP[(now.key||'').split('@')[0]]||'照畫面上的口白唸，選好後按下一步。';
      btns='<button class="ghost" onclick="jgTourClose(true)">離開演練</button>';
    }
  }
  if(key!==jgTour.lastKey){
    jgTour.lastKey=key;
    panel.innerHTML='<div class="jg-tour-head">'+head+'</div><div class="jg-tour-body">'+body+'</div><div class="jg-tour-btns">'+btns+'</div>';
    jgTourHighlight(sel, true);
  } else if(sel&&!document.querySelector('.tour-hl')){
    // 畫面重畫過（例如點了號碼格）外框會不見，補回去，但不要再捲動。
    jgTourHighlight(sel, false);
  }
}
function jgTourTick(){ if(jgTour) jgTourRender(); }

// 演練時只有框起來的按鈕能按（說明面板、上方分頁列除外），按到別的就提醒一下。
function jgTourGuardClick(e){
  if(!jgTour||jgTour.mode!=='practice') return;
  const t=e.target;
  if(!t||!t.closest) return;
  if(t.closest('#jg-tour')||t.closest('.nav')||t.closest('#jg-judge-end-modal')) return;
  if(!t.closest('#t-judge')) return;
  const hl=document.querySelector('.tour-hl');
  if(hl&&(hl===t||hl.contains(t))){ setTimeout(jgTourTick, 0); return; }
  e.preventDefault(); e.stopPropagation();
  const panel=document.getElementById('jg-tour');
  if(panel){ panel.classList.remove('jg-tour-nudge'); void panel.offsetWidth; panel.classList.add('jg-tour-nudge'); }
}

// ── 開始／結束 ──
function jgTourBegin(mode){
  jgTour={mode, idx:0, lastKey:null};
  if(!jgTourTimer) jgTourTimer=setInterval(jgTourTick, 300);
  jgTourRender();
}
// 第一次打開法官の助手（公開版）：問要不要看導覽。
function jgTourMaybeAuto(){
  if(jgTour||!jgIsPublicEdition()) return;
  let seen=jgTourSeenMem;
  try{ seen=seen||localStorage.getItem(JG_TOUR_SEEN_KEY)==='1'; }catch(e){}
  if(seen||!jgTourOnSetup()) return;
  jgTourBegin('offer');
}
function jgTourOffer(){ switchTab('t-judge'); jgTourBegin('offer'); }
function jgTourStart(){
  switchTab('t-judge');
  // 導覽是看設定頁：主持到一半的話先問要不要離開這一場（已經結束的場次直接回設定頁）。
  const midGame=jgTourInGame()&&!(typeof jgLastWinResult!=='undefined'&&jgLastWinResult);
  if(midGame&&!confirm('導覽要回到設定頁，目前這一場會中斷，確定嗎？')) return;
  if(!jgTourOnSetup()) jgReset();
  window.jgTourPractice=false;
  jgTourBegin('tour');
}
function jgTourNext(){ if(jgTour&&jgTour.mode==='tour'&&jgTour.idx<JG_TOUR_SETUP.length-1){ jgTour.idx++; jgTourRender(); } }
function jgTourStartPractice(){
  switchTab('t-judge');
  const midGame=jgTourInGame()&&!(typeof jgLastWinResult!=='undefined'&&jgLastWinResult);
  if(midGame&&!confirm('演練會結束目前這一場，確定嗎？')) return;
  jgReset();
  // 6 人預女獵守、單身分、不競選警長、不填名字
  if(typeof jgSetupDualMode!=='undefined'&&jgSetupDualMode) jgSetMode(false);
  const cnt=document.getElementById('jg-count'); if(cnt) cnt.value=6;
  const bp=document.getElementById('jg-board-preset'); if(bp) bp.value='custom';
  jgSetBoardPreset('custom');
  const sh=document.getElementById('jg-sheriff-enabled');
  if(sh&&sh.checked){ sh.checked=false; if(typeof jgUpdateSheriffToggleStyle==='function') jgUpdateSheriffToggleStyle(); }
  if(typeof jgPlayerNames!=='undefined') jgPlayerNames={};
  window.jgTourPractice=true;
  jgTourBegin('practice');
}
function jgTourFinishPractice(){
  jgTourClose(true);
  if(typeof jgReset==='function') jgReset();
  window.scrollTo(0,0);
}
function jgTourClose(markSeen){
  if(markSeen){ jgTourSeenMem=true; try{ localStorage.setItem(JG_TOUR_SEEN_KEY,'1'); }catch(e){} }
  jgTour=null;
  window.jgTourPractice=false;
  clearInterval(jgTourTimer); jgTourTimer=null;
  jgTourClearHl();
  const panel=document.getElementById('jg-tour'); if(panel) panel.remove();
  document.body.classList.remove('tour-on');
}

document.addEventListener('click', jgTourGuardClick, true);
