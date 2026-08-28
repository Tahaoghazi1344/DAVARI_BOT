-- =====================================================================
-- Migration 0001 — هسته سیستم (کاربران، گروه‌ها، نقش‌ها، Permission،
-- کیف پول، تراکنش‌ها، Sessionهای چندمرحله‌ای)
-- این migration بخشی از پارت ۱ پروژه است. جدول‌های بازی‌ها، دادگاه،
-- کلمات سفارشی و ... در migrationهای بعدی (پارت ۲ تا ۴) اضافه می‌شوند.
-- =====================================================================

-- کاربران (Global — مستقل از گروه)
CREATE TABLE IF NOT EXISTS users (
  telegram_id   INTEGER PRIMARY KEY,
  first_name    TEXT NOT NULL,
  username      TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- گروه‌ها
CREATE TABLE IF NOT EXISTS groups (
  chat_id       INTEGER PRIMARY KEY,
  title         TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- عضویت کاربر در گروه (یک کاربر می‌تواند در چند گروه باشد)
CREATE TABLE IF NOT EXISTS user_groups (
  user_id       INTEGER NOT NULL,
  chat_id       INTEGER NOT NULL,
  joined_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, chat_id),
  FOREIGN KEY (user_id) REFERENCES users(telegram_id),
  FOREIGN KEY (chat_id) REFERENCES groups(chat_id)
);

CREATE INDEX IF NOT EXISTS idx_user_groups_chat ON user_groups(chat_id);

-- کیف پول (هر کاربر دقیقاً یک Wallet — Global، نه وابسته به گروه)
CREATE TABLE IF NOT EXISTS wallets (
  user_id       INTEGER PRIMARY KEY,
  balance       INTEGER NOT NULL DEFAULT 10000,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(telegram_id)
);

-- تاریخچه تراکنش‌ها (تنها از طریق Economy Service نوشته می‌شود)
CREATE TABLE IF NOT EXISTS transactions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL,
  amount        INTEGER NOT NULL,        -- مثبت = واریز، منفی = برداشت
  type          TEXT NOT NULL,           -- 'initial' | 'tax' | 'tip' | 'game_reward' | 'court_fine' | ...
  reference     TEXT,                    -- شناسه مرجع تراکنش (اختیاری)
  chat_id       INTEGER,                 -- گروهی که تراکنش در آن رخ داده (اختیاری)
  balance_after INTEGER NOT NULL,        -- موجودی بعد از اعمال تراکنش (برای Audit)
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(telegram_id)
);

CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_chat ON transactions(chat_id);

-- نقش‌های کاربر در یک گروه مشخص (فرمانده / رعیت — Mutual Exclusive)
CREATE TABLE IF NOT EXISTS roles (
  user_id       INTEGER NOT NULL,
  chat_id       INTEGER NOT NULL,
  is_commander  INTEGER NOT NULL DEFAULT 0 CHECK (is_commander IN (0,1)),
  is_serf       INTEGER NOT NULL DEFAULT 0 CHECK (is_serf IN (0,1)),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, chat_id),
  FOREIGN KEY (user_id) REFERENCES users(telegram_id),
  FOREIGN KEY (chat_id) REFERENCES groups(chat_id),
  CHECK (NOT (is_commander = 1 AND is_serf = 1))
);

-- Permissionهای هر کاربر در یک گروه مشخص (کلید/مقدار روشن-خاموش)
CREATE TABLE IF NOT EXISTS permissions (
  user_id         INTEGER NOT NULL,
  chat_id         INTEGER NOT NULL,
  permission_key  TEXT NOT NULL,
  enabled         INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, chat_id, permission_key),
  FOREIGN KEY (user_id) REFERENCES users(telegram_id),
  FOREIGN KEY (chat_id) REFERENCES groups(chat_id)
);

-- Sessionهای فعال چندمرحله‌ای (مثلاً ثبت همسر، مالیات، دادگاه، ...)
-- هر کاربر در هر گروه حداکثر یک Session فعال دارد.
CREATE TABLE IF NOT EXISTS sessions (
  user_id       INTEGER NOT NULL,
  chat_id       INTEGER NOT NULL,
  session_type  TEXT NOT NULL,
  step          TEXT NOT NULL,
  data          TEXT NOT NULL DEFAULT '{}',   -- JSON
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT,
  PRIMARY KEY (user_id, chat_id)
);
