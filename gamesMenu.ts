import type { Env, MessageContext } from "../types";
import { TelegramApi } from "../telegram/api";
import { SpyFeature } from "../features/spy/spy";
import { BlackjackFeature } from "../features/blackjack/blackjack";
import { PokerFeature } from "../features/poker/poker";

// منوی اصلی بازی‌ها — طبق بخش ۱۳۸/۱۶۰ متن اصلی
export const GamesMenu = {
  async open(env: Env, ctx: MessageContext): Promise<void> {
    if (!ctx.chatId) return;
    await TelegramApi.sendMessage(env, ctx.chatId, "🎮 یکی از بازی‌ها را انتخاب کن:", {
      keyboard: [
        [{ text: "🕵️ جاسوس", callback_data: "games:spy" }],
        [{ text: "🃏 بلک‌جک", callback_data: "games:blackjack" }],
        [{ text: "♠️ پوکر", callback_data: "games:poker" }],
      ],
    });
  },

  async handleCallback(env: Env, ctx: MessageContext): Promise<void> {
    const cq = ctx.callbackQuery;
    if (!cq || !cq.data || !ctx.chatId) return;
    const choice = cq.data.split(":")[1];
    await TelegramApi.answerCallbackQuery(env, cq.id, "باشه!");

    if (choice === "spy") await SpyFeature.createLobby(env, ctx);
    else if (choice === "blackjack") await BlackjackFeature.start(env, ctx);
    else if (choice === "poker") await PokerFeature.openLobby(env, ctx);
  },
};
