-- Personal Task Hub — schema v1

CREATE TABLE companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  description TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL,
  logo_path TEXT,
  is_personal INTEGER NOT NULL DEFAULT 0 CHECK (is_personal IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  position REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  archived_at TEXT
);
CREATE UNIQUE INDEX one_personal ON companies(is_personal) WHERE is_personal = 1;

CREATE TABLE folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  color TEXT,
  position REAL NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX folders_company ON folders(company_id);

CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  description TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL,
  start_date TEXT,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('planned', 'active', 'paused', 'completed')),
  position REAL NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX projects_company ON projects(company_id);
CREATE INDEX projects_folder ON projects(folder_id);

CREATE TABLE boards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  position REAL NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX boards_project ON boards(project_id);

CREATE TABLE columns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  position REAL NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'todo' CHECK (category IN ('todo', 'in_progress', 'done')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX columns_board ON columns(board_id, position);

CREATE TABLE tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  column_id INTEGER NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  start_at TEXT,
  due_at TEXT,
  completed_at TEXT,
  archived_at TEXT,
  position REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX tasks_column ON tasks(column_id, position);
CREATE INDEX tasks_board ON tasks(board_id);
CREATE INDEX tasks_due ON tasks(due_at);
CREATE INDEX tasks_archived ON tasks(archived_at);

CREATE TABLE labels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  color TEXT NOT NULL
);
CREATE UNIQUE INDEX labels_name ON labels(lower(name));

CREATE TABLE task_labels (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  label_id INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, label_id)
);
CREATE INDEX task_labels_label ON task_labels(label_id);

CREATE TABLE comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(trim(body)) > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX comments_task ON comments(task_id);

CREATE TABLE checklists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  position REAL NOT NULL DEFAULT 0
);
CREATE INDEX checklists_task ON checklists(task_id);

CREATE TABLE checklist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  checklist_id INTEGER NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
  text TEXT NOT NULL CHECK (length(trim(text)) > 0),
  done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
  position REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  completed_at TEXT
);
CREATE INDEX checklist_items_list ON checklist_items(checklist_id, position);

CREATE TABLE attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((task_id IS NULL) <> (project_id IS NULL))
);
CREATE INDEX attachments_task ON attachments(task_id);
CREATE INDEX attachments_project ON attachments(project_id);

CREATE TABLE activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  field TEXT,
  old_value TEXT,
  new_value TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX activity_task ON activity_log(task_id, created_at);
CREATE INDEX activity_entity ON activity_log(entity_type, entity_id);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Visão de tarefas com dados derivados
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
  (t.archived_at IS NOT NULL OR b.archived_at IS NOT NULL OR p.archived_at IS NOT NULL OR co.status = 'archived') AS effective_archived
FROM tasks t
JOIN columns c ON c.id = t.column_id
JOIN boards b ON b.id = t.board_id
JOIN projects p ON p.id = b.project_id
JOIN companies co ON co.id = p.company_id;

-- Busca textual. rowid = entity_id * 8 + código (task=1, comment=2, project=3, company=4, attachment=5)
CREATE VIRTUAL TABLE search_index USING fts5(
  entity_type UNINDEXED,
  entity_id UNINDEXED,
  title,
  body,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER tasks_ai AFTER INSERT ON tasks BEGIN
  INSERT INTO search_index(rowid, entity_type, entity_id, title, body) VALUES (new.id * 8 + 1, 'task', new.id, new.title, new.description);
END;
CREATE TRIGGER tasks_au AFTER UPDATE OF title, description ON tasks BEGIN
  DELETE FROM search_index WHERE rowid = old.id * 8 + 1;
  INSERT INTO search_index(rowid, entity_type, entity_id, title, body) VALUES (new.id * 8 + 1, 'task', new.id, new.title, new.description);
END;
CREATE TRIGGER tasks_ad AFTER DELETE ON tasks BEGIN
  DELETE FROM search_index WHERE rowid = old.id * 8 + 1;
END;

CREATE TRIGGER comments_ai AFTER INSERT ON comments BEGIN
  INSERT INTO search_index(rowid, entity_type, entity_id, title, body) VALUES (new.id * 8 + 2, 'comment', new.id, '', new.body);
END;
CREATE TRIGGER comments_au AFTER UPDATE OF body ON comments BEGIN
  DELETE FROM search_index WHERE rowid = old.id * 8 + 2;
  INSERT INTO search_index(rowid, entity_type, entity_id, title, body) VALUES (new.id * 8 + 2, 'comment', new.id, '', new.body);
END;
CREATE TRIGGER comments_ad AFTER DELETE ON comments BEGIN
  DELETE FROM search_index WHERE rowid = old.id * 8 + 2;
END;

CREATE TRIGGER projects_ai AFTER INSERT ON projects BEGIN
  INSERT INTO search_index(rowid, entity_type, entity_id, title, body) VALUES (new.id * 8 + 3, 'project', new.id, new.name, new.description);
END;
CREATE TRIGGER projects_au AFTER UPDATE OF name, description ON projects BEGIN
  DELETE FROM search_index WHERE rowid = old.id * 8 + 3;
  INSERT INTO search_index(rowid, entity_type, entity_id, title, body) VALUES (new.id * 8 + 3, 'project', new.id, new.name, new.description);
END;
CREATE TRIGGER projects_ad AFTER DELETE ON projects BEGIN
  DELETE FROM search_index WHERE rowid = old.id * 8 + 3;
END;

CREATE TRIGGER companies_ai AFTER INSERT ON companies BEGIN
  INSERT INTO search_index(rowid, entity_type, entity_id, title, body) VALUES (new.id * 8 + 4, 'company', new.id, new.name, new.description);
END;
CREATE TRIGGER companies_au AFTER UPDATE OF name, description ON companies BEGIN
  DELETE FROM search_index WHERE rowid = old.id * 8 + 4;
  INSERT INTO search_index(rowid, entity_type, entity_id, title, body) VALUES (new.id * 8 + 4, 'company', new.id, new.name, new.description);
END;
CREATE TRIGGER companies_ad AFTER DELETE ON companies BEGIN
  DELETE FROM search_index WHERE rowid = old.id * 8 + 4;
END;

CREATE TRIGGER attachments_ai AFTER INSERT ON attachments BEGIN
  INSERT INTO search_index(rowid, entity_type, entity_id, title, body) VALUES (new.id * 8 + 5, 'attachment', new.id, new.original_name, '');
END;
CREATE TRIGGER attachments_ad AFTER DELETE ON attachments BEGIN
  DELETE FROM search_index WHERE rowid = old.id * 8 + 5;
END;

-- Seed: espaço Pessoal (não é dado fictício: é o espaço fixo do usuário)
INSERT INTO companies(name, color, is_personal, position) VALUES ('Pessoal', '#6366F1', 1, 0);
