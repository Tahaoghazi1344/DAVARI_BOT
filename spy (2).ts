import type { Env, MessageContext } from "../../types";
import { PermissionKey } from "../../types";
import { CONFIG } from "../../config";
import { SpyGameDb, SpyPlayerDb, SpyVoteDb, SpyWordDb, SpyGameRecord } from "../../database/spy";
import { SessionDb } from "../../database/sessions";
import { EconomyService } from "../../economy/economy";
import { TelegramApi } from "../../telegram/api";
import { Messages } from "../../telegram/messages";
import { requirePermission } from "../../telegram/router_helpers";

// =====================================================================
// بازی جاسوس 🕵️ — پیاده‌سازی طبق بخش‌های ۹۵ تا ۱۲۰ متن اصلی.
//
// ساده‌سازی مستند‌شده: اجرای دقیق «نوبت سؤال/پاسخ Reply-به-Reply» به‌طور
// کامل اجرا نشده (فقط شروع‌کننده اعلام می‌شود)؛ اما تمام مکانیزم‌های
// تعیین‌کننده‌ی برد/باخت — رأی‌گیری با حد نصاب، عدم افشای نقش، مرحله
// LAST CHANCE، تایمر مبتنی بر expiresAt، و پرداخت جایزه — کامل پیاده
// شده‌اند.
// =====================================================================

const WORDS_SESSION_TYPE = "spy_words";

async function getUserName(env: Env, userId: number): Promise<string> {
  const row = await env.BOT_DB.prepare("SELECT first_name FROM users WHERE telegram_id = ?")
    .bind(userId)
    .first<{ first_name: string }>();
  return row?.first_name ?? "کاربر";
}

async function announceStarterAndBegin(env: Env, game: SpyGameRecord): Promise<void> {
  const players = await SpyPlayerDb.listAll(env, game.id);
  if (!players.ok) return;
  const citizens = players.data.filter((p) => p.role === "CITIZEN");
  const starter = citizens.length > 0 ? citizens[Math.floor(Math.random() * citizens.length)] : players.data[0];

  const durationSeconds = game.duration_seconds ?? 10 * 60;
  const expiresAt = new Date(Date.now() + durationSeconds * 1000).toISOString();
  await SpyGameDb.update(env, game.id, { status: "RUNNING", starter_id: starter.user_id, expires_at: expiresAt });

  const starterName = await getUserName(env, starter.user_id);
  await TelegramApi.sendMessage(env, game.chat_id, Messages.spy.starterAnnounce(starterName));
}

async function checkTimeExpired(env: Env, game: SpyGameRecord): Promise<boolean> {
  if (game.status !== "RUNNING" || !game.expires_at) return false;
  if (new Date(game.expires_at).getTime() >= Date.now()) return false;

  await SpyGameDb.update(env, game.id, { status: "FINISHED" });
  await TelegramApi.sendMessage(env, game.chat_id, Messages.spy.citizensWinTimeout);
  await rewardTeam(env, game.id, game.chat_id, "CITIZEN");
  return true;
}

async function checkLastChanceExpired(env: Env, game: SpyGameRecord): Promise<boolean> {
  if (game.status !== "LAST_CHANCE" || !game.expires_at) return false;
  if (new Date(game.expires_at).getTime() >= Date.now()) return false;

  await SpyGameDb.update(env, game.id, { status: "FINISHED" });
  await TelegramApi.sendMessage(env, game.chat_id, Messages.spy.citizensWinTimeout);
  await rewardTeam(env, game.id, game.chat_id, "CITIZEN");
  return true;
}

async function rewardTeam(env: Env, gameId: number, chatId: number, team: "SPY" | "CITIZEN"): Promise<void> {
  const players = await SpyPlayerDb.listAll(env, gameId);
  if (!players.ok) return;
  const winners = players.data.filter((p) => p.role === team);
  for (const w of winners) {
    await EconomyService.adjustBalance(env, w.user_id, CONFIG.SPY_REWARD, "game_reward", {
      chatId,
      reference: `spy:${gameId}`,
    });
  }
  if (winners.length > 0) {
    await TelegramApi.sendMessage(env, chatId, Messages.spy.rewardGiven(CONFIG.SPY_REWARD));
  }
}

