## Frontend (минимальный)

Интерфейс без сборки, на нативных ES-модулях.

### Docker (рекомендуется)

В корне репозитория:

```bash
docker compose up --build
```

Админка: `http://localhost:5173`  
API: `http://localhost:8000/docs`

Запросы к API идут на `http://<хост>:8000` (тот же hostname, что у страницы). Переопределение: `http://localhost:5173/?api=http://127.0.0.1:8000`

### Локально без Docker

Из корня проекта:

```powershell
python -m http.server 5173 --directory frontend
```

Открыть: `http://localhost:5173`

Примечание: нужен запущенный API на `http://localhost:8000`.
