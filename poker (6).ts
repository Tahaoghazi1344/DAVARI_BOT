import type { Env, MessageContext } from "../../types";
import { PermissionKey } from "../../types";
import { CONFIG } from "../../config";
import { PokerGameDb, PokerPlayerDb, PokerGameRecord, PokerPlayerRecord } from "../../database/poker";
import { EconomyService } from "../../economy/economy";
import { TelegramApi } from "../../telegram/api";
import { Messages } from "../../telegram/messages";
import { requirePermission } from "../../telegram/router_helpers";
import { buildDeck, shuffle, handLabel, Card } from "../../games/cards";
import { bestHandOf7, compareHandScores } from "../../games/pokerHand";

// =====================================================================
// Poker ♠️ (Texas Hold'em) — ساده‌سازی مستند‌شده: هر بازی فقط یک دست
// (Single-Hand) است، نه یک میز پیوسته چند‌دستی؛ Raise با گام ثابت (به
// اندازه Big Blind) انجام می‌شود، نه با مبلغ دلخواه؛ Side Pot دقیق
// پیاده‌سازی نشده (در صورت چند All-in، کل Pot به برنده(های) اصلی
// می‌رسد). این ساده‌سازی‌ها برای پایداری و جلوگیری از باگ در نسخه اول
// انتخاب شده‌اند و به‌راحتی در آینده قابل گسترش‌اند.
// =====================================================================

const BUY_IN = CONFIG.POKER_BIG_BLIND * 20;

async function getUserName(env: Env, userId: number): Promise<string> {
  const row = await env.BOT_DB.prepare("SELECT first_name FROM users WHERE telegram_id = ?").bind(userId).first<{ first_name: string }>();
  return row?.first_name ?? "کاربر";
}

function activePlayers(players: PokerPlayerRecord[]): PokerPlayerRecord[] {
  return players.filter((p) => p.folded === 0);
}

async function endHandReturnStacks(env: Env, game: PokerGameRecord, winners: { userId: number; share: number }[]): Promise<void> {
  const playersResult = await PokerPlayerDb.listAll(env, game.id);
  if (!playersResult.ok) return;

  for (const p of playersResult.data) {
    if (p.stack > 0) {
      await EconomyService.adjustBalance(env, p.user_id, p.stack, "refund", { chatId: game.chat_id, reference: `poker:${game.id}` });
    }
  }
  for (const w of winners) {
    if (w.share > 0) {
      await EconomyService.adjustBalance(env, w.userId, w.share, "win", { chatId: game.chat_id, reference: `poker:${game.id}` });
    }
  }
  await PokerGameDb.update(env, game.id, { status: "FINISHED" });
}

async function dealCommunity(game: PokerGameRecord, count: number): Promise<{ deck: Card[]; community: Card[] }> {
  const deck = [...game.deck];
  const drawn: Card[] = [];
  for (let i = 0; i < count; i++) {
    const c = deck.pop();
    if (c) drawn.push(c);
  }
  return { deck, community: [...game.community_cards, ...drawn] };
}

async function runShowdown(env: Env, game: PokerGameRecord): Promise<void> {
  const playersResult = await PokerPlayerDb.listAll(env, game.id);
  if (!playersResult.ok) return;
  const contenders = activePlayers(playersResult.data);

  const scored = contenders.map((p) => ({ p, score: bestHandOf7([...p.hole_cards, ...game.community_cards]) }));
  scored.sort((a, b) => compareHandScores(b.score, a.score));
  const best = scored[0].score;
  const winners = scored.filter((s) => compareHandScores(s.score, best) === 0);
  const share = Math.floor(game.pot / winners.length);

  await TelegramApi.sendMessage(env, game.chat_id, Messages.poker.showdown);
  for (const w of winners) {
    const name = await getUserName(env, w.p.user_id);
    await TelegramApi.sendMessage(env, game.chat_id, Messages.poker.winner(name, w.score.label, share));
  }

  await endHandReturnStacks(env, game, winners.map((w) => ({ userId: w.p.user_id, share })));
}

