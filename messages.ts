// =====================================================================
// تمام رشته‌های فارسی رابط کاربری — پارت ۱.
// هر پارت بعدی، پیام‌های قابلیت‌های خودش را در فایل جداگانه در همین
// پوشه اضافه می‌کند (مثلاً court.messages.ts) تا این فایل شلوغ نشود.
// =====================================================================

export const Messages = {
  general: {
    unknownError: "⚠️ خطایی رخ داد. لطفاً دوباره تلاش کنید.",
    dbUnavailable: "❌ در حال حاضر سیستم قادر به پردازش این درخواست نیست.",
    unauthorized: "⛔️ شما اجازه انجام این کار را ندارید.",
    sessionExpired: "⏳ زمان این عملیات به پایان رسید. لطفاً دوباره شروع کنید.",
    onlyInGroup: "این قابلیت فقط داخل گروه قابل استفاده است.",
    cancelled: "❌ عملیات لغو شد.",
  },

  wallet: {
    balanceTitle: "💰 کیف پول شما",
    balanceLine: (amount: number) => `موجودی: ${amount.toLocaleString("fa-IR")} 🪙`,
  },

  roles: {
    owner: "👑 صاحب ربات",
    commander: "⚔️ فرمانده",
    serf: "⛓️ رعیت",
    normal: "👤 کاربر عادی",
    commanderCannotManageOwner: "⛔️ فرمانده نمی‌تواند صاحب ربات را مدیریت کند.",
    ownerAssignedCommander: (name: string) => `⚔️ ${name} به‌عنوان فرمانده تعیین شد.`,
    ownerAssignedSerf: (name: string) => `⛓️ ${name} در وضعیت رعیت قرار گرفت.`,
  },

  permission: {
    denied: (featureName: string) => `⛔️ قابلیت «${featureName}» برای شما فعال نیست.`,
  },

  words: {
    askTrigger: "✏️ کلمه‌ی موردنظر را بفرست (فقط متن):",
    askResponse: "📎 حالا پاسخ را بفرست — متن، عکس، گیف، استیکر، ویدیو، صدا یا فایل:",
    saved: (trigger: string) => `✅ کلمه‌ی «${trigger}» با موفقیت ذخیره شد.`,
    askTriggerToRemove: "✏️ کلمه‌ای که می‌خواهی حذف شود را بفرست:",
    removed: (trigger: string) => `🗑️ کلمه‌ی «${trigger}» حذف شد.`,
    notFound: (trigger: string) => `❌ کلمه‌ی «${trigger}» پیدا نشد.`,
    invalidResponseType: "❌ نوع پیام پشتیبانی نمی‌شود. متن، عکس، گیف، استیکر، ویدیو، صدا یا فایل بفرست.",
  },

  spouse: {
    needsReply: "❗️ برای این کار باید روی پیام فرد موردنظر ریپلای کنی.",
    startRegister: "❤️ بسیار خب! یک آیتم (متن، عکس، گیف، استیکر، ویدیو، صدا یا فایل) برای «همسر» خودت بفرست:",
    askMore: "➕ آیا آیتم دیگری هم داری؟",
    saved: "✅ آیتم ذخیره شد.",
    finished: (count: number) => `🎉 ثبت همسر تمام شد! (${count} آیتم ذخیره شد)`,
    invalidItemType: "❌ نوع پیام پشتیبانی نمی‌شود.",
    noSpouse: (name: string) => `${name} هنوز همسری ثبت نکرده است.`,
    askClearConfirm: "⚠️ آیا مطمئنی می‌خواهی همه‌ی آیتم‌های همسر خودت را پاک کنی؟",
    cleared: "🗑️ همه‌ی آیتم‌های همسر تو پاک شد.",
    cancelled: "❌ لغو شد.",
  },

  nickname: {
    needsReply: "❗️ برای این کار باید روی پیام فرد موردنظر ریپلای کنی.",
    needsText: "❗️ لطفاً متن لقب را هم بنویس. مثال: ثبت لقب جنگجو",
    set: (name: string, nick: string) => `🏷️ لقب ${name} به «${nick}» تغییر کرد.`,
    cleared: (name: string) => `🏷️ لقب ${name} حذف شد.`,
    listEmpty: "هیچ لقبی در این گروه ثبت نشده.",
    listTitle: "🏷️ فهرست القاب:",
  },

  moderation: {
    needsReply: "❗️ برای این کار باید روی پیام فرد موردنظر ریپلای کنی.",
    banned: (name: string) => `🚫 به فرمان حکومت، ${name} از این قلمرو اخراج شد.`,
    unbanned: (name: string) => `✅ حکم اخراج ${name} لغو شد؛ اجازه بازگشت دارد.`,
    muted: (name: string) => `🔇 به دستور حکومت، حق سخن‌گفتن از ${name} سلب شد.`,
    unmuted: (name: string) => `🔊 حق سخن‌گفتن به ${name} بازگردانده شد.`,
    warned: (name: string, count: number, max: number) =>
      `⚠️ به ${name} اخطار داده شد (${count} از ${max}).`,
    autoMutedAfterWarnings: (name: string) => `🔇 ${name} به‌دلیل رسیدن به سقف اخطار، ساکت شد.`,
    cannotActOnOwner: "⛔️ نمی‌توانی روی صاحب ربات اقدام مدیریتی انجام دهی.",
  },

  tax: {
    onlyOwner: "⛔️ فقط صاحب ربات می‌تواند مالیات وضع کند.",
    askConfirm: "💰 آیا می‌خواهی مالیات جدید از اهالی این قلمرو دریافت کنی؟",
    cancelled: "❌ دریافت مالیات لغو شد.",
    noSubjects: "هیچ رعیت مشمول مالیاتی در این گروه پیدا نشد.",
    subjectsListTitle: "📜 فهرست مشمولین مالیات:",
    askAmount: "💸 مبلغ مالیات موردنظر برای هرکدام را وارد کن (فقط عدد):",
    invalidAmount: "❌ مبلغ نامعتبر است. یک عدد صحیح مثبت بفرست.",
    paid: (name: string, amount: number) =>
      `✅ ${name} مبلغ ${amount.toLocaleString("fa-IR")} 🪙 مالیات را کامل پرداخت کرد.`,
    partiallyPaid: (name: string, amount: number, warnCount: number, max: number) =>
      `⚠️ موجودی ${name} کافی نبود؛ فقط ${amount.toLocaleString("fa-IR")} 🪙 کسر شد. (اخطار مالیاتی: ${warnCount} از ${max})`,
    autoBanned: (name: string) => `🚫 ${name} به‌دلیل عدم پرداخت مکرر مالیات، اخراج شد.`,
    exemptSet: (name: string) => `📜 ${name} از مالیات معاف شد.`,
    exemptRemoved: (name: string) => `📜 معافیت مالیاتی ${name} برداشته شد.`,
    summary: (total: number, count: number) =>
      `💰 مجموعاً ${total.toLocaleString("fa-IR")} 🪙 مالیات از ${count} نفر دریافت شد.`,
    alreadyProcessing: "⏳ یک عملیات مالیاتی دیگر در حال انجام است.",
  },

  tip: {
    needsReply: "❗️ برای این کار باید روی پیام فرد موردنظر ریپلای کنی.",
    invalidAmount: "❌ مبلغ نامعتبر است.",
    given: (name: string, amount: number) =>
      `🎁 مبلغ ${amount.toLocaleString("fa-IR")} 🪙 به‌عنوان انعام به ${name} داده شد.`,
  },

  deedLetter: {
    onlyOwner: "⛔️ نامه اعمال فقط در اختیار صاحب ربات است.",
    needsReply: "❗️ برای مشاهده نامه اعمال باید روی پیام فرد موردنظر ریپلای کنی.",
    title: (name: string) => `📜 نامه اعمال — ${name}`,
    line: {
      role: (role: string) => `نقش: ${role}`,
      balance: (n: number) => `موجودی: ${n.toLocaleString("fa-IR")} 🪙`,
      nickname: (n: string | null) => `لقب: ${n ?? "—"}`,
      warnings: (n: number, max: number) => `اخطار: ${n} از ${max}`,
    },
    actionDone: "✅ انجام شد.",
    appointedCommander: (name: string) => `📯 با فرمان سلطنتی، ${name} به مقام فرماندهی منصوب شد.`,
    revertedToSerf: (name: string) => `📯 با حکم حکومتی، ${name} به رعیت تنزل یافت.`,
    freed: (name: string) => `📯 ${name} از هر نقشی آزاد شد.`,
  },

  court: {
    needsReply: "❗️ برای شکایت باید روی پیام متهم ریپلای کنی.",
    alreadyActive: "⚖️ در حال حاضر یک دادگاه دیگر در این گروه فعال است.",
    notEnoughMembers: "❌ عضو کافی برای انتخاب قاضی در این گروه وجود ندارد.",
    cannotSueSelf: "❌ نمی‌توانی از خودت شکایت کنی!",
    opened: (plaintiff: string, defendant: string, judge: string) =>
      `⚖️ دادگاه تشکیل شد!\n\n👤 شاکی: ${plaintiff}\n👤 متهم: ${defendant}\n⚖️ قاضی: ${judge}\n\nقاضی محترم، برای شروع جلسه دکمه زیر را بزن.`,
    onlyJudgeCanStart: "⛔️ فقط قاضی می‌تواند جلسه را آغاز کند.",
    onlyJudgeOrPlaintiffCanCancel: "⛔️ فقط شاکی یا قاضی می‌تواند دادگاه را لغو کند.",
    cancelled: "🚫 دادگاه لغو شد.",
    sessionStarted: (first: string) => `🔨 جلسه آغاز شد!\n\n🗣️ نوبت صحبت: ${first}\nهر وقت صحبتت تمام شد، بنویس «تمام».`,
    notYourTurn: "⛔️ الان نوبت صحبت تو نیست.",
    turnSwitched: (next: string) => `🗣️ نوبت صحبت: ${next}\nهر وقت صحبتت تمام شد، بنویس «تمام».`,
    verdictPrompt: "⚖️ قاضی محترم، رأی خود را صادر کن:",
    onlyJudgeCanVote: "⛔️ فقط قاضی می‌تواند رأی صادر کند.",
    verdictAnnounced: (text: string) => `📜 رأی دادگاه:\n${text}`,
    bothInnocent: "هر دو طرف بی‌گناه اعلام شدند.",
    plaintiffGuilty: (name: string) => `${name} (شاکی) مجرم شناخته شد.`,
    defendantGuilty: (name: string) => `${name} (متهم) مجرم شناخته شد.`,
    bothGuilty: "هر دو طرف مجرم شناخته شدند.",
    punishPrompt: "⚖️ نوع مجازات را انتخاب کن:",
    askFineAmount: "💸 مبلغ جریمه نقدی را وارد کن (فقط عدد):",
    fineInvalid: "❌ مبلغ نامعتبر است.",
    fineFullyPaid: (name: string, amount: number) => `✅ ${name} مبلغ ${amount.toLocaleString("fa-IR")} 🪙 جریمه را کامل پرداخت کرد.`,
    finePartiallyPaid: (name: string, amount: number, warnCount: number, max: number) =>
      `⚠️ موجودی ${name} کافی نبود؛ فقط ${amount.toLocaleString("fa-IR")} 🪙 کسر شد. (اخطار دادگاه: ${warnCount} از ${max})`,
    fineAutoBanned: (name: string) => `🚫 ${name} به‌دلیل ناتوانی مکرر در پرداخت جریمه، اخراج شد.`,
    finished: "⚖️ دادگاه پایان یافت.",
    inactiveGame: "⚠️ این دادگاه دیگر فعال نیست.",
  },

  spy: {
    lobbyCreated: (host: string) => `🕵️ لابی بازی جاسوس توسط ${host} ساخته شد!\nبرای ورود بنویس «ورود به بازی».`,
    alreadyActive: "🕵️ یک بازی جاسوس دیگر در این گروه در حال اجراست.",
    joined: (name: string, count: number) => `✅ ${name} وارد بازی شد. (${count} نفر)`,
    alreadyJoined: "❗️ تو قبلاً وارد بازی شده‌ای.",
    notEnoughPlayers: (min: number) => `❌ حداقل ${min} بازیکن برای شروع لازم است.`,
    onlyHostCanStart: "⛔️ فقط برگزارکننده می‌تواند بازی را شروع کند.",
    chooseSpyCount: "🎯 تعداد جاسوس‌ها را انتخاب کن:",
    chooseCategory: "🗂️ موضوع بازی را انتخاب کن:",
    chooseDuration: "⏱️ زمان بازی را انتخاب کن:",
    dmFailed: (name: string) => `❌ نتوانستم برای ${name} پیام خصوصی بفرستم. باید اول ربات را در پیوی استارت کند.`,
    gameStarted: "🎬 بازی شروع شد! نقش‌ها به‌صورت خصوصی ارسال شد.",
    starterAnnounce: (name: string) => `🎲 قرعه مشخص شد.\n👤 ${name} باید بازی را آغاز کند.\nروی پیام یکی از بازیکنان Reply کن و سؤال بپرس.`,
    roleSpy: "🕵️ شما جاسوس هستید.\n\nکلمه بازی برای شما نمایش داده نمی‌شود. وظیفه شما این است که بدون لو رفتن، کلمه را کشف کنید.",
    roleCitizen: (word: string) => `🎯 کلمه بازی:\n${word}\n\nنقش شما:\n👤 شهروند`,
    voteStarted: (target: string) => `🗳️ رأی‌گیری برای حذف\n\nهدف:\n👤 ${target}\n\nآیا با حذف این بازیکن موافقید؟`,
    voteRegistered: "✅ رأی تو ثبت شد.",
    voteAlreadyCast: "❗️ قبلاً رأی داده‌ای.",
    eliminated: (name: string) => `❌ ${name} از بازی حذف شد.`,
    lastChance: "🕵️ آخرین فرصت!\nجاسوس‌ها حذف شده‌اند اما هنوز شکست نخورده‌اند.\nیک دقیقه فرصت دارید کلمه اصلی بازی را حدس بزنید.\nکلمه را در گروه ارسال کنید.",
    spiesWinGuess: "🎉 جاسوس‌ها برنده شدند!",
    citizensWinTimeout: "⏰ زمان به پایان رسید.\n🛡️ شهروندان پیروز شدند!",
    citizensWinWrongGuess: "❌ حدس اشتباه بود.\n🛡️ شهروندان پیروز شدند!",
    rewardGiven: (n: number) => `💰 هرکدام ${n.toLocaleString("fa-IR")} 🪙 جایزه گرفتند.`,
    askWordsCategory: "🗂️ ابتدا موضوع را انتخاب کن:",
    askWordsList: "✏️ کلمات را ارسال کن (هر کلمه در یک خط):",
    wordsAdded: (n: number) => `✅ ${n} کلمه اضافه شد.`,
    wordsRemoved: (n: number) => `🗑️ ${n} کلمه حذف شد.`,
    inactiveGameMsg: "⚠️ این بازی دیگر فعال نیست.",
  },

  blackjack: {
    askBet: (balance: number) => `🃏 چند سکه شرط می‌بندی؟ (موجودی: ${balance.toLocaleString("fa-IR")} 🪙)`,
    invalidBet: "❌ مبلغ نامعتبر است یا بیشتر از موجودی توست.",
    handTitle: (bet: number) => `🃏 Blackjack — شرط: ${bet.toLocaleString("fa-IR")} 🪙`,
    yourHand: (cards: string, value: number) => `دست شما: ${cards} (${value})`,
    dealerShows: (card: string) => `دست دیلر: ${card} 🂠`,
    dealerHand: (cards: string, value: number) => `دست دیلر: ${cards} (${value})`,
    naturalBlackjack: "🎉 Blackjack طبیعی! شما بردید.",
    bust: "💥 دستت از ۲۱ رد شد. باختی.",
    dealerBust: "💥 دیلر باخت! تو بردی.",
    youWin: "🎉 تو بردی!",
    youLose: "😢 باختی.",
    push: "🤝 مساوی شد؛ شرط برگشت.",
    payout: (n: number) => `💰 ${n.toLocaleString("fa-IR")} 🪙 به حساب شما اضافه شد.`,
  },

  poker: {
    lobbyOpened: (host: string, buyIn: number) =>
      `♠️ لابی پوکر توسط ${host} باز شد!\nBuy-in: ${buyIn.toLocaleString("fa-IR")} 🪙\nبرای ورود بنویس «ورود به پوکر».`,
    joined: (name: string, count: number) => `✅ ${name} وارد میز شد. (${count} نفر)`,
    notEnoughBalance: "❌ موجودی تو برای ورود به این میز کافی نیست.",
    notEnoughPlayers: "❌ حداقل ۲ بازیکن لازم است.",
    onlyHostCanStart: "⛔️ فقط برگزارکننده می‌تواند بازی را شروع کند.",
    started: "🎬 بازی شروع شد! کارت‌ها به‌صورت خصوصی ارسال شد.",
    yourCards: (cards: string) => `🂠 کارت‌های شما: ${cards}`,
    turnPrompt: (name: string, toCall: number) =>
      `🎯 نوبت ${name}\nبرای Call: ${toCall.toLocaleString("fa-IR")} 🪙`,
    notYourTurn: "⛔️ نوبت تو نیست.",
    folded: (name: string) => `🚫 ${name} فولد کرد.`,
    called: (name: string, amount: number) => `✅ ${name} کال کرد (${amount.toLocaleString("fa-IR")} 🪙).`,
    checked: (name: string) => `✅ ${name} چک کرد.`,
    raised: (name: string, amount: number) => `📈 ${name} رِیز کرد به ${amount.toLocaleString("fa-IR")} 🪙.`,
    allIn: (name: string) => `🔥 ${name} آل‌این کرد!`,
    communityCards: (stage: string, cards: string) => `🃏 ${stage}: ${cards}`,
    showdown: "🏁 Showdown!",
    winner: (name: string, hand: string, amount: number) =>
      `🏆 ${name} با دست ${hand} برنده شد و ${amount.toLocaleString("fa-IR")} 🪙 برد!`,
  },
} as const;
