// Firestore 安全規則（firestore.rules）的村莊權限測試：村長、成員、外人、匿名帳號各種讀寫。
// 要用 Firebase 官方模擬器跑（需要 Java），不在 npm test 裡，改規則之後手動跑一次：
//   mkdir /tmp/rt && cd /tmp/rt && npm init -y && npm i firebase-tools@13 @firebase/rules-unit-testing@3 firebase@10
//   cd /tmp/rt && NODE_PATH=/tmp/rt/node_modules npx firebase emulators:exec --only firestore --project demo-werewolf \
//     "node <repo>/tests/rules/firestore_rules.test.js"
//   （模擬器的埠號用 8089：在 /tmp/rt 放一個 firebase.json，內容
//    {"firestore":{"rules":"<repo>/firestore.rules"},"emulators":{"firestore":{"port":8089,"host":"127.0.0.1"},"ui":{"enabled":false}}}）
const fs=require('fs');
const path=require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, updateDoc, deleteDoc, collection, getDocs, arrayUnion, serverTimestamp } = require('firebase/firestore');
(async()=>{
  const env=await initializeTestEnvironment({ projectId:'demo-werewolf', firestore:{ rules:fs.readFileSync(path.join(__dirname,'..','..','firestore.rules'),'utf8'), host:'127.0.0.1', port:8089 } });
  const G={firebase:{sign_in_provider:'google.com'}};
  const A=env.authenticatedContext('uA', G).firestore();
  const B=env.authenticatedContext('uB', G).firestore();
  const C=env.authenticatedContext('uC', G).firestore();
  const anon=env.authenticatedContext('uX', {firebase:{sign_in_provider:'anonymous'}}).firestore();
  const results=[]; const t=async(name, p)=>{ try{ await p; results.push(['PASS',name]); }catch(e){ results.push(['FAIL',name,String(e.message).slice(0,120)]); } };
  const vid='v1', code='code1';
  // 村長建立村莊
  await t('A 建立村莊', assertSucceeds(setDoc(doc(A,'villages',vid), {name:'週五狼人殺', ownerUid:'uA', ownerName:'阿明', inviteCode:code, roster:[], createdAt:serverTimestamp()})));
  await t('A 把自己加成村長', assertSucceeds(setDoc(doc(A,'villages',vid,'members','uA'), {uid:'uA', name:'阿明', role:'owner', joinedAt:serverTimestamp(), code})));
  await t('A 建立邀請碼', assertSucceeds(setDoc(doc(A,'invites',code), {vid, name:'週五狼人殺'})));
  await t('A 寫自己的村莊清單', assertSucceeds(setDoc(doc(A,'users','uA'), {villages:arrayUnion(vid)}, {merge:true})));
  await t('A 讀村莊', assertSucceeds(getDoc(doc(A,'villages',vid))));
  // 不合規的建立
  await t('匿名帳號不能建立村莊', assertFails(setDoc(doc(anon,'villages','v9'), {name:'x', ownerUid:'uX', ownerName:'x', inviteCode:'c9', roster:[], createdAt:1})));
  await t('不能幫別人建村莊', assertFails(setDoc(doc(B,'villages','v8'), {name:'x', ownerUid:'uA', ownerName:'x', inviteCode:'c8', roster:[], createdAt:1})));
  await t('B 不能替不是自己的村莊建邀請碼', assertFails(setDoc(doc(B,'invites','fake'), {vid, name:'x'})));
  // 外人
  await t('B（還不是成員）讀不到村莊', assertFails(getDoc(doc(B,'villages',vid))));
  await t('B 讀不到村莊場次', assertFails(getDocs(collection(B,'villages',vid,'games'))));
  await t('B 用邀請碼查得到村莊', assertSucceeds(getDoc(doc(B,'invites',code))));
  await t('不能列出所有邀請碼', assertFails(getDocs(collection(B,'invites'))));
  await t('B 用錯的邀請碼加入失敗', assertFails(setDoc(doc(B,'villages',vid,'members','uB'), {uid:'uB', name:'阿華', role:'member', joinedAt:1, code:'wrong'})));
  await t('B 不能把自己加成村長', assertFails(setDoc(doc(B,'villages',vid,'members','uB'), {uid:'uB', name:'阿華', role:'owner', joinedAt:1, code})));
  await t('B 不能把別人加進村莊', assertFails(setDoc(doc(B,'villages',vid,'members','uC'), {uid:'uC', name:'小C', role:'member', joinedAt:1, code})));
  await t('匿名帳號不能加入村莊', assertFails(setDoc(doc(anon,'villages',vid,'members','uX'), {uid:'uX', name:'x', role:'member', joinedAt:1, code})));
  await t('B 用正確邀請碼加入', assertSucceeds(setDoc(doc(B,'villages',vid,'members','uB'), {uid:'uB', name:'阿華', role:'member', joinedAt:serverTimestamp(), code})));
  // 成員
  await t('B 讀村莊', assertSucceeds(getDoc(doc(B,'villages',vid))));
  await t('B 讀成員名單', assertSucceeds(getDocs(collection(B,'villages',vid,'members'))));
  await t('B 加玩家名單', assertSucceeds(updateDoc(doc(B,'villages',vid), {roster:arrayUnion('小王')})));
  await t('B 不能改村莊名稱', assertFails(updateDoc(doc(B,'villages',vid), {name:'改名'})));
  await t('B 不能把自己改成村長', assertFails(updateDoc(doc(B,'villages',vid), {ownerUid:'uB'})));
  const game=(by)=>({id:'1017_1', date:'2026-10-17', time:'21:00', board:'預女獵守', resultText:'好人陣營獲勝', winner:'good', players:[{num:1,name:'小王',role:'狼人'}], log:'**夜晚1st', recordedBy:by, recordedByName:'阿華', createdAt:serverTimestamp()});
  await t('B 存場次', assertSucceeds(setDoc(doc(B,'villages',vid,'games','g1'), game('uB'))));
  await t('B 不能冒用別人名義存場次', assertFails(setDoc(doc(B,'villages',vid,'games','g2'), game('uA'))));
  await t('B 不能存格式不對的場次', assertFails(setDoc(doc(B,'villages',vid,'games','g3'), {...game('uB'), hack:1})));
  await t('B 不能刪場次', assertFails(deleteDoc(doc(B,'villages',vid,'games','g1'))));
  await t('B 不能改場次', assertFails(updateDoc(doc(B,'villages',vid,'games','g1'), {winner:'evil'})));
  await t('B 不能刪村莊', assertFails(deleteDoc(doc(B,'villages',vid))));
  await t('B 不能踢掉村長', assertFails(deleteDoc(doc(B,'villages',vid,'members','uA'))));
  await t('B 讀不到別人的村莊清單', assertFails(getDoc(doc(B,'users','uA'))));
  // 外人 C
  await t('C 不能存場次', assertFails(setDoc(doc(C,'villages',vid,'games','g4'), game('uC'))));
  await t('C 讀不到成員', assertFails(getDocs(collection(C,'villages',vid,'members'))));
  // 村長
  await t('A 讀到 B 存的場次', assertSucceeds(getDoc(doc(A,'villages',vid,'games','g1'))));
  await t('A 刪場次', assertSucceeds(deleteDoc(doc(A,'villages',vid,'games','g1'))));
  await t('A 改村莊名稱', assertSucceeds(updateDoc(doc(A,'villages',vid), {name:'週六狼人殺'})));
  // B 自己離開，再用邀請碼回來
  await t('B 自己離開村莊', assertSucceeds(deleteDoc(doc(B,'villages',vid,'members','uB'))));
  await t('B 離開後讀不到村莊', assertFails(getDoc(doc(B,'villages',vid))));
  await t('B 再加入', assertSucceeds(setDoc(doc(B,'villages',vid,'members','uB'), {uid:'uB', name:'阿華', role:'member', joinedAt:1, code})));
  // 村長刪除村莊（照 js/village.js 的順序）
  await t('A 移除成員 B', assertSucceeds(deleteDoc(doc(A,'villages',vid,'members','uB'))));
  await t('A 刪邀請碼', assertSucceeds(deleteDoc(doc(A,'invites',code))));
  await t('A 刪自己的成員資料', assertSucceeds(deleteDoc(doc(A,'villages',vid,'members','uA'))));
  await t('A 刪村莊', assertSucceeds(deleteDoc(doc(A,'villages',vid))));
  // 連線房間的規則沒被影響
  await t('匿名帳號照樣可以開連線房間', assertSucceeds(setDoc(doc(anon,'rooms','123456'), {createdAt:serverTimestamp()})));
  results.forEach(r=>console.log(r.join('  ')));
  const fails=results.filter(r=>r[0]==='FAIL');
  console.log(fails.length?fails.length+' 項失敗':'全部 '+results.length+' 項規則測試通過');
  await env.cleanup();
  process.exit(fails.length?1:0);
})().catch(e=>{ console.error('FATAL', e); process.exit(1); });
