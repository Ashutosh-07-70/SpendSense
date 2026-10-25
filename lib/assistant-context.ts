import { CATEGORIES, CURRENCY, getBudgetMonth, isPostedDate, localDateString, summarize, type Budget, type DateRange, type Transaction } from "./finance";
import type { AssistantContext } from "./assistant";

export function buildFinancialAssistantContext(transactions: Transaction[], budgets: Budget[], range: Pick<DateRange, "start" | "end" | "label">, referenceDate: Date): AssistantContext {
  const date = localDateString(referenceDate);
  const posted = transactions.filter((row) => isPostedDate(row.date, referenceDate));
  const rangeEnd = range.end ?? date;
  const periodRows = posted.filter((row) => (!range.start || row.date >= range.start) && row.date <= rangeEnd && row.date <= date);
  const period = summarize(periodRows, referenceDate);
  const all = summarize(posted, referenceDate);
  const categoryTotals = new Map<(typeof CATEGORIES)[number], number>();
  for (const row of periodRows) if (row.type === "expense") categoryTotals.set(row.category as (typeof CATEGORIES)[number], (categoryTotals.get(row.category as (typeof CATEGORIES)[number]) ?? 0) + row.amountCents);
  const currentMonth = getBudgetMonth("this-month", referenceDate);
  return {
    currency: CURRENCY,
    periodLabel: range.label,
    referenceDate: date,
    periodRange: { start: range.start, end: rangeEnd, label: range.label },
    period: { incomeCents: period.incomeCents, expenseCents: period.expenseCents, balanceCents: period.balanceCents, savingsRate: period.savingsRate },
    allTime: { incomeCents: all.incomeCents, expenseCents: all.expenseCents, balanceCents: all.balanceCents },
    categories: [...categoryTotals].map(([category, amountCents]) => ({ category, amountCents })).sort((a, b) => b.amountCents - a.amountCents),
    budgets: budgets.map((budget) => {
      const spentCents = posted.filter((row) => row.type === "expense" && row.category === budget.category && row.date.slice(0, 7) === currentMonth).reduce((sum, row) => sum + row.amountCents, 0);
      return { category: budget.category, limitCents: budget.limitCents, spentCents, remainingCents: budget.limitCents - spentCents };
    }),
    transactions: [...posted].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 80).map(({ id, name, category, date: transactionDate, amountCents, type, paymentMethod }) => ({ id, name, category, date: transactionDate, amountCents, type, ...(paymentMethod ? { paymentMethod } : {}) })),
  };
}
