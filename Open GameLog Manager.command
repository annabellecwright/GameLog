#!/bin/bash
#
# Double-click this to edit your GameLog.
#
# It starts the manager (a small editor that runs on your own machine) and opens
# it in your browser. A Terminal window will appear -- that is the manager
# running. Keep it open while you edit, and close it when you are done.
#
# (Mac only. On Windows use "Open GameLog Manager.bat"; on Linux run
# `npm run manage` in a terminal.)

# Work from this file's own folder, whatever it is called or wherever it lives.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "  GameLog needs Node.js, and it isn't installed yet."
  echo
  echo "  Install it once from  https://nodejs.org  (choose the LTS version),"
  echo "  then double-click this file again."
  echo
  read -n 1 -s -r -p "  Press any key to close this window."
  echo
  exit 1
fi

PORT=4321
URL="http://localhost:$PORT/manage.html"

# Open the browser a moment after the manager has had time to start.
( sleep 1.5; open "$URL" ) &

echo
echo "  Starting the GameLog manager…"
echo "  Your browser will open at  $URL"
echo
echo "  Keep this window open while you edit. Close it (or press Ctrl-C) when"
echo "  you're done."
echo
node scripts/manage.mjs "$PORT"
