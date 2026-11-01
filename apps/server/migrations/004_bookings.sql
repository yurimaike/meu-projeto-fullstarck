CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  bookingCode TEXT NOT NULL UNIQUE,
  customerName TEXT NOT NULL,
  customerEmail TEXT NOT NULL,
  customerPhone TEXT NOT NULL,
  bookingDate TEXT NOT NULL,
  bookingTime TEXT NOT NULL,
  service TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','rejected','cancelled')),
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decidedAt TEXT,
  decisionNote TEXT
);
CREATE INDEX IF NOT EXISTS idx_bookings_date_status ON bookings (bookingDate, status);
CREATE INDEX IF NOT EXISTS idx_bookings_email ON bookings (customerEmail);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_active_slot ON bookings (bookingDate, bookingTime) WHERE status IN ('pending','confirmed');
