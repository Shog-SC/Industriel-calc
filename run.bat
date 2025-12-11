@echo off
title Salvage Calculator - Local Server

cd /d "%~dp0"

REM Lance un petit serveur HTTP sur le port 8080
npx http-server -p 8080 -c-1 .

echo.
echo Serveur lance sur: http://localhost:8080/pages/salvage.html
echo.
pause
