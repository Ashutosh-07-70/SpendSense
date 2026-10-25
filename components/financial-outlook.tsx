"use client";

import { CalendarClock, CircleHelp, Repeat2, TrendingUp } from "lucide-react";
import { Transaction, formatMoney } from "@/lib/finance";
import { detectRecurringExpenses, estimateCurrentMonthSpend } from "@/lib/financial-intelligence";

export default function FinancialOutlook({ transactions, referenceDate }: { transactions: Transaction[]; referenceDate: Date }) {
  const recurring = detectRecurringExpenses(transactions, referenceDate);
  const estimate = estimateCurrentMonthSpend(transactions, referenceDate);
  return <section className="outlook-grid" aria-label="Recurring payments and spending outlook">
    <article className="panel outlook-panel">
      <div className="panel-heading"><div><span className="section-kicker">REPEATED ACTIVITY</span><h2>Possible recurring expenses</h2></div><Repeat2 size={17} aria-hidden="true" /></div>
      {recurring.length ? <div className="outlook-list">{recurring.slice(0, 5).map((item) => <div className="outlook-row" key={`${item.category}:${item.name}`}><span className="outlook-icon"><CalendarClock size={14} /></span><span className="outlook-copy"><strong>{item.name}</strong><small>{item.category} / {item.occurrences} matching payments / possible {item.frequency} pattern</small></span><span className="outlook-value">{formatMoney(item.amountCents)}<small>Next ~{item.nextExpectedDate}</small></span></div>)}</div> : <div className="outlook-empty"><CircleHelp size={18} /><strong>No clear recurring pattern yet</strong><span>SpendSense needs at least three similarly spaced payments with the same name and category.</span></div>}
      <p className="outlook-footnote">These are candidates inferred from history, not confirmed subscriptions or scheduled bills.</p>
    </article>
    <article className="panel outlook-panel">
      <div className="panel-heading"><div><span className="section-kicker">ESTIMATE / NOT A BALANCE</span><h2>Month-end spending pace</h2></div><TrendingUp size={17} aria-hidden="true" /></div>
      {estimate ? <><div className="pace-value">{formatMoney(estimate.projectedExpenseCents)}</div><p className="pace-description">At the current average daily expense pace, estimated spending for this month is {formatMoney(estimate.projectedExpenseCents)}.</p><div className="pace-meter" role="img" aria-label={`${Math.round(estimate.elapsedDays / estimate.monthDays * 100)} percent of the month elapsed`}><i style={{ width: `${Math.round(estimate.elapsedDays / estimate.monthDays * 100)}%` }} /></div><div className="pace-meta"><span>{formatMoney(estimate.spentSoFarCents)} recorded through day {estimate.elapsedDays}</span><span>{estimate.monthDays} days</span></div><p className="outlook-footnote">Simple linear estimate from {estimate.transactionCount} posted expenses so far. It does not predict income, bills, or your account balance.</p></> : <div className="outlook-empty"><TrendingUp size={18} /><strong>Not enough activity to estimate yet</strong><span>After day 6 and at least five expenses this month, SpendSense can show a simple spending pace projection.</span></div>}
    </article>
  </section>;
}
