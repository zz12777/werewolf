// ═══════════════════════════════════════════
// js/playdata-core.js
// 遊玩數據分頁：排行榜統計、積分計算、成長趨勢圖
// 本檔案由 index.html 拆分而成，內容為原檔案對應區塊的原樣搬移（未修改邏輯）
// ═══════════════════════════════════════════

const ABBR={'民':'平民','狼':'狼人','巫':'女巫','預':'預言家','守':'守衛','獵':'獵人','通':'通靈師','混':'混血兒','王':'黑狼王','月':'血月使者','魔':'魔術師','魘':'夢魘','攝':'攝夢人','騎':'騎士'};
function normRole(r){return ABBR[r]||r;}
function classify(role){
  // 混血兒是唯一陣營會依「這場實際跟誰」而變動的角色：若是狼混（混到狼隊），
  // 這場要算邪惡陣營、跟狼隊共享勝負；沒有標註或標註好人混，才維持原本一律算好人。
  if(role.startsWith('混血兒')){
    return role.includes('狼混') ? 'evil' : 'good';
  }
  // 其餘角色優先用 ALL_ROLES 的陣營資料（team）當唯一真相來源，跟法官系統的判定保持一致，
  // 避免「石像鬼」「惡靈騎士」這類名稱裡沒有「狼」字、但其實是狼隊的角色被誤判成好人
  for(const k in ALL_ROLES){
    if(ALL_ROLES[k].name===role) return ALL_ROLES[k].team==='wolf'?'evil':'good';
  }
  // 找不到完全對應時（例如雙身分紀錄「民/攝」、或機械狼帶著學到身分的「機械狼(機械民)」
  // 這種組合字串）才退回關鍵字比對，補上「鬼」「惡靈」避免石像鬼／惡靈騎士的縮寫組合漏判
  const keys=['狼','機械','魘','血月','王','鬼','惡靈'];
  return keys.some(k=>role.includes(k))?'evil':'good';
}
// 統一的「顯示身分」：
// ‧ 混血兒：括號註記（好人混／狼混）要保留下來，不能被括號清除規則拿掉，
//   因為 classify() 要靠它判斷這場混血兒實際算好人還是邪惡陣營。
// ‧ 機械狼：學到的具體身分改成保留在括號內顯示（例如「機械狼(機械民)」「機械狼(機械守衛)」），
//   不再直接收斂成單純的「機械狼」，方便在每人細項、每場紀錄裡看出他當時學到什麼。
// ‧ 其餘角色：去掉括號附註後用完整名稱顯示。
function pdDisplayRole(rawRole){
  if(rawRole.includes('混')){
    const m=rawRole.match(/[（(]([^）)]*)[）)]/);
    const note=(m?m[1]:'').trim();
    if(note.includes('狼')) return '混血兒(狼混)';
    if(note) return '混血兒(好人混)';
    return '混血兒';
  }
  const clean=rawRole.replace(/（.*?）/,'').replace(/\(.*?\)/,'');
  if(clean.includes('機械')) return clean==='機械狼' ? '機械狼' : `機械狼(${clean})`;
  return normRole(clean);
}


// 顯示用排序（依日期、同日依原順序）
// ═══════════════════════════════════════════
// 雲端共用試算表設定（方法二：自動記錄／大家共用）
// ═══════════════════════════════════════════
// 一次性設定步驟：
// 1. 建立一個 Google 表單，欄位「依序」建立成：
//    場次代號(簡答) / 日期(簡答) / 板子(簡答) / 結果文字(簡答) / 陣營(簡答) / 時間(簡答) / 玩家名單JSON(段落) / 遊戲記錄(段落)
// 2. 表單右上角「⋮」→「取得預先填寫的連結」，每個欄位隨便填點東西 → 取得連結，把整條連結傳給 Claude
// 3. 表單「回覆」分頁 → 綠色試算表圖示，建立關聯的回應試算表 → 把該試算表網址「共用」設成
//    「知道連結的人均可查看」，把試算表網址也傳給 Claude
// Claude 會把下面三個值換成正確的設定，之後主持完按「🔗 送出到遊玩數據」就會自動送出、
// 這個分頁重新整理時也會自動去試算表抓最新場次。
const PD_FORM_ACTION_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSeAqU86sLtuptAh50Ndu7zHUjVQHQGU6ietsgJwlqUTS1K3iw/formResponse';
const PD_FORM_ENTRIES = {
  id:'entry.593689443', date:'entry.944666696', board:'entry.980679289',
  resultText:'entry.245423789', winner:'entry.1204746202', time:'entry.1141328912',
  players:'entry.1989136022', log:'entry.451885810'
};
const PD_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1q4qLbQLS4GBajy4Zh66spegaXlpC4Uo9TrkcAYLmyQQ/gviz/tq?tqx=out:csv&gid=0';
// 送出前需要輸入的密碼，避免別人不小心點到「送出到遊玩數據」洗掉資料。
// 想改密碼就直接改這一行的文字就好（提醒：這只是防呆用，不是真的加密，網頁原始碼打開看得到，不要用太重要的密碼）。
const PD_SUBMIT_PASSWORD = '12071211';
const PD_NOT_CONFIGURED = u => !u || u.includes('PASTE_');

