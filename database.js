const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

// Open or create Wordbank.
const db = new DatabaseSync(
  path.join(__dirname, 'wordbank.db')
);

// Create our tables.
db.exec(`
  CREATE TABLE IF NOT EXISTS tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    source_language TEXT NOT NULL,
    source_url TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS translations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_id INTEGER NOT NULL,
    target_language TEXT NOT NULL,
    translated_text TEXT NOT NULL,
    FOREIGN KEY (token_id) REFERENCES tokens(id)
  );
`);

// Enable foreign key enforcement.
db.exec('PRAGMA foreign_keys = ON');

module.exports = db;
