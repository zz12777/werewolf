'use strict';
// ═══════════════════════════════════════════
// js/room/cleanup.js
// 連線房間：自動清掉超過一天的舊房間（房間文件連同底下所有子集合整個刪掉）。
// 連線房間的程式拆成 js/room/ 底下好幾個一般 script 檔（依 index.html 的順序用 defer 載入，
// 共用同一個全域範圍，互相看得到彼此的變數與函式）；Firestore 函式由 js/firebase-init.js 提供。
// 檔案總覽見 js/room/core.js 開頭。
//
// 為什麼這樣做：Firestore 沒有「刪房間順便刪子集合」這種功能，前端也沒辦法一次砍乾淨，
// 以前解散房間只標記 dissolved:true，舊房間（含每個人的身分、投票、聊天）就一直堆著。
// 現在改成：任何人打開網頁、登入完成後，背景偷偷檢查一次「建立時間超過一天」的房間，
// 每個房間先把子集合裡的文件一筆一筆刪掉，最後才刪房間文件本身（順序不能反，房間文件
// 先刪的話就找不到子集合了）。遊戲結束當下要留存的東西（文字紀錄、遊玩數據）在結束畫面
// 就要先匯出／送出，一天後房間就不在了。
//
// 搭配的安全規則（repo 根目錄 firestore.rules）：房間建立超過一天，任何登入的人都可以讀、
// 刪那個房間和它底下所有子集合；規則還沒更新到 Firebase 主控台之前，刪除會被擋下來，
// 這裡就安靜放棄、不影響其他功能。
// ═══════════════════════════════════════════

// 房間底下會用到的所有子集合；新增子集合時要記得補進來，不然清理時會留下孤兒資料。
const JG_ROOM_SUBCOLLECTIONS=['players','secrets','votes','nightLog','dayLog','chat',
  'seerChecks','mediumChecks','witchActs','demonhunterActs','mechwolfChecks'];
const JG_ROOM_EXPIRE_MS=24*60*60*1000;      // 房間保留一天
const JG_ROOM_CLEANUP_EVERY_MS=6*60*60*1000; // 同一支手機／電腦最多每 6 小時清一次，避免每次開網頁都去查
const JG_ROOM_CLEANUP_MAX_ROOMS=20;          // 一次最多清幾間，剩下的留給下一次

// 刪掉一個房間（子集合 → 房間文件）。players 留到最後才刪：規則裡「是不是成員」靠的是
// players 文件，先刪掉別的子集合比較不會卡到權限。
async function jgRoomDeleteRoomDeep(db, code){
  const subs=JG_ROOM_SUBCOLLECTIONS.filter(s=>s!=='players').concat(['players']);
  for(const sub of subs){
    const snap=await getDocs(collection(db,'rooms',code,sub));
    for(const d of snap.docs) await deleteDoc(d.ref);
  }
  await deleteDoc(doc(db,'rooms',code));
}

// force:true 時不管上次什麼時候清過（給測試、或之後想做「手動清理」按鈕用）。
// 回傳這次清掉幾間房間。
window.jgRoomCleanupExpired=async function(force){
  const db=window.jgFirebaseDb;
  if(!db||typeof where!=='function') return 0;
  const now=Date.now();
  if(!force){
    try{
      const last=Number(localStorage.getItem('jgRoomCleanupAt')||0);
      if(now-last<JG_ROOM_CLEANUP_EVERY_MS) return 0;
      localStorage.setItem('jgRoomCleanupAt', String(now));
    }catch(e){}
  }
  await jgRoomWaitAuth();
  let snap;
  try{
    snap=await getDocs(query(collection(db,'rooms'), where('createdAt','<',new Date(now-JG_ROOM_EXPIRE_MS)), limit(JG_ROOM_CLEANUP_MAX_ROOMS)));
  }catch(e){ console.warn('查詢過期房間失敗', e); return 0; }
  let n=0;
  for(const d of snap.docs){
    if(d.id===jgRoomCode) continue; // 自己正在用的房間不動（理論上不會超過一天，保險起見）
    try{ await jgRoomDeleteRoomDeep(db, d.id); n++; }
    catch(e){
      // 多半是 Firebase 主控台的安全規則還沒更新（沒有開放刪除），後面的房間一定也一樣，直接停。
      console.warn('清除過期房間失敗（請確認 Firebase 規則已更新為 repo 裡的 firestore.rules）', d.id, e);
      break;
    }
  }
  if(n) console.log('已清除 '+n+' 間超過一天的連線房間');
  return n;
};

// 網頁載入後過一陣子才在背景清，不跟開頁面搶網路。
if(window.jgFirebaseReady){
  setTimeout(()=>{ window.jgRoomCleanupExpired(false).catch(()=>{}); }, 15000);
}
