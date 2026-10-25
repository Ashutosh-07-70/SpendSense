export const CATEGORIES = ["Housing", "Food & drink", "Transport", "Shopping", "Health", "Entertainment", "Other"] as const;
export type Category = (typeof CATEGORIES)[number] | "Income";
export type ExpenseCategory = (typeof CATEGORIES)[number];
export type MoneyCents = number;
export type Transaction = { id: string; name: string; category: Category; date: string; amountCents: MoneyCents; type: "income" | "expense"; note?: string; paymentMethod?: string };
export type Budget = { id: string; category: ExpenseCategory; limitCents: MoneyCents };
export type PeriodKey = "this-month" | "last-month" | "last-3-months" | "this-year" | "all-time";
export type DateRange = { key: PeriodKey; start: string | null; end: string | null; label: string };

/** Supported per-transaction and per-budget ceiling: INR 10,000,000.00. */
export const MAX_AMOUNT_CENTS = 1_000_000_000;
export const MAX_TEXT_LENGTH = 120;
export const MAX_NOTE_LENGTH = 240;
export const MAX_PAYMENT_METHOD_LENGTH = 48;
export const MAX_RECORDS = 20_000;
export const CURRENCY = "INR";

export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "this-month", label: "This Month" }, { key: "last-month", label: "Last Month" },
  { key: "last-3-months", label: "Last 3 Months" }, { key: "this-year", label: "This Year" }, { key: "all-time", label: "All Time" },
];

export const CATEGORY_META: Record<Category, { color: string; icon: string; budgetCents?: number }> = {
  Housing: { color: "#b79cff", icon: "⌂", budgetCents: 3_500_000 },
  "Food & drink": { color: "#c5f36c", icon: "◉", budgetCents: 1_500_000 },
  Transport: { color: "#7cc9ff", icon: "↗", budgetCents: 600_000 },
  Shopping: { color: "#ff9f84", icon: "◇", budgetCents: 1_000_000 },
  Health: { color: "#f28ed3", icon: "+", budgetCents: 400_000 },
  Entertainment: { color: "#ffc76e", icon: "✳", budgetCents: 300_000 },
  Income: { color: "#c5f36c", icon: "↙" },
  Other: { color: "#9ba3a0", icon: "•", budgetCents: 500_000 },
};

