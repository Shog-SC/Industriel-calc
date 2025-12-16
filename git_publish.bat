@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo ==========================
echo   Git - Commit / Push
echo   Repo: %CD%
echo ==========================
echo.

REM 1) Vérifier que c'est un repo git
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo ERREUR: Ce dossier n'est pas un depot Git.
  echo Lance d'abord: git init
  pause
  exit /b 1
)

REM 2) Vérifier s'il y a des changements
for /f %%A in ('git status --porcelain') do set hasChanges=1
if not defined hasChanges (
  echo Aucun changement a committer. Rien a faire.
  pause
  exit /b 0
)

REM 3) Afficher le status (résumé)
echo --- git status ---
git status
echo.

REM 4) Saisir message de commit
set /p msg=Message du commit : 
if "%msg%"=="" (
  echo Message vide. Annule.
  pause
  exit /b 1
)

REM 5) Stage + Commit
echo.
echo --- git add . ---
git add .
if errorlevel 1 (
  echo ERREUR: git add a echoue.
  pause
  exit /b 1
)

echo.
echo --- git commit ---
git commit -m "%msg%"
if errorlevel 1 (
  echo ERREUR: git commit a echoue. (Peut-etre rien a committer.)
  pause
  exit /b 1
)

REM 6) Demander confirmation avant push
echo.
set /p yn=Push sur GitHub maintenant ? (O/N) : 
if /I not "%yn%"=="O" (
  echo OK. Commit local effectue. Aucun push.
  pause
  exit /b 0
)

REM 7) Sync avant push (resout le "fetch first")
echo.
echo --- git pull --rebase ---
git pull --rebase
if errorlevel 1 (
  echo ERREUR: git pull --rebase a echoue. Conflit possible.
  echo Ouvre VS Code et resous les conflits, puis relance le push.
  pause
  exit /b 1
)

REM 8) Push
echo.
echo --- git push ---
git push
if errorlevel 1 (
  echo ERREUR: git push a echoue.
  pause
  exit /b 1
)

echo.
echo Terminé: commit + push OK.
pause
endlocal
