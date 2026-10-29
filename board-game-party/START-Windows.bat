@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js가 아직 설치되지 않았어요.
  echo  지금 열리는 페이지에서 LTS 버튼을 눌러 설치한 뒤,
  echo  이 파일을 다시 더블클릭해 주세요.
  echo.
  start https://nodejs.org/ko
  pause
  exit /b
)
node share.js
pause
