-- Meu Dia: blocos de horário. task_id aponta para a tarefa original (sem cópia).
CREATE TABLE day_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  title TEXT,
  note TEXT NOT NULL DEFAULT '',
  done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
  color TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (end_time > start_time)
);
CREATE INDEX day_blocks_date ON day_blocks(date, start_time);
CREATE INDEX day_blocks_task ON day_blocks(task_id);

-- Tarefa excluída: o bloco continua como atividade livre com o título original.
CREATE TRIGGER tasks_bd_day_blocks BEFORE DELETE ON tasks BEGIN
  UPDATE day_blocks SET title = OLD.title || ' (tarefa excluída)' WHERE task_id = OLD.id;
END;
