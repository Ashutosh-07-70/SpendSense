import { isPostedDate, Transaction, localDateString } from "./finance";

export type RecurringCandidate = {
  name: string;
  category: string;
  amountCents: number;
  frequency: "weekly" | "monthly";
  occurrences: number;
  lastDate: string;
  nextExpectedDate: string;
};

function addDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  date.setDate(date.getDate() + days);
  return localDateString(date);
}

/** Finds only repeated expenses with at least three consistently spaced records. */
export function detectRecurringExpenses(transactions: Transaction[], referenceDate = new Date()): RecurringCandidate[] {
  const groups = new Map<string, Transaction[]>();
  for (const item of transactions) {
    if (item.type !== "expense" || !isPostedDate(item.date, referenceDate) || !Number.isSafeInteger(item.amountCents) || item.amountCents <= 0 || !item.name.trim()) continue;
    const key = `${item.category}:${item.name.trim().toLocaleLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const candidates: RecurringCandidate[] = [];
  for (const rows of groups.values()) {
    const ordered = [...new Map(rows.map((row) => [row.date, row])).values()].sort((a, b) => a.date.localeCompare(b.date));
    if (ordered.length < 3) continue;
    const gaps = ordered.slice(1).map((row, index) => {
      const from = new Date(`${ordered[index].date}T12:00:00`);
      const to = new Date(`${row.date}T12:00:00`);
      return Math.round((to.getTime() - from.getTime()) / 86_400_000);
    });
    const median = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
    const frequency = median >= 6 && median <= 8 ? "weekly" : median >= 25 && median <= 35 ? "monthly" : null;
    if (!frequency || gaps.some((gap) => Math.abs(gap - median) > (frequency === "weekly" ? 1 : 3))) continue;
    const amounts = ordered.map((row) => row.amountCents).sort((a, b) => a - b);
    const amountCents = amounts[Math.floor(amounts.length / 2)];
    candidates.push({ name: ordered.at(-1)!.name, category: ordered.at(-1)!.category, amountCents, frequency, occurrences: ordered.length, lastDate: ordered.at(-1)!.date, nextExpectedDate: addDays(ordered.at(-1)!.date, median) });
  }
  return candidates.sort((a, b) => b.amountCents - a.amountCents);
}

export type SpendPaceEstimate = { projectedExpenseCents: number; spentSoFarCents: number; elapsedDays: number; monthDays: number; transactionCount: number };

/** Linear current-month expense pace; deliberately does not project account balance or income. */
export function estimateCurrentMonthSpend(transactions: Transaction[], referenceDate: Date): SpendPaceEstimate | null {
  const today = localDateString(referenceDate);
  const expenses = transactions.filter((item) => item.type === "expense" && isPostedDate(item.date, referenceDate) && item.date.slice(0, 7) === today.slice(0, 7) && Number.isSafeInteger(item.amountCents) && item.amountCents > 0);
  if (expenses.length < 5 || referenceDate.getDate() < 7) return null;
  const spentSoFarCents = expenses.reduce((sum, item) => sum + item.amountCents, 0);
  if (!Number.isSafeInteger(spentSoFarCents)) return null;
  const monthDays = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0).getDate();
  const projectedExpenseCents = Math.round((spentSoFarCents * monthDays) / referenceDate.getDate());
  if (!Number.isSafeInteger(projectedExpenseCents)) return null;
  return { projectedExpenseCents, spentSoFarCents, elapsedDays: referenceDate.getDate(), monthDays, transactionCount: expenses.length };
}

