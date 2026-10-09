-- Customer-owned storage. A drive can connect buckets (S3-compatible, Google
-- Cloud Storage, Azure Blob Storage) and pick one for new uploads. Each file
-- and thumbnail records where its bytes are; NULL is Otterware's R2 bucket,
-- so every existing row keeps working as it is.
CREATE TABLE storage_backend (
  id TEXT PRIMARY KEY NOT NULL,
  -- The drive (a top-level folder). Not cascading: a drive can't be deleted
  -- while it has storage, so no file is ever left without its credentials.
  drive_id TEXT NOT NULL REFERENCES folder(id),
  name TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('s3', 'gcs', 'azure')),
  -- Bucket, region, endpoint, prefix: never secrets.
  location_json TEXT NOT NULL,
  -- AES-GCM, keyed from the Worker's secrets and bound to this row's id.
  credentials_ciphertext TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  verified_at TEXT
);
CREATE INDEX storage_backend_drive_idx ON storage_backend (drive_id);

-- The drive's storage for new uploads; NULL is Otterware's.
ALTER TABLE folder ADD COLUMN storage_backend_id TEXT REFERENCES storage_backend(id);

ALTER TABLE artifact_file ADD COLUMN storage_backend_id TEXT REFERENCES storage_backend(id);
CREATE INDEX artifact_file_storage_idx ON artifact_file (storage_backend_id)
  WHERE storage_backend_id IS NOT NULL;

ALTER TABLE artifact_version ADD COLUMN preview_storage_backend_id TEXT REFERENCES storage_backend(id);
