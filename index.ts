// =====================================================================
// تایپ‌های مشترک پروژه
// =====================================================================

/** Bindingهای Cloudflare Worker (تعریف‌شده در wrangler.toml + Secrets) */
export interface Env {
  BOT_DB: bot_data;
  BOT_KV: Davari_bot_KV;

  // Secrets — این‌ها از قبل در Cloudflare تنظیم شده‌اند، هرگز Hard-code نشوند
  BOT_TOKEN: BOT_TOKEN;
 BOT_SECRET: "8951099478:AAECnmjYZl8nRJeWO-7yXGUEuSX8dHVI8b4";
  OWNER_ID: 984542821;
}

/** نقش‌های سیستمی کاربر */
export enum Role {
  Owner = "OWNER",
  Commander = "COMMANDER",
  Serf = "SERF",
  Normal = "NORMAL",
}

/** کلیدهای Permission — هر قابلیت جدید، کلید خودش را اینجا اضافه می‌کند */
export enum PermissionKey {
  WORD_ADD = "WORD_ADD",
  WORD_CLEAR = "WORD_CLEAR",
  WORD_LIST = "WORD_LIST",
  SPOUSE_USE = "SPOUSE_USE",
  SPOUSE_CLEAR = "SPOUSE_CLEAR",
  SPOUSE_ADMIN = "SPOUSE_ADMIN",
  NICKNAME_SET = "NICKNAME_SET",
  NICKNAME_CLEAR = "NICKNAME_CLEAR",
  NICKNAME_LIST = "NICKNAME_LIST",
  MOD_BAN = "MOD_BAN",
  MOD_UNBAN = "MOD_UNBAN",
  MOD_MUTE = "MOD_MUTE",
  MOD_UNMUTE = "MOD_UNMUTE",
  TAX_USE = "TAX_USE",
  TAX_EXEMPT = "TAX_EXEMPT",
  TIP_USE = "TIP_USE",
  COURT_USE = "COURT_USE",
  COURT_PUNISH = "COURT_PUNISH",
  SPY_PLAY = "SPY_PLAY",
  SPY_MANAGE = "SPY_MANAGE",
  BLACKJACK_PLAY = "BLACKJACK_PLAY",
  POKER_PLAY = "POKER_PLAY",
}

/** انواع تراکنش کیف پول — هر قابلیت جدید نوع خودش را اضافه می‌کند */
export type TransactionType =
  | "initial"
  | "tax"
  | "tip"
  | "game_reward"
  | "court_fine"
  | "bet"
  | "win"
  | "loss"
  | "push"
  | "refund";

/** رکورد کاربر */
export interface UserRecord {
  telegram_id: number;
  first_name: string;
  username: string | null;
  created_at: string;
}

/** رکورد گروه */
export interface GroupRecord {
  chat_id: number;
  title: string;
  created_at: string;
}

/** رکورد کیف پول */
export interface WalletRecord {
  user_id: number;
  balance: number;
  created_at: string;
}

/** رکورد نقش در یک گروه */
export interface RoleRecord {
  user_id: number;
  chat_id: number;
  is_commander: 0 | 1;
  is_serf: 0 | 1;
  updated_at: string;
}

/** Session فعال چندمرحله‌ای */
export interface SessionRecord<T = Record<string, unknown>> {
  user_id: number;
  chat_id: number;
  session_type: string;
  step: string;
  data: T;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
}

/** زمینه‌ی یکپارچه‌شده‌ای که در طول کل Pipeline پردازش پیام دست‌به‌دست می‌شود */
export interface MessageContext {
  update: TelegramUpdate;
  message: TelegramMessage | null;
  callbackQuery: TelegramCallbackQuery | null;
  userId: number | null;
  chatId: number | null;
  isPrivateChat: boolean;
  role: Role;
  activeSession: SessionRecord | null;
}

// ----------------------- تایپ‌های خام Telegram -----------------------
// (فقط فیلدهایی که پروژه استفاده می‌کند؛ در صورت نیاز قابل گسترش است)

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  reply_to_message?: TelegramMessage;
  photo?: { file_id: string; file_unique_id: string }[];
  video?: { file_id: string };
  animation?: { file_id: string };
  sticker?: { file_id: string };
  document?: { file_id: string };
  voice?: { file_id: string };
  audio?: { file_id: string };
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
}

export type InlineKeyboard = InlineKeyboardButton[][];
