// ═══════════════════════════════════════════
// data/team-config.js
// 只有「自己人版」用得到的資料：常用玩家名單、遊玩數據用的 Google 表單／試算表、送出密碼、
// 即時票型的同步網址、舊場次的手動獎項紀錄。
// 公開版打包（bash scripts/build-site.sh public）時，這個檔案會整個換成空的設定
// （const JG_TEAM_CONFIG={};），data/games-history.js 也會清成空陣列，
// 公開網站上不會出現任何人名、自己人的試算表網址或密碼。
// 要改這些值就直接改這個檔案；程式裡讀不到的欄位一律當成「沒設定」。
// 在自己人版網址後面加 ?edition=public 測試公開版時，也一樣當成沒有這些資料。
// ═══════════════════════════════════════════

const JG_TEAM_CONFIG=(typeof jgIsPublicEdition==='function'&&jgIsPublicEdition())?{}:{
  // 法官助手「設定玩家名單」的內建常用名單（第一次使用時的起點）
  namePreset:['陳冠竹','巫嘉軒','鄭文奇','李法順','李想成','陳冠彣','陳玉堂','黃家珮','黃柏寰','何冠岳','謝子凡','王悅謙','孫揚和','蘇祐樂','許逸凡','林芸竹','吳柏霖','陳詩涵','劉謙叡','龔則乾','洪梓睿','黃禹勛','蘇奕安','郭展吟','許綺文','林均豪','潘彥誠','曾冠學','謝伊晨','陳芯錞','劉欣融','賴宥瑋','魏愷呈'],
  // 即時票型：法官端同步投票紀錄用的 Apps Script 網址
  liveSyncUrl:'https://script.google.com/macros/s/AKfycbxnTE-iVo8D9GPmP2E6xsbRR4StTZJlbjG6oM6k9mUJlK-PBsX0C73AQNPg4ZRyEJgRiQ/exec',
  // 遊玩數據：送出用的 Google 表單、欄位代號、讀取用的試算表 CSV、送出前要輸入的密碼
  // （密碼只是防呆，不是真的加密，網頁原始碼打開看得到，不要用太重要的密碼）
  pdFormActionUrl:'https://docs.google.com/forms/d/e/1FAIpQLSeAqU86sLtuptAh50Ndu7zHUjVQHQGU6ietsgJwlqUTS1K3iw/formResponse',
  pdFormEntries:{
    id:'entry.593689443', date:'entry.944666696', board:'entry.980679289',
    resultText:'entry.245423789', winner:'entry.1204746202', time:'entry.1141328912',
    players:'entry.1989136022', log:'entry.451885810'
  },
  pdSheetCsvUrl:'https://docs.google.com/spreadsheets/d/1q4qLbQLS4GBajy4Zh66spegaXlpC4Uo9TrkcAYLmyQQ/gviz/tq?tqx=out:csv&gid=0',
  pdSubmitPassword:'12071211',
  // 主持結束視窗「給法官的提醒」第 2 點（誰可以輸入密碼上傳遊玩數據）
  judgeEndUploadNote:'找冠竹或嘉軒以輸入密碼上傳本場記錄到遊玩數據',
  // 獎項「滴滴之星」：舊格式場次沒有「當選警長」字樣，只能手動列出（場次代號：姓名）
  awardHantiaoManual:{ '0812_1':'黃家珮' }
};