export const SpyFeature = {
  isOwnSession(ctx: MessageContext): boolean {
    return ctx.activeSession?.session_type === WORDS_SESSION_TYPE;
  },

  async createLobby(env: Env, ctx: MessageContext): Promise<void> {
    if (!ctx.chatId || !ctx.userId || ctx.isPrivateChat) return;
    if (!(await requirePermission(env, ctx, PermissionKey.SPY_PLAY, "جاسوس"))) return;

    const active = await SpyGameDb.getActiveForChat(env, ctx.chatId);
    if (active.ok && active.data) {
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.spy.alreadyActive);
      return;
    }

    const createResult = await SpyGameDb.create(env, ctx.chatId, ctx.userId);
    if (!createResult.ok) return;
    await SpyPlayerDb.join(env, createResult.data, ctx.userId);

    const hostName = ctx.message?.from?.first_name ?? "کاربر";
    await TelegramApi.sendMessage(env, ctx.chatId, Messages.spy.lobbyCreated(hostName));
  },

  async join(env: Env, ctx: MessageContext): Promise<void> {
    if (!ctx.chatId || !ctx.userId) return;
    const active = await SpyGameDb.getActiveForChat(env, ctx.chatId);
    if (!active.ok || !active.data || active.data.status !== "LOBBY") return;

    const joined = await SpyPlayerDb.join(env, active.data.id, ctx.userId);
    if (!joined.ok) return;
    if (!joined.data) {
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.spy.alreadyJoined);
      return;
    }
    const players = await SpyPlayerDb.listAll(env, active.data.id);
    const name = ctx.message?.from?.first_name ?? "کاربر";
    await TelegramApi.sendMessage(env, ctx.chatId, Messages.spy.joined(name, players.ok ? players.data.length : 0));
  },

  async hostStart(env: Env, ctx: MessageContext): Promise<void> {
    if (!ctx.chatId || !ctx.userId) return;
    const active = await SpyGameDb.getActiveForChat(env, ctx.chatId);
    if (!active.ok || !active.data || active.data.status !== "LOBBY") return;
    if (ctx.userId !== active.data.host_id) {
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.spy.onlyHostCanStart);
      return;
    }

    const players = await SpyPlayerDb.listAll(env, active.data.id);
    const count = players.ok ? players.data.length : 0;
    if (count < CONFIG.SPY_MIN_PLAYERS) {
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.spy.notEnoughPlayers(CONFIG.SPY_MIN_PLAYERS));
      return;
    }

    await SpyGameDb.update(env, active.data.id, { status: "CONFIG" });
    const maxSpies = Math.min(CONFIG.SPY_MAX_SPIES, Math.floor(count / 2));
    const buttons = Array.from({ length: maxSpies }, (_, i) => ({
      text: String(i + 1),
      callback_data: `spy:cfg_count:${active.data!.id}:${i + 1}`,
    }));
    await TelegramApi.sendMessage(env, ctx.chatId, Messages.spy.chooseSpyCount, { keyboard: [buttons] });
  },

  async startAddWords(env: Env, ctx: MessageContext): Promise<void> {
    if (!ctx.chatId || !ctx.userId) return;
    if (!(await requirePermission(env, ctx, PermissionKey.SPY_MANAGE, "مدیریت کلمات جاسوس"))) return;
    const buttons = CONFIG.SPY_CATEGORIES.map((c) => [{ text: c, callback_data: `spy:word_cat:add:${c}` }]);
    await TelegramApi.sendMessage(env, ctx.chatId, Messages.spy.askWordsCategory, { keyboard: buttons });
  },

  async startRemoveWords(env: Env, ctx: MessageContext): Promise<void> {
    if (!ctx.chatId || !ctx.userId) return;
    if (!(await requirePermission(env, ctx, PermissionKey.SPY_MANAGE, "مدیریت کلمات جاسوس"))) return;
    const buttons = CONFIG.SPY_CATEGORIES.map((c) => [{ text: c, callback_data: `spy:word_cat:remove:${c}` }]);
    await TelegramApi.sendMessage(env, ctx.chatId, Messages.spy.askWordsCategory, { keyboard: buttons });
  },

  async continueSession(env: Env, ctx: MessageContext): Promise<void> {
    if (!ctx.chatId || !ctx.userId || !ctx.message || !ctx.activeSession) return;
    const { mode, category } = ctx.activeSession.data as { mode?: "add" | "remove"; category?: string };
    await SessionDb.clear(env, ctx.userId, ctx.chatId);
    if (!mode || !category || !ctx.message.text) return;

    const words = ctx.message.text.split("\n").map((w) => w.trim()).filter(Boolean);
    if (mode === "add") {
      const result = await SpyWordDb.addWords(env, category, words, ctx.userId);
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.spy.wordsAdded(result.ok ? result.data : 0));
    } else {
      const result = await SpyWordDb.removeWords(env, category, words);
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.spy.wordsRemoved(result.ok ? result.data : 0));
    }
  },

  async startVote(env: Env, ctx: MessageContext): Promise<void> {
    if (!ctx.chatId || !ctx.userId) return;
    const active = await SpyGameDb.getActiveForChat(env, ctx.chatId);
    if (!active.ok || !active.data || active.data.status !== "RUNNING") return;
    if (await checkTimeExpired(env, active.data)) return;

    const target = ctx.message?.reply_to_message?.from;
    if (!target) return;

    const targetName = target.first_name;
    await TelegramApi.sendMessage(env, ctx.chatId, Messages.spy.voteStarted(targetName), {
      keyboard: [
        [
          { text: "✅ رای می‌دهم", callback_data: `spy:vote:${active.data.id}:${target.id}:yes` },
          { text: "❌ رای نمی‌دهم", callback_data: `spy:vote:${active.data.id}:${target.id}:no` },
        ],
      ],
    });
  },

  async handleCallback(env: Env, ctx: MessageContext): Promise<void> {
    const cq = ctx.callbackQuery;
    if (!cq || !cq.data || !ctx.chatId || !ctx.userId) return;
    const parts = cq.data.split(":");
    const action = parts[1];

    if (action === "word_cat") {
      const mode = parts[2] as "add" | "remove";
      const category = parts.slice(3).join(":");
      await SessionDb.start(env, ctx.userId, ctx.chatId, WORDS_SESSION_TYPE, "words", { mode, category });
      await TelegramApi.answerCallbackQuery(env, cq.id, "انتخاب شد.");
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.spy.askWordsList);
      return;
    }

    const gameId = Number(parts[2]);
    const gameResult = await SpyGameDb.getById(env, gameId);
    if (!gameResult.ok || !gameResult.data) return;
    const game = gameResult.data;
    if (game.status === "FINISHED" || game.status === "CANCELLED") {
      await TelegramApi.answerCallbackQuery(env, cq.id, Messages.spy.inactiveGameMsg, true);
      return;
    }

    if (action === "cfg_count") {
      if (ctx.userId !== game.host_id) return;
      const spyCount = Number(parts[3]);
      await SpyGameDb.update(env, game.id, { spy_count: spyCount });
      const buttons = CONFIG.SPY_CATEGORIES.map((c) => [{ text: c, callback_data: `spy:cfg_cat:${game.id}:${c}` }]);
      await TelegramApi.answerCallbackQuery(env, cq.id, "ثبت شد.");
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.spy.chooseCategory, { keyboard: buttons });
      return;
    }

    if (action === "cfg_cat") {
      if (ctx.userId !== game.host_id) return;
      const category = parts.slice(3).join(":");
      await SpyGameDb.update(env, game.id, { category });
      const buttons = CONFIG.SPY_DURATION_OPTIONS_MIN.map((m) => [
        { text: `${m} دقیقه`, callback_data: `spy:cfg_dur:${game.id}:${m}` },
      ]);
      await TelegramApi.answerCallbackQuery(env, cq.id, "ثبت شد.");
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.spy.chooseDuration, { keyboard: buttons });
      return;
    }

    if (action === "cfg_dur") {
      if (ctx.userId !== game.host_id) return;
      const minutes = Number(parts[3]);
      await SpyGameDb.update(env, game.id, { duration_seconds: minutes * 60 });
      await TelegramApi.answerCallbackQuery(env, cq.id, "شروع می‌شود...");
      await finalizeSetupAndStart(env, { ...game, spy_count: game.spy_count, duration_seconds: minutes * 60 });
      return;
    }

    if (action === "vote") {
      if (await checkTimeExpired(env, game)) return;
      const targetId = Number(parts[3]);
      const voteType = parts[4];
      if (voteType !== "yes") {
        await TelegramApi.answerCallbackQuery(env, cq.id, "ثبت شد.");
        return;
      }
      const castResult = await SpyVoteDb.castVote(env, game.id, targetId, ctx.userId);
      if (!castResult.ok) return;

      const playersResult = await SpyPlayerDb.listAll(env, game.id);
      if (!playersResult.ok) return;
      const activeCount = playersResult.data.filter((p) => p.alive === 1).length;
      const votesResult = await SpyVoteDb.countVotes(env, game.id, targetId);
      const votes = votesResult.ok ? votesResult.data : 0;
      const quorum = Math.ceil(activeCount / 2);

      await TelegramApi.answerCallbackQuery(env, cq.id, Messages.spy.voteRegistered);

      if (votes >= quorum) {
        await SpyPlayerDb.eliminate(env, game.id, targetId);
        await SpyVoteDb.clearForTarget(env, game.id, targetId);
        const targetName = await getUserName(env, targetId);
        await TelegramApi.sendMessage(env, ctx.chatId, Messages.spy.eliminated(targetName));
        await checkSpyEliminationOutcome(env, game.id, ctx.chatId);
      }
    }
  },
};

