-- Módulo Ideias + anexos de ideias (reconstrução de attachments preservando ids e caminhos).
CREATE TABLE ideas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'analysis', 'developing', 'implemented', 'archived')),
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  converted_task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  converted_project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  position REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX ideas_status ON ideas(status, position);

CREATE TABLE idea_labels (
  idea_id INTEGER NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  label_id INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (idea_id, label_id)
);

CREATE TABLE attachments_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  idea_id INTEGER REFERENCES ideas(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((task_id IS NOT NULL) + (project_id IS NOT NULL) + (idea_id IS NOT NULL) = 1)
);
INSERT INTO attachments_new(id, task_id, project_id, idea_id, original_name, stored_path, mime_type, size_bytes, created_at)
  SELECT id, task_id, project_id, NULL, original_name, stored_path, mime_type, size_bytes, created_at FROM attachments;
DROP TABLE attachments;
ALTER TABLE attachments_new RENAME TO attachments;
CREATE INDEX attachments_task ON attachments(task_id);
CREATE INDEX attachments_project ON attachments(project_id);
CREATE INDEX attachments_idea ON attachments(idea_id);

CREATE TRIGGER attachments_ai AFTER INSERT ON attachments BEGIN
  INSERT INTO search_index(rowid, entity_type, entity_id, title, body) VALUES (new.id * 8 + 5, 'attachment', new.id, new.original_name, '');
END;
CREATE TRIGGER attachments_ad AFTER DELETE ON attachments BEGIN
  DELETE FROM search_index WHERE rowid = old.id * 8 + 5;
END;

-- Busca: ideias (código 6)
CREATE TRIGGER ideas_ai AFTER INSERT ON ideas BEGIN
  INSERT INTO search_index(rowid, entity_type, entity_id, title, body) VALUES (new.id * 8 + 6, 'idea', new.id, new.title, new.description);
END;
CREATE TRIGGER ideas_au AFTER UPDATE OF title, description ON ideas BEGIN
  DELETE FROM search_index WHERE rowid = old.id * 8 + 6;
  INSERT INTO search_index(rowid, entity_type, entity_id, title, body) VALUES (new.id * 8 + 6, 'idea', new.id, new.title, new.description);
END;
CREATE TRIGGER ideas_ad AFTER DELETE ON ideas BEGIN
  DELETE FROM search_index WHERE rowid = old.id * 8 + 6;
END;
