// 一次跑完 tests/ 底下所有 test_*.js。
// 每個測試檔各自用獨立的 node 行程執行，任何一個失敗（結束碼不是 0）整體就算失敗。
// 每個檔案最多跑 120 秒，超過就當作卡住、算失敗，避免 CI 一直掛著。
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const files = fs.readdirSync(dir).filter(f => /^test_.*\.js$/.test(f)).sort();
const failed = [];
for (const f of files) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(dir, f)], { encoding: 'utf8', timeout: 120000 });
  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  const ok = r.status === 0;
  const lastLine = ((r.stdout || '').trim().split('\n').pop() || '').slice(0, 120);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${f}  (${sec}s)  ${ok ? lastLine : ''}`);
  if (!ok) {
    failed.push(f);
    if (r.error && r.error.code === 'ETIMEDOUT') console.log('  逾時：超過 120 秒沒有結束');
    console.log((r.stdout || '').split('\n').slice(-40).join('\n'));
    console.log(r.stderr || '');
  }
}
console.log(failed.length ? `\n${failed.length} 個測試檔失敗：${failed.join('、')}` : `\n全部 ${files.length} 個測試檔通過`);
process.exit(failed.length ? 1 : 0);
