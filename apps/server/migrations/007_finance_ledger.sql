CREATE TABLE IF NOT EXISTS finance_transactions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('income','expense')),
  amountCents INTEGER NOT NULL CHECK (amountCents > 0),
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  transactionDate TEXT NOT NULL,
  bookingId TEXT UNIQUE REFERENCES bookings(id) ON DELETE RESTRICT,
  createdBy TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_date_type ON finance_transactions(transactionDate, type);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_category ON finance_transactions(category, transactionDate);
