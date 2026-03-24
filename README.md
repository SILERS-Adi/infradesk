# InfraDesk

**InfraDesk by SILERS** — Nowoczesna platforma operacyjna dla firm IT.

## O projekcie

InfraDesk to produkcyjny system do zarządzania klientami, lokalizacjami, infrastrukturą IT, danymi dostępowymi i zgłoszeniami serwisowymi.

**Moduły:**
- Zarządzanie klientami i lokalizacjami
- Inwentaryzacja urządzeń (CMDB)
- Serwis / Helpdesk (zgłoszenia, komentarze, przypisania)
- Vault danych dostępowych (szyfrowanie AES-256)
- Identyfikacja urządzeń przez QR
- Portal klienta
- Logi aktywności / audit trail
- Role: Administrator, Technik, Klient

## Stack

| Warstwa | Technologia |
|---------|-------------|
| Backend | Node.js, Express.js, TypeScript |
| Frontend | React 18, Vite, TypeScript, Tailwind CSS |
| Baza danych | PostgreSQL 16 |
| ORM | Prisma |
| Auth | JWT (access 15min + refresh 7d) |
| Deployment | Docker, docker-compose |

## Struktura projektu

```
infradesk/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   └── src/
│       ├── app.ts
│       ├── config/
│       ├── lib/
│       ├── middleware/
│       ├── modules/
│       │   ├── auth/
│       │   ├── users/
│       │   ├── clients/
│       │   ├── locations/
│       │   ├── devices/
│       │   ├── credentials/
│       │   ├── tickets/
│       │   ├── activityLogs/
│       │   └── dashboard/
│       └── utils/
├── frontend/
│   └── src/
│       ├── api/
│       ├── components/
│       │   ├── ui/
│       │   ├── layout/
│       │   └── forms/
│       ├── pages/
│       │   ├── auth/
│       │   ├── admin/
│       │   ├── portal/
│       │   └── qr/
│       ├── store/
│       └── types/
├── docker-compose.yml
├── docker-compose.dev.yml
└── README.md
```

## Konta demo

| Rola | Email | Hasło |
|------|-------|-------|
| Administrator | admin@infradesk.pl | Admin123! |
| Technik | jan.kowalski@infradesk.pl | Tech123! |
| Technik | anna.nowak@infradesk.pl | Tech123! |
| Klient | portal@techcorp.pl | Client123! |
| Klient | portal@retailchain.pl | Client123! |
| Klient | portal@hospital.pl | Client123! |

## Uruchomienie z Dockerem (produkcja)

```bash
git clone <repo>
cd infradesk

# Uruchom kontenery
docker-compose up -d --build

# Uruchom migracje i seed
docker exec infradesk-backend npx prisma migrate deploy
docker exec infradesk-backend npm run db:seed

# Otwórz aplikację
http://localhost        # Frontend
http://localhost:3000   # Backend API
```

## Uruchomienie lokalne (development)

```bash
# 1. Uruchom bazę danych
docker-compose -f docker-compose.dev.yml up -d

# 2. Backend
cd backend
npm install
cp .env.example .env    # uzupełnij zmienne
npx prisma generate
npx prisma migrate dev
npm run db:seed
npm run dev             # http://localhost:3000

# 3. Frontend (nowy terminal)
cd frontend
npm install
cp .env.example .env
npm run dev             # http://localhost:5173
```

## Zmienne środowiskowe

### backend/.env

| Zmienna | Opis | Przykład |
|---------|------|---------|
| DATABASE_URL | Connection string do PostgreSQL | postgresql://infradesk:infradesk@localhost:5432/infradesk |
| JWT_SECRET | Klucz JWT (min 32 znaki) | losowy string |
| JWT_REFRESH_SECRET | Klucz refresh token (min 32 znaki) | losowy string |
| ENCRYPTION_KEY | Klucz AES-256 (dokładnie 32 znaki) | losowy 32-znakowy string |
| PORT | Port backendu | 3000 |
| NODE_ENV | Środowisko | development / production |

### frontend/.env

| Zmienna | Opis |
|---------|------|
| VITE_API_URL | URL backendu | http://localhost:3000/api |

## API — główne endpointy

```
POST   /api/auth/login
POST   /api/auth/refresh
GET    /api/auth/me

GET    /api/clients
GET    /api/clients/:id
POST   /api/clients
PATCH  /api/clients/:id

GET    /api/locations
GET    /api/locations/:id
POST   /api/locations

GET    /api/devices
GET    /api/devices/:id
GET    /api/devices/:id/qr      → base64 PNG
GET    /api/qr/:qrCodeValue     → publiczny endpoint QR
POST   /api/devices

GET    /api/credentials
POST   /api/credentials
POST   /api/credentials/:id/reveal   → odszyfruj hasło (logowane)

GET    /api/tickets
POST   /api/tickets
GET    /api/tickets/:id
POST   /api/tickets/:id/comments
POST   /api/tickets/:id/assign
POST   /api/tickets/:id/status

GET    /api/activity-logs
GET    /api/dashboard
GET    /api/dashboard/client
```

## Bezpieczeństwo

- Hasła użytkowników: bcrypt
- Hasła w vault: szyfrowanie AES-256-CBC
- Hasła nigdy nie są zwracane w listach ani szczegółach
- Odsłonięcie hasła tylko przez `/reveal` z logowaniem audytowym
- JWT access token: 15 minut
- JWT refresh token: 7 dni
- Izolacja danych klientów na poziomie backendu

## Deploy na VPS

```bash
# Na serwerze Ubuntu/Debian
sudo apt install docker.io docker-compose -y

git clone <repo> /var/www/infradesk
cd /var/www/infradesk

# Uzupełnij sekrety w docker-compose.yml
# ...

docker-compose up -d --build
docker exec infradesk-backend npm run db:seed

# Domena: infradesk.pl → port 80
```
