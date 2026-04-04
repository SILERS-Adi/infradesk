!include "MUI2.nsh"

; ── App info ──
!define APPNAME "Asystent Home"
!define APPVERSION "6.0.0"
!define APPEXE "Asystent Home.exe"
!define PUBLISHER "Firma SILERS"
!define WEBSITE "https://www.silers.pl"
!define INSTALLDIR "$PROGRAMFILES\SILERS\${APPNAME}"

Name "${APPNAME} ${APPVERSION}"
OutFile "dist_onefile\Asystent Home Setup.exe"
InstallDir "${INSTALLDIR}"
RequestExecutionLevel admin
SetCompressor /SOLID lzma

; ── UI ──
!define MUI_ICON "icon.ico"
!define MUI_UNICON "icon.ico"
!define MUI_ABORTWARNING

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APPEXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Uruchom ${APPNAME}"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "Polish"

; ── Install ──
Section "Install"
  SetOutPath "$INSTDIR"

  ; Kill running instance
  nsExec::ExecToLog 'taskkill /F /IM "${APPEXE}"'

  ; Copy all files
  File /r "dist\Asystent Home\*.*"

  ; Uninstaller
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ; Start Menu
  CreateDirectory "$SMPROGRAMS\${APPNAME}"
  CreateShortCut "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk" "$INSTDIR\${APPEXE}" "" "$INSTDIR\${APPEXE}" 0
  CreateShortCut "$SMPROGRAMS\${APPNAME}\Odinstaluj.lnk" "$INSTDIR\Uninstall.exe"

  ; Desktop shortcut
  CreateShortCut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${APPEXE}" "" "$INSTDIR\${APPEXE}" 0

  ; Add/Remove Programs
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "DisplayName" "${APPNAME}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "DisplayVersion" "${APPVERSION}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "Publisher" "${PUBLISHER}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "URLInfoAbout" "${WEBSITE}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "DisplayIcon" "$INSTDIR\${APPEXE}"
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "NoRepair" 1

  ; Autostart
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APPNAME}" '"$INSTDIR\${APPEXE}"'

SectionEnd

; ── Uninstall ──
Section "Uninstall"
  ; Kill running
  nsExec::ExecToLog 'taskkill /F /IM "${APPEXE}"'

  ; Remove files
  RMDir /r "$INSTDIR"

  ; Shortcuts
  Delete "$DESKTOP\${APPNAME}.lnk"
  RMDir /r "$SMPROGRAMS\${APPNAME}"

  ; Registry
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APPNAME}"

SectionEnd
