const { JSDOM, VirtualConsole } = require('jsdom');
const path = require('path');

async function run(){
  const virtualConsole = new VirtualConsole();
  const dom = await JSDOM.fromFile(path.join(__dirname, '..', 'index.html'), {
    runScripts: 'dangerously',
    resources: 'usable',
    url: 'file://' + path.join(__dirname, '..') + '/',
    virtualConsole
  });
  const { window } = dom;
  window.Element.prototype.scrollTo = window.Element.prototype.scrollTo || function(){};
  window.Element.prototype.scrollIntoView = window.Element.prototype.scrollIntoView || function(){};
  window.HTMLElement.prototype.scrollTo = window.HTMLElement.prototype.scrollTo || function(){};
  await new Promise(r=>setTimeout(r, 1200));

  const results = [];
  const check = (name, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    results.push({ name, ok, actual, expected });
  };

  const navBtns = window.document.getElementById('nav-btns');
  check('一開始選單是收起的（沒有 open class）', navBtns.classList.contains('open'), false);
  window.eval('toggleNavMenu()');
  check('點擊漢堡按鈕後選單展開', navBtns.classList.contains('open'), true);
  window.eval('toggleNavMenu()');
  check('再點一次會收合', navBtns.classList.contains('open'), false);
  window.eval('toggleNavMenu()');
  check('展開之後...', navBtns.classList.contains('open'), true);
  window.eval("switchTab('t-rules')");
  check('...切換分頁後選單會自動收合', navBtns.classList.contains('open'), false);
  check('切換分頁後，對應按鈕變成 active', window.document.querySelector('.nav-btn[onclick*="t-rules"]').classList.contains('active'), true);

  console.log(JSON.stringify(results, null, 2));
  const anyFail = results.some(r => !r.ok);
  process.exit(anyFail ? 1 : 0);
}
run().catch(e => { console.error('FATAL', e); process.exit(1); });
