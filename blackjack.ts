import type { Env, MessageContext } from "../../types";
import { PermissionKey } from "../../types";
import { SessionDb } from "../../database/sessions";
import { EconomyService } from "../../economy/economy";
import { TelegramApi } from "../../telegram/api";
import { Messages } from "../../telegram/messages";
import { requirePermission } from "../../telegram/router_helpers";
import { buildDeck, shuffle, blackjackValue, handLabel, Card } from "../../games/cards";

// =====================================================================
// Blackjack 🃏 — بازی تک‌نفره در برابر Dealer. طبق «قانون طلایی عدم
// تداخل قابلیت‌ها»، وضعیت بازی در همان جدول عمومی sessions ذخیره
// می‌شود (session_type='blackjack') چون این بازی کاملاً شخصی است و به
// جدول اختصاصی نیاز ندارد؛ استفاده از Session موجود، بدون هیچ Migration
// اضافه، رفتار «حداکثر یک عملیات فعال به‌ازای هر کاربر» را هم رایگان
// تضمین می‌کند.
// =====================================================================

const SESSION_TYPE = "blackjack";


interface BjState {
  bet: number;
  deck: Card[];
  player: Card[];
  dealer: Card[];
}

async function dealRound(env: Env, ctx: MessageContext, bet: number): Promise<void> {
  if (!ctx.chatId || !ctx.userId) return;
  const deck = shuffle(buildDeck());
  const player = [deck.pop()!, deck.pop()!];
  const dealer = [deck.pop()!, deck.pop()!];

  const state: BjState = { bet, deck, player, dealer };
  await SessionDb.start(env, ctx.userId, ctx.chatId, SESSION_TYPE, "playing", state as unknown as Record<string, unknown>);

  const playerValue = blackjackValue(player);
  if (playerValue === 21) {
    await finishGame(env, ctx, state, "natural");
    return;
  }

  await sendHandMessage(env, ctx.chatId, bet, player, dealer, true);
}

async function sendHandMessage(env: Env, chatId: number, bet: number, player: Card[], dealer: Card[], hideDealer: boolean): Promise<void> {
  const lines = [
    Messages.blackjack.handTitle(bet),
    Messages.blackjack.yourHand(handLabel(player), blackjackValue(player)),
    hideDealer ? Messages.blackjack.dealerShows(handLabel([dealer[0]])) : Messages.blackjack.dealerHand(handLabel(dealer), blackjackValue(dealer)),
  ];
  await TelegramApi.sendMessage(env, chatId, lines.join("\n"), {
    keyboard: [
      [
        { text: "🃏 Hit", callback_data: "bj:hit" },
        { text: "✋ Stand", callback_data: "bj:stand" },
        { text: "💰 Double", callback_data: "bj:double" },
      ],
    ],
  });
}

async function finishGame(
  env: Env,
  ctx: MessageContext,
  state: BjState,
  outcome: "natural" | "bust" | "dealer_bust" | "win" | "lose" | "push"
): Promise<void> {
  if (!ctx.chatId || !ctx.userId) return;
  await SessionDb.clear(env, ctx.userId, ctx.chatId);

  let payout = 0;
  let message = "";
  switch (outcome) {
    case "natural":
      payout = Math.floor(state.bet * 2.5);
      message = Messages.blackjack.naturalBlackjack;
      break;
    case "bust":
      payout = 0;
      message = Messages.blackjack.bust;
      break;
    case "dealer_bust":
      payout = state.bet * 2;
      message = Messages.blackjack.dealerBust;
      break;
    case "win":
      payout = state.bet * 2;
      message = Messages.blackjack.youWin;
      break;
    case "lose":
      payout = 0;
      message = Messages.blackjack.youLose;
      break;
    case "push":
      payout = state.bet;
      message = Messages.blackjack.push;
      break;
  }

  await TelegramApi.sendMessage(
    env,
    ctx.chatId,
    `${Messages.blackjack.dealerHand(handLabel(state.dealer), blackjackValue(state.dealer))}\n${message}`
  );

  if (payout > 0) {
    await EconomyService.adjustBalance(env, ctx.userId, payout, "win", { chatId: ctx.chatId, reference: "blackjack" });
    await TelegramApi.sendMessage(env, ctx.chatId, Messages.blackjack.payout(payout));
  }
}