async function moveToNextStreet(env: Env, game: PokerGameRecord): Promise<void> {
  await PokerPlayerDb.resetForNewRound(env, game.id);

  if (game.status === "PREFLOP") {
    const { deck, community } = await dealCommunity(game, 3);
    await PokerGameDb.update(env, game.id, { status: "FLOP", deck, community_cards: community, current_bet: 0, last_raiser_seat: null });
    await TelegramApi.sendMessage(env, game.chat_id, Messages.poker.communityCards("فلاپ", handLabel(community)));
  } else if (game.status === "FLOP") {
    const { deck, community } = await dealCommunity(game, 1);
    await PokerGameDb.update(env, game.id, { status: "TURN", deck, community_cards: community, current_bet: 0, last_raiser_seat: null });
    await TelegramApi.sendMessage(env, game.chat_id, Messages.poker.communityCards("ترن", handLabel(community)));
  } else if (game.status === "TURN") {
    const { deck, community } = await dealCommunity(game, 1);
    await PokerGameDb.update(env, game.id, { status: "RIVER", deck, community_cards: community, current_bet: 0, last_raiser_seat: null });
    await TelegramApi.sendMessage(env, game.chat_id, Messages.poker.communityCards("ریور", handLabel(community)));
  } else {
    const refreshed = await PokerGameDb.getById(env, game.id);
    if (refreshed.ok && refreshed.data) await runShowdown(env, refreshed.data);
    return;
  }

  const refreshed = await PokerGameDb.getById(env, game.id);
  if (!refreshed.ok || !refreshed.data) return;
  const playersResult = await PokerPlayerDb.listAll(env, game.id);
  if (!playersResult.ok) return;

  const actable = activePlayers(playersResult.data).filter((p) => p.all_in === 0);
  if (actable.length === 0) {
    await moveToNextStreet(env, refreshed.data); // همه All-in — مستقیم به مرحله بعد
    return;
  }
  const dealerSeat = refreshed.data.dealer_seat;
  const firstActor = actable.find((p) => p.seat_index > dealerSeat) ?? actable[0];
  await PokerGameDb.update(env, game.id, { current_turn_seat: firstActor.seat_index, last_raiser_seat: firstActor.seat_index });
  await promptTurn(env, refreshed.data.chat_id, game.id);
}

async function promptTurn(env: Env, chatId: number, gameId: number): Promise<void> {
  const gameResult = await PokerGameDb.getById(env, gameId);
  if (!gameResult.ok || !gameResult.data) return;
  const game = gameResult.data;
  const playersResult = await PokerPlayerDb.listAll(env, gameId);
  if (!playersResult.ok) return;
  const current = playersResult.data.find((p) => p.seat_index === game.current_turn_seat);
  if (!current) return;

  const name = await getUserName(env, current.user_id);
  const toCall = game.current_bet - current.bet_this_round;
  await TelegramApi.sendMessage(env, chatId, Messages.poker.turnPrompt(name, Math.max(0, toCall)), {
    keyboard: [
      [
        { text: "🚫 فولد", callback_data: `poker:action:${gameId}:fold` },
        { text: "✅ چک/کال", callback_data: `poker:action:${gameId}:call` },
      ],
      [
        { text: "📈 رِیز", callback_data: `poker:action:${gameId}:raise` },
        { text: "🔥 آل‌این", callback_data: `poker:action:${gameId}:allin` },
      ],
    ],
  });
}

async function advanceTurn(env: Env, gameId: number): Promise<void> {
  const gameResult = await PokerGameDb.getById(env, gameId);
  if (!gameResult.ok || !gameResult.data) return;
  const game = gameResult.data;

  const playersResult = await PokerPlayerDb.listAll(env, gameId);
  if (!playersResult.ok) return;
  const active = activePlayers(playersResult.data);

  if (active.length === 1) {
    await TelegramApi.sendMessage(env, game.chat_id, Messages.poker.folded("سایر بازیکنان") + " — دست تمام شد.");
    await endHandReturnStacks(env, game, [{ userId: active[0].user_id, share: game.pot }]);
    const name = await getUserName(env, active[0].user_id);
    await TelegramApi.sendMessage(env, game.chat_id, Messages.poker.winner(name, "بدون Showdown", game.pot));
    return;
  }

  const candidates = active.filter((p) => p.all_in === 0);
  if (candidates.length === 0) {
    await moveToNextStreet(env, game);
    return;
  }

  const sortedSeats = candidates.map((p) => p.seat_index).sort((a, b) => a - b);
  const currentSeat = game.current_turn_seat ?? sortedSeats[0];
  const nextSeat = sortedSeats.find((s) => s > currentSeat) ?? sortedSeats[0];

  if (nextSeat === game.last_raiser_seat) {
    await moveToNextStreet(env, game);
    return;
  }

  await PokerGameDb.update(env, gameId, { current_turn_seat: nextSeat });
  await promptTurn(env, game.chat_id, gameId);
}