// 日期／時間統一格式化：
// 本機寫死的 GAMES 是純文字 "2026-07-30"，但雲端試算表那個欄位常常會被 Google 試算表
// 自動判斷成「日期」格式，用匯出當下的地區設定重新排版（例如變成 "2026/8/5"），
// 「時間」欄位也可能被判斷成 12 小時制文字（例如 "下午10:18:00"）。
// 這裡統一解析成內部固定格式（date: "YYYY-MM-DD" 方便排序、time: 24小時制 "HH:MM"），
// 畫面顯示時再一律轉成「YYYY/M/D」，日期紀錄就不會一下槓一下斜線。
function pdParseDateTime(rawDate, rawTime){
  let iso='', time=rawTime?String(rawTime).trim():'';
  let s=rawDate?String(rawDate).trim():'';
  // 日期欄位本身夾帶時間的情況（例如試算表把整欄轉成 datetime）
  const ampmInDate=s.match(/^(.*?)[\s,]+(上午|下午)\s*(\d{1,2}):(\d{2})(:\d{2})?$/);
  if(ampmInDate){ s=ampmInDate[1].trim(); if(!time) time=ampmInDate[2]+ampmInDate[3]+':'+ampmInDate[4]; }
  const m=s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  iso=m?(m[1]+'-'+String(+m[2]).padStart(2,'0')+'-'+String(+m[3]).padStart(2,'0')):s;
  // 時間欄位轉成 24 小時制 "HH:MM"（處理「下午10:18:00」這種中文上下午格式）
  const ampmT=time.match(/^(上午|下午)\s*(\d{1,2}):(\d{2})/);
  if(ampmT){
    let h=parseInt(ampmT[2],10);
    if(ampmT[1]==='下午'&&h<12) h+=12;
    if(ampmT[1]==='上午'&&h===12) h=0;
    time=String(h).padStart(2,'0')+':'+ampmT[3];
  } else {
    const plainT=time.match(/^(\d{1,2}):(\d{2})/);
    if(plainT) time=String(+plainT[1]).padStart(2,'0')+':'+plainT[2];
  }
  return {iso, time};
}
// 完整顯示："2026-07-30" → "2026/7/30"
function pdDisplayDate(iso){
  const m=(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m?(m[1]+'/'+(+m[2])+'/'+(+m[3])):(iso||'');
}
// 精簡顯示（排行榜對局小條目用，不含年份）："2026-07-30" → "7/30"
function pdDisplayDateShort(iso){
  const m=(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m?((+m[2])+'/'+(+m[3])):(iso||'');
}

// 簡易 CSV 解析（處理欄位內含逗號／換行／引號的情況，Google 試算表匯出的格式）
function pdParseCSV(text){
  const rows=[]; let row=[]; let field=''; let inQuotes=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(inQuotes){
      if(c==='"'){ if(text[i+1]==='"'){ field+='"'; i++; } else { inQuotes=false; } }
      else field+=c;
    } else {
      if(c==='"') inQuotes=true;
      else if(c===','){ row.push(field); field=''; }
      else if(c==='\n'){ row.push(field); rows.push(row); row=[]; field=''; }
      else if(c==='\r'){ /* 略過 */ }
      else field+=c;
    }
  }
  if(field.length||row.length){ row.push(field); rows.push(row); }
  return rows;
}

// 試算表欄位順序：0=Timestamp（Google表單自動加的）, 1=id, 2=date, 3=board, 4=resultText, 5=winner, 6=time, 7=playersJson, 8=log
function pdCloudGameFromRow(cols){
  try{
    const id=cols[1], rawDate=cols[2], board=cols[3], resultTextRaw=cols[4], winnerRaw=cols[5], rawTime=cols[6], playersJson=cols[7], log=cols[8];
    if(!id||!rawDate) return null;
    const {iso:date, time}=pdParseDateTime(rawDate, rawTime);
    // 「結果」「陣營」兩欄留空＝這場不列入戰績（例如系統bug、中途取消等），
    // 場次紀錄、場數統計還是會保留，只是不算進勝負／勝率。
    const unclear = !resultTextRaw && !winnerRaw;
    return {
      id, date, board,
      resultText: unclear ? '不記勝敗' : resultTextRaw,
      winner: unclear ? null : (winnerRaw==='evil'?'evil':(winnerRaw==='third'?'third':'good')),
      unclear,
      time: time||undefined,
      players: JSON.parse(playersJson),
      log: log||'',
      cloud: true,
    };
  }catch(e){ console.warn('雲端場次解析失敗', cols, e); return null; }
}

async function pdLoadCloudGames(){
  if(PD_NOT_CONFIGURED(PD_SHEET_CSV_URL)) return; // 尚未完成雲端試算表設定
  try{
    const res=await fetch(PD_SHEET_CSV_URL);
    if(!res.ok) return;
    const text=await res.text();
    const rows=pdParseCSV(text).slice(1); // 跳過表頭
    const existingIds=new Set(GAMES.map(g=>g.id));
    const cloudGames=rows.map(pdCloudGameFromRow).filter(Boolean).filter(g=>!existingIds.has(g.id));
    if(cloudGames.length){ GAMES.push(...cloudGames); pdRebuildAndRender(); }
  }catch(e){ console.warn('讀取雲端遊玩紀錄失敗', e); }
}

// 法官主持完一場後，從「遊戲結束」畫面按這顆按鈕，自動把這場送進雲端試算表
function pdSubmitGameRecord(){
  if(!jgLastWinResult){ alert('目前沒有可送出的對局結果'); return; }
  if(PD_NOT_CONFIGURED(PD_FORM_ACTION_URL)){
    alert('雲端試算表還沒設定好喔～可以先用上面「📋 匯出文字紀錄」複製這場的內容，之後貼給整理資料的人。');
    return;
  }
  const pw=prompt('請輸入密碼以確認送出這場紀錄：');
  if(pw===null) return; // 按取消，什麼都不做
  if(pw!==PD_SUBMIT_PASSWORD){ alert('❌ 密碼不對，這場沒有送出。'); return; }
  const d=new Date();
  const mmdd=String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0');
  const id=mmdd+'_'+jgGameCount;
  const iso=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const players=[];
  const thirdPartyNums=jgLoverThirdPartyMembers(); // 人狼鏈成立時才有值：兩位情侶＋邱比特的座號清單
  for(let i=1;i<=jgTotal;i++){
    const p=jgByNum(i);
    if(!p) continue;
    const entry={num:i, name:jgPlayerNames[i]||p.name, role:jgRoleDisplayName(p)};
    if(thirdPartyNums.includes(i.toString())) entry.third=true; // 標記這場「成為過第三方」，跟輸贏無關
    players.push(entry);
  }
  const fullLog=jgExportGameLog();
  const cut=fullLog.indexOf('**夜晚');
  const log=cut>=0?fullLog.slice(cut):fullLog;
  const winner=jgLastWinResult.winner==='good'?'good':(jgLastWinResult.winner==='third'?'third':'evil');
  const resultText=winner==='good'?'好人陣營獲勝':(winner==='third'?'第三方獲勝':'邪惡陣營獲勝');
  const body=new URLSearchParams();
  body.append(PD_FORM_ENTRIES.id, id);
  body.append(PD_FORM_ENTRIES.date, iso);
  body.append(PD_FORM_ENTRIES.board, jgAutoGameTitle());
  body.append(PD_FORM_ENTRIES.resultText, resultText);
  body.append(PD_FORM_ENTRIES.winner, winner);
  body.append(PD_FORM_ENTRIES.time, d.toTimeString().slice(0,5));
  body.append(PD_FORM_ENTRIES.players, JSON.stringify(players));
  body.append(PD_FORM_ENTRIES.log, log);
  fetch(PD_FORM_ACTION_URL, {method:'POST', mode:'no-cors', body})
    .then(()=>alert('✅ 已送出到遊玩數據！（切到「遊玩數據」分頁重新整理就看得到）'))
    .catch(()=>alert('送出失敗，請檢查網路連線後再試一次'));
}

// ═══════════════════════════════════════════
// 排行榜排序模式：'simple'＝簡單勝率，'bayes'＝貝葉斯分數
// ═══════════════════════════════════════════
let PD_SORT_MODE='simple';
const PD_BAYES_C=5; // 信心場數常數：場次少於這個數字時，分數會明顯被拉向陣營平均值

// ═══════════════════════════════════════════
// 積分計算模式（方案A／方案B，兩種公式都已經寫好）：
// 'dynamic'＝方案A（目前預設，行為不變）：每次重新整理排行榜，都用「全站至今全部場次」
//            算出最新的好人／邪惡勝率，套用到每個玩家的全部歷史勝場上——舊場次的積分會跟著
//            全站最新勝率一起變動，不是固定值。
// 'locked' ＝方案B（尚未啟用）：每一場結算時，用「這場發生當下、只算這場之前已存在的場次」
//            算出的好人／邪惡勝率去計分，算完就存進那筆對局紀錄、以後不再回頭調整——即使
//            之後全站勝率再變，這場當初拿到的積分數字也不會變。
// 目前先維持 'dynamic'，跟改動前的行為完全一致；之後若要切換成「固定」，把這個常數改成
// 'locked' 即可（下面 pdRebuildAndRender 已經把兩種算法都算好、存在每筆 history 紀錄裡
// 的 pointsDynamic／pointsLocked 兩個欄位，切換常數不需要再改計算邏輯）。
// ═══════════════════════════════════════════
const PD_POINTS_MODE='dynamic'; // 'dynamic' | 'locked'（方案B尚未啟用，先保留註解說明，不要改這行）

// 方案B（'locked'）專用：依時間順序，算出「結算每一場的當下」全站好人／邪惡勝率快照。
// 用「這場之前」已經發生、已分出勝負的場次去算（不含這場自己）——符合「用結算當下已經
// 知道的資訊算這場的分數，算完就定案，不會因為之後的場次回頭改變」的精神。全站第一場
// 對局還沒有任何「之前」的資料可用，退回到 0.5（五五波）當作起始基準。
function pdComputeSettlementRates(){
  const sorted=[...GAMES].sort((a,b)=> a.date===b.date?0:(a.date<b.date?-1:1));
  let goodWinsSoFar=0, evilWinsSoFar=0, clearSoFar=0;
  const rateByGameId={};
  sorted.forEach(g=>{
    rateByGameId[g.id]={
      mGood: clearSoFar?goodWinsSoFar/clearSoFar:0.5,
      mEvil: clearSoFar?evilWinsSoFar/clearSoFar:0.5,
    };
    if(!g.unclear){
      clearSoFar++;
      if(g.winner==='good') goodWinsSoFar++;
      else if(g.winner==='evil') evilWinsSoFar++;
    }
  });
  return rateByGameId;
}

function pdSetSortMode(mode){
  // Bayesian Score 按鈕先隱藏／停用（見上方 HTML 註解），這裡順便擋掉，避免舊資料或殘留呼叫把排序模式切去 'bayes' 導致找不到按鈕、畫面出錯
  if(mode==='bayes') mode='simple';
  PD_SORT_MODE=mode;
  document.getElementById('pd-sort-simple').classList.toggle('active', mode==='simple');
  const bayesBtn=document.getElementById('pd-sort-bayes');
  if(bayesBtn) bayesBtn.classList.toggle('active', mode==='bayes');
  document.getElementById('pd-sort-points').classList.toggle('active', mode==='points');
  pdRebuildAndRender();
}

// 公式說明區塊的展開／收合狀態
let PD_FORMULA_OPEN=false;
function pdToggleFormula(){
  PD_FORMULA_OPEN=!PD_FORMULA_OPEN;
  pdApplyFormulaVisibility();
}
function pdApplyFormulaVisibility(){
  const box=document.getElementById('pd-formula-box');
  const toggle=document.getElementById('pd-formula-toggle');
  if(!box||!toggle) return;
  box.style.display = PD_FORMULA_OPEN ? 'block' : 'none';
  toggle.textContent = PD_FORMULA_OPEN ? '🧮 收起公式 ▴' : '🧮 點擊了解公式 ▾';
}

// 手動重新整理雲端場次（點排行榜標題旁的 🔄）
async function pdManualRefresh(){
  const el=document.querySelector('[onclick="pdManualRefresh()"]');
  const original=el?el.textContent:'';
  if(el) el.textContent='🔄 更新中…';
  const before=GAMES.length;
  await pdLoadCloudGames();
  if(el) el.textContent = GAMES.length>before ? `✅ 已更新（新增 ${GAMES.length-before} 場）` : '✅ 已是最新';
  setTimeout(()=>{ if(el) el.textContent=original||'🔄 重新整理'; }, 2500);
}

// ═══════════════════════════════════════════
// 玩家成長趨勢圖（已完整寫好，暫不呈現）
// PD_SHOW_TREND_CHART＝false 時，排行榜完全不會渲染這個區塊；等積分呈現方式（方案A／方案B）
// 確定下來，只要把這個常數改成 true，趨勢圖就會出現在每位「已進入正式排名」玩家的展開明細裡，
// 不需要再改任何其他程式碼。
// ═══════════════════════════════════════════
const PD_SHOW_TREND_CHART=false;
const PD_TREND_MIN_GAMES=3; // 場次太少畫不出有意義的線，低於這個場數就不畫圖、只顯示文字
const PD_TREND_ROLL_WINDOW=10; // 近期移動平均要看最近幾場

// 每位玩家目前選擇要看哪一種趨勢線：'rollingAvg'（近期移動平均，預設）或 'cumulative'（累積總分）
let PD_TREND_METRIC={};
function pdTrendMetricFor(name){ return PD_TREND_METRIC[name]||'rollingAvg'; }

// 每次重建排行榜時，把每個玩家依時間順序排好的「單場積分」序列存在這裡（dynamic／locked
// 兩種算法都存），供趨勢圖／之後想做的任何時間序列分析共用，不用重新掃一次 GAMES。
let PD_TREND_SERIES={};

// 把一位玩家的 history（已經在 pdRebuildAndRender 裡按時間附上 pointsDynamic／pointsLocked）
// 轉成畫圖用的序列：依日期排序，並算出累積總分、近期移動平均兩種曲線的值。
function pdBuildTrendSeries(history){
  const sorted=[...history].sort((a,b)=> a.date<b.date?-1:(a.date>b.date?1:0));
  let cumD=0, cumL=0;
  return sorted.map((h,i)=>{
    cumD+=h.pointsDynamic||0;
    cumL+=h.pointsLocked||0;
    const win=Math.max(0,i-PD_TREND_ROLL_WINDOW+1);
    const windowSlice=sorted.slice(win,i+1);
    const rollD=windowSlice.reduce((s,x)=>s+(x.pointsDynamic||0),0)/windowSlice.length;
    const rollL=windowSlice.reduce((s,x)=>s+(x.pointsLocked||0),0)/windowSlice.length;
    return {date:h.date,label:h.label,board:h.board,role:h.role,result:h.result,
      dynamic:{single:h.pointsDynamic||0,cumulative:cumD,rollingAvg:rollD},
      locked:{single:h.pointsLocked||0,cumulative:cumL,rollingAvg:rollL}};
  });
}

// 純手刻 inline SVG 折線圖，不引入外部圖表庫。metricKey：'cumulative'（累積總分，只會越來越高）
// 或 'rollingAvg'（近期移動平均，會隨表現上下波動，比較看得出「最近進步／退步」）。
// 每個資料點都是一個小圓點，滑鼠移上去（或觸控裝置長按）會用瀏覽器原生 <title> 顯示這場的
// 日期／板子／身分／勝負，點進明細不用再另外做 tooltip 元件。
function pdTrendChartSvg(series, mode, metricKey){
  const w=320, h=110, pad=20;
  if(!series.length) return '<div class="info" style="font-size:12px;">尚無足夠對局資料可繪製趨勢圖</div>';
  const vals=series.map(s=>s[mode][metricKey]);
  let minV=Math.min(0,...vals), maxV=Math.max(...vals,0.0001);
  if(minV===maxV){ minV-=0.5; maxV+=0.5; }
  const n=series.length;
  const xAt=i=> n<=1? w/2 : pad+(i/(n-1))*(w-pad*2);
  const yAt=v=> h-pad-((v-minV)/(maxV-minV))*(h-pad*2);
  const pathPts=series.map((s,i)=>xAt(i).toFixed(1)+','+yAt(s[mode][metricKey]).toFixed(1));
  const path='M'+pathPts.join(' L');
  const zeroY=yAt(0).toFixed(1);
  const dots=series.map((s,i)=>{
    const cx=xAt(i).toFixed(1), cy=yAt(s[mode][metricKey]).toFixed(1);
    const color=s.result==='win'?'var(--vil)':(s.result==='lose'?'var(--wolf)':'var(--text3)');
    const resTxt=s.result==='win'?'勝':(s.result==='lose'?'負':'和局');
    return `<circle cx="${cx}" cy="${cy}" r="3" fill="${color}" stroke="var(--bg)" stroke-width="1"><title>${pdDisplayDateShort(s.date)}・${s.board}（${s.role}）・${resTxt}</title></circle>`;
  }).join('');
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:${h}px;display:block;">
    <line x1="${pad}" y1="${zeroY}" x2="${w-pad}" y2="${zeroY}" stroke="var(--border2)" stroke-width="1" stroke-dasharray="3,3"/>
    <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2"/>
    ${dots}
  </svg>`;
}

// 趨勢圖區塊內容（切換近期平均／累積總分時，只重繪這一小塊，不重建整個排行榜，
// 展開中的明細卡片不會被收合）。
function pdRenderTrendInner(name){
  const series=PD_TREND_SERIES[name]||[];
  const metric=pdTrendMetricFor(name);
  const metricKey=metric==='cumulative'?'cumulative':'rollingAvg';
  if(series.length<PD_TREND_MIN_GAMES){
    return '<div class="info" style="font-size:12px;">場次還太少（未達 '+PD_TREND_MIN_GAMES+' 場），暫時無法繪製趨勢圖。</div>';
  }
  const btn=(key,label)=>`<button type="button" onclick="event.stopPropagation();pdSetTrendMetric('${name.replace(/'/g,"\\'")}','${key}')" style="width:auto;margin:0;padding:5px 10px;font-size:11px;${metric===key?'background:var(--accent);color:#fff;border-color:transparent;':''}">${label}</button>`;
  return `<div style="display:flex;gap:6px;margin-bottom:6px;">${btn('rollingAvg','近期移動平均（近'+PD_TREND_ROLL_WINDOW+'場）')}${btn('cumulative','累積總分')}</div>`
    +pdTrendChartSvg(series, PD_POINTS_MODE, metricKey);
}
function pdSetTrendMetric(name, metric){
  PD_TREND_METRIC[name]=metric;
  // 用 CSS.escape 找到對應的容器，只更新這一塊，避免整個排行榜重繪、把已展開的明細收合。
  document.querySelectorAll('.pd-trend-box').forEach(box=>{
    if(box.dataset.player===name) box.innerHTML=pdRenderTrendInner(name);
  });
}
// 組出一位玩家的完整趨勢圖區塊（含標題），只有「進入正式排名」的玩家才會呼叫這個函式。
function pdPlayerTrendSectionHtml(name){
  return `<div style="margin-top:10px;">
    <div style="font-size:12px;color:var(--text2);margin-bottom:4px;">📈 成長趨勢</div>
    <div class="pd-trend-box" data-player="${name.replace(/"/g,'&quot;')}">${pdRenderTrendInner(name)}</div>
  </div>`;
}

