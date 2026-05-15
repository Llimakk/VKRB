# Бэкапы БД

Автоматический ежедневный дамп Postgres-контейнера в gzip с ротацией.

## Скрипт

`scripts/backup_db.sh` — выполняет `pg_dump --clean --if-exists` внутри контейнера, сжимает gzip-ом, пишет в `~/backups/vkrb/` и удаляет дампы старше `RETAIN_DAYS` (по умолчанию 14).

Конфигурация через переменные окружения:

| Переменная     | Значение по умолчанию       |
|----------------|------------------------------|
| `CONTAINER`    | `vkrb-db-1`                  |
| `DB_NAME`      | `vkrb`                       |
| `DB_USER`      | `postgres`                   |
| `BACKUP_DIR`   | `$HOME/backups/vkrb`         |
| `RETAIN_DAYS`  | `14`                         |

## Установка cron

Скрипт уже исполняемый. Открыть crontab:

```bash
crontab -e
```

Добавить строку (запуск каждый день в 04:00):

```
0 4 * * * /Users/resxton/Desktop/ВКР/VKRB/scripts/backup_db.sh >> /Users/resxton/backups/vkrb/backup.log 2>&1
```

Проверить расписание:

```bash
crontab -l
```

## Ручной запуск

```bash
./scripts/backup_db.sh
```

Дамп появится в `~/backups/vkrb/vkrb_YYYYMMDD_HHMMSS.sql.gz`.

## Восстановление

⚠️ Перед восстановлением убедись, что приложение не пишет в БД (останови `api`-контейнер).

```bash
docker compose stop api
gunzip -c ~/backups/vkrb/vkrb_20260516_040000.sql.gz | docker exec -i vkrb-db-1 psql -U postgres -d vkrb
docker compose start api
```

Флаги `--clean --if-exists` в `pg_dump` означают, что дамп при восстановлении сначала удалит существующие таблицы (`DROP TABLE IF EXISTS ...`), потом создаст их заново. Текущие данные потеряются.

## Проверка целостности дампа

Без восстановления — просто прочитать заголовок:

```bash
gunzip -c ~/backups/vkrb/vkrb_*.sql.gz | head -20
```

Должно начинаться с `-- PostgreSQL database dump`.

## Логи

`~/backups/vkrb/backup.log` — каждое выполнение пишет таймстамп, размер дампа, число удалённых старых файлов.

## Где хранится

Локально на машине, где запущен docker-compose. Для повышения надёжности можно настроить ещё одну копию во внешнее хранилище (Yandex Disk, iCloud Drive, отдельный диск) — добавить `cp` или `rsync` в конец `backup_db.sh`.
