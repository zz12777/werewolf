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
fi
echo "已打包 $EDITION 版：$(find dist -type f | wc -l) 個檔案"
