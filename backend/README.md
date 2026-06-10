## Admin API

Backend для интерфейса администратора

### Docker

В корне репозитория:

```bash
docker compose up --build
```

Админка (frontend): `http://localhost:5173`  
API: `http://localhost:8000/docs`

### venv (локально)

Из папки `backend`:

```bash
py -3.12 -m venv .venv
```

Windows PowerShell:

```powershell
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python run.py
```

Перед запуском должны быть заданы env-переменные:
- `DATABASE_URL`
- `MINIO_ENDPOINT`
- `MINIO_ACCESS_KEY`
- `MINIO_SECRET_KEY`
- `MINIO_BUCKET`
- `MINIO_SECURE`
- `MINIO_PUBLIC_BASE_URL` (или `MINIO_PUBLIC_ENDPOINT` + схема) — базовый URL Minio для ссылок в браузере, например `http://localhost:9000`

Картинки: в БД — `minio_object_key`, `mime_type`, `photo_url` (постоянная прямая ссылка на объект). **По умолчанию** ожидается **публичное чтение** bucket в MinIO: тогда `photo_url` — это `http://…:9000/<bucket>/<key>` без срока жизни. Если bucket **приватный**, задайте `MINIO_USE_PRESIGNED=true` — тогда в ответах будут presigned URL (срок — `MINIO_PRESIGN_EXPIRES_SECONDS`).

### Эндпоинты

Дерево:
- `GET /admin/campuses`
- `GET /admin/buildings?campus_id=...`
- `GET /admin/structures?building_id=...`
- `GET /admin/floors?structure_id=...`

CRUD дерева:
- `POST /admin/campuses`, `DELETE /admin/campuses/{id}`
- `POST /admin/buildings`, `DELETE /admin/buildings/{id}`
- `POST /admin/structures`, `DELETE /admin/structures/{id}`
- `POST /admin/floors`, `DELETE /admin/floors/{id}`

Планы:
- `GET /admin/plans/tree` — дерево с `image_exists` и `photo_url` на плане этажа
- `GET /admin/floors/{floor_id}/plan` — метаданные плана этажа + `photo_url`
- `GET /admin/floors/{floor_id}/context` — план + объекты + `photo_url`
- `GET /admin/plans/{plan_id}` — метаданные плана + объекты на плане + `photo_url`
- `PUT /admin/plans/{plan_id}/image` — загрузить/заменить JPG (в ответе `photo_url`)
- `DELETE /admin/plans/{plan_id}/image` — удалить только JPG

Фото кампуса/корпуса/строения:
- `PUT /admin/{campus|building|structure}/{id}/image`, `DELETE .../image` — в ответе `photo_url`

Объекты:
- `GET /admin/floors/{floor_id}/objects`
- `POST /admin/objects`
- `PATCH /admin/objects/{id}`
- `DELETE /admin/objects/{id}`

Типы объектов:
- `GET /admin/object-types`
- `POST /admin/object-types`

