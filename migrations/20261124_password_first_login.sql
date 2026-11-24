-- Contas já existentes permanecem válidas. Só novos cadastros e resets exigem troca.
ALTER TABLE accounts ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0 CHECK(must_change_password IN (0,1));
