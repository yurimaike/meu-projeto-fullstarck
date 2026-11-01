CREATE TABLE IF NOT EXISTS authorized_emails (
  email TEXT PRIMARY KEY,
  createdBy TEXT NOT NULL,
  createdAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_authorized_emails_created_at ON authorized_emails(createdAt);
