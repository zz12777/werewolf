#!/usr/bin/env bash
# 打包網站要用的檔案到 dist/（給 Cloudflare Pages 部署用）。
# 只放網站真的會用到的檔案，不放測試、node_modules、說明文件，部署比較快也比較穩。
#   自己人版：bash scripts/build-site.sh team
#   公開版：  bash scripts/build-site.sh public
# 新增了網站要用的檔案或資料夾（例如新的音效檔），記得加進下面的清單。
set -e
EDITION="${1:-team}"
rm -rf dist
mkdir dist
cp index.html style.css favicon.ico ./*.mp3 dist/
cp -r js data img assets dist/
if [ "$EDITION" = "public" ]; then
  echo "window.JG_DEPLOY_EDITION='public';" > dist/js/edition-config.js
  # 公開版不放自己人的資料：人名、歷史場次、試算表網址、密碼（見 data/team-config.js）
  echo "const JG_TEAM_CONFIG={};" > dist/data/team-config.js
  echo "const GAMES=[];" > dist/data/games-history.js
  # 公開版沒有的分頁按鈕直接從網頁原始碼拿掉（分享連結的預覽只讀原始碼，看不到程式藏起來的結果）
  sed -i -E '/class="nav-btn"[^>]*data-feature="(guide|playData|room)"/d' dist/index.html
fi
echo "已打包 $EDITION 版：$(find dist -type f | wc -l) 個檔案"
