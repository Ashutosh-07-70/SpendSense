"use client";

import { AlertTriangle, Archive, CheckCircle2, Upload } from "lucide-react";
import { CATEGORIES } from "@/lib/finance";
import type { FinanceLoadResult } from "@/lib/storage";
import type { MigrationResult } from "@/lib/finance-repository";

type Props = {
  preview: FinanceLoadResult;
  result: MigrationResult | null;
  busy: boolean;
  onImport: (includeSample: boolean) => void;
  onDownload: () => void;
  onDismiss: () => void;
};

export default function LocalMigrationPanel({ preview, result, busy, onImport, onDownload, onDismiss }: Props) {
  const demoBudgetIds = new Set(CATEGORIES.map((category) => `budget-${category.toLowerCase().replaceAll(" ", "-")}`));
  const realTransactions = preview.transactions.filter((row) => !row.id.startsWith("demo-"));
  const sampleTransactions = preview.transactions.length - realTransactions.length;
  const realBudgets = preview.budgets.filter((row) => !demoBudgetIds.has(row.id));
  const sampleBudgets = preview.budgets.length - realBudgets.length;
  return <section className="storage-recovery local-migration" aria-labelledby="local-migration-title">
    <div className="storage-recovery-copy">
      <strong id="local-migration-title"><Archive size={16} /> Local finance data found</strong>
      <p>Choose what to import into your signed-in account. Nothing is uploaded until you confirm. The browser copy will remain as a backup.</p>
      <ul><li>{realTransactions.length} saved transaction{realTransactions.length === 1 ? "" : "s"} · {realBudgets.length} saved budget{realBudgets.length === 1 ? "" : "s"}</li><li>{sampleTransactions} sample transaction{sampleTransactions === 1 ? "" : "s"} · {sampleBudgets} sample budget{sampleBudgets === 1 ? "" : "s"} (import only if you choose)</li></ul>
      {preview.issues.length > 0 && <div className="migration-issues" role="status"><span><AlertTriangle size={14} /> {preview.issues.length} record issue{preview.issues.length === 1 ? "" : "s"}; invalid records are preserved in the local backup.</span><ul>{preview.issues.slice(0, 4).map((issue, index) => <li key={`${issue.source}-${issue.index ?? index}`}>{issue.source}{issue.index === undefined ? "" : ` · record ${issue.index + 1}`}: {issue.reason}</li>)}</ul></div>}
      {result && <p className="migration-result" role="status"><CheckCircle2 size={14} /> {result.importedTransactions} transaction{result.importedTransactions === 1 ? "" : "s"} and {result.importedBudgets} budget{result.importedBudgets === 1 ? "" : "s"} verified; {result.duplicateTransactions + result.duplicateBudgets} duplicate record{result.duplicateTransactions + result.duplicateBudgets === 1 ? "" : "s"} skipped; {result.failedRecords} need retry{result.verified ? "." : ". Review failures and retry safely."}</p>}
    </div>
    <div className="storage-recovery-actions">
      <button className="secondary-button" type="button" onClick={onDownload}><Archive size={14} /> Download local backup</button>
      {realTransactions.length + realBudgets.length > 0 && <button className="primary-button" type="button" disabled={busy} onClick={() => onImport(false)}><Upload size={14} /> {busy ? "Importing…" : "Import saved records"}</button>}
      {sampleTransactions + sampleBudgets > 0 && <button className="secondary-button" type="button" disabled={busy} onClick={() => onImport(true)}><Upload size={14} /> Import sample data too</button>}
      <button className="text-button" type="button" onClick={onDismiss}>Review later</button>
    </div>
  </section>;
}
