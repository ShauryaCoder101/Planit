const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'planit.db');

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create all tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    duration INTEGER NOT NULL,
    goal_category TEXT NOT NULL,
    recurrence_type TEXT NOT NULL DEFAULT 'one-time',
    recurrence_days TEXT,
    carry_over INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS subtasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS daily_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    actual_duration INTEGER DEFAULT 0,
    is_carried_over INTEGER NOT NULL DEFAULT 0,
    carried_from TEXT,
    started_at TEXT,
    completed_at TEXT,
    FOREIGN KEY (task_id) REFERENCES tasks(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS daily_subtasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    daily_task_id INTEGER NOT NULL,
    subtask_id INTEGER NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (daily_task_id) REFERENCES daily_tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (subtask_id) REFERENCES subtasks(id)
  );

  CREATE TABLE IF NOT EXISTS timer_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    daily_task_id INTEGER NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT,
    paused_at TEXT,
    total_paused_ms INTEGER DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (daily_task_id) REFERENCES daily_tasks(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS sleep_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL UNIQUE,
    hours REAL NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS friend_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user_id INTEGER NOT NULL,
    to_user_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (from_user_id) REFERENCES users(id),
    FOREIGN KEY (to_user_id) REFERENCES users(id),
    UNIQUE(from_user_id, to_user_id)
  );

  CREATE TABLE IF NOT EXISTS friendships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    friend_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (friend_id) REFERENCES users(id),
    UNIQUE(user_id, friend_id)
  );
`);

// Create indexes for performance
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
  CREATE INDEX IF NOT EXISTS idx_daily_tasks_user_date ON daily_tasks(user_id, date);
  CREATE INDEX IF NOT EXISTS idx_daily_tasks_task_id ON daily_tasks(task_id);
  CREATE INDEX IF NOT EXISTS idx_subtasks_task_id ON subtasks(task_id);
  CREATE INDEX IF NOT EXISTS idx_daily_subtasks_daily_task_id ON daily_subtasks(daily_task_id);
  CREATE INDEX IF NOT EXISTS idx_timer_sessions_daily_task_id ON timer_sessions(daily_task_id);
  CREATE INDEX IF NOT EXISTS idx_sleep_logs_user_date ON sleep_logs(user_id, date);
  CREATE INDEX IF NOT EXISTS idx_friend_requests_to ON friend_requests(to_user_id);
  CREATE INDEX IF NOT EXISTS idx_friend_requests_from ON friend_requests(from_user_id);
  CREATE INDEX IF NOT EXISTS idx_friendships_user ON friendships(user_id);
  CREATE INDEX IF NOT EXISTS idx_friendships_friend ON friendships(friend_id);
`);

// Add task_type column if not exists (migration for existing DBs)
try {
  db.exec("ALTER TABLE tasks ADD COLUMN task_type TEXT NOT NULL DEFAULT 'timed'");
} catch (e) {
  // Column already exists, ignore
}

// Add is_admin column if not exists (migration for existing DBs)
try {
  db.exec("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0");
} catch (e) {
  // Column already exists, ignore
}

// Seed default user if not exists
const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get('shauryasharma2002@gmail.com');
if (!existingUser) {
  const hashedPassword = bcrypt.hashSync('Shaurya1', 10);
  db.prepare('INSERT INTO users (name, email, password) VALUES (?, ?, ?)').run(
    'Shaurya Sharma',
    'shauryasharma2002@gmail.com',
    hashedPassword
  );
  console.log('Default user created: shauryasharma2002@gmail.com');
}

// Ensure default user is admin
db.prepare('UPDATE users SET is_admin = 1 WHERE email = ?').run('shauryasharma2002@gmail.com');

module.exports = db;
