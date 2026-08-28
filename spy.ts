import type { Env } from "../types";
import { safeDbRun, DbResult } from "../utils/db";

export type SpyStatus = "LOBBY" | "CONFIG" | "RUNNING" | "LAST_CHANCE" | "FINISHED" | "CANCELLED";

export interface SpyGameRecord {
  id: number;
  chat_id: number;
  host_id: number;
  status: SpyStatus;
  category: string | null;
  word: string | null;
  spy_count: number | null;
  duration_seconds: number | null;
  starter_id: number | null;
  current_turn_id: number | null;
  expires_at: string | null;
}

export interface SpyPlayerRecord {
  game_id: number;
  user_id: number;
  role: "SPY" | "CITIZEN" | null;
  alive: 0 | 1;
}

export const SpyGameDb = {
  async getActiveForChat(env: Env, chatId: number): Promise<DbResult<SpyGameRecord | null>> {
    return safeDbRun(async () => {
      const row = await env.BOT_DB.prepare(
        `SELECT id, chat_id, host_id, status, category, word, spy_count, duration_seconds, starter_id, current_turn_id, expires_at
         FROM spy_games WHERE chat_id = ? AND status NOT IN ('FINISHED','CANCELLED') ORDER BY id DESC LIMIT 1`
      )
        .bind(chatId)
        .first<SpyGameRecord>();
      return row ?? null;
    }, "SpyGameDb.getActiveForChat");
  },

  async getById(env: Env, id: number): Promise<DbResult<SpyGameRecord | null>> {
    return safeDbRun(async () => {
      const row = await env.BOT_DB.prepare(
        `SELECT id, chat_id, host_id, status, category, word, spy_count, duration_seconds, starter_id, current_turn_id, expires_at
         FROM spy_games WHERE id = ?`
      )
        .bind(id)
        .first<SpyGameRecord>();
      return row ?? null;
    }, "SpyGameDb.getById");
  },

  async create(env: Env, chatId: number, hostId: number): Promise<DbResult<number>> {
    return safeDbRun(async () => {
      const result = await env.BOT_DB.prepare(
        `INSERT INTO spy_games (chat_id, host_id, status) VALUES (?, ?, 'LOBBY')`
      )
        .bind(chatId, hostId)
        .run();
      return Number(result.meta.last_row_id);
    }, "SpyGameDb.create");
  },

  async update(
    env: Env,
    id: number,
    fields: Partial<{
      status: SpyStatus;
      category: string;
      word: string;
      spy_count: number;
      duration_seconds: number;
      starter_id: number;
      current_turn_id: number | null;
      expires_at: string | null;
    }>
  ): Promise<DbResult<true>> {
    return safeDbRun(async () => {
      const keys = Object.keys(fields);
      if (keys.length === 0) return true as const;
      const setClause = keys.map((k) => `${k} = ?`).join(", ");
      const values = keys.map((k) => (fields as Record<string, unknown>)[k]);
      await env.BOT_DB.prepare(`UPDATE spy_games SET ${setClause}, updated_at = datetime('now') WHERE id = ?`)
        .bind(...values, id)
        .run();
      return true as const;
    }, "SpyGameDb.update");
  },
};

