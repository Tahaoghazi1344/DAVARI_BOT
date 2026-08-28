import type { Env } from "../types";
import { safeDbRun, DbResult } from "../utils/db";

// =====================================================================
// عملیات خام دیتابیس روی کلمات محرک سفارشی و پاسخ آن‌ها.
// هر کلمه در یک گروه، دقیقاً یک پاسخ دارد (متن یا یک مدیا).
// =====================================================================

export type ResponseKind =
  | "text"
  | "photo"
  | "video"
  | "animation"
  | "sticker"
  | "voice"
  | "audio"
  | "document";

export interface WordWithResponse {
  id: number;
  trigger_text: string;
  response_kind: ResponseKind;
  text_content: string | null;
  file_id: string | null;
}

export const WordDb = {
  async findByTrigger(env: Env, chatId: number, triggerText: string): Promise<DbResult<WordWithResponse | null>> {
    return safeDbRun(async () => {
      const row = await env.BOT_DB.prepare(
        `SELECT w.id, w.trigger_text, r.response_kind, r.text_content, r.file_id
         FROM custom_words w
         JOIN custom_word_responses r ON r.word_id = w.id
         WHERE w.chat_id = ? AND w.trigger_text = ?
         ORDER BY r.id DESC LIMIT 1`
      )
        .bind(chatId, triggerText)
        .first<WordWithResponse>();
      return row ?? null;
    }, "WordDb.findByTrigger");
  },

  async create(
    env: Env,
    chatId: number,
    triggerText: string,
    createdBy: number,
    response: { kind: ResponseKind; textContent?: string; fileId?: string }
  ): Promise<DbResult<{ id: number }>> {
    return safeDbRun(async () => {
      // اگر کلمه از قبل وجود دارد، پاسخ قبلی را جایگزین می‌کنیم (بدون رکورد تکراری)
      const existing = await env.BOT_DB.prepare(
        `SELECT id FROM custom_words WHERE chat_id = ? AND trigger_text = ?`
      )
        .bind(chatId, triggerText)
        .first<{ id: number }>();

      let wordId: number;
      if (existing) {
        wordId = existing.id;
      } else {
        const inserted = await env.BOT_DB.prepare(
          `INSERT INTO custom_words (chat_id, trigger_text, created_by) VALUES (?, ?, ?)`
        )
          .bind(chatId, triggerText, createdBy)
          .run();
        wordId = Number(inserted.meta.last_row_id);
      }

      await env.BOT_DB.prepare(
        `INSERT INTO custom_word_responses (word_id, response_kind, text_content, file_id)
         VALUES (?, ?, ?, ?)`
      )
        .bind(wordId, response.kind, response.textContent ?? null, response.fileId ?? null)
        .run();

      return { id: wordId };
    }, "WordDb.create");
  },

  async remove(env: Env, chatId: number, triggerText: string): Promise<DbResult<boolean>> {
    return safeDbRun(async () => {
      const existing = await env.BOT_DB.prepare(
        `SELECT id FROM custom_words WHERE chat_id = ? AND trigger_text = ?`
      )
        .bind(chatId, triggerText)
        .first<{ id: number }>();

      if (!existing) return false;

      await env.BOT_DB.prepare(`DELETE FROM custom_word_responses WHERE word_id = ?`)
        .bind(existing.id)
        .run();
      await env.BOT_DB.prepare(`DELETE FROM custom_words WHERE id = ?`).bind(existing.id).run();
      return true;
    }, "WordDb.remove");
  },

  async listTriggers(env: Env, chatId: number): Promise<DbResult<string[]>> {
    return safeDbRun(async () => {
      const { results } = await env.BOT_DB.prepare(
        `SELECT trigger_text FROM custom_words WHERE chat_id = ? ORDER BY trigger_text`
      )
        .bind(chatId)
        .all<{ trigger_text: string }>();
      return (results ?? []).map((r) => r.trigger_text);
    }, "WordDb.listTriggers");
  },
};
