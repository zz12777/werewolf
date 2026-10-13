# 狼人殺小分隊法官助手

面對面狼人殺的自動化法官工具，支援 6～16 人局多種板子配置，涵蓋完整場次（不只第一天）：夜晚各角色技能結算、警長競選、白天發言投票、勝負判定、遊玩數據排行榜、特別獎項統計，另外還有連線房間（讓玩家用手機加入房間、查自己的身分、做機械狼的操作）跟語音通話功能。

線上網址：https://zz12777.github.io/werewolf/

## 快速開始

### 只用本機離線功能（法官手上這台裝置自己操作）

1. 下載整個資料夾（保持資料夾結構，不要只抓 `index.html`）。
2. 雙擊 `index.html`，用瀏覽器直接打開即可。夜晚結算、白天流程、警長競選、遊玩數據、規則介紹這些核心功能都能正常運作。

### 要用連線房間或語音通話功能

連線房間（`js/room/` 底下的檔案）要靠 Firebase，而 Firebase 初始化（`js/firebase-init.js`）跟語音通話（`js/voice.js`）是用 ES module（`<script type="module">`）載入的，瀏覽器出於安全限制，不允許直接用 `file://` 開啟的頁面載入 ES module，所以這幾項功能必須透過 http 或 https 伺服器才能用。本機測試可以在專案根目錄跑：

```
python3 -m http.server
```

然後用瀏覽器開 `http://localhost:8000/` 即可；或是直接使用上面列出的線上網址，功能完全相同。

## 主要功能

1. 夜晚各角色技能自動排序與結算，角色清單涵蓋狼人陣營、神職、特殊角色等多種板子組合。
2. 警長競選全流程：候選、發言、退水、投票、PK、警徽交接。
3. 白天流程：天亮公告、發言、投票、PK、遺言、開槍鏈判定。
4. 勝負判定與場次紀錄，累積成遊玩數據排行榜、積分與特別獎項統計。
5. 連線房間：玩家用自己的手機掃碼或輸入房號加入房間，可以查自己的身分、玩家名單即時同步，也支援機械狼模式下的手機端操作。
6. 語音通話：房間內玩家可以直接用網頁通話，不需要另外開語音軟體。
7. 規則介紹分頁：角色卡片、板子資料、專有名詞小辭典、攻略參考，內容可由站長在 Google 試算表上直接編輯更新，網頁會自動抓取最新內容。

## 外部服務與資料安全

這個專案本體是純前端網頁，但以下兩項進階功能會連到外部服務：

1. 連線房間與語音通話：使用 Firebase（Firestore 即時資料庫、匿名登入）同步房間與玩家狀態，語音通話則透過 LiveKit，由 `api/livekit-token.js`、`api/livekit-mute.js` 這兩支伺服器端函式（部署在 Vercel 上）發放通話權杖與處理主持人靜音控制。玩家加入房間時會拿到一個匿名帳號，用來識別「這支手機是房間裡的哪一位玩家」，不需要輸入任何個人資料、不會收集真實姓名或聯絡方式。
2. 規則介紹分頁的內容（角色描述、板子介紹、專有名詞、攻略文章）可以透過幾份公開發布的 Google 試算表來編輯，網頁啟動時會抓取試算表內容覆蓋預設文字；試算表抓不到或是空白時，會自動顯示內建的預設內容，不影響網頁運作。

這些外部服務的設定（Firebase 專案金鑰、LiveKit 伺服器資訊）都寫在程式碼或環境變數裡，使用者不需要額外申請帳號才能使用連線房間功能；只是要注意，連線房間跟語音通話都需要網路連線才能用。

## 檔案結構

