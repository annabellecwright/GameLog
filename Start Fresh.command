#!/bin/bash
#
# Double-click this to empty the example collection out of a fresh copy, so the
# shelf is blank and ready for yours. It clears the games, hardware, lists, log,
# profile and title, and leaves everything else alone.
#
# It is safe: it shows you exactly what it will erase and then asks you to type
# a word to confirm, so a stray double-click cannot wipe anything. You normally
# do this once, right after setting up your copy.
#
# (Mac only. On Windows use "Start Fresh.bat".)

cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "  GameLog needs Node.js, and it isn't installed yet."
  echo "  Install it once from  https://nodejs.org  (choose the LTS version)."
  echo
  read -n 1 -s -r -p "  Press any key to close this window."
  echo
  exit 1
fi

node scripts/start-fresh.mjs

echo
read -n 1 -s -r -p "  Press any key to close this window."
echo
