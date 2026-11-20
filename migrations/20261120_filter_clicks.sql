-- SNT Links: executar UMA VEZ em bancos já existentes, antes da versão filtrada.
-- Preserva integralmente as contagens históricas (não auditadas).
ALTER TABLE links ADD COLUMN filtered_clicks INTEGER NOT NULL DEFAULT 0;
ALTER TABLE click_events ADD COLUMN qualified INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_events_filtered_dedupe ON click_events(link_id,visitor_hash,qualified,clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_filtered_day ON click_events(qualified,clicked_at);
-- Os registros anteriores ficam qualified=0.
-- A nova API exibe filtered_clicks; links.clicks permanece para auditoria histórica.
