-- Доп. поля: номер, полное имя, описание; для сущностей локаций и плановых объектов — адрес и чертёж (MinIO).

-- object_type
ALTER TABLE object_type ADD COLUMN IF NOT EXISTS number INTEGER;
ALTER TABLE object_type ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE object_type ADD COLUMN IF NOT EXISTS description TEXT;

UPDATE object_type SET number = id WHERE number IS NULL;

-- object_kind
ALTER TABLE object_kind ADD COLUMN IF NOT EXISTS number INTEGER;
ALTER TABLE object_kind ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE object_kind ADD COLUMN IF NOT EXISTS description TEXT;

UPDATE object_kind SET number = id WHERE number IS NULL;

-- campus
ALTER TABLE campus ADD COLUMN IF NOT EXISTS number INTEGER;
ALTER TABLE campus ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE campus ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE campus ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE campus ADD COLUMN IF NOT EXISTS drawing_minio_object_key TEXT;
ALTER TABLE campus ADD COLUMN IF NOT EXISTS drawing_mime_type VARCHAR(100);
ALTER TABLE campus ADD COLUMN IF NOT EXISTS drawing_url TEXT;

UPDATE campus SET number = id WHERE number IS NULL;

-- building
ALTER TABLE building ADD COLUMN IF NOT EXISTS number INTEGER;
ALTER TABLE building ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE building ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE building ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE building ADD COLUMN IF NOT EXISTS drawing_minio_object_key TEXT;
ALTER TABLE building ADD COLUMN IF NOT EXISTS drawing_mime_type VARCHAR(100);
ALTER TABLE building ADD COLUMN IF NOT EXISTS drawing_url TEXT;

UPDATE building SET number = id WHERE number IS NULL;

-- structure
ALTER TABLE structure ADD COLUMN IF NOT EXISTS number INTEGER;
ALTER TABLE structure ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE structure ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE structure ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE structure ADD COLUMN IF NOT EXISTS drawing_minio_object_key TEXT;
ALTER TABLE structure ADD COLUMN IF NOT EXISTS drawing_mime_type VARCHAR(100);
ALTER TABLE structure ADD COLUMN IF NOT EXISTS drawing_url TEXT;

UPDATE structure SET number = id WHERE number IS NULL;

-- floor
ALTER TABLE floor ADD COLUMN IF NOT EXISTS number INTEGER;
ALTER TABLE floor ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE floor ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE floor ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE floor ADD COLUMN IF NOT EXISTS drawing_minio_object_key TEXT;
ALTER TABLE floor ADD COLUMN IF NOT EXISTS drawing_mime_type VARCHAR(100);
ALTER TABLE floor ADD COLUMN IF NOT EXISTS drawing_url TEXT;

UPDATE floor SET number = id WHERE number IS NULL;

-- transition_zone
ALTER TABLE transition_zone ADD COLUMN IF NOT EXISTS number INTEGER;
ALTER TABLE transition_zone ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE transition_zone ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE transition_zone ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE transition_zone ADD COLUMN IF NOT EXISTS drawing_minio_object_key TEXT;
ALTER TABLE transition_zone ADD COLUMN IF NOT EXISTS drawing_mime_type VARCHAR(100);
ALTER TABLE transition_zone ADD COLUMN IF NOT EXISTS drawing_url TEXT;

UPDATE transition_zone SET number = id WHERE number IS NULL;

-- object (на плане)
ALTER TABLE object ADD COLUMN IF NOT EXISTS number INTEGER;
ALTER TABLE object ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE object ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE object ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE object ADD COLUMN IF NOT EXISTS drawing_minio_object_key TEXT;
ALTER TABLE object ADD COLUMN IF NOT EXISTS drawing_mime_type VARCHAR(100);
ALTER TABLE object ADD COLUMN IF NOT EXISTS drawing_url TEXT;

UPDATE object SET number = id WHERE number IS NULL;
