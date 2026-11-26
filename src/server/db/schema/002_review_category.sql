-- Novo tipo de coluna: "Em validação" (trabalho entregue, aguardando homologação).
ALTER TABLE columns DROP CONSTRAINT IF EXISTS columns_category_check;
ALTER TABLE columns ADD CONSTRAINT columns_category_check CHECK (category IN ('todo', 'in_progress', 'review', 'done'));
