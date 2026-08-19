@echo off
cd /d "%~dp0JUDICIARY\backend"
if not exist node_modules (
  echo Installing backend dependencies...
  npm.cmd install
)
echo Starting backend server on http://localhost:3000
npm.cmd start