// ═══════════════════════════════════════════
// STATS + RENDER（可重複呼叫：第一次用內建歷史資料render，
// 抓到雲端新場次之後會再呼叫一次重新render）
// ═══════════════════════════════════════════
function pdRebuildAndRender(){
  GAMES.sort((a,b)=> a.date===b.date? 0 : (a.date<b.date?-1:1));

  // mGood/mEvil（方案A用，全站至今的整體勝率）跟 settlementRates（方案B用，每場結算當下的
  // 快照）都要在逐場建立玩家資料之前先算好，這樣才能在下面的迴圈裡順便幫每一筆對局紀錄
  // 算出 pointsDynamic／pointsLocked，不用另外再掃一次 GAMES。
  const clearGames=GAMES.filter(g=>!g.unclear);
  const goodWins=clearGames.filter(g=>g.winner==='good').length;
  const evilWins=clearGames.filter(g=>g.winner==='evil').length;
  const mGood=clearGames.length?goodWins/clearGames.length:0.5;
  const mEvil=clearGames.length?evilWins/clearGames.length:0.5;
  const settlementRates=pdComputeSettlementRates();

  const players={};
  function getP(name){
    if(!players[name]) players[name]={name,games:0,wins:0,unclearGames:0,thirdGames:0,thirdWins:0,points:0,pointsLockedTotal:0,totalGames:0,roleCounts:{},camp:{good:0,evil:0},campWins:{good:0,evil:0},history:[]};
    return players[name];
  }
  GAMES.forEach(g=>{
    g.players.forEach(pl=>{
      const p=getP(pl.name);
      const roleDisp=pdDisplayRole(pl.role);
      p.totalGames++;
      let result='unclear', camp=null;
      let pointsDynamic=0, pointsLocked=0;
      if(!g.unclear){
        if(pl.third){
          // 這場配成人狼鏈、成為第三方陣營一員：勝負跟著第三方走，不算進原本陣營的好人/邪惡勝率，
          // 免得該局明明是靠第三方輸贏，卻被誤記到玩家原本身分（例如狼人、平民）的陣營戰績裡。
          camp='third';
          result=(g.winner==='third')?'win':'lose';
          p.thirdGames++;
          if(result==='win'){ p.thirdWins++; pointsDynamic=2; pointsLocked=2; } // 第三方固定2分，兩種算法都一樣
        } else {
          camp=classify(roleDisp);
          result = (camp===g.winner) ? 'win':'lose';
          p.games++;
          p.camp[camp]++;
          if(result==='win'){
            p.wins++; p.campWins[camp]++;
            // 方案A：用「全站至今」的勝率算這一場（隨全站資料變動，之後 p.points 會整批重算）
            pointsDynamic = camp==='good' ? (1-mGood) : (1-mEvil);
            // 方案B：用「這場結算當下」的勝率算這一場（算完鎖定，之後不會再變）
            const sr=settlementRates[g.id]||{mGood:0.5,mEvil:0.5};
            pointsLocked = camp==='good' ? (1-sr.mGood) : (1-sr.mEvil);
          }
        }
      } else {
        p.unclearGames++;
      }
      p.pointsLockedTotal+=pointsLocked;
      // 「玩過角色」統計用收斂過的身分：不管是機械狼學到什麼、還是混血兒混到哪邊，
      // 統計格都只看角色本身、去掉括號細節，避免被拆成機械民／機械女巫／混血兒(狼混)…
      // 太細碎；每局紀錄仍然用 roleDisp，保留括號內的具體資訊。
      const roleTally=roleDisp.replace(/\(.*?\)/,'');
      p.roleCounts[roleTally]=(p.roleCounts[roleTally]||0)+1;
      p.history.push({date:g.date,label:g.id,board:g.board,role:roleDisp,result,resultText:g.resultText,pointsDynamic,pointsLocked});
    });
  });
  const boardCounts={};
  GAMES.forEach(g=>boardCounts[g.board]=(boardCounts[g.board]||0)+1);

  // 全站基礎勝率（貝葉斯分數的先驗值 m），會隨場次自動更新
  const C=PD_BAYES_C;

  Object.values(players).forEach(p=>{
    const ng=p.camp.good, wg=p.campWins.good, ne=p.camp.evil, we=p.campWins.evil;
    const scoreGood=(C*mGood+wg)/(C+ng);
    const scoreEvil=(C*mEvil+we)/(C+ne);
    p.bayesScore = p.games ? (scoreGood*ng + scoreEvil*ne)/p.games : 0;
    // ── 積分（減法版）──
    // 好人陣營每贏一場＝(1－全站好人勝率)分；邪惡陣營每贏一場＝(1－全站邪惡勝率)分；
    // 陣營勝率越低，代表那個陣營越難贏，贏一場就補越多分；第三方獲勝固定 2 分；輸／和局 0 分。
    // 目前 PD_POINTS_MODE='dynamic'，這裡維持原本方案A的算法，跟改動前完全一致；
    // p.pointsLockedTotal（方案B總分）已經在上面的迴圈裡算好、隨時可用，只是還沒有接上來顯示。
    p.points = wg*(1-mGood) + we*(1-mEvil) + p.thirdWins*2;
    // 供趨勢圖使用：把這位玩家的單場積分序列（時間排序＋累積＋移動平均）算好存起來
    PD_TREND_SERIES[p.name]=pdBuildTrendSeries(p.history);
  });

  const playerList=Object.values(players).sort((a,b)=>{
    if(PD_SORT_MODE==='bayes'){
      if(b.bayesScore!==a.bayesScore) return b.bayesScore-a.bayesScore;
      return b.games-a.games;
    }
    if(PD_SORT_MODE==='points'){
      if(b.points!==a.points) return b.points-a.points;
      return b.games-a.games;
    }
    const wa=a.games?a.wins/a.games:0, wb=b.games?b.wins/b.games:0;
    if(wb!==wa) return wb-wa;
    return b.games-a.games;
  });
  // 場次太少（少於全站總場次的十分之一）的玩家，勝率參考價值不高（一兩場全勝/全輸就能把
  // 排名衝到很前面），所以還是照樣顯示勝率跟對局紀錄，但不排進正式名次，統一放到排行榜最下面。
  const pdRankThreshold=GAMES.length/10;
  const pdRankedList=playerList.filter(p=>p.totalGames>=pdRankThreshold);
  const pdUnrankedList=playerList.filter(p=>p.totalGames<pdRankThreshold);

  // ── 總覽 ──
  document.getElementById('ov-games').textContent=GAMES.length;
  document.getElementById('ov-players').textContent=playerList.length;
  document.getElementById('ov-good').textContent=clearGames.length?Math.round(goodWins/clearGames.length*100)+'%':'–';
  document.getElementById('ov-evil').textContent=clearGames.length?Math.round(evilWins/clearGames.length*100)+'%':'–';
  document.getElementById('ov-bar-g').style.width=clearGames.length?(goodWins/clearGames.length*100)+'%':'0%';
  document.getElementById('ov-bar-e').style.width=clearGames.length?(evilWins/clearGames.length*100)+'%':'0%';

  // ── 排行榜排序方式說明 ──
  const mGoodPct=Math.round(mGood*100), mEvilPct=Math.round(mEvil*100);
  const formulaBox=document.getElementById('pd-formula-box');
  if(PD_SORT_MODE==='simple'){
    formulaBox.innerHTML=`
      <b>簡單勝率</b>：直接用「勝場 ÷ 總場數」排序。勝率相同時則場次多者排前面。
      <code>勝率 ＝ 勝場數 ／ 總場數</code>`;
  } else if(PD_SORT_MODE==='points'){
    const mGoodPctPt=Math.round(mGood*100), mEvilPctPt=Math.round(mEvil*100);
    formulaBox.innerHTML=`
      <b>積分</b>：以「累積分數」排序，使贏面較低的陣營每贏一場拿到較多分，若「成為第三方並獲勝」則額外加分。分數相同時則場次多者排前面。
      <code>好人陣營每贏一場　＝　(1 － 整體好人勝率) 分
邪惡陣營每贏一場　＝　(1 － 整體邪惡勝率) 分
第三方陣營每贏一場（人狼鏈成立且第三方獲勝）　＝　2 分
輸／和局的場次　＝　0 分</code>
      其中「整體好人／邪惡勝率」依整體 ${clearGames.length} 場自動計算（目前好人 ${mGoodPctPt}%、邪惡 ${mEvilPctPt}%）：某陣營整體勝率越低，代表越難贏，每贏一場能拿到的分數就越接近 1 分；勝率越高則越接近 0 分。這樣兩邊陣營長期下來「平均每場能拿到的分數期望值」是一樣的，不會有哪個陣營天生比較好拿分。
      注意：積分是「累積總分」，不是平均值，玩得越多、贏得越多分數自然越高，不適合拿來跟簡單勝率這種「比率」類指標直接比較高低。`;
  } else {
    formulaBox.innerHTML=`
      <b>Bayesian Score</b>：把「場次多寡」也算進去，場次太少時分數會被拉回陣營平均值，場次越多就越接近真實勝率。
      <code>好人校正勝率 ＝ (C × m好人 ＋ 好人勝場) ／ (C ＋ 好人總場)
邪惡校正勝率 ＝ (C × m邪惡 ＋ 邪惡勝場) ／ (C ＋ 邪惡總場)
Bayesian Score ＝ (好人校正勝率 × 好人場次 ＋ 邪惡校正勝率 × 邪惡場次) ／ 總場次</code>
      其中 <b>m好人</b>、<b>m邪惡</b> 是目前全站好人／邪惡陣營的整體勝率（依全站 ${clearGames.length} 場自動計算：好人 ${mGoodPct}%、邪惡 ${mEvilPct}%），<b>C＝${C}</b> 是「信心場數」，場次不到 C 場時分數會比較貼近陣營平均，分數不會被玩家那一兩場的極端結果（全勝或全輸）大幅影響。場次一旦超過 C，就會漸漸相信玩家自己的真實表現，分數也就會越來越貼近玩家真正的勝率。
      <div style="margin-top:8px;font-size:11.5px;color:var(--text3);">延伸閱讀：<a href="https://zh.soundoflife.com/blogs/experiences/movie-rating-websites" target="_blank" rel="noopener" style="color:var(--accent);">IMDb Top 250 電影榜單算法</a>。</div>`;
  }
  pdApplyFormulaVisibility();

  // ── 排行榜排名門檻說明 ──
  const thresholdNote=document.getElementById('pd-rank-threshold-note');
  if(thresholdNote){
    thresholdNote.textContent=GAMES.length>0
      ?`僅計入遊玩場數 ≥ 全站總場次 1/10（${(GAMES.length/10).toFixed(1)} 場，取整數 ${Math.ceil(GAMES.length/10)} 場以上）的玩家排名。`
      :'';
  }

  // ── 排行榜 ──
  // 場次太少的玩家勝率波動很大（例如只玩1場全勝就變100%），排到前面沒有參考意義，
  // 所以排名只計入場數達門檻的玩家；沒達到門檻的玩家還是會顯示（勝率、對局紀錄都在），
  // 只是統一放到排行榜最下面、不給正式名次，避免灌水的高勝率誤導大家。
  const pdOrderedList=[...pdRankedList, ...pdUnrankedList];
  const lb=document.getElementById('leaderboard');
  lb.innerHTML=pdOrderedList.map((p,i)=>{
    const isRanked=i<pdRankedList.length;
    const wr=p.games?Math.round(p.wins/p.games*100):0;
    const bayesPct=Math.round(p.bayesScore*100);
    const scoreLabel=PD_SORT_MODE==='bayes'?'Bayesian Score':(PD_SORT_MODE==='points'?'積分':'勝率');
    const scoreVal=PD_SORT_MODE==='points'?(Math.round(p.points*10)/10+' 分'):(p.games?(PD_SORT_MODE==='bayes'?bayesPct+'%':wr+'%'):'–');
    const topRoles=Object.entries(p.roleCounts).sort((a,b)=>b[1]-a[1])
      .map(([r,c])=>`<span class="chip">${r} ×${c}</span>`).join('');
    const histSorted=[...p.history].sort((a,b)=> a.date<b.date?1:(a.date>b.date?-1:0));
    const histHtml=histSorted.map(h=>{
      const cls=h.result==='win'?'win':(h.result==='lose'?'lose':'unclear');
      const mark=h.result==='win'?'✓':(h.result==='lose'?'✗':'－');
      const title=h.result==='unclear'?' title="不列入戰績勝率"':'';
      return `<div class="hist-item"><span class="hist-res ${cls}"${title}>${mark}</span><span class="hist-role">${h.role}</span><span>${h.board}</span><span class="hist-date">${pdDisplayDateShort(h.date)}</span></div>`;
    }).join('');
    const divider=(!isRanked&&i===pdRankedList.length)
      ?`<div class="pd-unranked-divider">⬇ 以下玩家遊玩場數未達門檻，僅供參考、不列入正式排名</div>`:'';
    return `${divider}
    <div class="row${isRanked?'':' unranked'}" onclick="pdToggleDetail(${i})">
      <div class="rank"${isRanked?'':' title="場數未達門檻，不列入排名"'}>${isRanked?(i+1):'－'}</div>
      <div class="av">${p.name.slice(0,1)}</div>
      <div class="nm-wrap">
        <div class="nm">${p.name}</div>
        <div class="nm-sub">${p.games} 場・${p.wins} 勝</div>
      </div>
      <div>
        <div class="wr">${scoreVal}</div>
        <div class="wr-sub">${scoreLabel}</div>
      </div>
      <div class="arrow" id="pd-arrow-${i}">▶</div>
    </div>
    <div class="detail" id="pd-detail-${i}">
      <div class="chip-row">
        <span class="chip good">好人 ${p.camp.good} 場・${p.camp.good?Math.round(p.campWins.good/p.camp.good*100):0}% 勝率</span>
        <span class="chip evil">邪惡 ${p.camp.evil} 場・${p.camp.evil?Math.round(p.campWins.evil/p.camp.evil*100):0}% 勝率</span>
        ${p.thirdGames?`<span class="chip third" title="人狼鏈成立、成為第三方陣營的場次；分母是「成為第三方」的總場次，跟輸贏無關">💘 第三方 ${p.thirdGames} 場・${Math.round(p.thirdWins/p.thirdGames*100)}% 勝率</span>`:''}
        ${p.unclearGames?`<span class="chip">和局 ${p.unclearGames} 場</span>`:''}
      </div>
      <div class="chip-row">${topRoles}</div>
      ${(PD_SHOW_TREND_CHART&&isRanked)?pdPlayerTrendSectionHtml(p.name):''}
      <div class="hist">${histHtml}</div>
    </div>`;
  }).join('');

  // ── 篩選器（重建選項，保留 change 監聽器） ──
  const fPlayerEl=document.getElementById('f-player');
  fPlayerEl.innerHTML='<option value="">全部玩家</option>';
  playerList.forEach(p=>{
    const o=document.createElement('option'); o.value=p.name; o.textContent=p.name; fPlayerEl.appendChild(o);
  });
  const fDateEl=document.getElementById('f-date');
  fDateEl.innerHTML='<option value="">全部日期</option>';
  [...new Set(GAMES.map(g=>g.date))].sort().reverse().forEach(d=>{
    const o=document.createElement('option'); o.value=d; o.textContent=pdDisplayDate(d); fDateEl.appendChild(o);
  });
  const fBoardEl=document.getElementById('f-board');
  fBoardEl.innerHTML='<option value="">全部板子</option>';
  [...new Set(GAMES.map(g=>g.board))].forEach(b=>{
    const o=document.createElement('option'); o.value=b; o.textContent=b; fBoardEl.appendChild(o);
  });

  pdRenderGames();
  if(typeof awardsRender==='function') awardsRender();
}

