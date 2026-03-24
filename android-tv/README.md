# InfraDesk TV — Android TV App

## Budowanie APK

1. Otwórz Android Studio → **Open** → wybierz folder `android-tv`
2. Poczekaj na sync Gradle
3. **Build → Build Bundle(s) / APK(s) → Build APK(s)**
4. APK znajdziesz w: `app/build/outputs/apk/debug/app-debug.apk`

## Instalacja na Android TV / Fire TV

```bash
adb connect <IP_TELEWIZORA>:5555
adb install app/build/outputs/apk/debug/app-debug.apk
```

Lub przez pendrive (sideload).

## Konfiguracja URL

W `MainActivity.kt` zmień:
```kotlin
private val TV_URL = "https://app.infradesk.pl/tv"
```

## Jak działa

- Aplikacja otwiera `/tv` w pełnoekranowym WebView
- Dane odświeżają się automatycznie co 30 sekund
- Token logowania przechowywany w localStorage WebView
- Przy pierwszym uruchomieniu pojawi się strona logowania InfraDesk
- Po zalogowaniu aplikacja zapamięta sesję

## Wymagania

- Android TV 5.0+ (API 21)
- Android Studio Electric Eel lub nowszy
