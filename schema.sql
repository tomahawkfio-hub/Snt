-- SNT Links — Cloudflare D1
CREATE TABLE IF NOT EXISTS links (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  original_url TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  clicks INTEGER NOT NULL DEFAULT 0,
  filtered_clicks INTEGER NOT NULL DEFAULT 0,
  interaction_clicks INTEGER NOT NULL DEFAULT 0,
  social_title TEXT NOT NULL DEFAULT '',
  social_description TEXT NOT NULL DEFAULT '',
  social_image TEXT NOT NULL DEFAULT '',
  social_fetched_at TEXT NOT NULL DEFAULT '',
  disabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_links_created ON links(created_at DESC);

CREATE TABLE IF NOT EXISTS click_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id TEXT NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  clicked_at TEXT NOT NULL DEFAULT (datetime('now')),
  country TEXT NOT NULL DEFAULT 'XX',
  referrer_domain TEXT NOT NULL DEFAULT 'direto',
  device TEXT NOT NULL DEFAULT 'desktop',
  visitor_hash TEXT NOT NULL,
  qualified INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_events_day ON click_events(clicked_at);
CREATE INDEX IF NOT EXISTS idx_events_link ON click_events(link_id, clicked_at);
CREATE INDEX IF NOT EXISTS idx_events_filtered_dedupe ON click_events(link_id,visitor_hash,qualified,clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_filtered_day ON click_events(qualified,clicked_at);
CREATE TRIGGER IF NOT EXISTS trg_interaction_click_insert AFTER INSERT ON click_events
WHEN NEW.qualified=2
BEGIN
  UPDATE links SET interaction_clicks=interaction_clicks+1 WHERE id=NEW.link_id;
END;

CREATE TABLE IF NOT EXISTS request_audit_daily (
  link_id TEXT NOT NULL,
  day TEXT NOT NULL,
  classification TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (link_id,day,classification)
);

CREATE TABLE IF NOT EXISTS login_attempts (
  bucket TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_created ON login_attempts(created_at);
