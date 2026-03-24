@echo off
echo ================================
echo  InfraDesk Agent - budowanie EXE
echo ================================
cd /d "%~dp0"

REM Kopiuj ikony z folderu GRAFIKI
copy /y "..\GRAFIKI\logo.png"        logo.png        >nul 2>&1
copy /y "..\GRAFIKI\ikona.png"       ikona.png       >nul 2>&1
copy /y "..\GRAFIKI\ikona_nazwa.png" ikona_nazwa.png >nul 2>&1

REM Instalacja zależności
pip install pyinstaller pillow pystray psutil requests websocket-client customtkinter --quiet

REM Generuj icon.ico z logo
python -c "from PIL import Image; img=Image.open('logo.png').convert('RGBA'); img.save('icon.ico', format='ICO', sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])"

pyinstaller ^
  --onefile ^
  --windowed ^
  --name "InfraDesk Agent" ^
  --icon icon.ico ^
  --add-data "logo.png;." ^
  --add-data "ikona.png;." ^
  --add-data "ikona_nazwa.png;." ^
  --collect-all customtkinter ^
  --hidden-import customtkinter ^
  --hidden-import PIL ^
  --hidden-import pystray ^
  --hidden-import websocket ^
  --hidden-import winreg ^
  --noconfirm ^
  agent.py

echo.
if exist "dist\InfraDesk Agent.exe" (
    echo [OK] Build gotowy: dist\InfraDesk Agent.exe
) else (
    echo [BLAD] Build nie powiodl sie
)
pause
