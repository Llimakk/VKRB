-- Колонка photo_url: публичная ссылка на объект в Minio для прямой загрузки в браузере.
-- Выполнить вручную в pgAdmin после деплоя кода.

ALTER TABLE campus ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE building ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE structure ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE plan ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- Старые строки без photo_url: API всё равно отдаёт ссылку через minio_object_key (effective_photo_url).
-- Чтобы сохранить URL в БД, можно перезагрузить изображения через админку.
