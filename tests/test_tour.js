const { JSDOM } = require('jsdom');
const path = require('path');

// 法官助手導覽（js/tour.js）：公開版第一次打開法官の助手會問要不要看導覽；
// 照劇本只按被框起來的按鈕，要能從設定、輸入名單一路走到好人勝利、匯出紀錄；其他按鈕按了不會有反應。
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
  check('公開版第一次打開法官の助手會問要不要看導覽', panel().includes('要看法官助手導覽嗎'), true);

  // 導覽：只按框起來的按鈕（或面板上的按鈕），一路走到結束
  w.eval('jgTourStartPractice()'); await wait(50);
  check('導覽設定成 6 人', d.getElementById('jg-count').value, '6');
  check('導覽用基本板', w.eval('jgBoardPreset'), 'custom');
  const hlIs = cls=>{ const h=d.querySelector('.tour-hl'); return !!h&&h.classList.contains(cls); };
  check('導覽第 1 步框出遊戲基本設定', hlIs('jg-sec-basic'), true);
  const seen={};
  let blockedChecked=false, steps=0;
  for(let i=0;i<160;i++){
    w.eval('jgTourTick()');
    const t=panel();
    if(process.env.TOUR_DEBUG) console.log(i, w.eval('jgCurrentStep'), t.slice(0,40), (d.querySelector('.tour-hl')||{}).outerHTML?.slice(0,80));
    if(t.startsWith('導覽完成')) break;
    const endModal=d.querySelector('#jg-judge-end-modal button');
    if(endModal){ endModal.click(); await wait(50); continue; }
    if(!blockedChecked&&w.eval('jgCurrentStep')==='wolf-wake'&&w.eval('jgTourInGame()')){
      const save=d.querySelector('#jg-content [onclick="jgSaveWolf()"]');
      save.dispatchEvent(new w.MouseEvent('click', {bubbles:true, cancelable:true}));
      check('導覽中按沒有框起來的按鈕不會有反應', w.eval('jgCurrentStep'), 'wolf-wake');
      blockedChecked=true;
    }
    // 面板上的按鈕（下一步、看大字報範例）
    const panelBtn=[...d.querySelectorAll('#jg-tour button.primary')][0];
    if(panelBtn){ if(t.includes('大字報')) seen.bigcardBtn=true; if(t.includes('記在這台裝置')) seen.rosterNote=true; panelBtn.click(); steps++; await wait(30); continue; }
    const hl=d.querySelector('.tour-hl');
    if(!hl){ await wait(300); continue; }
    if(hl.id==='jg-roster-manual-row'){
      seen.roster=true;
      d.getElementById('jg-roster-manual-input').value='小明';
      hl.querySelector('button').dispatchEvent(new w.MouseEvent('click', {bubbles:true, cancelable:true}));
    } else {
      if(d.getElementById('jg-bigcard-modal')&&w.eval('jgCurrentStep')==='seer-wake') seen.bigcard=true;
      hl.dispatchEvent(new w.MouseEvent('click', {bubbles:true, cancelable:true}));
    }
    steps++;
    await wait(w.eval('jgCurrentStep')==='discuss'?400:30);
  }
  check('導覽有帶輸入玩家名單', !!seen.roster&&!!seen.rosterNote, true);
  check('輸入的名字有填進 1 號', w.eval('jgPlayers[0].name'), '小明');
  check('導覽有示範大字報', !!seen.bigcardBtn&&!!seen.bigcard, true);
  check('導覽走到最後顯示導覽完成', panel().startsWith('導覽完成'), true);
  check('導覽完成提到遊玩數據範例（公開版）', panel().includes('遊玩數據'), true);
  check('導覽最後有帶匯出並複製文字紀錄', w.eval('(window.jgExportCopiedAt||0)>0')&&!d.getElementById('jg-export-modal'), true);
  check('導覽結果是好人勝利', !!w.eval('jgLastWinResult')&&w.eval("jgAlive().filter(p=>p.role==='wolf').length"), 0);
  check('導覽中有標記 jgTourPractice（不送出任何資料）', w.eval('window.jgTourPractice'), true);
  w.eval('jgTourFinishPractice()');
  check('結束導覽回到設定頁、面板關掉', d.getElementById('jg-p-setup').classList.contains('on')&&!d.getElementById('jg-tour'), true);
  check('結束導覽後不再是導覽模式', w.eval('window.jgTourPractice'), false);
  w.eval("switchTab('t-rules'); switchTab('t-judge')"); await wait(500);
  check('看過之後不再自動跳出', !!d.getElementById('jg-tour'), false);
  w.close();

  const w2 = await load('');
  try{ w2.localStorage.removeItem('jgTourSeen'); }catch(e){}
  w2.eval("switchTab('t-judge')"); await wait(500);
  check('自己人版不會自動跳出導覽', !!w2.document.getElementById('jg-tour'), false);
  check('自己人版設定頁有法官助手導覽按鈕', !!w2.document.querySelector('.jg-tour-open'), true);
  w2.close();

  console.log(JSON.stringify(results.filter(r=>!r.ok), null, 2));
  if(results.some(r=>!r.ok)){ console.error('新手導覽測試有失敗！'); process.exit(1); }
  console.log(`全部 ${results.length} 項新手導覽測試通過（導覽共按了 ${steps} 下）`);
  process.exit(0);
}
run().catch(e=>{ console.error('FATAL', e); process.exit(1); });
