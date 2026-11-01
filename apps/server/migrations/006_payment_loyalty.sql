ALTER TABLE bookings ADD COLUMN paymentStatus TEXT NOT NULL DEFAULT 'unpaid' CHECK (paymentStatus IN ('unpaid','paid'));
ALTER TABLE bookings ADD COLUMN completedAt TEXT;
ALTER TABLE bookings ADD COLUMN paymentUpdatedAt TEXT;

CREATE TABLE IF NOT EXISTS loyalty_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO loyalty_settings (id, enabled) VALUES (1, 0);

CREATE TABLE IF NOT EXISTS loyalty_rewards (
  id TEXT PRIMARY KEY,
  customerEmail TEXT NOT NULL,
  customerName TEXT NOT NULL,
  cycleNumber INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'earned' CHECK (status IN ('earned','redeemed')),
  earnedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  redeemedAt TEXT,
  redeemedBookingId TEXT,
  redeemedService TEXT,
  UNIQUE(customerEmail, cycleNumber)
);
CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_customer ON loyalty_rewards (customerEmail, cycleNumber);
