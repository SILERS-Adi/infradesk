; InfraDesk Agent — NSIS Installer
; Budowanie: makensis installer.nsi

!include "MUI2.nsh"

!define APP_NAME     "InfraDesk Agent"
!define APP_VERSION  "1.5.0"
!define EXE_NAME     "InfraDesk Agent.exe"
!define INSTALL_DIR  "$APPDATA\InfraDesk"
!define PUBLISHER    "SILERS — Adrian Błaszczykowski"
!define WEBSITE      "https://infradesk.pl"

Name "${APP_NAME}"
OutFile "InfraDesk-Agent-Setup.exe"
InstallDir "${INSTALL_DIR}"
RequestExecutionLevel user
SetCompressor /SOLID lzma
Unicode true

; ── Wygląd instalatora ────────────────────────────────────────────────────────
!define MUI_ICON        "icon.ico"
!define MUI_UNICON      "icon.ico"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP_NOSTRETCH
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN         "$INSTDIR\${EXE_NAME}"
!define MUI_FINISHPAGE_RUN_TEXT    "Uruchom InfraDesk Agent teraz"
!define MUI_FINISHPAGE_LINK        "infradesk.pl"
!define MUI_FINISHPAGE_LINK_LOCATION "${WEBSITE}"

; ── Strony ───────────────────────────────────────────────────────────────────
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; ── Język ────────────────────────────────────────────────────────────────────
!insertmacro MUI_LANGUAGE "Polish"

; ── Instalacja ───────────────────────────────────────────────────────────────
Section "Instalacja" SecMain
  SetOutPath "$INSTDIR"
  File "dist\InfraDesk Agent.exe"
  File "icon.ico"

  ; Autostart przy logowaniu
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" \
    "${APP_NAME}" '"$INSTDIR\${EXE_NAME}"'

  ; Skrót na pulpicie — Zgłoszenie serwisowe
  CreateShortcut "$DESKTOP\Zgłoszenie serwisowe.lnk" \
    "$INSTDIR\${EXE_NAME}" "--ticket" \
    "$INSTDIR\icon.ico" 0

  ; Skrót w menu Start
  CreateDirectory "$SMPROGRAMS\InfraDesk"
  CreateShortcut "$SMPROGRAMS\InfraDesk\InfraDesk Agent.lnk" \
    "$INSTDIR\${EXE_NAME}" "" "$INSTDIR\icon.ico" 0
  CreateShortcut "$SMPROGRAMS\InfraDesk\Zgłoszenie serwisowe.lnk" \
    "$INSTDIR\${EXE_NAME}" "--ticket" "$INSTDIR\icon.ico" 0
  CreateShortcut "$SMPROGRAMS\InfraDesk\Odinstaluj.lnk" \
    "$INSTDIR\Uninstall.exe"

  ; Deinstalator
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "DisplayName"     "${APP_NAME}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "DisplayVersion"  "${APP_VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "Publisher"       "${PUBLISHER}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "URLInfoAbout"    "${WEBSITE}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "DisplayIcon"     "$INSTDIR\icon.ico"
SectionEnd

; ── Deinstalacja ─────────────────────────────────────────────────────────────
Section "Uninstall"
  ; Zatrzymaj agenta jeśli działa
  ExecWait 'taskkill /F /IM "${EXE_NAME}"' $0

  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APP_NAME}"
  DeleteRegKey   HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"
  DeleteRegKey   HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\InfraDesk Agent"

  Delete "$DESKTOP\Zgłoszenie serwisowe.lnk"
  Delete "$DESKTOP\Zgloszenie serwisowe.lnk"
  Delete "$SMPROGRAMS\InfraDesk\*.lnk"
  RMDir  "$SMPROGRAMS\InfraDesk"

  Delete "$INSTDIR\${EXE_NAME}"
  Delete "$INSTDIR\icon.ico"
  Delete "$INSTDIR\Uninstall.exe"
  ; config.json zostawiamy celowo (dane logowania)
  RMDir  "$INSTDIR"
SectionEnd
