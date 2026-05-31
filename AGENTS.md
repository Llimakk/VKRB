# AGENTS.md

## Cursor Cloud specific instructions

### Product

**VKRB Navigator** admin slice: FastAPI backend + static ES-module frontend for managing campuses, buildings, structures, floors, floor plans (MinIO), and POIs. No auth or navigation yet.

### Services (not in Compose)

| Service | How to start | URL |
|---------|----------------|-----|
| PostgreSQL, MinIO, API | `sudo docker compose up --build -d` from repo root | API `http://localhost:8000`, MinIO `http://localhost:9000`, DB `5432` |
| Frontend static server | `python3 -m http.server 5173 --directory frontend` from repo root | `http://localhost:5173` |

On fresh Cloud VMs, Docker may need to be installed and started (`sudo service docker start`). This environment uses `fuse-overlayfs` as the Docker storage driver.

The frontend is **not** in `docker-compose.yml`. Browser E2E requires both Compose **and** the static server on port 5173.

### Verify stack

- `curl http://localhost:8000/health` → `{"status":"ok"}`
- OpenAPI: `http://localhost:8000/docs`
- Frontend talks to API at port 8000 (`frontend/js/config.js` uses same hostname as the page).

### Lint / test / build

The repo defines **no** lint, test, or frontend build scripts (no `package.json`, `Makefile`, or `pytest` suite). Backend dependencies are installed inside the `api` Docker image (`backend/requirements.txt`). Frontend is served as static files only.

### Local backend without Docker

From `backend/`: Python 3.12 venv, `pip install -r requirements.txt`, set `DATABASE_URL` and `MINIO_*` env vars (see `backend/README.md`), then `python run.py`. Requires PostgreSQL and MinIO reachable separately.

### Gotchas

- API waits for Postgres healthcheck before starting; first `docker compose up` can take ~30s.
- Plan images expect MinIO bucket `plans` with public read unless `MINIO_USE_PRESIGNED=true`.
- CORS is open (`allow_origins=["*"]`) for local dev.
