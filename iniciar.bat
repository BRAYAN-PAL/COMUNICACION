@echo off
title Barberetos - Chat en vivo
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando dependencias...
  call npm install
)
start "" http://localhost:3000
npm start
pause
