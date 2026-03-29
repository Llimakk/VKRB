-- Добавляет колонки для хранения JPG (Minio key + mime) для campus/building/structure.
-- Применять один раз к существующей БД.

alter table if exists campus add column if not exists minio_object_key text;
alter table if exists campus add column if not exists mime_type varchar(100);

alter table if exists building add column if not exists minio_object_key text;
alter table if exists building add column if not exists mime_type varchar(100);

alter table if exists structure add column if not exists minio_object_key text;
alter table if exists structure add column if not exists mime_type varchar(100);

