-- SNT Links: executar apenas em bancos existentes antes do deploy social.
ALTER TABLE links ADD COLUMN social_title TEXT NOT NULL DEFAULT '';
ALTER TABLE links ADD COLUMN social_description TEXT NOT NULL DEFAULT '';
ALTER TABLE links ADD COLUMN social_image TEXT NOT NULL DEFAULT '';
ALTER TABLE links ADD COLUMN social_fetched_at TEXT NOT NULL DEFAULT '';
-- Sem modificações em URLs, eventos ou cliques existentes.
