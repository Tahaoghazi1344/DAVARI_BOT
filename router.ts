import type { Env, MessageContext, TelegramUpdate } from "../types";
import { Role } from "../types";
import { UserDb } from "../database/users";
import { GroupDb } from "../database/groups";
import { RoleDb } from "../database/roles";
import { SessionDb } from "../database/sessions";
import { EconomyService } from "../economy/economy";
import { PermissionService, resolveRole } from "./permissions";
import { TelegramApi } from "./api";
import { Messages } from "./messages";
import { requirePermission } from "./router_helpers";
import { WordsFeature } from "../features/words/words";
import { SpouseFeature } from "../features/spouse/spouse";
import { NicknameFeature } from "../features/nickname/nickname";
import { ModerationFeature } from "../features/moderation/moderation";
import { TaxFeature } from "../features/tax/tax";
import { TipFeature } from "../features/tip/tip";
import { DeedLetterFeature } from "../menus/deedLetter";
import { CourtFeature } from "../features/court/court";
import { SpyFeature } from "../features/spy/spy";
import { BlackjackFeature } from "../features/blackjack/blackjack";
import { PokerFeature } from "../features/poker/poker";
import { GamesMenu } from "../menus/gamesMenu";
import { checkSpyGuess } from "../features/spy/spy";

// =====================================================================
// Router — نقطه‌ی ورود منطقی تمام Updateهای تلگرام.
// ترتیب پایپ‌لاین (نباید جابه‌جا شود):
//   ۱) استخراج پیام/Callback از Update خام
//   ۲) Resolve کاربر (Upsert در دیتابیس + ساخت کیف پول اولیه)
//   ۳) Resolve گروه (در صورت گروهی بودن چت)
//   ۴) تعیین نقش (Owner/Commander/Serf/Normal)
//   ۵) خواندن Session فعال کاربر (در صورت وجود)
//   ۶) Dispatch به هندلر مناسب (ادامه‌ی Session، یا Command جدید)
// =====================================================================

async function buildContext(env: Env, update: TelegramUpdate): Promise<MessageContext | null> {
  const message = update.message ?? null;
  const callbackQuery = update.callback_query ?? null;

  const from = message?.from ?? callbackQuery?.from ?? null;
  const chat = message?.chat ?? callbackQuery?.message?.chat ?? null;

  if (!from || !chat) return null;

  const userResult = await UserDb.upsert(env, from.id, from.first_name, from.username ?? null);
  if (!userResult.ok) return null;
  await EconomyService.ensureInitialWallet(env, from.id);

  const isPrivateChat = chat.type === "private";

  if (!isPrivateChat) {
    await GroupDb.upsert(env, chat.id, chat.title ?? "بدون‌نام");
    await UserDb.linkToGroup(env, from.id, chat.id);
  }

  const role = isPrivateChat ? Role.Normal : await resolveRole(env, from.id, chat.id);

  const sessionResult = await SessionDb.get(env, from.id, chat.id);
  const activeSession = sessionResult.ok ? sessionResult.data : null;

  return { update, message, callbackQuery, userId: from.id, chatId: chat.id, isPrivateChat, role, activeSession };
}

export { requirePermission };

// ----------------------- هندلرهای پایه -----------------------

async function handleStart(env: Env, ctx: MessageContext): Promise<void> {
  if (!ctx.chatId) return;
  await TelegramApi.sendMessage(
    env,
    ctx.chatId,
    "🤖 ربات با موفقیت راه‌اندازی شد.\n\nبرای مشاهده موجودی کیف‌پول، بنویس: «موجودی»"
  );
}

async function handleWalletBalance(env: Env, ctx: MessageContext): Promise<void> {
  if (!ctx.chatId || !ctx.userId) return;
  const balance = await EconomyService.getBalance(env, ctx.userId);
  if (balance === null) {
    await TelegramApi.sendMessage(env, ctx.chatId, Messages.general.dbUnavailable);
    return;
  }
  await TelegramApi.sendMessage(env, ctx.chatId, `${Messages.wallet.balanceTitle}\n${Messages.wallet.balanceLine(balance)}`);
}