async function playDealerAndSettle(env: Env, ctx: MessageContext, state: BjState): Promise<void> {
  let dealer = [...state.dealer];
  const deck = [...state.deck];
  while (blackjackValue(dealer) < 17) {
    const card = deck.pop();
    if (!card) break;
    dealer = [...dealer, card];
  }
  const finalState = { ...state, dealer, deck };

  const dealerValue = blackjackValue(dealer);
  const playerValue = blackjackValue(state.player);

  if (dealerValue > 21) return void (await finishGame(env, ctx, finalState, "dealer_bust"));
  if (dealerValue > playerValue) return void (await finishGame(env, ctx, finalState, "lose"));
  if (dealerValue < playerValue) return void (await finishGame(env, ctx, finalState, "win"));
  await finishGame(env, ctx, finalState, "push");
}

export const BlackjackFeature = {
  isOwnSession(ctx: MessageContext): boolean {
    return ctx.activeSession?.session_type === SESSION_TYPE;
  },

  async start(env: Env, ctx: MessageContext): Promise<void> {
    if (!ctx.chatId || !ctx.userId) return;
    if (!(await requirePermission(env, ctx, PermissionKey.BLACKJACK_PLAY, "بلک جک"))) return;

    const balance = await EconomyService.getBalance(env, ctx.userId);
    if (balance === null) return;

    await SessionDb.start(env, ctx.userId, ctx.chatId, SESSION_TYPE, "awaiting_bet", {});
    await TelegramApi.sendMessage(env, ctx.chatId, Messages.blackjack.askBet(balance));
  },

  async continueSession(env: Env, ctx: MessageContext): Promise<void> {
    if (!ctx.chatId || !ctx.userId || !ctx.message || !ctx.activeSession) return;
    if (ctx.activeSession.step !== "awaiting_bet") return; // مراحل بعدی از طریق Callback است

    const bet = Number((ctx.message.text ?? "").replace(/[^0-9]/g, ""));
    const balance = await EconomyService.getBalance(env, ctx.userId);

    if (!Number.isFinite(bet) || bet <= 0 || balance === null || bet > balance) {
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.blackjack.invalidBet);
      return;
    }

    const deductResult = await EconomyService.adjustBalance(env, ctx.userId, -bet, "bet", { chatId: ctx.chatId, reference: "blackjack" });
    if (!deductResult.ok) {
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.blackjack.invalidBet);
      return;
    }

    await dealRound(env, ctx, bet);
  },

  async handleCallback(env: Env, ctx: MessageContext): Promise<void> {
    const cq = ctx.callbackQuery;
    if (!cq || !cq.data || !ctx.chatId || !ctx.userId) return;
    if (!ctx.activeSession || ctx.activeSession.session_type !== SESSION_TYPE || ctx.activeSession.step !== "playing") {
      await TelegramApi.answerCallbackQuery(env, cq.id, "بازی فعالی یافت نشد.", true);
      return;
    }

    const state = ctx.activeSession.data as unknown as BjState;
    const action = cq.data.split(":")[1];

    if (action === "hit") {
      const deck = [...state.deck];
      const card = deck.pop();
      if (!card) return;
      const player = [...state.player, card];
      const newState: BjState = { ...state, deck, player };

      if (blackjackValue(player) > 21) {
        await TelegramApi.answerCallbackQuery(env, cq.id, "Bust!");
        await finishGame(env, ctx, newState, "bust");
        return;
      }
      await SessionDb.updateStep(env, ctx.userId, ctx.chatId, "playing", newState as unknown as Record<string, unknown>);
      await TelegramApi.answerCallbackQuery(env, cq.id, "کارت گرفتی.");
      await sendHandMessage(env, ctx.chatId, state.bet, player, state.dealer, true);
      return;
    }

    if (action === "stand") {
      await TelegramApi.answerCallbackQuery(env, cq.id, "ایستادی.");
      await playDealerAndSettle(env, ctx, state);
      return;
    }

    if (action === "double") {
      const balance = await EconomyService.getBalance(env, ctx.userId);
      if (balance === null || balance < state.bet) {
        await TelegramApi.answerCallbackQuery(env, cq.id, "موجودی کافی نیست.", true);
        return;
      }
      await EconomyService.adjustBalance(env, ctx.userId, -state.bet, "bet", { chatId: ctx.chatId, reference: "blackjack_double" });
      const deck = [...state.deck];
      const card = deck.pop();
      const player = card ? [...state.player, card] : state.player;
      const newState: BjState = { ...state, bet: state.bet * 2, deck, player };
      await TelegramApi.answerCallbackQuery(env, cq.id, "دبل شد.");

      if (blackjackValue(player) > 21) {
        await finishGame(env, ctx, newState, "bust");
        return;
      }
      await SessionDb.updateStep(env, ctx.userId, ctx.chatId, "playing", newState as unknown as Record<string, unknown>);
      await playDealerAndSettle(env, ctx, newState);
    }
  },
};
