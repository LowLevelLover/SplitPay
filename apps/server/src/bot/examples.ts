export const expenseExamples = (botUsername: string): string =>
  "*نمونه دستورها*\n\n" +
  "تقسیم مساوی (با نام افراد)\n" +
  `\`@${botUsername} @farzinvatani paid 60000 dinner @farfromhomeland @whywhy2121\`\n\n` +
  "تقسیم مساوی بین کل گروه (بدون نام ← همه اعضا)\n" +
  `\`@${botUsername} @farzinvatani paid 90000 taxi\`\n\n` +
  "تقسیم نامساوی / مبلغ دقیق (باقی‌مانده با پرداخت‌کننده)\n" +
  `\`@${botUsername} @farzinvatani paid 100000 @farfromhomeland=30000 @whywhy2121=20000\`\n\n` +
  "مبلغ دقیق بدون جمع کل (جمع = ۳۰۰۰۰+۳۰۰۰۰)\n" +
  `\`@${botUsername} @farzinvatani paid @farfromhomeland=30000 @whywhy2121=30000\`\n\n` +
  "بر اساس درصد\n" +
  `\`@${botUsername} @farzinvatani paid 120000 hotel @farfromhomeland=50% @whywhy2121=50%\`\n\n` +
  "بر اساس سهم / وزن (۲:۱:۱ از ۸۰۰۰۰)\n" +
  `\`@${botUsername} @farzinvatani paid 80000 @farfromhomeland*2 @whywhy2121*1 @farzinvatani*1\`\n\n` +
  "با تعدیل (یک نفر ۵۰۰۰ بیشتر می‌دهد، بقیه مساوی)\n" +
  `\`@${botUsername} @farzinvatani paid 60000 pizza @farfromhomeland+5000 @whywhy2121 @farzinvatani\`\n\n` +
  "بدهی مستقیم (فلانی به فلانی بدهکار است)\n" +
  `\`@${botUsername} @farfromhomeland should pay @farzinvatani 50000\`\n\n` +
  "دفترچه (یک دورهمی؛ - = مصرف، + = پرداخت — چندخطی)\n" +
  `\`\`\`\n@${botUsername}\n@farzinvatani -50000 kabab, +150000 paid\n@farfromhomeland -100000 pizza\n@whywhy2121 -30000 cola\n\`\`\`\n` +
  "ورودی فارسی + تشخیص واحد پول (تومان، ارقام فارسی)\n" +
  `\`@${botUsername} @farzinvatani ۶۰۰۰۰ تومان کباب @farfromhomeland @whywhy2121\`\n\n` +
  "ارز USDT / TON (از خود متن تشخیص داده می‌شود)\n" +
  `\`@${botUsername} @farzinvatani paid 40 usdt @farfromhomeland @whywhy2121\``;
