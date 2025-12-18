USE db_partkatalog;

ALTER TABLE illustrations ADD COLUMN IF NOT EXISTS no_posisi VARCHAR(255) DEFAULT '' AFTER nama_posisi;
