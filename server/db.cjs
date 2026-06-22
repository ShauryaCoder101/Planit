const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Use DATABASE_URL from Render PostgreSQL, fall back to local SQLite-like behavior
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required.');
  console.error('Set it to your PostgreSQL connection string.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' || DATABASE_URL.includes('render.com')
    ? { rejectUnauthorized: false }
    : false,
});

// Initialize database schema
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        is_admin INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        name TEXT NOT NULL,
        duration INTEGER NOT NULL DEFAULT 0,
        goal_category TEXT NOT NULL,
        recurrence_type TEXT NOT NULL DEFAULT 'one-time',
        recurrence_days TEXT,
        carry_over INTEGER NOT NULL DEFAULT 0,
        task_type TEXT NOT NULL DEFAULT 'timed',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS subtasks (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS daily_tasks (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES tasks(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        actual_duration INTEGER DEFAULT 0,
        is_carried_over INTEGER NOT NULL DEFAULT 0,
        carried_from TEXT,
        started_at TEXT,
        completed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS daily_subtasks (
        id SERIAL PRIMARY KEY,
        daily_task_id INTEGER NOT NULL REFERENCES daily_tasks(id) ON DELETE CASCADE,
        subtask_id INTEGER NOT NULL REFERENCES subtasks(id),
        completed INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS timer_sessions (
        id SERIAL PRIMARY KEY,
        daily_task_id INTEGER NOT NULL REFERENCES daily_tasks(id) ON DELETE CASCADE,
        start_time TEXT NOT NULL,
        end_time TEXT,
        paused_at TEXT,
        total_paused_ms INTEGER DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS sleep_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        date TEXT NOT NULL,
        hours REAL NOT NULL,
        UNIQUE(user_id, date)
      );

      CREATE TABLE IF NOT EXISTS friend_requests (
        id SERIAL PRIMARY KEY,
        from_user_id INTEGER NOT NULL REFERENCES users(id),
        to_user_id INTEGER NOT NULL REFERENCES users(id),
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(from_user_id, to_user_id)
      );

      CREATE TABLE IF NOT EXISTS friendships (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        friend_id INTEGER NOT NULL REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, friend_id)
      );
    `);

    // Create indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_daily_tasks_user_date ON daily_tasks(user_id, date)',
      'CREATE INDEX IF NOT EXISTS idx_daily_tasks_task_id ON daily_tasks(task_id)',
      'CREATE INDEX IF NOT EXISTS idx_subtasks_task_id ON subtasks(task_id)',
      'CREATE INDEX IF NOT EXISTS idx_daily_subtasks_daily_task_id ON daily_subtasks(daily_task_id)',
      'CREATE INDEX IF NOT EXISTS idx_timer_sessions_daily_task_id ON timer_sessions(daily_task_id)',
      'CREATE INDEX IF NOT EXISTS idx_sleep_logs_user_date ON sleep_logs(user_id, date)',
      'CREATE INDEX IF NOT EXISTS idx_friend_requests_to ON friend_requests(to_user_id)',
      'CREATE INDEX IF NOT EXISTS idx_friend_requests_from ON friend_requests(from_user_id)',
      'CREATE INDEX IF NOT EXISTS idx_friendships_user ON friendships(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_friendships_friend ON friendships(friend_id)',
    ];
    for (const idx of indexes) {
      await client.query(idx);
    }

    // Seed default user if not exists
    const { rows } = await client.query('SELECT id FROM users WHERE email = $1', ['shauryasharma2002@gmail.com']);
    if (rows.length === 0) {
      const hashedPassword = bcrypt.hashSync('Shaurya1', 10);
      await client.query(
        'INSERT INTO users (name, email, password, is_admin) VALUES ($1, $2, $3, $4)',
        ['Shaurya Sharma', 'shauryasharma2002@gmail.com', hashedPassword, 1]
      );
      console.log('Default user created: shauryasharma2002@gmail.com');
    }

    // Ensure default user is admin
    await client.query('UPDATE users SET is_admin = 1 WHERE email = $1', ['shauryasharma2002@gmail.com']);

    console.log('Database initialized successfully');
  } finally {
    client.release();
  }
}

// Initialize on import
initDB().catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

module.exports = pool;