async function finalizeSetupAndStart(env: Env, game: SpyGameRecord): Promise<void> {
  const playersResult = await SpyPlayerDb.listAll(env, game.id);
  if (!playersResult.ok) return;
  const players = playersResult.data;

  const spyCount = Math.min(game.spy_count ?? 1, players.length - 1);
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  const spies = new Set(shuffled.slice(0, spyCount).map((p) => p.user_id));

  const category = game.category ?? CONFIG.SPY_CATEGORIES[0];
  const bankWord = await SpyWordDb.randomWord(env, category);
  const seedList = (CONFIG.SPY_SEED_WORDS as Record<string, readonly string[]>)[category] ?? [];
  const word = bankWord.ok && bankWord.data ? bankWord.data : seedList[Math.floor(Math.random() * seedList.length)];

  for (const p of players) {
    const role = spies.has(p.user_id) ? "SPY" : "CITIZEN";
    await SpyPlayerDb.setRole(env, game.id, p.user_id, role);

    const dmResult = await TelegramApi.sendMessage(
      env,
      p.user_id,
      role === "SPY" ? Messages.spy.roleSpy : Messages.spy.roleCitizen(word)
    );
    if (!dmResult.ok) {
      const name = await getUserName(env, p.user_id);
      await SpyGameDb.update(env, game.id, { status: "CANCELLED" });
      await TelegramApi.sendMessage(env, game.chat_id, Messages.spy.dmFailed(name));
      return;
    }
  }

  await SpyGameDb.update(env, game.id, { word, category });
  await TelegramApi.sendMessage(env, game.chat_id, Messages.spy.gameStarted);

  const refreshed = await SpyGameDb.getById(env, game.id);
  if (refreshed.ok && refreshed.data) {
    await announceStarterAndBegin(env, refreshed.data);
  }
}

