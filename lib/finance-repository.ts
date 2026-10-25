import type { SupabaseClient } from "@supabase/supabase-js";
import type { Budget, Category, ExpenseCategory, Transaction } from "./finance";
import { CATEGORIES, MAX_AMOUNT_CENTS, MAX_RECORDS, isPostedDate, validateBudgets, validateTransactions } from "./finance";
import type { FinanceLoadResult } from "./storage";
import type { Database } from "./supabase/database.types";

type Client = SupabaseClient<Database>;
type TransactionRow = Database["public"]["Tables"]["finance_transactions"]["Row"];
type BudgetRow = Database["public"]["Tables"]["finance_budgets"]["Row"];
export type FinanceSnapshot = { transactions: Transaction[]; budgets: Budget[] };

function checkedCents(value: number | string) {
  const cents = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(cents) || cents < 1 || cents > MAX_AMOUNT_CENTS) throw new Error("Saved financial data has an invalid amount. Contact support before editing this record.");
  return cents;
}

export function transactionFromRow(row: TransactionRow): Transaction {
  const type = row.type;
  const category = row.category;
  const amountCents = checkedCents(row.amount_cents);
  if (!row.source_id || row.source_id.length > 128 || typeof row.name !== "string" || !row.name.trim() || row.name.length > 120 || !isPostedDate(row.transaction_date) || (type !== "income" && type !== "expense") || (type === "income" ? category !== "Income" : !CATEGORIES.includes(category as ExpenseCategory)) || row.note !== null && (typeof row.note !== "string" || row.note.length > 240) || row.payment_method !== null && (typeof row.payment_method !== "string" || row.payment_method.length > 48)) throw new Error("Saved financial data contains a malformed transaction. Its records were not treated as an empty account.");
  return { id: row.source_id, name: row.name.trim(), category: category as Category, date: row.transaction_date, amountCents, type, ...(row.note?.trim() ? { note: row.note.trim() } : {}), ...(row.payment_method?.trim() ? { paymentMethod: row.payment_method.trim() } : {}) };
}

export function budgetFromRow(row: BudgetRow): Budget {
  if (!row.source_id || row.source_id.length > 128 || !CATEGORIES.includes(row.category as ExpenseCategory)) throw new Error("Saved financial data contains a malformed budget.");
  return { id: row.source_id, category: row.category as ExpenseCategory, limitCents: checkedCents(row.limit_cents) };
}

function cleanError(message: string): Error { return new Error(message); }

export async function fetchFinanceData(client: Client, userId: string): Promise<FinanceSnapshot> {
  const pageSize = 1000;
  const transactionRows: TransactionRow[] = [];
  for (let offset = 0; offset <= MAX_RECORDS; offset += pageSize) {
    const { data, error } = await client.from("finance_transactions").select("*").eq("user_id", userId).order("transaction_date", { ascending: false }).range(offset, offset + pageSize - 1);
    if (error || !data) throw cleanError("Your finance data could not be loaded. Check your connection and Supabase setup, then retry.");
    transactionRows.push(...data);
    if (transactionRows.length > MAX_RECORDS) throw cleanError(`This account exceeds the supported ${MAX_RECORDS} transaction limit.`);
    if (data.length < pageSize) break;
  }
  const { data: budgetRows, error: budgetError } = await client.from("finance_budgets").select("*").eq("user_id", userId).order("category");
  if (budgetError || !budgetRows) throw cleanError("Your finance data could not be loaded. Check your connection and Supabase setup, then retry.");
  const transactions = transactionRows.map((row) => transactionFromRow(row));
  const budgets = budgetRows.map((row) => budgetFromRow(row));
  if (!validateTransactions(transactions).valid || !validateBudgets(budgets).valid) throw cleanError("Supabase returned records that do not pass SpendSense validation. No data was discarded.");
  return { transactions, budgets };
}

