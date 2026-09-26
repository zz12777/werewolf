// ═══════════════════════════════════════════
// api/livekit-mute.js
// Vercel Serverless Function：房主強制關掉／恢復某位玩家的麥克風。
//
// 為什麼一定要繞伺服器端，不能只在前端做：麥克風開關如果只是「房主的手機在 Firestore
// 寫一個 muted 旗標，請對方的手機自己配合關掉」，對方的手機理論上可以不理它（不管是
// 程式有 bug、還是有人故意改前端程式碼）；這支函式改叫 LiveKit 的伺服器端 API
// （mutePublishedTrack），是請 LiveKit 的 SFU 伺服器直接停止轉發那個人的音訊軌，就算
// 對方的手機不配合，其他人也聽不到他的聲音——這才是真的「強制」。
//
// 部署方式跟金鑰設定：跟 api/livekit-token.js 完全一樣（同一個 Vercel 專案、同一組
// LIVEKIT_API_KEY / LIVEKIT_API_SECRET / LIVEKIT_WS_URL 環境變數）。
//
// 權限把關：這裡沒有另外驗證「呼叫的人真的是房主」——跟這個 app 其餘所有「房主專用」
// 操作（例如公布投票結果、分配身分）一樣，都是前端只把按鈕顯示給房主看，伺服器端本身
// 沒有另外擋。這是跟現有架構一致的取捨（朋友一起玩，不是防範惡意玩家的系統），如果之後
// 想要更嚴謹，可以在這裡加一段查 Firestore room 文件的 hostUid 是否等於呼叫者的驗證，
// 但那需要額外引入 Firebase Admin SDK 跟服務帳號金鑰，目前先不做。
// ═══════════════════════════════════════════
const { RoomServiceClient } = require('livekit-server-sdk');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const body = req.body || {};
  const roomCode = body.roomCode ? String(body.roomCode).trim() : '';
  const identity = body.identity ? String(body.identity).trim() : '';
  const muted = !!body.muted;
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
  // RoomServiceClient 走的是一般 HTTPS API（不是 WebSocket），所以要把 wss:// 換成
  // https://（LiveKit Cloud 同一個網域，同時服務 WebSocket 跟一般 HTTP API）。
  const httpUrl = wsUrl.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');

  try {
    const svc = new RoomServiceClient(httpUrl, apiKey, apiSecret);
    const participant = await svc.getParticipant(roomCode, identity);
    const tracks = (participant.tracks || []).filter((t) => t.type === 'AUDIO');
    if (!tracks.length) {
      // 對方可能根本還沒開過麥克風（還沒發佈任何音訊軌）——不是錯誤，只是沒事可做。
      res.status(200).json({ ok: true, mutedTracks: 0, note: 'participant has no published audio track yet' });
      return;
    }
    for (const t of tracks) {
      await svc.mutePublishedTrack(roomCode, identity, t.sid, muted);
    }
    res.status(200).json({ ok: true, mutedTracks: tracks.length });
  } catch (err) {
    res.status(500).json({ error: String((err && err.message) || err) });
  }
};
