-- Lista de Compras (preço unitário em centavos).
CREATE TABLE shopping_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  notes TEXT NOT NULL DEFAULT '',
  quantity REAL NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  price_cents INTEGER CHECK (price_cents IS NULL OR price_cents >= 0),
  url TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'bought')),
  bought_at TEXT,
  position REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX shopping_status ON shopping_items(status, position);
