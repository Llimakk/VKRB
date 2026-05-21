# VKRB Navigator — Backend

FastAPI-сервис: админка планов, мобильный API навигации, JWT-авторизация.

Базовый запуск описан в [корневом README](../README.md) — здесь только бэкенд-специфичные детали.

## Запуск без Docker

Когда нужен дебаг в IDE с горячей перезагрузкой:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Перед запуском нужен поднятый Postgres и MinIO (можно поднять только их через compose):

```bash
docker compose up -d db minio
```

И переменные окружения (или `.env`-loader):

```bash
export DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/vkrb
export MINIO_ENDPOINT=localhost:9000
export MINIO_PUBLIC_BASE_URL=http://localhost
export MINIO_ACCESS_KEY=minioadmin
export MINIO_SECRET_KEY=minioadmin
export MINIO_BUCKET=plans
export MINIO_USE_PRESIGNED=true
export JWT_SECRET_KEY=$(openssl rand -hex 32)

python run.py
```

API поднимется на `http://localhost:8000`, Swagger — `http://localhost:8000/docs`.

## Структура

```text
app/
  api/
    admin/           — /admin/* (редактор: дерево, планы, граф, объекты)
    mobile.py        — /mobile/* (мобильное приложение: tree, search, route, plan)
    auth.py          — /auth/* (register, login, me, change-password)
    deps.py          — Depends-фабрики (get_db, get_current_user, get_optional_user)
  models/            — SQLAlchemy ORM
  schemas/           — Pydantic IO-схемы
  services/
    routing.py       — Дейкстра, построение шагов и полилиний
    minio_service.py — загрузка/удаление файлов, presigned URL
    image_service.py — оптимизация PNG при загрузке (ресайз + квантизация)
    auth_service.py  — bcrypt-хеши, JWT
  db/                — engine, sessionmaker, Base
main.py              — точка входа (app = FastAPI(...))
```

## Эндпоинты

Полный актуальный список — в Swagger: [/docs](http://localhost/docs).

Группы:

| Префикс       | Назначение                                                | Авторизация                          |
| ------------- | --------------------------------------------------------- | ------------------------------------ |
| `/auth/*`     | Регистрация, логин, профиль, смена пароля                 | JWT (где нужен)                      |
| `/admin/*`    | Редактор: дерево, CRUD узлов, граф плана, объекты, фото   | нет\*                                |
| `/mobile/*`   | Поиск, дерево, план этажа, маршрут                        | опц. JWT (только для `avoid_stairs`) |

\* Защита `/admin/*` запланирована, сейчас открыто на чтение и запись — рассчитано на доверенную сеть.

### Ключевые мобильные эндпоинты

- `GET /mobile/tree` — иерархия кампусов с этажами (отсортировано: верхний этаж сверху)
- `GET /mobile/objects/search?q=...&node_type=room|toilet|exit` — поиск; возвращает и Object-ы (комнаты/туалеты), и nav-узлы (выходы) с дискриминатором `kind`
- `GET /mobile/floors/{id}/plan` — план + полигоны объектов на этаже
- `POST /mobile/route` — построить маршрут; принимает `from_object_id` или `from_node_id` (аналогично `to_*`); если JWT-токен передан и у юзера `avoid_stairs=true`, лестницы избегаются

### Алгоритм маршрута

В `services/routing.py`:

1. Загружается весь граф (`_load_graph`) — один SELECT всех `nav_node` и `nav_edge`.
2. Добавляются виртуальные рёбра:
   - **Inter-floor** (lift, stairs) — узлы с одинаковым `name` на разных этажах одной структуры, стоимость 15м.
   - **Cross-structure** (passage) — переходы между корпусами на одном этаже, стоимость 5м.
   - **Cross-building outdoor** — exit-узлы с GPS-координатами разных корпусов; стоимость = Haversine.
3. Если `avoid_stairs=True` — стоимость рёбер, касающихся `stairs`-узлов, увеличивается на 100 000.
4. **Дейкстра** возвращает путь.
5. `_build_steps` собирает человекочитаемые шаги: «Идите прямо ~12 м», «Поверните налево», «Поднимитесь на 5 этаж на лифте», «Войдите в 309».
6. Полилинии сегментов строятся через `_segment_polyline` с учётом **waypoints** на рёбрах (изгибы внутри сложных комнат).

## База данных

- ER-диаграмма — `vkrb-rpz/docs/er.png` (если есть; иначе посмотри `docs/` или генерируется из `models.py`).
- Миграций нет — таблицы создаются автоматически при старте через `Base.metadata.create_all`. Изменения схемы вне разработки делай через `ALTER TABLE` руками.

## MinIO

Один бакет `plans` хранит PNG планов этажей. Загрузка (`PUT /admin/plans/{id}/image`) проходит через `image_service.optimize_plan_image`:

- ресайз до 2400px по длинной стороне (LANCZOS),
- квантизация ≤256 цветов,
- PNG с максимальным zlib-сжатием.

Типичный план 3-4 MB сжимается до 300-600 KB без потери читаемости.

Ссылки на файлы — **presigned** (по умолчанию `MINIO_USE_PRESIGNED=true`). Подпись привязана к хосту, поэтому при смене `PUBLIC_HOST` нужно пересобрать `api`:

```bash
docker compose up --build api -d
```

## Авторизация

JWT через `python-jose`, пароли — `bcrypt`. Время жизни токена — 7 суток (`auth_service.py:ACCESS_TOKEN_EXPIRE_DAYS`). Клиент должен слать `Authorization: Bearer <token>`.

`/admin/*` пока **открыты**. Это намеренно: редактор используется в доверенной сети. Если нужно закрыть — раскомментируй `Depends(get_current_user)` в `app/api/admin/__init__.py`.

## Бэкап БД

См. [BACKUP.md](BACKUP.md).

## Полезное

- Лог-уровень — стандартный uvicorn.info. Для дебага `LOGURU_LEVEL=DEBUG`/`uvicorn --log-level debug`.
- Принудительный сброс схемы (потеря данных!): `docker compose down -v && docker compose up -d` — `-v` удаляет volume Postgres.
- Подключиться к БД из контейнера: `docker exec -it vkrb-db-1 psql -U postgres -d vkrb`.
- Список таблиц в живом контейнере: `docker exec vkrb-db-1 psql -U postgres -d vkrb -c "\dt"`.
