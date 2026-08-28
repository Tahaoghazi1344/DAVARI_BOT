-- =====================================================================
-- Migration 0004 — پارت ۴: جدول‌های Poker (Blackjack از جدول sessions
-- موجود استفاده می‌کند چون بازی تک‌نفره در برابر Dealer است و نیازی به
-- جدول اختصاصی ندارد).
-- =====================================================================

CREATE TABLE IF NOT EXISTS poker_games (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id           INTEGER NOT NULL,
  host_id           INTEGER NOT NULL,
  status            TEXT NOT NULL DEFAULT 'LOBBY', -- LOBBY|PREFLOP|FLOP|TURN|RIVER|SHOWDOWN|FINISHED|CANCELLED
  dealer_seat       INTEGER NOT NULL DEFAULT 0,
  current_turn_seat INTEGER,
  last_raiser_seat  INTEGER,
  pot               INTEGER NOT NULL DEFAULT 0,
  current_bet       INTEGER NOT NULL DEFAULT 0,
  community_cards   TEXT NOT NULL DEFAULT '[]',
  deck              TEXT NOT NULL DEFAULT '[]',
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_poker_games_chat ON poker_games(chat_id);

CREATE TABLE IF NOT EXISTS poker_players (
  game_id         INTEGER NOT NULL,
  user_id         INTEGER NOT NULL,
  seat_index      INTEGER NOT NULL,
  stack           INTEGER NOT NULL,
  hole_cards      TEXT NOT NULL DEFAULT '[]',
  bet_this_round  INTEGER NOT NULL DEFAULT 0,
  total_bet       INTEGER NOT NULL DEFAULT 0,
  folded          INTEGER NOT NULL DEFAULT 0,
  all_in          INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (game_id, user_id)
);
