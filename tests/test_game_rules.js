// js/game-rules.js：法官助手跟連線房間共用的勝負規則，直接用純資料（局面物件）測試。
const fs = require('fs');
const path = require('path');

// 角色清單照抄 rules-ui.js（game-rules.js 執行時才去讀這兩個全域變數）。
const rulesUi = fs.readFileSync(path.join(__dirname, '..', 'js', 'rules-ui.js'), 'utf8');
global.WOLF_ROLES = eval(rulesUi.match(/^const WOLF_ROLES\s*=\s*(\[.*\]);/m)[1]);
global.GOD_ROLES = eval(rulesUi.match(/^const GOD_ROLES\s*=\s*(\[.*\]);/m)[1]);
const R = require('../js/game-rules.js');

// roles: ['wolf','seer',...]；dead: 死亡的座位號碼；extra: 每個座位額外的欄位
function st(roles, dead, extra, more) {
  const players = roles.map((role, i) => Object.assign({ id: String(i + 1), role, alive: !(dead || []).includes(i + 1) }, (extra || {})[i + 1] || {}));
  const comp = {}; roles.forEach(r => { comp[r] = (comp[r] || 0) + 1; });
  return Object.assign({ players, comp, lovers: null }, more || {});
}
const W = r => r && r.winner || null;

const results = [];
const check = (name, actual, expected) => results.push({ name, ok: JSON.stringify(actual) === JSON.stringify(expected), actual, expected });

