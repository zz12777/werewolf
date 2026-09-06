// ═══════════════════════════════════════════
// js/firebase-init.js
// Firebase 初始化——用 CDN 版的模組化 SDK（不需要 npm/打包工具），直接用 <script type="module">
// 載入。這個檔案只負責「連上你的 Firebase 專案」，實際的房間/連線邏輯在 js/room.js。
// ═══════════════════════════════════════════
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAdSFUV-uzZyY6MQ-qMRS017fUPR2d147c",
  authDomain: "werewolf-room.firebaseapp.com",
  projectId: "werewolf-room",
  storageBucket: "werewolf-room.firebasestorage.app",
  messagingSenderId: "108481932808",
  appId: "1:108481932808:web:b4e6416f8cc6f1a485abbd"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// 這個檔案是 ES module，跟其餘用 <script> 一般載入的檔案（js/core.js 等）是不同的作用域，
// 彼此看不到對方宣告的變數——所以把 db/auth 掛到 window 上，讓 js/room.js（也是 module）
// 跟未來要用到連線功能的一般 script 都拿得到同一份。
window.jgFirebaseApp = app;
window.jgFirebaseDb = db;
window.jgFirebaseAuth = auth;

// 每支手機第一次進來就自動用「匿名登入」拿一個帳號——不用真的註冊，Firestore 安全規則會用
// 這個匿名帳號的 uid 來判斷「這支手機是房間裡的哪一位玩家」，藉此做到身分保密。
window.jgFirebaseReady = new Promise((resolve) => {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      window.jgFirebaseUid = user.uid;
      resolve(user.uid);
    } else {
      signInAnonymously(auth).catch((err) => {
        console.error('Firebase 匿名登入失敗', err);
      });
    }
  });
});
