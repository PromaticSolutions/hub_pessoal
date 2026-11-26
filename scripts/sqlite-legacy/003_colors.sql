-- Cores opcionais de quadros, colunas e cartões (NULL = visual padrão).
ALTER TABLE boards ADD COLUMN color TEXT;
ALTER TABLE columns ADD COLUMN color TEXT;
ALTER TABLE tasks ADD COLUMN color TEXT;