export const PokerFeature = {
  async openLobby(env: Env, ctx: MessageContext): Promise<void> {
    if (!ctx.chatId || !ctx.userId || ctx.isPrivateChat) return;
    if (!(await requirePermission(env, ctx, PermissionKey.POKER_PLAY, "پوکر"))) return;

    const active = await PokerGameDb.getActiveForChat(env, ctx.chatId);
    if (active.ok && active.data) return;

    const balance = await EconomyService.getBalance(env, ctx.userId);
    if (balance === null || balance < BUY_IN) {
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.poker.notEnoughBalance);
      return;
    }

    const createResult = await PokerGameDb.create(env, ctx.chatId, ctx.userId);
    if (!createResult.ok) return;
    await EconomyService.adjustBalance(env, ctx.userId, -BUY_IN, "bet", { chatId: ctx.chatId, reference: "poker_buyin" });
    await PokerPlayerDb.join(env, createResult.data, ctx.userId, 0, BUY_IN);

    const hostName = ctx.message?.from?.first_name ?? "کاربر";
    await TelegramApi.sendMessage(env, ctx.chatId, Messages.poker.lobbyOpened(hostName, BUY_IN));
  },

  async join(env: Env, ctx: MessageContext): Promise<void> {
    if (!ctx.chatId || !ctx.userId) return;
    const active = await PokerGameDb.getActiveForChat(env, ctx.chatId);
    if (!active.ok || !active.data || active.data.status !== "LOBBY") return;

    const balance = await EconomyService.getBalance(env, ctx.userId);
    if (balance === null || balance < BUY_IN) {
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.poker.notEnoughBalance);
      return;
    }

    const playersResult = await PokerPlayerDb.listAll(env, active.data.id);
    if (!playersResult.ok) return;
    if (playersResult.data.some((p) => p.user_id === ctx.userId)) return;

    await EconomyService.adjustBalance(env, ctx.userId, -BUY_IN, "bet", { chatId: ctx.chatId, reference: "poker_buyin" });
    await PokerPlayerDb.join(env, active.data.id, ctx.userId, playersResult.data.length, BUY_IN);

    const name = ctx.message?.from?.first_name ?? "کاربر";
    await TelegramApi.sendMessage(env, ctx.chatId, Messages.poker.joined(name, playersResult.data.length + 1));
  },

  async hostStart(env: Env, ctx: MessageContext): Promise<void> {
    if (!ctx.chatId || !ctx.userId) return;
    const active = await PokerGameDb.getActiveForChat(env, ctx.chatId);
    if (!active.ok || !active.data || active.data.status !== "LOBBY") return;
    if (ctx.userId !== active.data.host_id) {
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.poker.onlyHostCanStart);
      return;
    }

    const playersResult = await PokerPlayerDb.listAll(env, active.data.id);
    if (!playersResult.ok || playersResult.data.length < 2) {
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.poker.notEnoughPlayers);
      return;
    }
    const players = playersResult.data;
    const n = players.length;

    let deck = shuffle(buildDeck());
    for (const p of players) {
      const cards = [deck.pop()!, deck.pop()!];
      await PokerPlayerDb.update(env, active.data.id, p.user_id, { hole_cards: cards });
      const dmResult = await TelegramApi.sendMessage(env, p.user_id, Messages.poker.yourCards(handLabel(cards)));
      if (!dmResult.ok) {
        const name = await getUserName(env, p.user_id);
        await TelegramApi.sendMessage(env, ctx.chatId, Messages.spy.dmFailed(name));
      }
    }

    const dealerSeat = 0;
    const sbSeat = (dealerSeat + 1) % n;
    const bbSeat = (dealerSeat + 2) % n;
    const sbPlayer = players.find((p) => p.seat_index === sbSeat)!;
    const bbPlayer = players.find((p) => p.seat_index === bbSeat)!;

    await PokerPlayerDb.update(env, active.data.id, sbPlayer.user_id, {
      stack: sbPlayer.stack - CONFIG.POKER_SMALL_BLIND,
      bet_this_round: CONFIG.POKER_SMALL_BLIND,
      total_bet: CONFIG.POKER_SMALL_BLIND,
    });
    await PokerPlayerDb.update(env, active.data.id, bbPlayer.user_id, {
      stack: bbPlayer.stack - CONFIG.POKER_BIG_BLIND,
      bet_this_round: CONFIG.POKER_BIG_BLIND,
      total_bet: CONFIG.POKER_BIG_BLIND,
    });

    const firstActorSeat = (bbSeat + 1) % n;
    await PokerGameDb.update(env, active.data.id, {
      status: "PREFLOP",
      dealer_seat: dealerSeat,
      current_turn_seat: firstActorSeat,
      last_raiser_seat: bbSeat,
      pot: CONFIG.POKER_SMALL_BLIND + CONFIG.POKER_BIG_BLIND,
      current_bet: CONFIG.POKER_BIG_BLIND,
      deck,
      community_cards: [],
    });

    await TelegramApi.sendMessage(env, ctx.chatId, Messages.poker.started);
    await promptTurn(env, ctx.chatId, active.data.id);
  },

  async handleCallback(env: Env, ctx: MessageContext): Promise<void> {
    const cq = ctx.callbackQuery;
    if (!cq || !cq.data || !ctx.chatId || !ctx.userId) return;
    const [, , gameIdStr, action] = cq.data.split(":");
    const gameId = Number(gameIdStr);
    const gameResult = await PokerGameDb.getById(env, gameId);
    if (!gameResult.ok || !gameResult.data) return;
    const game = gameResult.data;
    if (!["PREFLOP", "FLOP", "TURN", "RIVER"].includes(game.status)) {
      await TelegramApi.answerCallbackQuery(env, cq.id, "این دست دیگر فعال نیست.", true);
      return;
    }

    const playersResult = await PokerPlayerDb.listAll(env, gameId);
    if (!playersResult.ok) return;
    const actor = playersResult.data.find((p) => p.user_id === ctx.userId);
    if (!actor || actor.seat_index !== game.current_turn_seat) {
      await TelegramApi.answerCallbackQuery(env, cq.id, Messages.poker.notYourTurn, true);
      return;
    }

    const name = await getUserName(env, ctx.userId);

    if (action === "fold") {
      await PokerPlayerDb.update(env, gameId, ctx.userId, { folded: 1 });
      await TelegramApi.answerCallbackQuery(env, cq.id, "فولد کردی.");
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.poker.folded(name));
      await advanceTurn(env, gameId);
      return;
    }

    if (action === "call") {
      const toCall = Math.min(game.current_bet - actor.bet_this_round, actor.stack);
      const isAllIn = toCall >= actor.stack;
      await PokerPlayerDb.update(env, gameId, ctx.userId, {
        stack: actor.stack - toCall,
        bet_this_round: actor.bet_this_round + toCall,
        total_bet: actor.total_bet + toCall,
        all_in: isAllIn ? 1 : 0,
      });
      await PokerGameDb.update(env, gameId, { pot: game.pot + toCall });
      await TelegramApi.answerCallbackQuery(env, cq.id, "ثبت شد.");
      await TelegramApi.sendMessage(
        env,
        ctx.chatId,
        toCall === 0 ? Messages.poker.checked(name) : Messages.poker.called(name, toCall)
      );
      await advanceTurn(env, gameId);
      return;
    }

    if (action === "raise") {
      const newBet = game.current_bet + CONFIG.POKER_BIG_BLIND;
      const needed = Math.min(newBet - actor.bet_this_round, actor.stack);
      const isAllIn = needed >= actor.stack;
      const finalBet = actor.bet_this_round + needed;

      await PokerPlayerDb.update(env, gameId, ctx.userId, {
        stack: actor.stack - needed,
        bet_this_round: finalBet,
        total_bet: actor.total_bet + needed,
        all_in: isAllIn ? 1 : 0,
      });
      await PokerGameDb.update(env, gameId, { pot: game.pot + needed, current_bet: Math.max(game.current_bet, finalBet), last_raiser_seat: actor.seat_index });
      await TelegramApi.answerCallbackQuery(env, cq.id, "ریز کردی.");
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.poker.raised(name, finalBet));
      await advanceTurn(env, gameId);
      return;
    }

    if (action === "allin") {
      const amount = actor.stack;
      const finalBet = actor.bet_this_round + amount;
      await PokerPlayerDb.update(env, gameId, ctx.userId, {
        stack: 0,
        bet_this_round: finalBet,
        total_bet: actor.total_bet + amount,
        all_in: 1,
      });
      const isRaise = finalBet > game.current_bet;
      await PokerGameDb.update(env, gameId, {
        pot: game.pot + amount,
        current_bet: Math.max(game.current_bet, finalBet),
        last_raiser_seat: isRaise ? actor.seat_index : game.last_raiser_seat,
      });
      await TelegramApi.answerCallbackQuery(env, cq.id, "آل‌این کردی!");
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.poker.allIn(name));
      await advanceTurn(env, gameId);
    }
  },
};
