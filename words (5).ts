import type { Env, MessageContext, TelegramMessage } from "../../types";
import { PermissionKey } from "../../types";
import { WordDb, ResponseKind } from "../../database/words";
import { SessionDb } from "../../database/sessions";
import { TelegramApi } from "../../telegram/api";
import { Messages } from "../../telegram/messages";
import { requirePermission } from "../../telegram/router_helpers";

// =====================================================================
// قابلیت «کلمات و پاسخ سفارشی».
// جریان افزودن کلمه دو مرحله‌ای است (از طریق Session):
//   ۱) کاربر می‌نویسد «افزودن کلمه» → Session با step='trigger' ساخته می‌شود
//   ۲) پیام بعدی کاربر (متن) به‌عنوان کلمه محرک ذخیره می‌شود، step='response'
//   ۳) پیام بعدی کاربر (هر نوعی) به‌عنوان پاسخ ذخیره و Session پاک می‌شود
// =====================================================================

const SESSION_TYPE = "add_word";
const REMOVE_SESSION_TYPE = "remove_word";

function detectResponseKind(message: TelegramMessage): { kind: ResponseKind; fileId?: string; text?: string } | null {
  if (message.text) return { kind: "text", text: message.text };
  if (message.photo && message.photo.length > 0) {
    return { kind: "photo", fileId: message.photo[message.photo.length - 1].file_id };
  }
  if (message.animation) return { kind: "animation", fileId: message.animation.file_id };
  if (message.sticker) return { kind: "sticker", fileId: message.sticker.file_id };
  if (message.video) return { kind: "video", fileId: message.video.file_id };
  if (message.voice) return { kind: "voice", fileId: message.voice.file_id };
  if (message.audio) return { kind: "audio", fileId: message.audio.file_id };
  if (message.document) return { kind: "document", fileId: message.document.file_id };
  return null;
}

export const WordsFeature = {
  /** شروع جریان افزودن کلمه — از Router برای متن «افزودن کلمه» فراخوانی می‌شود */
  async startAdd(env: Env, ctx: MessageContext): Promise<void> {
    if (!ctx.chatId || !ctx.userId) return;
    if (!(await requirePermission(env, ctx, PermissionKey.WORD_ADD, "افزودن کلمه"))) return;

    await SessionDb.start(env, ctx.userId, ctx.chatId, SESSION_TYPE, "trigger");
    await TelegramApi.sendMessage(env, ctx.chatId, Messages.words.askTrigger);
  },

  /** شروع جریان حذف کلمه */
  async startRemove(env: Env, ctx: MessageContext): Promise<void> {
    if (!ctx.chatId || !ctx.userId) return;
    if (!(await requirePermission(env, ctx, PermissionKey.WORD_CLEAR, "حذف کلمه"))) return;

    await SessionDb.start(env, ctx.userId, ctx.chatId, REMOVE_SESSION_TYPE, "trigger");
    await TelegramApi.sendMessage(env, ctx.chatId, Messages.words.askTriggerToRemove);
  },

  /** آیا این Context در وسط یک Session مربوط به این قابلیت است؟ */
  isOwnSession(ctx: MessageContext): boolean {
    return (
      ctx.activeSession?.session_type === SESSION_TYPE ||
      ctx.activeSession?.session_type === REMOVE_SESSION_TYPE
    );
  },

  /** ادامه‌ی جریان چندمرحله‌ای — از Router هنگام وجود Session فعال فراخوانی می‌شود */
  async continueSession(env: Env, ctx: MessageContext): Promise<void> {
    if (!ctx.chatId || !ctx.userId || !ctx.message || !ctx.activeSession) return;
    const session = ctx.activeSession;

    if (session.session_type === REMOVE_SESSION_TYPE) {
      const trigger = ctx.message.text?.trim();
      await SessionDb.clear(env, ctx.userId, ctx.chatId);
      if (!trigger) return;

      const removed = await WordDb.remove(env, ctx.chatId, trigger);
      if (removed.ok && removed.data) {
        await TelegramApi.sendMessage(env, ctx.chatId, Messages.words.removed(trigger));
      } else {
        await TelegramApi.sendMessage(env, ctx.chatId, Messages.words.notFound(trigger));
      }
      return;
    }

    // session_type === SESSION_TYPE (افزودن کلمه)
    if (session.step === "trigger") {
      const trigger = ctx.message.text?.trim();
      if (!trigger) {
        await TelegramApi.sendMessage(env, ctx.chatId, Messages.words.askTrigger);
        return;
      }
      await SessionDb.updateStep(env, ctx.userId, ctx.chatId, "response", { trigger });
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.words.askResponse);
      return;
    }

    if (session.step === "response") {
      const trigger = (session.data as { trigger?: string }).trigger;
      if (!trigger) {
        await SessionDb.clear(env, ctx.userId, ctx.chatId);
        return;
      }

      const detected = detectResponseKind(ctx.message);
      if (!detected) {
        await TelegramApi.sendMessage(env, ctx.chatId, Messages.words.invalidResponseType);
        return;
      }

      await WordDb.create(env, ctx.chatId, trigger, ctx.userId, {
        kind: detected.kind,
        textContent: detected.text,
        fileId: detected.fileId,
      });
      await SessionDb.clear(env, ctx.userId, ctx.chatId);
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.words.saved(trigger));
    }
  },

  /** بررسی و پاسخ به یک کلمه محرک عادی (فراخوانی‌شده برای هر پیام متنی بدون Session) */
  async tryRespond(env: Env, ctx: MessageContext, text: string): Promise<boolean> {
    if (!ctx.chatId) return false;
    const found = await WordDb.findByTrigger(env, ctx.chatId, text);
    if (!found.ok || !found.data) return false;

    const word = found.data;
    await TelegramApi.sendStoredResponse(env, ctx.chatId, word.response_kind, {
      text: word.text_content ?? undefined,
      fileId: word.file_id ?? undefined,
    });
    return true;
  },

  /** لیست کلمات ثبت‌شده در گروه */
  async list(env: Env, ctx: MessageContext): Promise<void> {
    if (!ctx.chatId) return;
    if (!(await requirePermission(env, ctx, PermissionKey.WORD_LIST, "لیست کلمات"))) return;
    const result = await WordDb.listTriggers(env, ctx.chatId);
    if (!result.ok || result.data.length === 0) {
      await TelegramApi.sendMessage(env, ctx.chatId, "هیچ کلمه‌ای در این گروه ثبت نشده.");
      return;
    }
    await TelegramApi.sendMessage(env, ctx.chatId, `📋 کلمات ثبت‌شده:\n${result.data.map((t) => `• ${t}`).join("\n")}`);
  },
};
