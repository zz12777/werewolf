const { JSDOM } = require('jsdom');
const path = require('path');

// 新手導覽／演練（js/tour.js）：公開版第一次打開法官の助手會問要不要看導覽；
// 演練照劇本只按被框起來的按鈕，要能從設定一路走到好人勝利；其他按鈕按了不會有反應。
async function load(query){
  const dom = await JSDOM.fromFile(path.join(__dirname, '..', 'index.html'), {
    runScripts: 'dangerously', resources: 'usable', url: 'file://' + path.join(__dirname, '..') + '/index.html' + (query||'')
  });
  const { window } = dom;
  await new Promise(r=>setTimeout(r, 1200)); for(let i=0;i<150&&!(window.jgRoomRenderEntry&&window.document.readyState==='complete');i++) await new Promise(r=>setTimeout(r, 100));
  window.alert = ()=>{}; window.confirm = ()=>true;
  window.scrollTo = ()=>{}; window.Element.prototype.scrollIntoView = function(){}; window.Element.prototype.scrollTo = function(){};
  window.fetch = ()=>Promise.resolve({ok:false, text:()=>Promise.resolve('')});
  return window;
}
const wait = ms=>new Promise(r=>setTimeout(r, ms));
async function run(){
  const results = [];
  const check = (name, actual, expected)=>results.push({name, ok: JSON.stringify(actual)===JSON.stringify(expected), actual, expected});

  const w = await load('?edition=public');
  const d = w.document;
  const panel = ()=>{ const e=d.getElementById('jg-tour'); return e?e.textContent:''; };
  try{ w.localStorage.removeItem('jgTourSeen'); }catch(e){}
  w.eval("switchTab('t-judge')"); await wait(500);
  check('公開版第一次打開法官の助手會問要不要看導覽', panel().includes('第一次使用法官の助手嗎'), true);

  // 導覽：三步，框出基本設定、選擇板子、開始主持
  w.eval('jgTourStart()'); await wait(50);
  const hlIs = cls=>{ const h=d.querySelector('.tour-hl'); return !!h&&h.classList.contains(cls); };
  check('導覽第 1 步框出遊戲基本設定', hlIs('jg-sec-basic'), true);
  w.eval('jgTourNext()'); await wait(50);
  check('導覽第 2 步框出選擇板子', hlIs('jg-sec-board'), true);
  w.eval('jgTourNext()'); await wait(50);
  check('導覽第 3 步框出開始主持', hlIs('jg-start-btn'), true);
  check('導覽最後可以接著演練', panel().includes('演練一場'), true);

  // 演練：只按框起來的按鈕，一路走到結束
  w.eval('jgTourStartPractice()'); await wait(50);
  check('演練設定成 6 人', d.getElementById('jg-count').value, '6');
  check('演練用基本板', w.eval('jgBoardPreset'), 'custom');
  let blockedChecked=false, steps=0;
  for(let i=0;i<120;i++){
    w.eval('jgTourTick()');
    const t=panel();
    if(process.env.TOUR_DEBUG) console.log(i, w.eval('jgCurrentStep'), t.slice(0,40), (d.querySelector('.tour-hl')||{}).outerHTML?.slice(0,80));
    if(t.startsWith('演練完成')) break;
    const endModal=d.querySelector('#jg-judge-end-modal button');
    if(endModal){ endModal.click(); await wait(50); continue; }
    if(!blockedChecked&&w.eval('jgCurrentStep')==='wolf-wake'){
      const save=d.querySelector('#jg-content [onclick="jgSaveWolf()"]');
      save.dispatchEvent(new w.MouseEvent('click', {bubbles:true, cancelable:true}));
      check('演練中按沒有框起來的按鈕不會有反應', w.eval('jgCurrentStep'), 'wolf-wake');
      blockedChecked=true;
    }
    const hl=d.querySelector('.tour-hl');
    if(!hl){ await wait(300); continue; }
    hl.dispatchEvent(new w.MouseEvent('click', {bubbles:true, cancelable:true}));
    steps++;
    await wait(w.eval('jgCurrentStep')==='discuss'?400:30);
  }
  check('演練走到最後顯示演練完成', panel().startsWith('演練完成'), true);
  check('演練結果是好人勝利', !!w.eval('jgLastWinResult')&&w.eval("jgAlive().filter(p=>p.role==='wolf').length"), 0);
  check('演練中有標記 jgTourPractice（不送出任何資料）', w.eval('window.jgTourPractice'), true);
  w.eval('jgTourFinishPractice()');
  check('結束演練回到設定頁、面板關掉', d.getElementById('jg-p-setup').classList.contains('on')&&!d.getElementById('jg-tour'), true);
  check('結束演練後不再是演練模式', w.eval('window.jgTourPractice'), false);
  w.eval("switchTab('t-rules'); switchTab('t-judge')"); await wait(500);
  check('看過之後不再自動跳出', !!d.getElementById('jg-tour'), false);
  w.close();

  const w2 = await load('');
  try{ w2.localStorage.removeItem('jgTourSeen'); }catch(e){}
  w2.eval("switchTab('t-judge')"); await wait(500);
  check('自己人版不會自動跳出導覽', !!w2.document.getElementById('jg-tour'), false);
  check('自己人版設定頁有導覽／演練按鈕', !!w2.document.querySelector('.jg-tour-open'), true);
  w2.close();

  console.log(JSON.stringify(results.filter(r=>!r.ok), null, 2));
  if(results.some(r=>!r.ok)){ console.error('新手導覽測試有失敗！'); process.exit(1); }
  console.log(`全部 ${results.length} 項新手導覽測試通過（演練共按了 ${steps} 下）`);
  process.exit(0);
}
run().catch(e=>{ console.error('FATAL', e); process.exit(1); });
