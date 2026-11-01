-- Adds an optional account association. Existing guest reservations remain unlinked.
ALTER TABLE bookings
  ADD COLUMN userId TEXT REFERENCES user (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_user_date_status
  ON bookings (userId, bookingDate, status);
