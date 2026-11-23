-- SNT Links SaaS (22/11/2026): não apaga nenhuma notícia ou clique.
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK(role='member'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','suspended')),
  plan_cents INTEGER NOT NULL DEFAULT 990 CHECK(plan_cents IN (990,1500)),
  paid_until TEXT,
  session_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status,paid_until);
ALTER TABLE links ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'superadmin';
CREATE INDEX IF NOT EXISTS idx_links_owner_created ON links(owner_id,created_at DESC);
-- A conta superadmin é virtual e usa o segredo ADMIN_PASSWORD já ativo.
-- Os links criados antes desta migração permanecem atribuídos a superadmin.
-- Contas pagas somente após ativação manual no painel; sem cobranças automáticas.
