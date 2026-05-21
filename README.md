# VKRB Navigator

Система навигации по университетскому кампусу. Сервис состоит из трёх частей:

| Часть                | Стек                                                 | Назначение                                                          |
| -------------------- | ---------------------------------------------------- | ------------------------------------------------------------------- |
| **Backend**          | FastAPI · SQLAlchemy · PostgreSQL · MinIO            | REST API, расчёт маршрутов (Дейкстра), хранение планов              |
| **Frontend-редактор**| React 19 · TypeScript · Zustand · Webpack 5          | Веб-редактор полигонов, нав-узлов и рёбер для администратора        |
| **iOS-клиент**       | SwiftUI · MVVM · async/await                         | Мобильный навигатор для пользователя (см. отдельный репозиторий)    |

Все сетевые запросы проходят через **nginx** на 80-м порту — он раздаёт статику фронтенда, проксирует API и отдаёт изображения планов из MinIO.

## Архитектура

```
                  ┌────────────────┐
                  │     nginx      │   :80
                  └────────────────┘
                    │     │     │
   /admin /mobile   │     │     │   /plans/*
   /auth /docs ─────┘     │     └────────► MinIO  (бакет "plans")
                          │
                          │   /*
                          └──► frontend/dist (React SPA)

   /admin|/mobile|/auth|/docs|/redoc|/openapi.json
                          │
                          ▼
                  ┌────────────────┐
                  │  FastAPI (api) │   :8000 (внутри docker-сети)
                  └────────────────┘
                          │
                          ▼
                  ┌────────────────┐
                  │  PostgreSQL    │   :5432
                  └────────────────┘
```

## Быстрый старт

Требуется Docker Desktop (или docker engine + compose v2).

```bash
# 1. Клонировать проект и создать .env из примера
cp .env.example .env

# 2. Поднять весь стек (db, api, minio, nginx)
docker compose up --build -d

# 3. Открыть редактор
open http://localhost
```

После запуска доступны:

| URL                         | Что                                                       |
| --------------------------- | --------------------------------------------------------- |
| `http://localhost/`         | Веб-редактор (React)                                      |
| `http://localhost/docs`     | Swagger UI с REST API                                     |
| `http://localhost/redoc`    | ReDoc — альтернативный UI документации                    |
| `http://localhost:9001`     | MinIO Console (логин/пароль из `.env`)                    |

## Конфигурация (`.env`)

```dotenv
# Публичный адрес, по которому клиенты обращаются к серверу.
# Локально — оставь localhost. Для ngrok — поддомен .ngrok-free.app.
# Для домашней сети / VPN — твой IP, например 195.19.46.160.
PUBLIC_HOST=localhost
PUBLIC_BASE_URL=http://localhost
PUBLIC_SECURE=false        # true если за HTTPS-прокси (ngrok, Caddy + Let's Encrypt и т.п.)

# PostgreSQL
POSTGRES_PASSWORD=postgres

# MinIO — S3-совместимое хранилище для PNG планов
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin

# JWT — поменяй на свой! Сгенерировать: openssl rand -hex 32
JWT_SECRET_KEY=change-me-in-production
```

`PUBLIC_HOST` критичен: MinIO создаёт presigned-URL с подписью, привязанной к хосту. Если поменял IP/домен — пересобери `api` (`docker compose up --build api -d`).

## Доступ извне (для тестирования мобилки на устройстве)

Варианты по убыванию сложности:

1. **Тот же Wi-Fi** — узнай IP компа (`ifconfig | grep "inet "`), поставь в `.env`, в iOS-клиенте обнови `APIClient.base`.
2. **ngrok** — `ngrok http 80`, поставь полученный URL в `.env` как `PUBLIC_HOST` и `PUBLIC_BASE_URL=https://...`, `PUBLIC_SECURE=true`.
3. **Реальный домен + HTTPS** — поставь Caddy/Traefik перед nginx, оформи Let's Encrypt.

Подробности — в [backend/README.md](backend/README.md).

## Структура репозитория

```
backend/        FastAPI API
  app/
    api/          эндпоинты (admin/, mobile.py, auth.py)
    models/       SQLAlchemy-модели
    schemas/      Pydantic-схемы
    services/     routing, minio, image, auth
    db/           сессия
  Dockerfile
  README.md       детали бэкенда
  BACKUP.md       автобэкап БД
frontend/       React-редактор
  src/
    components/   SVGCanvas, ModeSelector, панели, диалоги
    store/        Zustand-стор + история (undo/redo)
    api.ts        клиент к /admin
  README.md       детали редактора
nginx/          nginx.conf для роутинга
scripts/        backup_db.sh
docker-compose.yml
.env.example
```

## Запросы об архитектуре

- Маршрут строится по узлам `nav_node` и рёбрам `nav_edge`. Inter-floor (stairs, elevator) и cross-structure (passage) рёбра — **виртуальные**, создаются автоматически по совпадению имени узла.
- Cross-building маршруты идут через `exit`-узлы с GPS-координатами; стоимость ребра — Haversine.
- Объекты-комнаты имеют **полигон** (для подсветки на карте) и связь с одним или несколькими `nav_node` через `object_entry_node` (для множественных входов в комнату).
- iOS-приложение получает готовый маршрут с инструкциями и полилиниями для каждого этажа — никаких вычислений на клиенте.

## Бэкап БД

См. [backend/BACKUP.md](backend/BACKUP.md). Кратко: `scripts/backup_db.sh` дампит контейнер `vkrb-db-1` в `~/backups/vkrb/`, ротация 14 дней, ставится в `crontab`.

## Лицензия

Учебный проект (ВКР МГТУ им. Н.Э. Баумана).
