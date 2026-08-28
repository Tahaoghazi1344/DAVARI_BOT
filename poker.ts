import type { Env } from "../types";
import { safeDbRun, DbResult } from "../utils/db";
import type { Card } from "../games/cards";

export type PokerStatus = "LOBBY" | "PREFLOP" | "FLOP" | "TURN" | "RIVER" | "SHOWDOWN" | "FINISHED" | "CANCELLED";

export interface PokerGameRecord {
  id: number;
  chat_id: number;
  host_id: number;
  status: PokerStatus;
  dealer_seat: number;
  current_turn_seat: number | null;
  last_raiser_seat: number | null;
  pot: number;
  current_bet: number;
  community_cards: Card[];
  deck: Card[];
}

export interface PokerPlayerRecord {
  game_id: number;
  user_id: number;
  seat_index: number;
  stack: number;
  hole_cards: Card[];
  bet_this_round: number;
  total_bet: number;
  folded: 0 | 1;
  all_in: 0 | 1;
}

interface RawPokerGameRow {
  id: number; chat_id: number; host_id: number; status: PokerStatus; dealer_seat: number;
  current_turn_seat: number | null; last_raiser_seat: number | null; pot: number; current_bet: number;
  community_cards: string; deck: string;
}

function parseGame(row: RawPokerGameRow): PokerGameRecord {
  return { ...row, community_cards: JSON.parse(row.community_cards), deck: JSON.parse(row.deck) };
}

export const PokerGameDb = {
  async getActiveForChat(env: Env, chatId: number): Promise<DbResult<PokerGameRecord | null>> {
    return safeDbRun(async () => {
      const row = await env.BOT_DB.prepare(
        `SELECT * FROM poker_games WHERE chat_id = ? AND status NOT IN ('FINISHED','CANCELLED') ORDER BY id DESC LIMIT 1`
      )
        .bind(chatId)
        .first<RawPokerGameRow>();
      return row ? parseGame(row) : null;
    }, "PokerGameDb.getActiveForChat");
  },

  async getById(env: Env, id: number): Promise<DbResult<PokerGameRecord | null>> {
    return safeDbRun(async () => {
      const row = await env.BOT_DB.prepare(`SELECT * FROM poker_games WHERE id = ?`).bind(id).first<RawPokerGameRow>();
      return row ? parseGame(row) : null;
    }, "PokerGameDb.getById");
  },

  async create(env: Env, chatId: number, hostId: number): Promise<DbResult<number>> {
    return safeDbRun(async () => {
      const result = await env.BOT_DB.prepare(`INSERT INTO poker_games (chat_id, host_id, status) VALUES (?, ?, 'LOBBY')`)
        .bind(chatId, hostId)
        .run();
      return Number(result.meta.last_row_id);
    }, "PokerGameDb.create");
  },

  async update(
    env: Env,
    id: number,
    fields: Partial<{
      status: PokerStatus; dealer_seat: number; current_turn_seat: number | null; last_raiser_seat: number | null;
      pot: number; current_bet: number; community_cards: Card[]; deck: Card[];
    }>
  ): Promise<DbResult<true>> {
    return safeDbRun(async () => {
      const entries = Object.entries(fields);
      if (entries.length === 0) return true as const;
      const setClause = entries.map(([k]) => `${k} = ?`).join(", ");
      const values = entries.map(([k, v]) => (k === "community_cards" || k === "deck" ? JSON.stringify(v) : v));
      await env.BOT_DB.prepare(`UPDATE poker_games SET ${setClause}, updated_at = datetime('now') WHERE id = ?`)
        .bind(...values, id)
        .run();
      return true as const;
    }, "PokerGameDb.update");
  },
};

interface RawPlayerRow {
  game_id: number; user_id: number; seat_index: number; stack: number; hole_cards: string;
  bet_this_round: number; total_bet: number; folded: number; all_in: number;
}

function parsePlayer(row: RawPlayerRow): PokerPlayerRecord {
  return { ...row, hole_cards: JSON.parse(row.hole_cards), folded: row.folded as 0 | 1, all_in: row.all_in as 0 | 1 };
}

export const PokerPlayerDb = {
  async listAll(env: Env, gameId: number): Promise<DbResult<PokerPlayerRecord[]>> {
    return safeDbRun(async () => {
      const { results } = await env.BOT_DB.prepare(
        `SELECT * FROM poker_players WHERE game_id = ? ORDER BY seat_index ASC`
      )
        .bind(gameId)
        .all<RawPlayerRow>();
      return (results ?? []).map(parsePlayer);
    }, "PokerPlayerDb.listAll");
  },

  async join(env: Env, gameId: number, userId: number, seatIndex: number, stack: number): Promise<DbResult<true>> {
    return safeDbRun(async () => {
      await env.BOT_DB.prepare(
        `INSERT INTO poker_players (game_id, user_id, seat_index, stack) VALUES (?, ?, ?, ?)`
      )
        .bind(gameId, userId, seatIndex, stack)
        .run();
      return true as const;
    }, "PokerPlayerDb.join");
  },

  async update(
    env: Env,
    gameId: number,
    userId: number,
    fields: Partial<{ stack: number; hole_cards: Card[]; bet_this_round: number; total_bet: number; folded: 0 | 1; all_in: 0 | 1 }>
  ): Promise<DbResult<true>> {
    return safeDbRun(async () => {
      const entries = Object.entries(fields);
      if (entries.length === 0) return true as const;
      const setClause = entries.map(([k]) => `${k} = ?`).join(", ");
      const values = entries.map(([k, v]) => (k === "hole_cards" ? JSON.stringify(v) : v));
      await env.BOT_DB.prepare(`UPDATE poker_players SET ${setClause} WHERE game_id = ? AND user_id = ?`)
        .bind(...values, gameId, userId)
        .run();
      return true as const;
    }, "PokerPlayerDb.update");
  },

  async resetForNewRound(env: Env, gameId: number): Promise<DbResult<true>> {
    return safeDbRun(async () => {
      await env.BOT_DB.prepare(`UPDATE poker_players SET bet_this_round = 0 WHERE game_id = ?`).bind(gameId).run();
      return true as const;
    }, "PokerPlayerDb.resetForNewRound");
  },
};
