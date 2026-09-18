ALTER TABLE incidents ADD COLUMN reported_location_text TEXT;
ALTER TABLE incidents ADD COLUMN reported_location_specificity TEXT;
ALTER TABLE incidents ADD COLUMN location_redacted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE incidents ADD COLUMN display_radius_m INTEGER NOT NULL DEFAULT 0;
