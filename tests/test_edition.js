const { JSDOM } = require('jsdom');
const path = require('path');

// 版本切換（js/edition.js）：預設自己人版；網址 ?edition=public 或部署設定可以切成公開版。
async function load(query){
  const dom = await JSDOM.fromFile(path.join(__dirname, '..', 'index.html'), {
    runScripts: 'dangerously', resources: 'usable', url: 'file://' + path.join(__dirname, '..') + '/index.html' + (query||'')
  });
  const { window } = dom;
  await new Promise(r=>setTimeout(r, 1200)); for(let i=0;i<150&&!(window.jgRoomRenderEntry&&window.document.readyState==='complete');i++) await new Promise(r=>setTimeout(r, 100));
  return window;
}
async function run(){
  const results = [];
  const check = (name, actual, expected)=>results.push({name, ok: JSON.stringify(actual)===JSON.stringify(expected), actual, expected});

  const w1 = await load('');
  check('預設是自己人版', w1.eval('JG_EDITION'), 'team');
  check('自己人版頁尾沒有標示', w1.document.querySelector('.site-footer span').textContent.includes('公開版'), false);
  check('自己人版功能全開', w1.eval("jgEditionHas('anything')"), true);
  check('部署設定 public → 公開版', w1.eval("jgDetectEdition('', 'public')"), 'public');
  check('網址參數優先於部署設定', w1.eval("jgDetectEdition('?edition=team', 'public')"), 'team');
  check('不認得的值當成自己人版', w1.eval("jgDetectEdition('?edition=xyz', 'abc')"), 'team');
  w1.close();

  const w2 = await load('?edition=public');
  check('網址 ?edition=public 切成公開版', w2.eval('jgIsPublicEdition()'), true);
  check('html 標上版本', w2.document.documentElement.getAttribute('data-edition'), 'public');
  check('公開版頁尾標示公開版', w2.document.querySelector('.site-footer span').textContent.includes('公開版'), true);
  w2.close();

  console.log(JSON.stringify(results.filter(r=>!r.ok), null, 2));
  if(results.some(r=>!r.ok)){ console.error('版本切換測試有失敗！'); process.exit(1); }
  console.log(`全部 ${results.length} 項版本切換測試通過`);
  process.exit(0);
}
run().catch(e=>{ console.error('FATAL', e); process.exit(1); });