export function localDateString(date = new Date()) {
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function localDate(year: number, month: number, day: number) {
  const result = new Date(0);
  result.setHours(12, 0, 0, 0);
  result.setFullYear(year, month, day);
  return localDateString(result);
}

export function getDateRange(key: PeriodKey, referenceDate = new Date()): DateRange {
  const year = referenceDate.getFullYear(); const month = referenceDate.getMonth(); const today = localDateString(referenceDate);
  if (key === "all-time") return { key, start: null, end: today, label: "All Time" };
  if (key === "this-month") return { key, start: localDate(year, month, 1), end: today, label: referenceDate.toLocaleDateString("en-IN", { month: "long", year: "numeric" }) };
  if (key === "last-month") {
    const start = localDate(year, month - 1, 1); const end = localDate(year, month, 0);
    return { key, start, end, label: new Date(year, month - 1, 1, 12).toLocaleDateString("en-IN", { month: "long", year: "numeric" }) };
  }
  if (key === "last-3-months") return { key, start: localDate(year, month - 2, 1), end: today, label: "Last 3 Months" };
  return { key, start: localDate(year, 0, 1), end: today, label: String(year) };
}

export function isValidCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setHours(12, 0, 0, 0);
  date.setFullYear(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function isPostedDate(value: string, referenceDate = new Date()) {
  return isValidCalendarDate(value) && value <= localDateString(referenceDate);
}

export function getPostedDateError(value: string, referenceDate = new Date()) {
  if (!isValidCalendarDate(value)) return "Enter a valid calendar date.";
  if (!isPostedDate(value, referenceDate)) return `Posted transactions cannot be dated after ${localDateString(referenceDate)}.`;
  return null;
}

export function isInDateRange(date: string, range: DateRange, referenceDate = new Date()) {
  return isPostedDate(date, referenceDate) && (!range.start || date >= range.start) && (!range.end || date <= range.end);
}

export function getBudgetMonth(key: PeriodKey, referenceDate = new Date()) {
  if (key === "last-month") return localDate(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1).slice(0, 7);
  return localDateString(referenceDate).slice(0, 7);
}

export function dateForMonthDay(day: number, referenceDate = new Date()) {
  const lastDay = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0).getDate();
  return localDate(referenceDate.getFullYear(), referenceDate.getMonth(), Math.min(Math.max(1, day), lastDay, referenceDate.getDate()));
}

/** Parse an INR major-unit string once into integer paise. Exponent notation and >2 decimals are rejected. */
export function parseMoneyToCents(input: string | number): MoneyCents | null {
  if (typeof input === "number" && !Number.isFinite(input)) return null;
  const value = String(input).trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  const cents = BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0") || "0");
  if (cents <= BigInt(0) || cents > BigInt(MAX_AMOUNT_CENTS)) return null;
  return Number(cents);
}

/** Format integer cents at the UI boundary. Invalid values never produce NaN or Infinity text. */
export function formatMoney(cents: number, currency = CURRENCY) {
  if (!Number.isSafeInteger(cents)) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

export function centsToInput(cents: number) {
  if (!Number.isSafeInteger(cents) || cents < 0) return "";
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

export function formatMajorMoney(majorUnits: number, currency = CURRENCY) {
  if (!Number.isFinite(majorUnits)) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(majorUnits);
}

const demoDays = [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
const demoRows: [string, Category, number, Transaction["type"]][] = [
  ["Monthly salary", "Income", 85000, "income"], ["Apartment rent", "Housing", 24000, "expense"], ["BigBasket groceries", "Food & drink", 2150, "expense"],
  ["Metro card recharge", "Transport", 1250, "expense"], ["Coffee shop", "Food & drink", 280, "expense"], ["Freelance · Studio North", "Income", 12000, "income"],
  ["Clothing", "Shopping", 3400, "expense"], ["Lunch with colleagues", "Food & drink", 850, "expense"], ["Gym membership", "Health", 1600, "expense"],
  ["Auto · Home", "Transport", 320, "expense"], ["Spotify Premium", "Entertainment", 119, "expense"], ["Electronics store", "Shopping", 2490, "expense"],
  ["Dinner out", "Food & drink", 1800, "expense"], ["Electricity bill", "Housing", 2100, "expense"], ["Streaming subscription", "Entertainment", 499, "expense"],
  ["Local grocery shop", "Food & drink", 930, "expense"], ["Cab · Airport", "Transport", 1200, "expense"], ["Pharmacy", "Health", 480, "expense"],
  ["Dinner with Maya", "Food & drink", 1400, "expense"], ["Museum tickets", "Entertainment", 650, "expense"], ["Corner store", "Other", 320, "expense"],
  ["Instamart", "Food & drink", 860, "expense"], ["Contract income", "Income", 9000, "income"], ["Weekend brunch", "Food & drink", 1100, "expense"],
];

export function makeDemoTransactions(referenceDate = new Date()): Transaction[] {
  return demoRows.map(([name, category, amount, type], index) => ({
    id: `demo-${index + 1}`, name, category, date: dateForMonthDay(demoDays[index], referenceDate),
    amountCents: parseMoneyToCents(amount)!, type,
  }));
}
export const DEMO_TRANSACTIONS = makeDemoTransactions();
export const DEMO_BUDGETS: Budget[] = CATEGORIES.filter((category) => CATEGORY_META[category].budgetCents !== undefined).map((category) => ({
  id: `budget-${category.toLowerCase().replaceAll(" ", "-")}`, category, limitCents: CATEGORY_META[category].budgetCents!,
}));

export type ValidationIssue = { source: string; index?: number; reason: string; record?: unknown };
export type ValidationResult<T> = { records: T[]; issues: ValidationIssue[]; valid: boolean };

function normalizedId(value: unknown) { return typeof value === "string" && value.trim().length > 0 && value.length <= 128 ? value.trim() : null; }
function normalizedText(value: unknown, maxLength = MAX_TEXT_LENGTH) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength ? value.trim() : null;
}

export function validateTransactions(value: unknown, referenceDate = new Date(), unit: "cents" | "major" = "cents", source = "transactions"): ValidationResult<Transaction> {
  const records: Transaction[] = []; const issues: ValidationIssue[] = [];
  if (!Array.isArray(value)) return { records, issues: [{ source, reason: "Expected a transaction array.", record: value }], valid: false };
  if (value.length > MAX_RECORDS) issues.push({ source, reason: `Transaction count exceeds the supported ${MAX_RECORDS} records.`, record: value.slice(MAX_RECORDS) });
  const ids = new Set<string>();
  value.slice(0, MAX_RECORDS).forEach((item, index) => {
    const reject = (reason: string) => issues.push({ source, index, reason, record: item });
    if (!item || typeof item !== "object" || Array.isArray(item)) return reject("Record must be an object.");
    const row = item as Record<string, unknown>;
    const id = normalizedId(row.id); const name = normalizedText(row.name);
    if (!id || !name) return reject("A non-empty ID and name (up to 120 characters) are required.");
    if (ids.has(id)) return reject("Duplicate transaction ID.");
    if (row.type !== "income" && row.type !== "expense") return reject("Type must be income or expense.");
    if (row.type === "income" ? row.category !== "Income" : !CATEGORIES.includes(row.category as ExpenseCategory)) return reject("Category does not match the transaction type.");
    if (typeof row.date !== "string" || !isValidCalendarDate(row.date)) return reject("Date is not a valid local calendar date.");
    if (!isPostedDate(row.date, referenceDate)) return reject(`Future-dated record is not posted; latest allowed date is ${localDateString(referenceDate)}.`);
    if (row.note !== undefined && (typeof row.note !== "string" || row.note.length > MAX_NOTE_LENGTH)) return reject(`Optional note must be text of at most ${MAX_NOTE_LENGTH} characters.`);
    if (row.paymentMethod !== undefined && (typeof row.paymentMethod !== "string" || row.paymentMethod.trim().length > MAX_PAYMENT_METHOD_LENGTH)) return reject(`Payment method must be text of at most ${MAX_PAYMENT_METHOD_LENGTH} characters.`);
    const amountCents = unit === "cents" ? row.amountCents : parseMoneyToCents(row.amount as number);
    if (typeof amountCents !== "number" || !Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > MAX_AMOUNT_CENTS) return reject("Amount must be positive, at most two decimal places, and no more than INR 10,000,000.00.");
    ids.add(id);
    records.push({ id, name, category: row.category as Category, date: row.date, amountCents, type: row.type, ...(typeof row.note === "string" && row.note.trim() ? { note: row.note.trim() } : {}), ...(typeof row.paymentMethod === "string" && row.paymentMethod.trim() ? { paymentMethod: row.paymentMethod.trim() } : {}) });
  });
  return { records, issues, valid: issues.length === 0 };
}

export function validateBudgets(value: unknown, unit: "cents" | "major" = "cents", source = "budgets"): ValidationResult<Budget> {
  const records: Budget[] = []; const issues: ValidationIssue[] = [];
  if (!Array.isArray(value)) return { records, issues: [{ source, reason: "Expected a budget array.", record: value }], valid: false };
  if (value.length > CATEGORIES.length) issues.push({ source, reason: "Budget count exceeds the number of spending categories.", record: value.slice(CATEGORIES.length) });
  const ids = new Set<string>(); const categories = new Set<ExpenseCategory>();
  value.forEach((item, index) => {
    const reject = (reason: string) => issues.push({ source, index, reason, record: item });
    if (!item || typeof item !== "object" || Array.isArray(item)) return reject("Record must be an object.");
    const row = item as Record<string, unknown>;
    const id = normalizedId(row.id);
    if (!id || !CATEGORIES.includes(row.category as ExpenseCategory)) return reject("A valid ID and spending category are required.");
    if (ids.has(id) || categories.has(row.category as ExpenseCategory)) return reject("Budget IDs and categories must be unique.");
    const limitCents = unit === "cents" ? row.limitCents : parseMoneyToCents(row.amount as number);
    if (typeof limitCents !== "number" || !Number.isSafeInteger(limitCents) || limitCents <= 0 || limitCents > MAX_AMOUNT_CENTS) return reject("Budget must be positive, at most two decimal places, and no more than INR 10,000,000.00.");
    ids.add(id); categories.add(row.category as ExpenseCategory);
    records.push({ id, category: row.category as ExpenseCategory, limitCents });
  });
  return { records, issues, valid: issues.length === 0 };
}

function sumCents(values: number[]) { return values.reduce((sum, value) => sum + value, 0); }
export function sumMoneyCents(values: number[]) { return sumCents(values); }

export function summarize(transactions: Transaction[], referenceDate = new Date()) {
  const posted = transactions.filter((transaction) => isPostedDate(transaction.date, referenceDate));
  const incomeCents = sumCents(posted.filter((transaction) => transaction.type === "income").map((transaction) => transaction.amountCents));
  const expenseCents = sumCents(posted.filter((transaction) => transaction.type === "expense").map((transaction) => transaction.amountCents));
  const balanceCents = incomeCents - expenseCents;
  const savingsRate = incomeCents > 0 ? (balanceCents / incomeCents) * 100 : null;
  return { incomeCents, expenseCents, balanceCents, savingsRate: savingsRate !== null && Number.isFinite(savingsRate) ? savingsRate : null };
}

export function categoryTotals(transactions: Transaction[], referenceDate = new Date()) {
  return CATEGORIES.map((category) => ({
    category,
    amountCents: sumCents(transactions.filter((transaction) => isPostedDate(transaction.date, referenceDate) && transaction.type === "expense" && transaction.category === category).map((transaction) => transaction.amountCents)),
    color: CATEGORY_META[category].color,
  })).filter((item) => item.amountCents > 0);
}

export type ChartPoint = { label: string; incomeCents: number; expenseCents: number; savingsCents: number };
export function buildChartSeries(transactions: Transaction[], range: DateRange, referenceDate = new Date()): ChartPoint[] {
  const posted = transactions.filter((transaction) => isInDateRange(transaction.date, range, referenceDate));
  if (posted.length === 0) return [];
  const dates = posted.map((transaction) => transaction.date).sort();
  const start = range.start ?? `${dates[0].slice(0, 7)}-01`;
  const end = range.end ?? dates[dates.length - 1];
  const daily = range.key === "this-month" || range.key === "last-month";
  const buckets = new Map<string, { label: string; incomeCents: number; expenseCents: number }>();
  if (daily) {
    const startDate = new Date(`${start}T12:00:00`); const endDate = new Date(`${end}T12:00:00`);
    for (const cursor = new Date(startDate); cursor <= endDate; cursor.setDate(cursor.getDate() + 1)) {
      const key = localDateString(cursor);
      buckets.set(key, { label: String(cursor.getDate()), incomeCents: 0, expenseCents: 0 });
    }
  } else {
    const cursor = new Date(`${start.slice(0, 7)}-01T12:00:00`);
    const last = new Date(`${end.slice(0, 7)}-01T12:00:00`);
    while (cursor <= last) {
      const key = localDateString(cursor).slice(0, 7);
      buckets.set(key, { label: cursor.toLocaleDateString("en-IN", { month: "short", year: range.key === "all-time" ? "2-digit" : undefined }), incomeCents: 0, expenseCents: 0 });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }
  for (const transaction of posted) {
    const bucket = buckets.get(daily ? transaction.date : transaction.date.slice(0, 7));
    if (!bucket) continue;
    if (transaction.type === "income") bucket.incomeCents += transaction.amountCents;
    else bucket.expenseCents += transaction.amountCents;
  }
  return [...buckets.values()].map((point) => ({ ...point, savingsCents: point.incomeCents - point.expenseCents }));
}

export type Insight = { icon: string; title: string; detail: string; tone: string };
export function makeInsights(transactions: Transaction[], budgets: Budget[], budgetMonthTransactions: Transaction[], periodLabel: string, referenceDate = new Date()): Insight[] {
  const postedTransactions = transactions.filter((transaction) => isPostedDate(transaction.date, referenceDate));
  if (postedTransactions.length === 0) return [{ icon: "◌", title: "No activity in this period", detail: "Choose another range or add a transaction to see a useful summary.", tone: "#9ba3a0" }];
  const totals = summarize(postedTransactions, referenceDate); const categories = categoryTotals(postedTransactions, referenceDate);
  const top = [...categories].sort((a, b) => b.amountCents - a.amountCents)[0];
  const insights: Insight[] = [];
  if (top && totals.expenseCents > 0) insights.push({ icon: CATEGORY_META[top.category].icon, title: `${top.category} is your largest expense`, detail: `${formatMoney(top.amountCents)} of ${formatMoney(totals.expenseCents)} spent in ${periodLabel.toLowerCase()}.`, tone: CATEGORY_META[top.category].color });
  if (totals.savingsRate !== null) insights.push({ icon: "↗", title: `${totals.savingsRate >= 20 ? "Good savings pace" : "Savings opportunity"} · ${Math.round(totals.savingsRate)}%`, detail: totals.savingsRate >= 20 ? "Your income exceeded expenses in this period." : "Review a category budget to find room to save.", tone: "#c5f36c" });
  else insights.push({ icon: "↗", title: "No income recorded for this period", detail: "Add income to calculate a meaningful savings rate.", tone: "#7cc9ff" });
  const spendByCategory = new Map(categoryTotals(budgetMonthTransactions, referenceDate).map((item) => [item.category, item.amountCents]));
  const exceeded = budgets.map((budget) => ({ ...budget, spentCents: spendByCategory.get(budget.category) ?? 0 })).filter((budget) => budget.spentCents > budget.limitCents).sort((a, b) => b.spentCents / b.limitCents - a.spentCents / a.limitCents)[0];
  if (exceeded) insights.push({ icon: "!", title: `${exceeded.category} is over its monthly budget`, detail: `${formatMoney(exceeded.spentCents - exceeded.limitCents)} above the ${formatMoney(exceeded.limitCents)} limit.`, tone: "#ff9f84" });
  else if (budgets.length) insights.push({ icon: "✓", title: "Monthly budgets are within limits", detail: "Your tracked categories have not exceeded their limits.", tone: "#7cc9ff" });
  return insights;
}
