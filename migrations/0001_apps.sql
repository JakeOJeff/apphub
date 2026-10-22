-- Apps and their encrypted data sources.
CREATE TABLE IF NOT EXISTS apps (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL
);