function pdToggleDetail(i){
  document.getElementById('pd-detail-'+i).classList.toggle('open');
  document.getElementById('pd-arrow-'+i).classList.toggle('open');
}

function pdRenderGames(){
  const pv=document.getElementById('f-player').value;
  const dv=document.getElementById('f-date').value;
  const bv=document.getElementById('f-board').value;
  const filtered=GAMES.filter(g=>{
    if(dv && g.date!==dv) return false;
    if(bv && g.board!==bv) return false;
    if(pv && !g.players.some(p=>p.name===pv)) return false;
    return true;
  }).sort((a,b)=> a.date<b.date?1:(a.date>b.date?-1:0));
  document.getElementById('gcount').textContent=`共 ${filtered.length} 場`;
  const list=document.getElementById('game-list');
  if(!filtered.length){ list.innerHTML='<div class="empty">沒有符合條件的場次</div>'; return; }
  list.innerHTML=filtered.map((g,i)=>{
    const badgeCls = g.unclear?'bu':(g.winner==='evil'?'bw':'bv');
    const roster=g.players.map(p=>{
      const disp=pdDisplayRole(p.role);
      const camp=g.unclear?null:classify(disp);
      const badge=g.unclear?'':`<span class="badge ${camp==='evil'?'bw':'bv'}" style="padding:2px 8px;font-size:10px;">${camp==='evil'?'邪惡':'好人'}</span>`;
      return `<tr><td>${p.num}</td><td>${p.name}</td><td>${disp}${p.role.includes('（')?'<span style="color:var(--text3);font-size:11px;"> '+p.role.match(/（(.*?)）/)[1]+'</span>':''}</td><td>${badge}</td></tr>`;
    }).join('');
    return `
    <div class="gcard" onclick="pdToggleGame(${i})">
      <div class="gcard-hd">
        <div class="gcard-title">
          <div class="gcard-board">${g.board}</div>
          <div class="gcard-meta">${pdDisplayDate(g.date)}${g.time?' '+g.time:''}・${g.id}${g.cloud?' ・☁️':''}</div>
        </div>
        <span class="badge ${badgeCls}">${g.resultText}</span>
      </div>
      <div class="gcard-body" id="pd-gbody-${i}">
        <table class="roster-table"><tbody>${roster}</tbody></table>
        <div class="log-box">${g.log}</div>
      </div>
    </div>`;
  }).join('');
}
function pdToggleGame(i){
  document.getElementById('pd-gbody-'+i).classList.toggle('open');
}
document.getElementById('f-player').addEventListener('change', pdRenderGames);
document.getElementById('f-date').addEventListener('change', pdRenderGames);
document.getElementById('f-board').addEventListener('change', pdRenderGames);

// ═══════════════════════════════════════════
// 🏆 特別獎項：自動從 GAMES（含雲端場次）逐場重新計算，
//    每次 pdRebuildAndRender() 被呼叫（開頁 / 切到遊玩數據 tab / 新場次載入）都會重跑。
//    新增場次不用改這段程式，資料對就會自動算進去。
// ═══════════════════════════════════════════

// ── 角色判斷規則（可對照雙身分板 role 用 "/" 分隔，如 "巫/王"） ──
