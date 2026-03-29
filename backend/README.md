## VKRB Navigator — Admin API

Backend для админки (без навигации и авторизации).

### Docker

В корне репозитория:

```bash
docker compose up --build
```

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
- `GET /admin/plans/tree` — дерево с меткой `image_exists`
- `GET /admin/floors/{floor_id}/plan` — метаданные плана этажа
- `GET /admin/plans/{plan_id}` — метаданные плана + объекты на плане
- `GET /admin/plans/{plan_id}/image` — получить JPG (байты)
- `PUT /admin/plans/{plan_id}/image` — загрузить/заменить JPG
- `DELETE /admin/plans/{plan_id}/image` — удалить только JPG

Объекты:
- `GET /admin/floors/{floor_id}/objects`
- `POST /admin/objects`
- `PATCH /admin/objects/{id}`
- `DELETE /admin/objects/{id}`

Типы объектов:
- `GET /admin/object-types`
- `POST /admin/object-types`

