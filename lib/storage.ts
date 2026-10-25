import {
  Budget,
  CURRENCY,
  DEMO_BUDGETS,
  MAX_RECORDS,
  Transaction,
  ValidationIssue,
  ValidationResult,
  makeDemoTransactions,
  validateBudgets,
  validateTransactions,
} from "./finance";

export const FINANCE_STORAGE_KEY = "spendsense.finance.v2";
export const LEGACY_TRANSACTION_KEY = "spendsense.transactions.v1";
export const LEGACY_BUDGET_KEY = "spendsense.budgets.v1";
export const RECOVERY_KEY_PREFIX = "spendsense.finance.recovery.v1:";
export const FINANCE_SCHEMA_VERSION = 3;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type FinanceData = { transactions: Transaction[]; budgets: Budget[] };
export type FinanceLoadStatus = "loaded" | "sample" | "migrated" | "recovery" | "unavailable";
export type FinanceLoadResult = FinanceData & {
  status: FinanceLoadStatus;
  issues: ValidationIssue[];
  recoveryRaw: string | null;
  recoverySaved: boolean;
  requiresRecovery: boolean;
  message: string;
};

export class FinanceStorageError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "FinanceStorageError";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function preserveRaw(storage: StorageLike, source: string, raw: string, referenceDate: Date) {
  const timestamp = referenceDate.getTime();
  for (let index = 0; index < 100; index += 1) {
    const key = `${RECOVERY_KEY_PREFIX}${timestamp}:${index}`;
    try {
      if (storage.getItem(key) !== null) continue;
      storage.setItem(key, JSON.stringify({ version: 1, createdAt: referenceDate.toISOString(), source, raw }));
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

function result(data: FinanceData, status: FinanceLoadStatus, issues: ValidationIssue[], raw: string | null, recoverySaved: boolean, requiresRecovery: boolean, message: string): FinanceLoadResult {
  return { ...data, status, issues, recoveryRaw: raw, recoverySaved, requiresRecovery, message };
}

function emptyData(): FinanceData { return { transactions: [], budgets: [] }; }

function recover(storage: StorageLike, raw: string, source: string, referenceDate: Date, issues: ValidationIssue[], data = emptyData(), message = "Saved finance data needs review.") {
  const recoverySaved = preserveRaw(storage, source, raw, referenceDate);
  const finalIssues = recoverySaved ? issues : [...issues, { source: "recovery", reason: "Could not create a local recovery copy. Download the original payload before continuing." }];
  return result(data, "recovery", finalIssues, raw, recoverySaved, true, message);
}

export function serializeFinanceData(data: FinanceData, referenceDate = new Date()) {
  const transactions = validateTransactions(data.transactions, referenceDate, "cents", "transactions");
  const budgets = validateBudgets(data.budgets, "cents", "budgets");
  if (!transactions.valid || !budgets.valid) {
    throw new FinanceStorageError("Refusing to save invalid finance records.", [...transactions.issues, ...budgets.issues]);
  }
  if (data.transactions.length > MAX_RECORDS) throw new FinanceStorageError(`Cannot save more than ${MAX_RECORDS} transactions.`);
  return JSON.stringify({
    version: FINANCE_SCHEMA_VERSION,
    currency: CURRENCY,
    amountUnit: "cents",
    transactions: transactions.records,
    budgets: budgets.records,
  });
}

/** A single setItem atomically replaces one envelope; browser storage is not a durable database. */
export function saveFinanceData(storage: StorageLike, data: FinanceData, referenceDate = new Date()) {
  let payload: string;
  try {
    payload = serializeFinanceData(data, referenceDate);
    storage.setItem(FINANCE_STORAGE_KEY, payload);
  } catch (error) {
    if (error instanceof FinanceStorageError) throw error;
    throw new FinanceStorageError("Could not save finance data to this browser.", error);
  }
}

function loadCurrent(storage: StorageLike, raw: string, referenceDate: Date): FinanceLoadResult {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch {
    return recover(storage, raw, FINANCE_STORAGE_KEY, referenceDate, [{ source: FINANCE_STORAGE_KEY, reason: "Saved finance data is not valid JSON." }], emptyData(), "Saved finance data could not be parsed. The original payload was preserved for recovery.");
  }
  if (isObject(parsed) && parsed.version === 2 && parsed.currency === "USD" && parsed.amountUnit === "cents") {
    const transactions = validateTransactions(parsed.transactions, referenceDate, "cents", "transactions");
    const budgets = validateBudgets(parsed.budgets, "cents", "budgets");
    const issues = [...transactions.issues, ...budgets.issues];
    const data = { transactions: transactions.records, budgets: budgets.records };
    if (issues.length) return recover(storage, raw, FINANCE_STORAGE_KEY, referenceDate, issues, data, "The previous USD ledger contains records that need review. Its original payload was preserved; the currency migration was not applied.");
    const recoverySaved = preserveRaw(storage, "finance-v2-usd-currency-migration", raw, referenceDate);
    if (!recoverySaved) return result(data, "recovery", [{ source: "recovery", reason: "Could not make a recovery copy of the previous USD ledger." }], raw, false, true, "The previous ledger is readable, but its recovery copy could not be saved. No currency migration was made.");
    try {
      saveFinanceData(storage, data, referenceDate);
      return result(data, "migrated", [], raw, true, false, "Ledger updated to INR. Existing numeric amounts were kept as-is; no exchange-rate conversion was applied. A recoverable copy of the original USD data was retained.");
    } catch (error) {
      return result(data, "recovery", [{ source: FINANCE_STORAGE_KEY, reason: error instanceof Error ? error.message : "Currency migration write failed." }], raw, true, true, "The INR ledger could not be saved. Your original USD ledger and its recovery copy remain available.");
    }
  }
  if (!isObject(parsed) || parsed.version !== FINANCE_SCHEMA_VERSION || parsed.currency !== CURRENCY || parsed.amountUnit !== "cents") {
    const version = isObject(parsed) ? String(parsed.version ?? "missing") : "invalid";
    return recover(storage, raw, FINANCE_STORAGE_KEY, referenceDate, [{ source: FINANCE_STORAGE_KEY, reason: `Unsupported finance storage schema (version ${version}).` }], emptyData(), "This data format is not supported by this version. The original payload was preserved.");
  }
  const transactions = validateTransactions(parsed.transactions, referenceDate, "cents", "transactions");
  const budgets = validateBudgets(parsed.budgets, "cents", "budgets");
  const issues = [...transactions.issues, ...budgets.issues];
  const data = { transactions: transactions.records, budgets: budgets.records };
  if (issues.length) return recover(storage, raw, FINANCE_STORAGE_KEY, referenceDate, issues, data, "Some saved records need review. Valid records are available; the original payload was preserved.");
  return result(data, "loaded", [], null, true, false, "Saved locally on this device.");
}

function parseLegacy(raw: string | null, key: string, referenceDate: Date, unit: "transactions"): ValidationResult<Transaction>;
function parseLegacy(raw: string | null, key: string, referenceDate: Date, unit: "budgets"): ValidationResult<Budget>;
function parseLegacy(raw: string | null, key: string, referenceDate: Date, unit: "transactions" | "budgets"): ValidationResult<Transaction> | ValidationResult<Budget> {
  if (raw === null) return unit === "transactions"
    ? { records: makeDemoTransactions(referenceDate), issues: [] as ValidationIssue[], valid: true }
    : { records: DEMO_BUDGETS, issues: [] as ValidationIssue[], valid: true };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { return { records: [], issues: [{ source: key, reason: "Legacy saved data is not valid JSON." }], valid: false }; }
  return unit === "transactions"
    ? validateTransactions(parsed, referenceDate, "major", key)
    : validateBudgets(parsed, "major", key);
}

function loadLegacy(storage: StorageLike, transactionRaw: string | null, budgetRaw: string | null, referenceDate: Date): FinanceLoadResult {
  const original = JSON.stringify({ transactionsRaw: transactionRaw, budgetsRaw: budgetRaw });
  const recoverySaved = preserveRaw(storage, "legacy-v1-keys", original, referenceDate);
  const partial = (transactionRaw === null) !== (budgetRaw === null);
  const transactions = partial && transactionRaw === null
    ? { records: [] as Transaction[], issues: [] as ValidationIssue[], valid: true }
    : parseLegacy(transactionRaw, LEGACY_TRANSACTION_KEY, referenceDate, "transactions");
  const budgets = partial && budgetRaw === null
    ? { records: [] as Budget[], issues: [] as ValidationIssue[], valid: true }
    : parseLegacy(budgetRaw, LEGACY_BUDGET_KEY, referenceDate, "budgets");
  const issues = [...transactions.issues, ...budgets.issues];
  const data = { transactions: transactions.records, budgets: budgets.records };
  if (partial) issues.push({ source: "legacy-v1-keys", reason: "Only one legacy dataset exists. The missing dataset was left empty instead of assuming it was intentionally reset." });
  if (!recoverySaved) {
    return result(data, "recovery", [...issues, { source: "recovery", reason: "Legacy data could not be copied locally. Download the original payload before continuing." }], original, false, true, "Legacy data was found, but its recovery copy could not be saved.");
  }
  if (issues.length) return result(data, "recovery", issues, original, true, true, "Some legacy records need review. The original v1 data is preserved; no migration was written.");
  try {
    saveFinanceData(storage, data, referenceDate);
    return result(data, "migrated", [], original, true, false, "Legacy data migrated to the current format. The original v1 keys and a recovery copy were retained.");
  } catch (error) {
    return result(data, "unavailable", [{ source: FINANCE_STORAGE_KEY, reason: error instanceof Error ? error.message : "Migration write failed." }], original, true, false, "Legacy data is loaded but migration could not be saved. Your original v1 keys remain available.");
  }
}

/** Load, validate, preserve, and migrate without replacing the original payload on uncertainty. */
export function loadFinanceData(storage: StorageLike, referenceDate = new Date()): FinanceLoadResult {
  let currentRaw: string | null;
  let transactionRaw: string | null;
  let budgetRaw: string | null;
  try {
    currentRaw = storage.getItem(FINANCE_STORAGE_KEY);
    if (currentRaw !== null) return loadCurrent(storage, currentRaw, referenceDate);
    transactionRaw = storage.getItem(LEGACY_TRANSACTION_KEY);
    budgetRaw = storage.getItem(LEGACY_BUDGET_KEY);
  } catch {
    return result(emptyData(), "unavailable", [{ source: "storage", reason: "Browser storage could not be read. Existing data was not treated as empty or overwritten." }], null, false, true, "Browser storage is unavailable. No saved data was changed.");
  }
  if (transactionRaw !== null || budgetRaw !== null) return loadLegacy(storage, transactionRaw, budgetRaw, referenceDate);
  return result({ transactions: makeDemoTransactions(referenceDate), budgets: DEMO_BUDGETS }, "sample", [], null, true, false, "Sample data is shown. Changes will save locally on this device.");
}

export function exportableFinanceData(data: FinanceData) {
  return JSON.stringify({ version: FINANCE_SCHEMA_VERSION, currency: CURRENCY, amountUnit: "cents", ...data }, null, 2);
}
