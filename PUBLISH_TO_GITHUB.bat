@echo off
setlocal
cd /d "%~dp0"
where git >nul 2>nul
if errorlevel 1 (
  echo Git is not installed or not available in PATH.
  echo Install Git for Windows first: https://git-scm.com/download/win
  pause
  exit /b 1
)

if not exist .git (
  git init
  git branch -M main
  git config user.name "yua3891"
  git config user.email "24313710+yua3891@users.noreply.github.com"
  git add .
  git commit -m "Initial open-source release: Snowball Battle v0.6.3"
)

git remote get-url origin >nul 2>nul
if errorlevel 1 (
  git remote add origin https://github.com/yua3891/snowball-battle.git
) else (
  git remote set-url origin https://github.com/yua3891/snowball-battle.git
)

echo.
echo Publishing to https://github.com/yua3891/snowball-battle ...
git push -u origin main
if errorlevel 1 (
  echo.
  echo Push failed. Complete GitHub sign-in in the browser/Git Credential Manager and run this file again.
  pause
  exit /b 1
)

echo.
echo Published successfully.
pause
