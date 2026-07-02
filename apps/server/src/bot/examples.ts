export const expenseExamples = (botUsername: string): string =>
  "*Example templates*\n\n" +
  "Equal split (named)\n" +
  `\`@${botUsername} @farzinvatani paid 60000 dinner @farfromhomeland @whywhy2121\`\n\n` +
  "Equal split (whole group - no names -> everyone)\n" +
  `\`@${botUsername} @farzinvatani paid 90000 taxi\`\n\n` +
  "Unequal / exact amounts (payer covers the rest)\n" +
  `\`@${botUsername} @farzinvatani paid 100000 @farfromhomeland=30000 @whywhy2121=20000\`\n\n` +
  "Exact with no total (total inferred = 30000+30000)\n" +
  `\`@${botUsername} @farzinvatani paid @farfromhomeland=30000 @whywhy2121=30000\`\n\n` +
  "By percentage\n" +
  `\`@${botUsername} @farzinvatani paid 120000 hotel @farfromhomeland=50% @whywhy2121=50%\`\n\n` +
  "By shares / weights (2:1:1 of 80000)\n" +
  `\`@${botUsername} @farzinvatani paid 80000 @farfromhomeland*2 @whywhy2121*1 @farzinvatani*1\`\n\n` +
  "By adjustment (one person pays +5000 extra, rest split equally)\n" +
  `\`@${botUsername} @farzinvatani paid 60000 pizza @farfromhomeland+5000 @whywhy2121 @farzinvatani\`\n\n` +
  "Direct debt (X owes Y)\n" +
  `\`@${botUsername} @farfromhomeland should pay @farzinvatani 50000\`\n\n` +
  "Ledger (one outing; - = consumed, + = paid - multi-line)\n" +
  `\`\`\`\n@${botUsername}\n@farzinvatani -50000 kabab, +150000 paid\n@farfromhomeland -100000 pizza\n@whywhy2121 -30000 cola\n\`\`\`\n` +
  "Persian + currency detection (Toman, Persian digits)\n" +
  `\`@${botUsername} @farzinvatani ۶۰۰۰۰ تومان کباب @farfromhomeland @whywhy2121\`\n\n` +
  "USDT / TON currency (detected from the text)\n" +
  `\`@${botUsername} @farzinvatani paid 40 usdt @farfromhomeland @whywhy2121\``;
