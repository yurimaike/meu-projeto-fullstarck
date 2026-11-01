-- Idempotent guest booking submission; no existing reservation rows are modified.
ALTER TABLE bookings ADD COLUMN idempotencyKey TEXT;
ALTER TABLE bookings ADD COLUMN requestHash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_idempotency_key ON bookings (idempotencyKey) WHERE idempotencyKey IS NOT NULL;
