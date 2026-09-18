// 測試 js/awards.js 的 computeAwards()——這個檔案本身是純邏輯（不碰 DOM／Firestore），
// 直接把它讀進 Node context、塞一份假的 GAMES 資料進去跑就可以測，不需要額外的 stub。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadAwards(GAMES){
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'awards.js'), 'utf8');
  const sandbox = { GAMES, console };
  vm.createContext(sandbox);
  vm.runInContext(src + '\nthis.computeAwards = computeAwards;', sandbox);
  return sandbox.computeAwards;
}

function run(){
  const results=[];
  const check=(name, actual, expected)=>{
    const ok = JSON.stringify(actual)===JSON.stringify(expected);
    results.push({name, ok, actual, expected});
  };

  // ── 自刀專家：狼隊首夜刀了自己隊友，且女巫真的救了那個目標（代表「自刀騙解藥」這招
  //    真的成功騙到女巫出手），同局所有見面狼隊友都該算一次；如果女巫沒有救（沒被騙到），
  //    就不該算。這場戲設定：1號狼人、2號黑狼王、3號白狼王 是狼隊，首夜刀了2號（自己
  //    隊友），女巫也救了2號，3人都應該各算一次。──
  const gameSelfKill = {
    id: 'g1',
    players: [
      { num:1, name:'甲', role:'狼人' },
      { num:2, name:'乙', role:'黑狼王' },
      { num:3, name:'丙', role:'白狼王' },
      { num:4, name:'丁', role:'平民' },
    ],
    log: '**夜晚1st\n--刀 2\n--救 2\n**白天1st\n>平安夜',
  };
  {
    const computeAwards = loadAwards([gameSelfKill]);
    const awards = computeAwards();
    const selfKillAward = awards.find(a=>a.title==='自刀專家');
    const namesCredited = (selfKillAward.top[0]||{}).name || '';
    check('自刀專家：女巫真的救到自刀目標時，同局三位見面狼隊友都算到（甲/乙/丙）',
      ['甲','乙','丙'].every(n=>namesCredited.includes(n)), true);
    check('自刀專家：沒見面的平民不算', namesCredited.includes('丁'), false);
  }

  // ── 自刀專家：狼隊自刀了隊友，但女巫沒有救（沒被騙到）——這種情況不該算，因為「騙解藥」
  //    這個策略沒有成功。──
  const gameSelfKillNotSaved = {
    id: 'g1b',
    players: [
      { num:1, name:'甲2', role:'狼人' },
      { num:2, name:'乙2', role:'黑狼王' },
    ],
    log: '**夜晚1st\n--刀 2\n--救 x\n**白天1st\n>2號死亡',
  };
  {
    const computeAwards = loadAwards([gameSelfKillNotSaved]);
    const awards = computeAwards();
    const selfKillAward = awards.find(a=>a.title==='自刀專家');
    check('自刀專家：自刀了但女巫沒救，不算', (selfKillAward.top[0]||{}).count, undefined);
  }

  // ── 查狼專家：魔術師換牌後，紀錄的號碼是查驗者原本點的號碼、但陣營結果是換牌後真正
  //    生效的對象——「驗 4→7(狼)」代表預言家原本要驗4號，實際生效對象是7號，結果是狼。
  //    4號其實是平民，7號才是真正的狼；如果程式碼只看號碼回頭查最終角色，會查到4號（平民）
  //    得出「沒查到狼」的錯誤結論；正確做法應該直接信任紀錄裡寫的 (狼) 這個結果。──
  const gameSwap = {
    id: 'g2',
    players: [
      { num:1, name:'預言家甲', role:'預言家' },
      { num:4, name:'平民丁', role:'平民' },
      { num:7, name:'狼人戊', role:'狼人' },
    ],
    log: '**夜晚1st\n--換 4-7\n--驗 4→7(狼)\n**白天1st\n>平安夜',
  };
  {
    const computeAwards = loadAwards([gameSwap]);
    const awards = computeAwards();
    const seerAward = awards.find(a=>a.title==='查狼專家');
    check('查狼專家：換牌後直接信任紀錄裡的(狼)標註，正確算到1次',
      (seerAward.top[0]||{}).count, 1);
  }

  // ── 查狼專家：機械狼還沒學到技能時，通靈師查到會顯示「(機)」這個縮寫，應該算查到狼；
  //    學到女巫技能後顯示「(巫)」，不應該再算。──
  const gameMechwolf = {
    id: 'g3',
    players: [
      { num:1, name:'通靈師甲', role:'通靈師' },
      { num:5, name:'機械狼乙', role:'機械狼' },
      { num:6, name:'機械狼丙(已學女巫)', role:'機械狼' },
    ],
    log: '**夜晚1st\n--通驗 5(機)\n**夜晚2nd\n--通驗 6(巫)\n**白天2nd\n>平安夜',
  };
  {
    const computeAwards = loadAwards([gameMechwolf]);
    const awards = computeAwards();
    const seerAward = awards.find(a=>a.title==='查狼專家');
    check('查狼專家：查到還沒學技能的機械狼(機)算1次，學到女巫技能的(巫)不算',
      (seerAward.top[0]||{}).count, 1);
  }

  // ── 舊資料相容性：如果紀錄裡沒有標註文字（舊格式，例如只有「驗 4」沒有 (狼)/(好)），
  //    要退回用目標號碼查玩家最終角色這個舊邏輯，不能整個壞掉。──
  const gameOldFormat = {
    id: 'g4',
    players: [
      { num:1, name:'預言家甲', role:'預言家' },
      { num:2, name:'狼人乙', role:'狼人' },
    ],
    log: '**夜晚1st\n--驗 2\n**白天1st\n>平安夜',
  };
  {
    const computeAwards = loadAwards([gameOldFormat]);
    const awards = computeAwards();
    const seerAward = awards.find(a=>a.title==='查狼專家');
    check('查狼專家：舊格式（沒有標註文字）退回用最終角色判斷，仍然算到1次',
      (seerAward.top[0]||{}).count, 1);
  }

  // ── 自刀專家：同一局如果連續好幾晚都符合條件（女巫救到自刀目標），只應該算一次，不是
  //    每晚都疊加。──
  const gameSelfKillMultiNight = {
    id: 'g1c',
    players: [
      { num:1, name:'甲3', role:'狼人' },
      { num:2, name:'乙3', role:'黑狼王' },
    ],
    log: '**夜晚1st\n--刀 2\n--救 2\n**白天1st\n>平安夜\n**夜晚2nd\n--刀 1\n--救 1\n**白天2nd\n>平安夜',
  };
  {
    const computeAwards = loadAwards([gameSelfKillMultiNight]);
    const awards = computeAwards();
    const selfKillAward = awards.find(a=>a.title==='自刀專家');
    check('自刀專家：同一局符合條件好幾晚也只算一次（不是疊加）',
      (selfKillAward.top[0]||{}).count, 1);
  }

  // ── 超會獵魔人：獵魔人狩獵的對象是狼隊，算一次；狩到好人不算 ──
  const gameDemonhunter = {
    id: 'g5',
    players: [
      { num:1, name:'獵魔人甲', role:'獵魔人' },
      { num:2, name:'狼人乙', role:'狼人' },
      { num:3, name:'平民丙', role:'平民' },
    ],
    log: '**夜晚1st\n--狩 2\n**白天1st\n>平安夜\n**夜晚2nd\n--狩 3\n**白天2nd\n>平安夜',
  };
  {
    const computeAwards = loadAwards([gameDemonhunter]);
    const awards = computeAwards();
    const dhAward = awards.find(a=>a.title==='超會獵魔人');
    check('超會獵魔人：狩到狼人算1次（狩到平民那次不算）', (dhAward.top[0]||{}).count, 1);
    check('超會獵魔人：正確算到獵魔人甲', (dhAward.top[0]||{}).name, '獵魔人甲');
  }

  console.log(JSON.stringify(results, null, 2));
  const anyFail = results.some(r=>!r.ok);
  if(anyFail){ console.error('特別獎項測試有失敗！'); process.exit(1); }
  console.log(`全部 ${results.length} 項特別獎項測試通過`);
}

run();
