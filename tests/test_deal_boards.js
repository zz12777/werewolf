const { JSDOM } = require('jsdom');
const path = require('path');

async function run(){
  const dom = await JSDOM.fromFile(path.join(__dirname, '..', 'index.html'), {
    runScripts: 'dangerously',
    resources: 'usable',
    url: 'file://' + path.join(__dirname, '..') + '/'
  });
  const { window } = dom;

  await new Promise(r=>setTimeout(r, 1200));

  // jsdom 沒有實作 scrollTo/scrollIntoView，補假函式避免畫面切換時噴錯
  window.Element.prototype.scrollTo = window.Element.prototype.scrollTo || function(){};
  window.Element.prototype.scrollIntoView = window.Element.prototype.scrollIntoView || function(){};
  window.HTMLElement.prototype.scrollTo = window.HTMLElement.prototype.scrollTo || function(){};

  const results = [];

  function testBoard(name, comp, total){
    try{
      const seatRoleMap = {};
      const pool = [];
      Object.entries(comp).forEach(([r,n])=>{ for(let i=0;i<n;i++) pool.push(r); });
      pool.forEach((r,i)=>{ seatRoleMap[i+1]=r; });
      window.__seatRoleMap = seatRoleMap; window.__comp = comp; window.__total = total;
      window.eval('jgApplyDealtRoles(window.__seatRoleMap, window.__comp, window.__total)');
      const step = window.eval('jgCurrentStep');
      const players = window.eval('jgPlayers');
      const playersOk = players.length===total && players.every(p=>p.role);
      results.push({name, ok:true, step, playersOk, roles: players.map(p=>p.role).join(',')});
    }catch(e){
      results.push({name, ok:false, error: e.stack || e.message});
    }
  }

  // 殭屍板：wolfking:1, seer:1, witch:1, hunter:1, zombie:1 + 補滿狼人/平民到 8 人
  testBoard('殭屍板(8人)', {wolfking:1, seer:1, witch:1, hunter:1, zombie:1, wolf:1, villager:2}, 8);

  // 詭術之境板：trickster:1, seer:1, witch:1, trickmage:1, sequenceprince:1 + 補滿到 8 人
  testBoard('詭術之境板(8人)', {trickster:1, seer:1, witch:1, trickmage:1, sequenceprince:1, wolf:1, villager:2}, 8);

  // 大灰狼+占卜師板：biggreywolf:1, diviner:1, seer:1, witch:1, hunter:1 + 補滿到 8 人
  testBoard('大灰狼占卜師板(8人)', {biggreywolf:1, diviner:1, seer:1, witch:1, hunter:1, wolf:1, villager:2}, 8);

  console.log(JSON.stringify(results, null, 2));

  const anyFail = results.some(r=>!r.ok || !r.playersOk);
  process.exit(anyFail?1:0);
}

run().catch(e=>{ console.error('FATAL', e); process.exit(1); });
