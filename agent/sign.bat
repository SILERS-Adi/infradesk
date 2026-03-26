@echo off
REM ═══════════════════════════════════════════════════════════════════════════
REM  InfraDesk Agent — Code Signing Script
REM
REM  WYMAGANIA:
REM  1. Certyfikat Code Signing (PFX) od zaufanego dostawcy:
REM     - DigiCert, Sectigo, GlobalSign, SSL.com
REM     - Cena: ~200-400 EUR/rok
REM     - Wymaga weryfikacji firmy SILERS
REM
REM  2. signtool.exe (Windows SDK):
REM     Zainstaluj: https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/
REM
REM  UŻYCIE:
REM    sign.bat                    — podpisz InfraDesk Agent.exe
REM    sign.bat path\to\file.exe  — podpisz dowolny plik
REM
REM  KONFIGURACJA:
REM    Ustaw zmienne poniżej przed pierwszym użyciem.
REM ═══════════════════════════════════════════════════════════════════════════

REM ── Konfiguracja (zmień na swoje dane) ─────────────────────────────────────
SET CERT_FILE=C:\certs\silers-codesign.pfx
SET CERT_PASS=TWOJE_HASLO
SET TIMESTAMP_URL=http://timestamp.digicert.com
SET SIGNTOOL="C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64\signtool.exe"

REM ── Plik do podpisania ─────────────────────────────────────────────────────
IF "%~1"=="" (
    SET FILE_TO_SIGN=dist\InfraDesk Agent.exe
) ELSE (
    SET FILE_TO_SIGN=%~1
)

echo.
echo  ╔═══════════════════════════════════════════╗
echo  ║   InfraDesk Agent — Code Signing          ║
echo  ╚═══════════════════════════════════════════╝
echo.

REM ── Sprawdź czy plik istnieje ──────────────────────────────────────────────
IF NOT EXIST "%FILE_TO_SIGN%" (
    echo  [BLAD] Plik nie znaleziony: %FILE_TO_SIGN%
    echo  Najpierw zbuduj agenta: python -m PyInstaller "InfraDesk Agent.spec" --noconfirm
    exit /b 1
)

REM ── Sprawdź czy certyfikat istnieje ────────────────────────────────────────
IF NOT EXIST "%CERT_FILE%" (
    echo  [BLAD] Certyfikat nie znaleziony: %CERT_FILE%
    echo.
    echo  Aby uzyskac certyfikat Code Signing:
    echo  1. Kup certyfikat od DigiCert, Sectigo lub GlobalSign (~200-400 EUR/rok)
    echo  2. Przejdz weryfikacje firmy SILERS
    echo  3. Pobierz plik PFX i umiesz go w %CERT_FILE%
    echo  4. Ustaw haslo w zmiennej CERT_PASS w tym skrypcie
    echo.
    echo  Alternatywa: Microsoft Trusted Signing (Azure)
    echo  https://learn.microsoft.com/en-us/azure/trusted-signing/
    exit /b 1
)

REM ── Sprawdź signtool ───────────────────────────────────────────────────────
IF NOT EXIST %SIGNTOOL% (
    echo  [BLAD] signtool.exe nie znaleziony
    echo  Zainstaluj Windows SDK: https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/
    exit /b 1
)

REM ── Podpisz ────────────────────────────────────────────────────────────────
echo  Podpisywanie: %FILE_TO_SIGN%
echo.

%SIGNTOOL% sign ^
    /f "%CERT_FILE%" ^
    /p "%CERT_PASS%" ^
    /tr %TIMESTAMP_URL% ^
    /td sha256 ^
    /fd sha256 ^
    /d "InfraDesk Agent" ^
    /du "https://infradesk.pl" ^
    "%FILE_TO_SIGN%"

IF %ERRORLEVEL% NEQ 0 (
    echo.
    echo  [BLAD] Podpisywanie nie powiodlo sie!
    exit /b 1
)

echo.
echo  [OK] Plik podpisany pomyslnie!
echo.

REM ── Weryfikacja ────────────────────────────────────────────────────────────
echo  Weryfikacja podpisu...
%SIGNTOOL% verify /pa /v "%FILE_TO_SIGN%"

echo.
echo  ══════════════════════════════════════════════
echo  Gotowe! Plik %FILE_TO_SIGN% jest podpisany.
echo  Wydawca: SILERS / InfraDesk
echo  ══════════════════════════════════════════════
