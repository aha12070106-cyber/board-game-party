#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo " Node.js가 아직 설치되지 않았어요."
  echo " 지금 열리는 페이지에서 LTS 버튼을 눌러 설치한 뒤,"
  echo " 이 파일을 다시 더블클릭해 주세요."
  open "https://nodejs.org/ko"
  read -n 1 -s -r -p " 아무 키나 누르면 닫혀요."
  exit 0
fi
node share.js