function transactionPayload(row: Transaction, userId: string) {
  const checked = validateTransactions([row]);
  if (!checked.valid) throw cleanError(checked.issues[0]?.reason ?? "Transaction did not pass validation.");
  return { user_id: userId, source_id: row.id, name: row.name.trim(), category: row.category, transaction_date: row.date, amount_cents: row.amountCents, type: row.type, note: row.note?.trim() || null, payment_method: row.paymentMethod?.trim() || null };
}

export async function insertTransaction(client: Client, userId: string, transaction: Transaction) {
  const { data, error } = await client.from("finance_transactions").upsert(transactionPayload(transaction, userId), { onConflict: "user_id,source_id", ignoreDuplicates: true }).select("*").maybeSingle();
  if (error) throw cleanError("Transaction could not be saved to your account. Check your connection and retry.");
  if (data) return transactionFromRow(data);
  const existing = await client.from("finance_transactions").select("*").eq("user_id", userId).eq("source_id", transaction.id).maybeSingle();
  if (existing.error || !existing.data) throw cleanError("Transaction could not be verified in your account. Refresh and retry.");
  return transactionFromRow(existing.data);
}

export async function updateTransaction(client: Client, userId: string, transaction: Transaction) {
  const id = transaction.id;
  const payload = transactionPayload(transaction, userId);
  const { data, error } = await client.from("finance_transactions").update({ name: payload.name, category: payload.category, transaction_date: payload.transaction_date, amount_cents: payload.amount_cents, type: payload.type, note: payload.note, payment_method: payload.payment_method }).eq("source_id", id).eq("user_id", userId).select("*").maybeSingle();
  if (error || !data) throw cleanError("Transaction changes were not saved. This record may no longer exist; refresh and retry.");
  return transactionFromRow(data);
}

export async function deleteTransaction(client: Client, userId: string, transactionId: string) {
  const { data, error } = await client.from("finance_transactions").delete().eq("source_id", transactionId).eq("user_id", userId).select("source_id").maybeSingle();
  if (error || !data) throw cleanError("Transaction could not be deleted. It may no longer exist; refresh and retry.");
}

function budgetPayload(budget: Budget, userId: string) {
  const checked = validateBudgets([budget]);
  if (!checked.valid) throw cleanError(checked.issues[0]?.reason ?? "Budget did not pass validation.");
  return { user_id: userId, source_id: budget.id, category: budget.category, limit_cents: budget.limitCents };
}

export async function saveBudget(client: Client, userId: string, budget: Budget, editing: boolean) {
  const payload = budgetPayload(budget, userId);
  const result = editing
    ? await client.from("finance_budgets").update({ category: payload.category, limit_cents: payload.limit_cents }).eq("source_id", budget.id).eq("user_id", userId).select("*").maybeSingle()
    : await client.from("finance_budgets").insert(payload).select("*").maybeSingle();
  if (result.error || !result.data) throw cleanError("Budget could not be saved. Check your connection and retry.");
  return budgetFromRow(result.data);
}

export async function deleteBudget(client: Client, userId: string, budgetId: string) {
  const { data, error } = await client.from("finance_budgets").delete().eq("source_id", budgetId).eq("user_id", userId).select("source_id").maybeSingle();
  if (error || !data) throw cleanError("Budget could not be deleted. It may no longer exist; refresh and retry.");
}

export async function replaceFinanceData(client: Client, userId: string, transactions: Transaction[], budgets: Budget[]) {
  const checkedTransactions = validateTransactions(transactions);
  const checkedBudgets = validateBudgets(budgets);
  if (!checkedTransactions.valid || !checkedBudgets.valid || transactions.length > MAX_RECORDS) throw cleanError("The replacement data did not pass validation. Nothing was changed.");
  const { error } = await client.rpc("replace_my_finance_data", {
    p_transactions: transactions.map((row) => ({ source_id: row.id, name: row.name, category: row.category, transaction_date: row.date, amount_cents: row.amountCents, type: row.type, note: row.note ?? null, payment_method: row.paymentMethod ?? null })),
    p_budgets: budgets.map((row) => ({ source_id: row.id, category: row.category, limit_cents: row.limitCents })),
  });
  if (error) throw cleanError("The data reset did not complete. Your existing account records were not replaced.");
  return fetchFinanceData(client, userId);
}