export const SpyPlayerDb = {
  async join(env: Env, gameId: number, userId: number): Promise<DbResult<boolean>> {
    return safeDbRun(async () => {
      const existing = await env.BOT_DB.prepare(
        `SELECT user_id FROM spy_players WHERE game_id = ? AND user_id = ?`
      )
        .bind(gameId, userId)
        .first();
      if (existing) return false;
      await env.BOT_DB.prepare(`INSERT INTO spy_players (game_id, user_id) VALUES (?, ?)`)
        .bind(gameId, userId)
        .run();
      return true;
    }, "SpyPlayerDb.join");
  },

  async listAll(env: Env, gameId: number): Promise<DbResult<SpyPlayerRecord[]>> {
    return safeDbRun(async () => {
      const { results } = await env.BOT_DB.prepare(
        `SELECT game_id, user_id, role, alive FROM spy_players WHERE game_id = ?`
      )
        .bind(gameId)
        .all<SpyPlayerRecord>();
      return results ?? [];
    }, "SpyPlayerDb.listAll");
  },

  async setRole(env: Env, gameId: number, userId: number, role: "SPY" | "CITIZEN"): Promise<DbResult<true>> {
    return safeDbRun(async () => {
      await env.BOT_DB.prepare(`UPDATE spy_players SET role = ? WHERE game_id = ? AND user_id = ?`)
        .bind(role, gameId, userId)
        .run();
      return true as const;
    }, "SpyPlayerDb.setRole");
  },

  async eliminate(env: Env, gameId: number, userId: number): Promise<DbResult<true>> {
    return safeDbRun(async () => {
      await env.BOT_DB.prepare(`UPDATE spy_players SET alive = 0 WHERE game_id = ? AND user_id = ?`)
        .bind(gameId, userId)
        .run();
      return true as const;
    }, "SpyPlayerDb.eliminate");
  },
};

export const SpyVoteDb = {
  async castVote(env: Env, gameId: number, targetId: number, voterId: number): Promise<DbResult<true>> {
    return safeDbRun(async () => {
      await env.BOT_DB.prepare(
        `INSERT INTO spy_votes (game_id, target_id, voter_id, vote) VALUES (?, ?, ?, 1)
         ON CONFLICT(game_id, target_id, voter_id) DO NOTHING`
      )
        .bind(gameId, targetId, voterId)
        .run();
      return true as const;
    }, "SpyVoteDb.castVote");
  },

  async countVotes(env: Env, gameId: number, targetId: number): Promise<DbResult<number>> {
    return safeDbRun(async () => {
      const row = await env.BOT_DB.prepare(
        `SELECT COUNT(*) AS c FROM spy_votes WHERE game_id = ? AND target_id = ?`
      )
        .bind(gameId, targetId)
        .first<{ c: number }>();
      return row?.c ?? 0;
    }, "SpyVoteDb.countVotes");
  },

  async clearForTarget(env: Env, gameId: number, targetId: number): Promise<DbResult<true>> {
    return safeDbRun(async () => {
      await env.BOT_DB.prepare(`DELETE FROM spy_votes WHERE game_id = ? AND target_id = ?`)
        .bind(gameId, targetId)
        .run();
      return true as const;
    }, "SpyVoteDb.clearForTarget");
  },
};

export const SpyWordDb = {
  async randomWord(env: Env, category: string): Promise<DbResult<string | null>> {
    return safeDbRun(async () => {
      const row = await env.BOT_DB.prepare(
        `SELECT word FROM spy_words WHERE category = ? ORDER BY RANDOM() LIMIT 1`
      )
        .bind(category)
        .first<{ word: string }>();
      return row?.word ?? null;
    }, "SpyWordDb.randomWord");
  },

  async addWords(env: Env, category: string, words: string[], createdBy: number): Promise<DbResult<number>> {
    return safeDbRun(async () => {
      let inserted = 0;
      for (const w of words) {
        const word = w.trim();
        if (!word) continue;
        await env.BOT_DB.prepare(
          `INSERT INTO spy_words (category, word, created_by) VALUES (?, ?, ?)
           ON CONFLICT(category, word) DO NOTHING`
        )
          .bind(category, word, createdBy)
          .run();
        inserted += 1;
      }
      return inserted;
    }, "SpyWordDb.addWords");
  },

  async removeWords(env: Env, category: string, words: string[]): Promise<DbResult<number>> {
    return safeDbRun(async () => {
      let removed = 0;
      for (const w of words) {
        const word = w.trim();
        if (!word) continue;
        await env.BOT_DB.prepare(`DELETE FROM spy_words WHERE category = ? AND word = ?`)
          .bind(category, word)
          .run();
        removed += 1;
      }
      return removed;
    }, "SpyWordDb.removeWords");
  },
};
