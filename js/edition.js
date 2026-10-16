// ═══════════════════════════════════════════
// js/edition.js
// 版本切換：同一份程式碼分成「自己人版」（team，現在大家在用的完整功能）跟「公開版」
// （public，之後給外面的人用：沒有真實人名、沒有攻略、只開放部分板子……）。
//
// 怎麼決定是哪個版本（優先順序由高到低）：
//   1. 網址帶 ?edition=public 或 ?edition=team：方便測試，只影響這一次打開
//   2. 部署設定 window.JG_DEPLOY_EDITION（見 js/edition-config.js，公開版網站部署時寫入）
//   3. 都沒有就是自己人版（GitHub Pages、本機開發都是這個）
//
// 其他程式要判斷版本時用 jgIsPublicEdition()；要開關某個功能用 jgEditionHas('功能名稱')，
// 功能清單在下面 JG_EDITION_FEATURES，新增「公開版要拿掉」的東西就在這裡加一項。
// ═══════════════════════════════════════════
const JG_EDITIONS=['team','public'];
function jgDetectEdition(search, deployEdition){
  try{
    const q=new URLSearchParams(search||'').get('edition');
    if(JG_EDITIONS.includes(q)) return q;
  }catch(e){}
  if(JG_EDITIONS.includes(deployEdition)) return deployEdition;
  return 'team';
}
const JG_EDITION=jgDetectEdition(typeof location!=='undefined'?location.search:'', typeof window!=='undefined'?window.JG_DEPLOY_EDITION:null);
function jgIsPublicEdition(){ return JG_EDITION==='public'; }

// 各版本有哪些功能（沒列出來的＝有）。自己人版維持原本的完整功能，只是沒有公開版的首頁。
// 公開版拿掉的東西：
//   guide     攻略參考分頁
//   playData  遊玩數據分頁（自己人的雲端試算表、送出到遊玩數據、名單裡的歷史人名）
//   liveVotes 法官助手頁的即時票型紀錄（會寫進自己人的試算表，不同場次會混在一起）
//   room      連線房間分頁、建立連線房間／使用手機發牌按鈕、邀請連結、語音通話
//   dualMode  雙身分模式
//   allBoards 全部板子（公開版只開放免費板子，見 JG_FREE_BOARDS）
//   sheriffAudio 警長競選「現在開始競選警長」的音檔按鈕
// 公開版多兩個：home（首頁）、playDataDemo（遊玩數據頁顯示「尚未開放此功能」＋範例資料）。
// 畫面上的元素加 data-feature="功能名稱"，那個功能沒有時會自動藏起來（見下面）。
const JG_EDITION_FEATURES={
  team:{ home:false, playDataDemo:false },
  public:{ guide:false, playData:false, liveVotes:false, room:false, dualMode:false, allBoards:false, sheriffAudio:false }
};
function jgEditionHas(feature){
  const table=JG_EDITION_FEATURES[JG_EDITION]||{};
  return table[feature]!==false;
}
// 公開版的免費板子：'custom' 是「自訂角色」，公開版只能選預言家、女巫、獵人、守衛跟狼人、黑狼王、
// 平民（＝預女獵守基本板）；其他是 JG_BOARD_PRESETS 的 key。沒開放的板子在選單上畫一個鎖、不能選。
const JG_FREE_BOARDS=['custom','evilknight_guard','wolfbeauty_knight','mechwolf_medium','dreamcatcher_nightmare'];
const JG_BASIC_WOLVES=['wolf','wolfking'];
const JG_BASIC_GODS=['seer','witch','hunter','guard'];
function jgBoardAvailable(key){
  return jgEditionHas('allBoards')||JG_FREE_BOARDS.includes(key);
}
// 公開版不出現的角色（選角畫面、角色與規則都不顯示）。
const JG_PUBLIC_HIDDEN_ROLES=['whitewolf'];
function jgRoleAvailable(id){
  return !jgIsPublicEdition()||!JG_PUBLIC_HIDDEN_ROLES.includes(id);
}
// 把 data-feature 的元素依版本藏起來（用屬性＋CSS 的 !important，切分頁也不會被打開）。
function jgApplyEditionFeatures(root){
  if(typeof document==='undefined') return;
  (root||document).querySelectorAll('[data-feature]').forEach(el=>{
    const off=el.getAttribute('data-feature').split(/\s+/).some(f=>f&&!jgEditionHas(f));
    if(off) el.setAttribute('data-feature-off',''); else el.removeAttribute('data-feature-off');
  });
}

// 讓 CSS 也能依版本調整（html[data-edition="public"] ...），頁尾版本號後面標示是哪個版本，
// 部署到 Cloudflare 之後一眼就能確認兩個網站有沒有切對。
if(typeof document!=='undefined'){
  document.documentElement.setAttribute('data-edition', JG_EDITION);
  // 這支檔案放在 <body> 最後面載入，畫面元素已經都在了，直接套用，不會先閃一下再消失。
  jgApplyEditionFeatures();
  // 有首頁的版本：一打開先停在首頁（原本預設是法官の助手）。
  if(jgEditionHas('home')){
    const home=document.getElementById('t-home');
    if(home){
      document.querySelectorAll('.tab').forEach(t=>t.classList.remove('on'));
      home.classList.add('on');
      document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
    }
  }
  document.addEventListener('DOMContentLoaded',()=>{
    jgApplyEditionFeatures();
    if(!jgIsPublicEdition()) return;
    const v=document.querySelector('.site-footer span');
    if(v&&!v.textContent.includes('公開版')) v.textContent+='（公開版）';
  });
}
