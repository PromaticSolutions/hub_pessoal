-- Tarefas em projetos dentro de pasta arquivada (ou com ancestral arquivado) contam como arquivadas.
DROP VIEW v_tasks;
CREATE VIEW v_tasks AS
SELECT
  t.*,
  c.category AS status,
  c.name AS column_name,
  b.name AS board_name,
  p.id AS project_id,
  p.name AS project_name,
  p.color AS project_color,
  co.id AS company_id,
  co.name AS company_name,
  co.color AS company_color,
  co.is_personal AS is_personal,
  CASE
    WHEN t.due_at IS NULL THEN NULL
    WHEN length(t.due_at) = 10 THEN t.due_at || 'T23:59'
    ELSE t.due_at
  END AS due_end,
  (t.archived_at IS NOT NULL OR b.archived_at IS NOT NULL OR p.archived_at IS NOT NULL OR co.status = 'archived'
   OR (p.folder_id IS NOT NULL AND EXISTS (
     WITH RECURSIVE anc(id) AS (
       SELECT p.folder_id
       UNION ALL
       SELECT f.parent_id FROM folders f JOIN anc ON f.id = anc.id WHERE f.parent_id IS NOT NULL
     )
     SELECT 1 FROM anc JOIN folders f ON f.id = anc.id WHERE f.archived_at IS NOT NULL
   ))) AS effective_archived
FROM tasks t
JOIN columns c ON c.id = t.column_id
JOIN boards b ON b.id = t.board_id
JOIN projects p ON p.id = b.project_id
JOIN companies co ON co.id = p.company_id;
