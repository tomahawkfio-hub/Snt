
-- Demonstrações completamente separadas dos eventos e contadores de cliques reais.
-- Sempre apresentar ao superadmin como DADOS FICTÍCIOS.
CREATE TABLE IF NOT EXISTS demo_daily_views (
 day TEXT NOT NULL,
 owner_id TEXT NOT NULL,
 link_id TEXT NOT NULL REFERENCES links(id) ON DELETE CASCADE,
 views INTEGER NOT NULL CHECK(views>=0),
 label TEXT NOT NULL DEFAULT 'FICTICIO - DEMONSTRACAO',
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 PRIMARY KEY (day,owner_id,link_id)
);
CREATE INDEX IF NOT EXISTS idx_demo_daily_owner_day ON demo_daily_views(owner_id,day);