async function checkSpyEliminationOutcome(env: Env, gameId: number, chatId: number): Promise<void> {
  const playersResult = await SpyPlayerDb.listAll(env, gameId);
  if (!playersResult.ok) return;
  const aliveSpies = playersResult.data.filter((p) => p.role === "SPY" && p.alive === 1);

  if (aliveSpies.length > 0) return; // بازی ادامه دارد

  const expiresAt = new Date(Date.now() + CONFIG.SPY_LAST_CHANCE_MS).toISOString();
  await SpyGameDb.update(env, gameId, { status: "LAST_CHANCE", expires_at: expiresAt });
  await TelegramApi.sendMessage(env, chatId, Messages.spy.lastChance);
}

/** بررسی حدس نهایی جاسوس‌ها در مرحله LAST CHANCE — از Router برای هر پیام متنی گروه فراخوانی می‌شود */
export async function checkSpyGuess(env: Env, ctx: MessageContext, text: string): Promise<boolean> {
  if (!ctx.chatId || !ctx.userId) return false;
  const active = await SpyGameDb.getActiveForChat(env, ctx.chatId);
  if (!active.ok || !active.data) return false;
  const game = active.data;

  if (game.status === "RUNNING") {
    await checkTimeExpired(env, game);
    return false;
  }
  if (game.status !== "LAST_CHANCE") return false;
  if (await checkLastChanceExpired(env, game)) return true;

  if (!game.word) return false;
  const normalized = text.trim();
  if (normalized !== game.word.trim()) return false;

  await SpyGameDb.update(env, game.id, { status: "FINISHED" });
  await TelegramApi.sendMessage(env, ctx.chatId, Messages.spy.spiesWinGuess);
  await rewardTeam(env, game.id, ctx.chatId, "SPY");
  return true;
}
