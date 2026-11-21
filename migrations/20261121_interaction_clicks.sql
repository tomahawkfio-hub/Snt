-- Executar UMA VEZ em bancos SNT Links existentes (21/11/2026).
-- Os eventos antigos qualificados=0/1 continuam intactos; não são reclassificados.
ALTER TABLE links ADD COLUMN interaction_clicks INTEGER NOT NULL DEFAULT 0;
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
-- qualified=2 identifica somente sinais explícitos de navegação iniciada pelo usuário.
-- Guardamos as requisições descartadas como contagens agregadas, sem IP bruto.
