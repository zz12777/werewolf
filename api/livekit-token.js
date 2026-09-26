// ═══════════════════════════════════════════
// api/livekit-token.js
// Vercel Serverless Function：簽發 LiveKit 房間的加入權杖（token）。
//
// 為什麼要有這支獨立的伺服器端函式：LiveKit 需要用 API Key + API Secret 簽一組短效期
// JWT，玩家的瀏覽器才能連進語音房間；這兩把金鑰絕對不能放進前端 JS 或 GitHub（放進去
// 等於公開金鑰，任何人都能拿去冒用你的 LiveKit 專案額度）。這支函式跑在 Vercel 的伺服器
// 端，金鑰只存在 Vercel 的環境變數裡，前端只拿得到簽好的 token，拿不到金鑰本身。
//
// 部署方式：把整個 repo 匯入 Vercel（vercel.com → Add New → Project → 選這個 GitHub
// repo），Vercel 會自動把 /api 資料夾底下的檔案變成 API 路由，不用另外寫設定檔。
// 部署後到 Vercel 專案的 Settings → Environment Variables 加三個變數：
//   LIVEKIT_API_KEY    ← LiveKit Cloud 專案的 API Key
//   LIVEKIT_API_SECRET ← LiveKit Cloud 專案的 API Secret
//   LIVEKIT_WS_URL     ← LiveKit Cloud 專案的 WebSocket URL（wss://xxx.livekit.cloud）
// 這三個值只填在 Vercel 後台，不要寫進任何程式碼或 commit 進 GitHub。
//
// 信任模型：跟這個 app 其餘連線房間功能一致——「知道房號」本身就是信任邊界（房號本身就
// 像一把鑰匙，全房間的人本來就互相看得到彼此的座位/名字），這支函式不另外驗證呼叫者是
// 誰，只要給房號、身分 id、顯示名稱就發 token。這不是疏漏，是刻意跟現有 Firestore 規則
// 採同一種「朋友一起玩，不防內部人」的取捨；不是拿來給互不信任的陌生人連線用的。
// ═══════════════════════════════════════════
const { AccessToken } = require('livekit-server-sdk');

module.exports = async function handler(req, res) {
  // CORS：前端跑在 GitHub Pages（不同網域），一定要允許跨網域呼叫，否則瀏覽器會擋下請求。
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const body = req.body || {};
  const roomCode = body.roomCode ? String(body.roomCode).trim() : '';
  const identity = body.identity ? String(body.identity).trim() : '';
  const name = body.name ? String(body.name).trim() : undefined;
  if (!roomCode || !identity) {
    res.status(400).json({ error: 'roomCode and identity are required' });
    return;
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const wsUrl = process.env.LIVEKIT_WS_URL;
  if (!apiKey || !apiSecret || !wsUrl) {
    res.status(500).json({ error: 'Server is missing LiveKit credentials (check Vercel env vars)' });
    return;
  }

  try {
    const at = new AccessToken(apiKey, apiSecret, {
      identity,
      name,
      // 4 小時夠一整場遊戲用，不用每場都重新申請；真的忘記關掉，LiveKit Cloud 那邊本來
      // 就有連線閒置逾時機制，不會無限占用額度。
      ttl: '4h',
    });
    at.addGrant({
      room: roomCode,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      // 不需要資料通道（文字訊息），縮小權限範圍。
      canPublishData: false,
    });
    const token = await at.toJwt();
    res.status(200).json({ token, wsUrl });
  } catch (err) {
    res.status(500).json({ error: String((err && err.message) || err) });
  }
};