async function handleRoleAssignment(env: Env, ctx: MessageContext, word: string): Promise<void> {
  if (!ctx.chatId || !ctx.userId || ctx.isPrivateChat) return;
  if (!ctx.message?.reply_to_message?.from) {
    await TelegramApi.sendMessage(env, ctx.chatId, "❗️ برای این کار باید روی پیام فرد موردنظر ریپلای کنی.");
    return;
  }

  const targetId = ctx.message.reply_to_message.from.id;
  const targetName = ctx.message.reply_to_message.from.first_name;
  const targetRole = await resolveRole(env, targetId, ctx.chatId);

  if (!PermissionService.canActOn(ctx.role, targetRole)) {
    await TelegramApi.sendMessage(env, ctx.chatId, Messages.roles.commanderCannotManageOwner);
    return;
  }
  if (ctx.role !== Role.Owner && ctx.role !== Role.Commander) {
    await TelegramApi.sendMessage(env, ctx.chatId, Messages.general.unauthorized);
    return;
  }

  if (word === "فرمانده") {
    if (ctx.role !== Role.Owner) {
      await TelegramApi.sendMessage(env, ctx.chatId, Messages.general.unauthorized);
      return;
    }
    await RoleDb.setCommander(env, targetId, ctx.chatId);
    await TelegramApi.sendMessage(env, ctx.chatId, Messages.roles.ownerAssignedCommander(targetName));
  } else if (word === "رعیت") {
    await RoleDb.setSerf(env, targetId, ctx.chatId);
    await TelegramApi.sendMessage(env, ctx.chatId, Messages.roles.ownerAssignedSerf(targetName));
  } else if (word === "آزاد") {
    await RoleDb.clearRole(env, targetId, ctx.chatId);
    await TelegramApi.sendMessage(env, ctx.chatId, `🔓 ${targetName} از نقش فعلی آزاد شد.`);
  }
}

const TIP_PLUS_REGEX = /^(\d+)\s*\+$/;
const TIP_PHRASE_REGEX = /^(\d+)\s*سکه\s*به\s*تو\s*انعام\s*می‌?دهم$/;

// ----------------------- Dispatch اصلی -----------------------

