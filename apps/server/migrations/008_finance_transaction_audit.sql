CREATE TABLE IF NOT EXISTS finance_transaction_audit (
  id TEXT PRIMARY KEY,
  transactionId TEXT NOT NULL REFERENCES finance_transactions(id) ON DELETE RESTRICT,
  changedBy TEXT NOT NULL,
  oldValues TEXT NOT NULL,
  newValues TEXT NOT NULL,
  changedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_finance_transaction_audit_transaction
ON finance_transaction_audit(transactionId, changedAt);