```
index.html              主要 HTML 入口，各畫面以 div 切換顯示/隱藏
style.css                全域樣式
package.json              npm 相依套件設定（jsdom 測試用、livekit server sdk）
data/
  games-history.js        歷史對局紀錄（GAMES 陣列，純資料，會持續增長）
js/
  core.js                 全域狀態、共用工具函式（玩家查找、死亡結算共用邏輯、存讀檔、即時同步）
  sheriff.js              警長競選全流程
  night.js                夜晚各角色睜眼／技能結算邏輯
  day.js                  白天流程（天亮公告、發言、投票、PK、遺言、開槍鏈）
  steps.js                主要畫面調度函式 jgRenderStep()，依目前步驟渲染對應畫面
  rules-ui.js             規則介紹分頁（角色卡片、板子資料、專有名詞、攻略、問題回報）
  awards.js               特別獎項計算
  playdata-core.js        遊玩數據分頁：排行榜統計、積分、成長趨勢圖
  icons.js                線條圖示（jgIcon），畫面上所有圖示都從這裡來
  firebase-init.js        Firebase 初始化與匿名登入，並把 Firestore 函式提供給連線房間（ES module）
  room/                   連線房間（多個一般 script 檔，共用同一個全域範圍，檔案總覽見 room/core.js 開頭）
    core.js               房間狀態、建立/加入房間、發牌房、畫面總機
    night-flow.js         夜晚流程、死亡結算、死訊、警徽、夜槍
    win.js                勝負自動判定
    widgets.js            法官語音、浮動按鈕、文字聊天室
    night-basic.js        守衛、女巫、狼隊出刀、共用小工具
    day.js                警長競選、投票、放逐、遺言、發言順序
    record.js             上帝視角、結束畫面、匯出與送出遊玩數據
    night-shell.js        夜晚畫面總機、預言家、通靈師、獵魔人
    roles-special.js      夢魘、魔術師、攝夢人、機械狼、邱比特、盜賊、狼兄狼弟、黑市商人、夜槍
    roles-batch1.js       狼美人、惡靈騎士、騎士、混血兒、唯鄰是從、邱比特勝負
    entry.js              分頁入口、自動重連、邀請連結
  voice.js                語音通話客戶端（ES module）
  main.js                 初始化與啟動流程（必須最後載入）
api/
  livekit-token.js        核發 LiveKit 通話權杖的 Vercel serverless function
  livekit-mute.js         主持人靜音控制的 Vercel serverless function
assets/
  logo.png                網站圖示
tests/
  test_room_logic.js       連線房間核心邏輯測試
  test_awards.js            特別獎項計算測試
  test_deal_boards.js       板子配置測試
  test_dreamcatcher_day_death.js   夢魔白天死亡結算測試
  test_nav_menu.js          導覽選單測試
  test_sequenceprince.js    序列王子相關測試
  test_trickster_vote_swap.js      騙術師換票測試
  test_neighbor_puppet.js          唯鄰是從（傀儡）板子測試
  test_animal_dream.js             動物夢境板子測試
  test_windspy.js                  風聲諜影板子測試
  test_night_win_early.js          進入黑夜前提前判定狼人獲勝測試
```

### 載入順序

`index.html` 裡的 `<script>` 標籤順序是刻意排的，改動時請維持這個順序：

```
icons.js → data/games-history.js → core.js → sheriff.js → night.js → day.js
→ steps.js → rules-ui.js → awards.js → playdata-core.js → main.js
→ firebase-init.js（ES module）→ room/ 底下 11 個檔案（defer）→ voice.js（ES module）
```

`main.js` 必須放在一般 script 的最後，裡面的程式碼會在頁面載入當下立刻呼叫其他檔案定義的函式（初始化畫面、抓雲端資料），放前面會因為對應函式還沒被定義而報錯。`firebase-init.js` 用 `type="module"` 載入，把 `db`、`auth` 跟 Firestore 函式（`doc`、`setDoc`、`getDoc`⋯）掛到 `window` 上；`room/` 底下的檔案用 `defer` 載入，會照順序排在 `firebase-init.js` 之後執行，所以可以直接用這些函式。`room/` 底下的檔案彼此共用同一個全域範圍，順序也要維持（`core.js` 第一、`entry.js` 最後）。

## 開發

### 執行測試

測試用純 Node 執行，不需要額外的測試框架指令：

```
node tests/test_room_logic.js
node tests/test_awards.js
node tests/test_deal_boards.js
node tests/test_dreamcatcher_day_death.js
node tests/test_nav_menu.js
node tests/test_sequenceprince.js
node tests/test_trickster_vote_swap.js
node tests/test_neighbor_puppet.js
node tests/test_animal_dream.js
```

執行前先裝好相依套件：

```
npm install
```

### 開發準則

1. 新增邏輯時依照上面的檔案分工放進對應檔案；不確定放哪裡，優先參考該功能屬於哪個遊戲階段（夜晚／白天／警長競選），或是不是共用工具。
2. `jgRenderStep()`（`steps.js`）目前是一個涵蓋所有步驟的大函式（if/else 依 `step` 名稱分流），新增畫面步驟時在裡面加一個分支即可。
3. `data/games-history.js` 只放歷史對局的原始資料，不要把邏輯寫進這個檔案。
4. 所有使用者看到的文字、程式碼註解一律使用繁體中文。
5. 畫面上要加圖案一律用線條畫的 SVG icon，不要新增 emoji。

## 授權

著作權所有，保留一切權利（All rights reserved）。本專案沒有採用任何開源授權：程式碼放在 GitHub 上只是方便部署與自己人協作，未經作者同意，不得重製、修改、散布，或拿去用在其他網站與服務。
