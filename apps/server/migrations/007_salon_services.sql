CREATE TABLE IF NOT EXISTS salon_services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  durationMinutes INTEGER NOT NULL DEFAULT 60 CHECK (durationMinutes BETWEEN 5 AND 600),
  priceCents INTEGER NOT NULL DEFAULT 0 CHECK (priceCents >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_salon_services_active_name ON salon_services(active, name);
