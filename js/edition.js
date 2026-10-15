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

// 各版本有哪些功能（true＝有）。自己人版全部都有；公開版先全部維持原樣，
// 之後一項一項關掉（例如：攻略、內建人名、遊玩數據試算表、即時票型、語音通話）。
const JG_EDITION_FEATURES={
  team:{},
  public:{}
};
function jgEditionHas(feature){
  const table=JG_EDITION_FEATURES[JG_EDITION]||{};
  return table[feature]!==false;
}

// 讓 CSS 也能依版本調整（html[data-edition="public"] ...），頁尾版本號後面標示是哪個版本，
// 部署到 Cloudflare 之後一眼就能確認兩個網站有沒有切對。
if(typeof document!=='undefined'){
  document.documentElement.setAttribute('data-edition', JG_EDITION);
  document.addEventListener('DOMContentLoaded',()=>{
    if(!jgIsPublicEdition()) return;
    const v=document.querySelector('.site-footer span');
    if(v&&!v.textContent.includes('公開版')) v.textContent+='（公開版）';
  });
}
