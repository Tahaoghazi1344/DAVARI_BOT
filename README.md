# ربات تلگرام فارسی — پارت ۱ (هسته و زیرساخت)

این نسخه فقط شامل **پارت ۱** از ۴ پارت پروژه است:
- ساختار پروژه + Config
- اتصال به Telegram Bot API (Webhook با Secret Token)
- دیتابیس D1 (کاربران، گروه‌ها، نقش‌ها، Permission، کیف پول، تراکنش‌ها، Session)
- Router مرکزی پردازش پیام
- سیستم نقش‌ها (Owner / فرمانده / رعیت) و Permission
- کیف پول و Economy Service (تغییر اتمیک و امن موجودی)

قابلیت‌های نامه اعمال، کلمات سفارشی، همسر، لقب، مدیریت، مالیات، دادگاه و
بازی‌ها در پارت‌های ۲ تا ۴ روی همین پروژه اضافه می‌شوند.

## راه‌اندازی

1. وابستگی‌ها را نصب کن:
   ```bash
   npm install
   ```

2. در `wrangler.toml` مقادیر `database_name` / `database_id` (D1) و `id` (KV) را
   با مقادیر واقعی که در Cloudflare ساخته‌ای جایگزین کن.

3. Secretها را تنظیم کن (اگر قبلاً تنظیم نشده‌اند):
   ```bash
   wrangler secret put BOT_TOKEN
   wrangler secret put BOT_SECRET
   wrangler secret put OWNER_ID
   ```

4. Migration دیتابیس را اجرا کن:
   ```bash
   npm run db:migrate:remote
   ```

5. Webhook تلگرام را با همان `BOT_SECRET` ثبت کن (یک‌بار، خارج از این پروژه):
   ```
   https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=<WORKER_URL>&secret_token=<BOT_SECRET>
   ```

6. Deploy:
   ```bash
   npm run deploy
   ```

## تست سریع پارت ۱

- در چت خصوصی یا گروه: `/start`
- برای دیدن موجودی: بنویس `موجودی`
- (فقط Owner، با ریپلای روی پیام یک عضو): بنویس `فرمانده` یا `رعیت` یا `آزاد`

## نکته مهم درباره ادامه پروژه

پارت‌های ۲ تا ۴ روی همین ساختار پوشه‌بندی (`src/database`, `src/telegram`,
`src/economy`, `src/features/...`) اضافه می‌شوند و هر پارت migration
دیتابیس مخصوص خودش را در `migrations/000X_*.sql` خواهد داشت. لطفاً این
پوشه را همان‌جایی که هست نگه دار تا پارت‌های بعدی بدون تداخل روی آن سوار شوند.
