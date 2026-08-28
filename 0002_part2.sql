-- =====================================================================
-- Migration 0002 — قابلیت‌های پارت ۲:
-- کلمات و پاسخ سفارشی، همسر، لقب، مدیریت (اخطار)، مالیات، Audit Log
-- =====================================================================

-- کلمات محرک سفارشی (هر گروه، کلمات خودش را دارد)
CREATE TABLE IF NOT EXISTS custom_words (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id       INTEGER NOT NULL,
  trigger_text  TEXT NOT NULL,
  created_by    INTEGER NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(chat_id, trigger_text)
);

CREATE INDEX IF NOT EXISTS idx_custom_words_chat ON custom_words(chat_id);

-- پاسخ سفارشی مربوط به هر کلمه (متن یا مدیا — با file_id، نه کپی خام فایل)
CREATE TABLE IF NOT EXISTS custom_word_responses (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  word_id       INTEGER NOT NULL,
  response_kind TEXT NOT NULL,   -- 'text' | 'photo' | 'video' | 'animation' | 'sticker' | 'voice' | 'audio' | 'document'
  text_content  TEXT,            -- برای response_kind = 'text'
  file_id       TEXT,            -- برای انواع مدیا
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (word_id) REFERENCES custom_words(id)
);

CREATE INDEX IF NOT EXISTS idx_word_responses_word ON custom_word_responses(word_id);

-- همسر (رابطه‌ی دوطرفه، محدود به یک گروه مشخص)
CREATE TABLE IF NOT EXISTS spouses (
  user_id       INTEGER NOT NULL,
  spouse_id     INTEGER NOT NULL,
  chat_id       INTEGER NOT NULL,
  married_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, chat_id)
);

CREATE INDEX IF NOT EXISTS idx_spouses_chat ON spouses(chat_id);

-- لقب اختصاصی هر کاربر در هر گروه
CREATE TABLE IF NOT EXISTS nicknames (
  user_id       INTEGER NOT NULL,
  chat_id       INTEGER NOT NULL,
  nickname      TEXT NOT NULL,
  set_by        INTEGER NOT NULL,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, chat_id)
);

-- اخطارهای مدیریتی (پایه‌ی تصمیم بن/میوت خودکار در آینده)
CREATE TABLE IF NOT EXISTS warnings (
  user_id       INTEGER NOT NULL,
  chat_id       INTEGER NOT NULL,
  count         INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, chat_id)
);

-- نرخ مالیات هر رعیت در هر گروه (درصد از موجودی، در بازه تنظیم‌شده در Config)
CREATE TABLE IF NOT EXISTS tax_rates (
  user_id       INTEGER NOT NULL,
  chat_id       INTEGER NOT NULL,
  percent       INTEGER NOT NULL,
  exempt        INTEGER NOT NULL DEFAULT 0 CHECK (exempt IN (0,1)),
  set_by        INTEGER NOT NULL,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, chat_id)
);

-- گزارش اقدامات مدیریتی (برای نامه اعمال / Audit)
CREATE TABLE IF NOT EXISTS action_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id       INTEGER NOT NULL,
  actor_id      INTEGER NOT NULL,
  target_id     INTEGER,
  action_type   TEXT NOT NULL,   -- 'ban' | 'unban' | 'mute' | 'unmute' | 'warn' | 'tax' | 'tip' | 'nickname' | 'spouse' | 'role_change' | ...
  details       TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_action_logs_chat ON action_logs(chat_id);
CREATE INDEX IF NOT EXISTS idx_action_logs_target ON action_logs(target_id);
