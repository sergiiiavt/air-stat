CREATE TABLE IF NOT EXISTS kova_history_posts (
  post_id TEXT PRIMARY KEY,
  post_number INTEGER,
  published_at TEXT NOT NULL,
  text TEXT NOT NULL,
  url TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kova_history_posts_published_at
  ON kova_history_posts(published_at);
