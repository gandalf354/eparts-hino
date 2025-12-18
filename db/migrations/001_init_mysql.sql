CREATE DATABASE IF NOT EXISTS db_partkatalog CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE db_partkatalog;

CREATE TABLE IF NOT EXISTS illustrations (
  iid BIGINT AUTO_INCREMENT PRIMARY KEY,
  jenis VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  model VARCHAR(255) NOT NULL,
  image VARCHAR(255) NOT NULL,
  width INT NOT NULL,
  height INT NOT NULL
);

CREATE TABLE IF NOT EXISTS parts (
  id VARCHAR(64) PRIMARY KEY,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL
);

ALTER TABLE parts ADD COLUMN IF NOT EXISTS price INT NOT NULL DEFAULT 0 AFTER name;

ALTER TABLE illustrations ADD COLUMN IF NOT EXISTS model VARCHAR(255) NOT NULL DEFAULT '' AFTER name;

CREATE TABLE IF NOT EXISTS illustration_parts (
  illustration_id VARCHAR(64) NOT NULL,
  illustration_iid BIGINT NOT NULL,
  part_id VARCHAR(64) NOT NULL,
  PRIMARY KEY (illustration_iid, part_id),
  KEY idx_illustration_parts_part (part_id),
  KEY idx_illustration_parts_illustration_id (illustration_id),
  CONSTRAINT fk_illustration_parts_illustration_iid FOREIGN KEY (illustration_iid)
    REFERENCES illustrations(iid) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_illustration_parts_part FOREIGN KEY (part_id)
    REFERENCES parts(id) ON DELETE CASCADE ON UPDATE CASCADE
);
ALTER TABLE illustration_parts ADD COLUMN IF NOT EXISTS illustration_iid BIGINT NOT NULL AFTER illustration_id;
ALTER TABLE illustration_parts DROP PRIMARY KEY;
ALTER TABLE illustration_parts ADD PRIMARY KEY (illustration_iid, part_id);
ALTER TABLE illustration_parts ADD INDEX IF NOT EXISTS idx_illustration_parts_illustration_iid (illustration_iid);
ALTER TABLE illustration_parts ADD CONSTRAINT IF NOT EXISTS fk_illustration_parts_illustration_iid FOREIGN KEY (illustration_iid) REFERENCES illustrations(iid) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS hotspots (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  illustration_id VARCHAR(64) NOT NULL,
  illustration_iid BIGINT NULL,
  x INT NOT NULL,
  y INT NOT NULL,
  r INT NOT NULL,
  KEY idx_hotspots_illustration (illustration_id),
  CONSTRAINT fk_hotspots_illustration FOREIGN KEY (illustration_id)
    REFERENCES illustrations(id) ON DELETE CASCADE ON UPDATE CASCADE
);
ALTER TABLE hotspots ADD COLUMN IF NOT EXISTS illustration_iid BIGINT NULL AFTER illustration_id;
ALTER TABLE hotspots ADD INDEX IF NOT EXISTS idx_hotspots_illustration_iid (illustration_iid);
ALTER TABLE hotspots ADD CONSTRAINT IF NOT EXISTS fk_hotspots_illustration_iid FOREIGN KEY (illustration_iid) REFERENCES illustrations(iid) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS hotspot_parts (
  hotspot_id BIGINT NOT NULL,
  part_id VARCHAR(64) NOT NULL,
  PRIMARY KEY (hotspot_id, part_id),
  KEY idx_hotspot_parts_part (part_id),
  CONSTRAINT fk_hotspot_parts_hotspot FOREIGN KEY (hotspot_id)
    REFERENCES hotspots(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_hotspot_parts_part FOREIGN KEY (part_id)
    REFERENCES parts(id) ON DELETE CASCADE ON UPDATE CASCADE
);
