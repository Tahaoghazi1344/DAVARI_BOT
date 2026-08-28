-- =====================================================================
-- Migration 0003 — اصلاح ساختار پارت ۲ طبق متن اصلی پرامپت + جدول‌های
-- پارت ۳ (دادگاه ⚖️ و بازی جاسوس 🕵️).
-- =====================================================================

-- ------------------- اصلاح مالیات: بجای درصد جدا، فقط وضعیت معافیت -------------------
DROP TABLE IF EXISTS tax_rates;
CREATE TABLE IF NOT EXISTS tax_status (
  user_id       INTEGER NOT NULL,
  chat_id       INTEGER NOT NULL,
  exempt        INTEGER NOT NULL DEFAULT 0 CHECK (exempt IN (0,1)),
  set_by        INTEGER NOT NULL,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, chat_id)
);

-- ------------------- اصلاح اخطارها: پشتیبانی از نوع (TAX/COURT/...) -------------------
DROP TABLE IF EXISTS warnings;
CREATE TABLE IF NOT EXISTS warnings (
  user_id       INTEGER NOT NULL,
  chat_id       INTEGER NOT NULL,
  type          TEXT NOT NULL,   -- 'TAX' | 'COURT' | ...
  count         INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, chat_id, type)
);

-- ------------------- اصلاح همسر: مجموعه آیتم شخصی (نه ازدواج دوطرفه) -------------------
DROP TABLE IF EXISTS spouses;
CREATE TABLE IF NOT EXISTS spouse_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL,
  chat_id       INTEGER NOT NULL,
  kind          TEXT NOT NULL,   -- 'text' | 'photo' | 'video' | 'animation' | 'sticker' | 'voice' | 'audio' | 'document'
  text_content  TEXT,
  file_id       TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_spouse_items_user ON spouse_items(user_id, chat_id);

-- ============================= دادگاه ⚖️ =============================
CREATE TABLE IF NOT EXISTS courts (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id           INTEGER NOT NULL,
  plaintiff_id      INTEGER NOT NULL,
  defendant_id      INTEGER,
  judge_id          INTEGER NOT NULL,
  status            TEXT NOT NULL DEFAULT 'SETUP', -- SETUP | READY | ACTIVE | VERDICT | PUNISHMENT | FINISHED | CANCELLED
  speak_order       TEXT,       -- 'plaintiff_first' | 'defendant_first'
  current_speaker   TEXT,       -- 'plaintiff' | 'defendant' | null
  verdict           TEXT,       -- 'plaintiff_guilty' | 'defendant_guilty' | 'both_innocent' | 'both_guilty'
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_courts_chat ON courts(chat_id);

-- فقط یک دادگاه ACTIVE/SETUP/READY/VERDICT/PUNISHMENT به‌ازای هر گروه مجاز است
-- (این محدودیت در سطح Application اعمال می‌شود، نه با UNIQUE، چون Statusها متغیرند)

CREATE TABLE IF NOT EXISTS court_punishments (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  court_id          INTEGER NOT NULL,
  target_id         INTEGER NOT NULL,
  punishment_type   TEXT NOT NULL,   -- 'ban' | 'mute' | 'fine'
  amount            INTEGER,         -- برای fine
  paid_fully        INTEGER,         -- برای fine: آیا کامل پرداخت شد
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (court_id) REFERENCES courts(id)
);

-- ============================= بازی جاسوس 🕵️ =============================
CREATE TABLE IF NOT EXISTS spy_games (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id         INTEGER NOT NULL,
  host_id         INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'LOBBY', -- LOBBY | CONFIG | RUNNING | LAST_CHANCE | FINISHED | CANCELLED
  category        TEXT,
  word            TEXT,
  spy_count       INTEGER,
  duration_seconds INTEGER,
  starter_id      INTEGER,
  current_turn_id INTEGER,
  expires_at      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_spy_games_chat ON spy_games(chat_id);

CREATE TABLE IF NOT EXISTS spy_players (
  game_id     INTEGER NOT NULL,
  user_id     INTEGER NOT NULL,
  role        TEXT,             -- 'SPY' | 'CITIZEN' — فقط بعد از شروع بازی تعیین می‌شود
  alive       INTEGER NOT NULL DEFAULT 1,
  joined_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (game_id, user_id),
  FOREIGN KEY (game_id) REFERENCES spy_games(id)
);

CREATE TABLE IF NOT EXISTS spy_votes (
  game_id     INTEGER NOT NULL,
  target_id   INTEGER NOT NULL,
  voter_id    INTEGER NOT NULL,
  vote        INTEGER NOT NULL,  -- 1 = موافق حذف, 0 = مخالف
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (game_id, target_id, voter_id)
);

CREATE TABLE IF NOT EXISTS spy_words (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  category    TEXT NOT NULL,
  word        TEXT NOT NULL,
  created_by  INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(category, word)
);