// 基本
check('狼全滅：好人獲勝', W(R.checkWin(st(['wolf', 'seer', 'villager'], [1]))), 'good');
check('屠民：狼人獲勝', W(R.checkWin(st(['wolf', 'wolf', 'seer', 'villager', 'hunter', 'villager'], [4, 6]))), 'wolf');
check('屠神：狼人獲勝', W(R.checkWin(st(['wolf', 'wolf', 'seer', 'villager', 'hunter', 'villager'], [3, 5]))), 'wolf');
check('混血兒算平民：平民死光但混血兒活著不算屠民', R.checkWin(st(['wolf', 'wolf', 'seer', 'villager', 'hybrid', 'hunter', 'villager'], [4, 7])), null);
check('人數打平、沒有翻盤手段：狼人獲勝', W(R.checkWin(st(['wolf', 'wolf', 'seer', 'villager', 'guard', 'villager'], [3, 4]))), 'wolf');
// 翻盤手段：人數打平不算
check('女巫還有藥：打平不算', R.checkWin(st(['wolf', 'wolf', 'witch', 'villager', 'seer', 'villager'], [4, 5])), null);
check('女巫藥都用完：打平算狼贏', W(R.checkWin(st(['wolf', 'wolf', 'witch', 'villager', 'seer', 'villager'], [4, 5], { 3: { witchSaveUsed: true, witchPoisonUsed: true } }))), 'wolf');
check('獵魔人活著：打平不算', R.checkWin(st(['wolf', 'wolf', 'demonhunter', 'villager', 'seer', 'villager'], [4, 5])), null);
check('騎士還沒決鬥：打平不算', R.checkWin(st(['wolf', 'wolf', 'knight', 'villager', 'seer', 'villager'], [4, 5])), null);
check('騎士已經決鬥：打平算狼贏', W(R.checkWin(st(['wolf', 'wolf', 'knight', 'villager', 'seer', 'villager'], [4, 5], { 3: { knightDuelUsed: true } }))), 'wolf');
check('幸運兒握著女巫毒藥：2 狼 2 好人不算', R.checkWin(st(['wolf', 'wolf', 'seer', 'villager', 'hunter', 'villager', 'guard'], [5, 6, 3], { 4: { luckyWitchUnused: true } })), null);
// 板子特例
check('機械狼板：人數達標也不算，要屠邊', R.checkWin(st(['wolf', 'mechanicalwolf', 'seer', 'villager', 'medium', 'villager'], [3, 4])), null);
check('魔術師板：打平不算', R.checkWin(st(['wolf', 'wolf', 'magician', 'villager', 'seer', 'villager'], [4, 5])), null);
check('魔術師板：狼嚴格多於才算', W(R.checkWin(st(['wolf', 'wolf', 'magician', 'villager', 'seer', 'villager', 'villager'], [4, 5, 3, 7]))), 'wolf');
check('風聲諜影：只看屠神', W(R.checkWin(st(['awgargoyle', 'seer', 'witch', 'hybrid'], [2, 3], null, { windspy: true }))), 'wolf');
check('風聲諜影：人數達標不算', R.checkWin(st(['awgargoyle', 'awgargoyle', 'seer', 'hybrid'], [4], null, { windspy: true })), null);
check('風聲諜影：混血兒混到轉化者算狼', R.isWolfForWin(st(['awgargoyle', 'seer', 'hybrid'], [], { 2: { converted: true } }, { windspy: true, hybridTarget: '2' }), { id: '3', role: 'hybrid', alive: true }), true);
check('傻瓜不追刀：屠神不用殺傻瓜', W(R.checkWin(st(['wolf', 'seer', 'fool', 'villager'], [2]))), 'wolf');
check('傻瓜要追刀：傻瓜也要殺', R.checkWin(st(['wolf', 'seer', 'fool', 'villager', 'villager'], [2], null, { foolChase: true })), null);
// 第三方
check('人狼鏈：第三方三人活著、其餘全滅 → 第三方獲勝', W(R.checkWin(st(['wolf', 'villager', 'cupid', 'seer', 'wolf', 'villager'], [4, 5, 6], null, { lovers: ['1', '2'] }))), 'third');
check('人狼鏈：第三方還在，狼人不能提前獲勝', R.checkWin(st(['wolf', 'villager', 'cupid', 'seer', 'wolf', 'villager', 'hunter'], [4], null, { lovers: ['1', '2'] })), null);
check('狼狼鏈：邱比特算狼', R.isWolfForWin(st(['wolf', 'wolf', 'cupid'], [], null, { lovers: ['1', '2'] }), { id: '3', role: 'cupid', alive: true }), true);
check('殭屍：其餘存活全部感染 → 殭屍獲勝', W(R.checkWin(st(['zombie', 'wolf', 'seer'], [], { 2: { infected: true }, 3: { infected: true } }))), 'third');
// 狼刀在先
check('狼刀在先：狼刀屠民＋同晚毒死最後一狼 → 狼人獲勝', W(R.wolfFirstWin(st(['wolf', 'witch', 'villager'], [1, 3]), ['1'])), 'wolf');
check('狼刀在先：只是人數達標 → 不算', R.wolfFirstWin(st(['wolf', 'wolf', 'witch', 'villager', 'hunter'], [1, 5], { 3: { witchSaveUsed: true, witchPoisonUsed: true } }), ['1']), null);
// 進入黑夜前就確定
check('進入黑夜前：一狼一獵人一民 → 狼人獲勝', W(R.guaranteedNightWin(st(['wolf', 'hunter', 'villager', 'villager'], [4]))), 'wolf');
check('進入黑夜前：女巫還有解藥 → 不判', R.guaranteedNightWin(st(['wolf', 'witch', 'villager', 'villager'], [4])), null);
check('進入黑夜前：女巫只剩毒藥 → 狼人獲勝', W(R.guaranteedNightWin(st(['wolf', 'witch', 'villager', 'villager'], [4], { 2: { witchSaveUsed: true } }))), 'wolf');
check('進入黑夜前：有守衛 → 不判', R.guaranteedNightWin(st(['wolf', 'guard', 'villager', 'villager'], [4])), null);
check('進入黑夜前：傀儡守衛不算', W(R.guaranteedNightWin(st(['wolf', 'guard', 'villager', 'villager'], [4], { 2: { puppet: true } }))), 'wolf');
check('進入黑夜前：白貓被刀不會死 → 不判', R.guaranteedNightWin(st(['wolf', 'whitecat', 'villager', 'villager'], [4], { 2: { knifeImmune: true } })), null);
check('進入黑夜前：有毒的女巫＋刀完只是人數達標 → 不判', R.guaranteedNightWin(st(['wolf', 'wolf', 'wolf', 'wolf', 'witch', 'seer', 'villager', 'villager'], [], { 5: { witchSaveUsed: true } })), null);
check('進入黑夜前：沒有毒＋刀完人數達標 → 狼人獲勝', W(R.guaranteedNightWin(st(['wolf', 'wolf', 'wolf', 'wolf', 'hunter', 'seer', 'villager', 'villager'], []))), 'wolf');
check('進入黑夜前：女巫只剩毒藥＋刀完都屠邊 → 狼人獲勝', W(R.guaranteedNightWin(st(['wolf', 'wolf', 'witch', 'villager', 'villager', 'hunter', 'seer'], [6, 7, 5], { 3: { witchSaveUsed: true } }))), 'wolf');
check('進入黑夜前：雙身分不判', R.guaranteedNightWin(st(['wolf', 'hunter', 'villager'], [], null, { dualMode: true })), null);
check('進入黑夜前：殭屍活著不判', R.guaranteedNightWin(st(['wolf', 'hunter', 'villager', 'zombie'], [])), null);

console.log(JSON.stringify(results.filter(r => !r.ok), null, 2));
const anyFail = results.some(r => !r.ok);
if (anyFail) { console.error('共用勝負規則測試有失敗！'); process.exit(1); }
console.log(`全部 ${results.length} 項共用勝負規則測試通過`);
process.exit(0);
