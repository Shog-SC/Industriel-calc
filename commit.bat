@echo off
setlocal

title Industriel-calc - Commit GitHub

echo.
echo ================================
echo   Industriel-calc - Commit
echo ================================
echo.
echo 1 - Fix / Bugfix
echo 2 - UI / CSS
echo 3 - Feature
echo 4 - Data / Prices
echo 5 - Release / Version
echo 6 - Message personnalise
echo.
set /p choice=Choix : 

if "%choice%"=="1" set msg=Fix / Bugfix
if "%choice%"=="2" set msg=UI / CSS update
if "%choice%"=="3" set msg=New feature
if "%choice%"=="4" set msg=Data / Prices update
if "%choice%"=="5" set msg=Release update
if "%choice%"=="6" goto custom

if not defined msg (
  echo Choix invalide.
  pause
  exit /b
)

goto commit

:custom
echo.
set /p msg=Message du commit : 
if "%msg%"=="" (
  echo Message vide, annule.
  pause
  exit /b
)

:commit
echo.
echo Commit : "%msg%"
echo.

git add .
git commit -m "%msg%"
git push

echo.
echo Commit termine pour Industriel-calc.
pause
endlocal
