!include "MUI2.nsh"

; ── App info ──
!define APPNAME    "InfraDesk Business"
!define APPVERSION "5.0.0"
!define APPEXE     "InfraDesk Business.exe"
!define PUBLISHER  "SILERS — Błaszczykowski Adrian"
!define WEBSITE    "https://infradesk.pl"
!define INSTALLDIR "$PROGRAMFILES\SILERS\${APPNAME}"
!define REGKEY     "InfraDeskBusiness"

Name "${APPNAME} ${APPVERSION}"
OutFile "dist_onefile\InfraDesk Business Setup 5.0.0.exe"
InstallDir "${INSTALLDIR}"
RequestExecutionLevel admin
SetCompressor /SOLID lzma

VIProductVersion "${APPVERSION}.0"
VIAddVersionKey "ProductName" "${APPNAME}"
VIAddVersionKey "CompanyName" "${PUBLISHER}"
VIAddVersionKey "FileDescription" "${APPNAME} — monitoring, backup, diagnostyka"
VIAddVersionKey "FileVersion" "${APPVERSION}"
VIAddVersionKey "LegalCopyright" "© 2026 SILERS"

; ── UI ──
!define MUI_ICON    "..\icon.ico"
!define MUI_UNICON  "..\icon.ico"
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

  ; Kill running instances (both new and legacy names)
  nsExec::ExecToLog 'taskkill /F /IM "${APPEXE}"'
  nsExec::ExecToLog 'taskkill /F /IM "Asystent Business.exe"'

  ; Copy all files
  File /r "dist\InfraDesk Business\*.*"

  ; Uninstaller
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ; Start Menu
  CreateDirectory "$SMPROGRAMS\${APPNAME}"
  CreateShortCut "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk" "$INSTDIR\${APPEXE}" "" "$INSTDIR\${APPEXE}" 0
  CreateShortCut "$SMPROGRAMS\${APPNAME}\Odinstaluj.lnk" "$INSTDIR\Uninstall.exe"

  ; Desktop shortcut
  CreateShortCut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${APPEXE}" "" "$INSTDIR\${APPEXE}" 0

  ; Legacy cleanup — remove old Asystent Business registration if present
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Asystent Business"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Asystent Business"
  Delete "$DESKTOP\Asystent Business.lnk"

  ; Add/Remove Programs
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${REGKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${REGKEY}" "DisplayVersion" "${APPVERSION}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${REGKEY}" "Publisher" "${PUBLISHER}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${REGKEY}" "URLInfoAbout" "${WEBSITE}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${REGKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${REGKEY}" "DisplayIcon" "$INSTDIR\${APPEXE}"
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${REGKEY}" "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${REGKEY}" "NoRepair" 1

  ; Autostart
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APPNAME}" '"$INSTDIR\${APPEXE}"'

SectionEnd

; ── Uninstall ──
Section "Uninstall"
  nsExec::ExecToLog 'taskkill /F /IM "${APPEXE}"'

  RMDir /r "$INSTDIR"

  Delete "$DESKTOP\${APPNAME}.lnk"
  RMDir /r "$SMPROGRAMS\${APPNAME}"

  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${REGKEY}"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APPNAME}"
SectionEnd
