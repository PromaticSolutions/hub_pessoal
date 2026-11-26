-- Dashboards personalizáveis (blocos em grade de 12 colunas).
CREATE TABLE dashboards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  scope TEXT NOT NULL DEFAULT '"all"',
  position REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE dashboard_widgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dashboard_id INTEGER NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('kpi', 'summary', 'chart', 'taskList', 'projects', 'shopping')),
  title TEXT NOT NULL DEFAULT '',
  config TEXT NOT NULL DEFAULT '{}',
  x INTEGER NOT NULL DEFAULT 0,
  y INTEGER NOT NULL DEFAULT 0,
  w INTEGER NOT NULL DEFAULT 3 CHECK (w BETWEEN 1 AND 12),
  h INTEGER NOT NULL DEFAULT 2 CHECK (h >= 1)
);
CREATE INDEX dashboard_widgets_dash ON dashboard_widgets(dashboard_id);
