@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

title Git - Commit / Push (Helper)

echo ==================================================
echo  Git - Commit / Push
echo  Repo : %CD%
echo ==================================================
echo.

REM --- Verify git repo ---
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo [ERREUR] Ce dossier n'est pas un depot Git.
  echo         Ouvre le bon dossier ou lance: git init
  echo.
  pause
  exit /b 1
)

REM --- Detect changes ---
set "hasChanges="
for /f %%A in ('git status --porcelain') do set hasChanges=1

echo --- Etat du depot ---
git status
echo.

if not defined hasChanges (
  echo Aucun changement a committer.
  echo Astuce: si tu as juste cree un fichier et qu'il n'apparait pas, verifie que tu es au bon endroit.
  echo.
  pause
  exit /b 0
)

REM --- Show a compact summary of changes ---
echo --- Resume (fichiers detectes) ---
git status --porcelain
echo.

REM --- Commit message UX ---
echo --------------------------------------------------
echo Message du commit (une phrase courte).
echo NE PAS taper de commandes ici (ex: "git add ...").
echo Exemples :
echo   - Fix calcul hauling + UI
echo   - Add mining page
echo   - Update CSS layout
echo --------------------------------------------------
set "msg="
set /p msg=Message du commit : 

REM Trim-ish check (empty)
if "%msg%"=="" (
  echo.
  echo [ANNULE] Message vide. Aucun commit.
  pause
  exit /b 1
)

REM If message looks like a command, warn and confirm
echo %msg% | findstr /I /R "^\s*git\s" >nul 2>&1
if not errorlevel 1 (
  echo.
  echo [ATTENTION] Ton message commence par "git ...".
  echo           Tu voulais peut-etre executer une commande, pas ecrire un message.
  set /p yn=Continuer quand meme avec ce message ? (O/N) : 
  if /I not "%yn%"=="O" (
    echo.
    echo OK, annule. Relance et mets un message du type: "Fix ..." / "Add ..." / "Update ..."
    pause
    exit /b 0
  )
)

REM --- Stage changes ---
echo.
echo --- Etape 1/4 : git add . ---
git add .
if errorlevel 1 (
  echo [ERREUR] git add a echoue.
  pause
  exit /b 1
)

REM --- Commit ---
echo.
echo --- Etape 2/4 : git commit ---
git commit -m "%msg%"
if errorlevel 1 (
  echo [ERREUR] git commit a echoue (parfois: rien a committer).
  pause
  exit /b 1
)

echo.
echo --- Commit OK ---
git log -1 --oneline
echo.

REM --- Confirm push ---
set /p yn=Publier maintenant sur GitHub (git push) ? (O/N) : 
if /I not "%yn%"=="O" (
  echo.
  echo OK. Commit local termine. Aucun push effectue.
  echo Pour publier plus tard: git push
  echo.
  pause
  exit /b 0
)

REM --- Rebase before push (avoids fetch-first) ---
echo.
echo --- Etape 3/4 : git pull --rebase (sync) ---
git pull --rebase
if errorlevel 1 (
  echo.
  echo [ERREUR] git pull --rebase a echoue.
  echo Conflit probable. Ouvre VS Code, resous les conflits, puis relance:
  echo   git push
  echo.
  pause
  exit /b 1
)

REM --- Push ---
echo.
echo --- Etape 4/4 : git push ---
git push
if errorlevel 1 (
  echo [ERREUR] git push a echoue.
  pause
  exit /b 1
)

echo.
echo ==================================================
echo  Termine : commit + push OK
echo  (GitHub Pages se mettra a jour automatiquement)
echo ==================================================
pause
endlocal
