## Frontend (минимальный)

Интерфейс без сборки, на нативных ES-модулях.

### Запуск
Из корня проекта `d:\VKRB`:

```powershell
python -m http.server 5173 --directory frontend
```

Открыть в браузере: `http://localhost:5173`

Примечание: запросы идут на `http://localhost:8000` (FastAPI).