export type MigrationResult = { importedTransactions: number; duplicateTransactions: number; importedBudgets: number; duplicateBudgets: number; failedRecords: number; verified: boolean };

export async function migrateLocalFinanceData(client: Client, userId: string, preview: FinanceLoadResult, includeSample: boolean): Promise<MigrationResult> {
  const transactions = includeSample ? preview.transactions : preview.transactions.filter((row) => !row.id.startsWith("demo-"));
  const demoBudgetIds = new Set(CATEGORIES.map((category) => `budget-${category.toLowerCase().replaceAll(" ", "-")}`));
  const budgets = includeSample ? preview.budgets : preview.budgets.filter((row) => !demoBudgetIds.has(row.id));
  const validation = validateTransactions(transactions);
  const budgetValidation = validateBudgets(budgets);
  const selectedTransactions = validation.records;
  const selectedBudgets = budgetValidation.records;
  if (!selectedTransactions.length && !selectedBudgets.length) throw cleanError("There are no valid local records selected for migration.");

  const { data: existingTransactionRows, error: transactionReadError } = await client.from("finance_transactions").select("source_id").eq("user_id", userId);
  const { data: existingBudgetRows, error: budgetReadError } = await client.from("finance_budgets").select("source_id, category").eq("user_id", userId);
  if (transactionReadError || budgetReadError || !existingTransactionRows || !existingBudgetRows) throw cleanError("Could not check for previous imports. No local records were uploaded.");
  const existingTransactionIds = new Set(existingTransactionRows.map((row) => row.source_id));
  const existingBudgetIds = new Set(existingBudgetRows.map((row) => row.source_id));
  const existingBudgetCategories = new Set(existingBudgetRows.map((row) => row.category));
  const newTransactions = selectedTransactions.filter((row) => !existingTransactionIds.has(row.id));
  const newBudgets = selectedBudgets.filter((row) => !existingBudgetIds.has(row.id) && !existingBudgetCategories.has(row.category));
  let failedRecords = validation.issues.length + budgetValidation.issues.length;

  for (let offset = 0; offset < newTransactions.length; offset += 100) {
    const chunk = newTransactions.slice(offset, offset + 100).map((row) => transactionPayload(row, userId));
    const { error } = await client.from("finance_transactions").upsert(chunk, { onConflict: "user_id,source_id", ignoreDuplicates: true });
    if (!error) continue;
    for (const record of chunk) {
      const retry = await client.from("finance_transactions").upsert(record, { onConflict: "user_id,source_id", ignoreDuplicates: true });
      if (retry.error) failedRecords += 1;
    }
  }
  for (const row of newBudgets) {
    const { error } = await client.from("finance_budgets").insert(budgetPayload(row, userId));
    if (error) failedRecords += 1;
  }

  const verified = await fetchFinanceData(client, userId);
  const verifiedTransactionIds = new Set(verified.transactions.map((row) => row.id));
  const verifiedBudgetIds = new Set(verified.budgets.map((row) => row.id));
  const verifiedTxCount = newTransactions.filter((row) => verifiedTransactionIds.has(row.id)).length;
  const verifiedBudgetCount = newBudgets.filter((row) => verifiedBudgetIds.has(row.id)).length;
  const missingTxCount = newTransactions.length - verifiedTxCount;
  const missingBudgetCount = newBudgets.length - verifiedBudgetCount;
  failedRecords += missingTxCount + missingBudgetCount;
  return { importedTransactions: verifiedTxCount, duplicateTransactions: selectedTransactions.length - newTransactions.length, importedBudgets: verifiedBudgetCount, duplicateBudgets: selectedBudgets.length - newBudgets.length, failedRecords, verified: failedRecords === 0 };
}