export async function handleUpdate(env: Env, update: TelegramUpdate): Promise<void> {
  const ctx = await buildContext(env, update);
  if (!ctx) return;

  if (ctx.callbackQuery) {
    const data = ctx.callbackQuery.data ?? "";
    if (data.startsWith("court:")) {
      await CourtFeature.handleCallback(env, ctx);
    } else if (data.startsWith("spy:")) {
      await SpyFeature.handleCallback(env, ctx);
    } else if (data.startsWith("bj:")) {
      await BlackjackFeature.handleCallback(env, ctx);
    } else if (data.startsWith("poker:")) {
      await PokerFeature.handleCallback(env, ctx);
    } else if (data.startsWith("games:")) {
      await GamesMenu.handleCallback(env, ctx);
    } else {
      await DeedLetterFeature.handleCallback(env, ctx);
    }
    return;
  }

  if (!ctx.message) return;

  // ------------------------------------------------------------------
  // مسیریابی Session فعال — هر قابلیت Session خودش را تشخیص می‌دهد
  // ------------------------------------------------------------------
  if (ctx.activeSession) {
    if (WordsFeature.isOwnSession(ctx)) return void (await WordsFeature.continueSession(env, ctx));
    if (SpouseFeature.isOwnSession(ctx)) return void (await SpouseFeature.continueSession(env, ctx));
    if (TaxFeature.isOwnSession(ctx)) return void (await TaxFeature.continueSession(env, ctx));
    if (CourtFeature.isOwnSession(ctx)) return void (await CourtFeature.continueSession(env, ctx));
    if (SpyFeature.isOwnSession(ctx)) return void (await SpyFeature.continueSession(env, ctx));
  }

  const text = ctx.message.text?.trim();
  if (!text) return;

  if (text === "/start") return void (await handleStart(env, ctx));
  if (text === "موجودی" || text === "کیف پول" || text === "/wallet") return void (await handleWalletBalance(env, ctx));
  if (["فرمانده", "رعیت", "آزاد"].includes(text)) return void (await handleRoleAssignment(env, ctx, text));

  // -------------------- کلمات سفارشی --------------------
  if (text === "افزودن کلمه") return void (await WordsFeature.startAdd(env, ctx));
  if (text === "حذف کلمه") return void (await WordsFeature.startRemove(env, ctx));
  if (text === "لیست کلمات") return void (await WordsFeature.list(env, ctx));

  // -------------------- همسر --------------------
  if (text === "ثبت همسر من") return void (await SpouseFeature.startRegisterSelf(env, ctx));
  if (text === "ثبت همسر") return void (await SpouseFeature.startRegisterForTarget(env, ctx));
  if (text === "همسر من" || text === "همسر") return void (await SpouseFeature.show(env, ctx));
  if (text === "پاکسازی همسر") return void (await SpouseFeature.startClear(env, ctx));

  // -------------------- لقب --------------------
  if (text.startsWith("ثبت لقب ")) return void (await NicknameFeature.set(env, ctx, text.slice("ثبت لقب ".length).trim()));
  if (text === "پاکسازی لقب") return void (await NicknameFeature.clear(env, ctx));
  if (text === "لیست القاب") return void (await NicknameFeature.list(env, ctx));

  // -------------------- مدیریت --------------------
  if (text === "بن") return void (await ModerationFeature.ban(env, ctx));
  if (text === "رفع بن") return void (await ModerationFeature.unban(env, ctx));
  if (text === "سکوت") return void (await ModerationFeature.mute(env, ctx));
  if (text === "رفع سکوت") return void (await ModerationFeature.unmute(env, ctx));
  if (text === "اخطار") return void (await ModerationFeature.warn(env, ctx));

  // -------------------- مالیات --------------------
  if (text === "مالیات") return void (await TaxFeature.startBroadcast(env, ctx));
  if (text === "معافیت مالیاتی") return void (await TaxFeature.setExempt(env, ctx, true));
  if (text === "لغو معافیت مالیاتی") return void (await TaxFeature.setExempt(env, ctx, false));

  // -------------------- انعام (دو الگوی مجاز) --------------------
  const tipPlus = text.match(TIP_PLUS_REGEX);
  if (tipPlus) return void (await TipFeature.give(env, ctx, Number(tipPlus[1])));
  const tipPhrase = text.match(TIP_PHRASE_REGEX);
  if (tipPhrase) return void (await TipFeature.give(env, ctx, Number(tipPhrase[1])));

  // -------------------- نامه اعمال --------------------
  if (text === "نامه اعمال") return void (await DeedLetterFeature.open(env, ctx));

  // -------------------- دادگاه --------------------
  if (text === "دادگاه") return void (await CourtFeature.start(env, ctx));
  if (text === "لغو دادگاه") return void (await CourtFeature.cancel(env, ctx));
  if (text === "تمام") return void (await CourtFeature.finishSpeaking(env, ctx));

  // -------------------- بازی‌ها --------------------
  if (text === "بازی‌ها" || text === "بازی ها" || text === "منوی بازی‌ها") return void (await GamesMenu.open(env, ctx));
  if (text === "جاسوس") return void (await SpyFeature.createLobby(env, ctx));
  if (text === "ورود به بازی") return void (await SpyFeature.join(env, ctx));
  if (text === "شروع بازی") return void (await SpyFeature.hostStart(env, ctx));
  if (text === "افزودن کلمه جاسوس") return void (await SpyFeature.startAddWords(env, ctx));
  if (text === "حذف کلمه جاسوس") return void (await SpyFeature.startRemoveWords(env, ctx));
  if (ctx.message.reply_to_message && text === "رای گیری") return void (await SpyFeature.startVote(env, ctx));
  if (text === "بلک جک" || text === "بلک‌جک") return void (await BlackjackFeature.start(env, ctx));
  if (text === "پوکر") return void (await PokerFeature.openLobby(env, ctx));

  // -------------------- حدس کلمه در مرحله LAST CHANCE بازی جاسوس --------------------
  if (!ctx.isPrivateChat) {
    const handledAsSpyGuess = await checkSpyGuess(env, ctx, text);
    if (handledAsSpyGuess) return;
  }

  // ------------------------------------------------------------------
  // در نهایت، بررسی کلمه محرک سفارشی (کمترین اولویت)
  // ------------------------------------------------------------------
  await WordsFeature.tryRespond(env, ctx, text);
}
