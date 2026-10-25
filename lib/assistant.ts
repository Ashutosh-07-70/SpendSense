import { CATEGORIES, Category, CURRENCY, ExpenseCategory, getPostedDateError, MAX_TEXT_LENGTH, parseMoneyToCents, Transaction } from "./finance";

export type AssistantDraft = {
  type: "income" | "expense";
  amount: string;
  currency: string;
  category: Category;
  merchant: string;
  date: string;
  paymentMethod: string;
  confidence: number;
  needsClarification: boolean;
};

export type AssistantCorrection = {
  action: "edit" | "delete";
  transactionId: string;
  amount: string | null;
  currency: "USD" | "INR" | null;
  category: ExpenseCategory | "Income" | null;
  date: string | null;
  name: string | null;
  paymentMethod: string | null;
  needsClarification: boolean;
};

export type ReceiptItem = { name: string; amount: string | null; category: ExpenseCategory | "Other" | null };
export type ReceiptDetails = {
  isReceipt: boolean;
  merchant: string | null;
  total: string | null;
  currency: "USD" | "INR" | null;
  date: string | null;
  tax: string | null;
  items: ReceiptItem[];
  warnings: string[];
};

export type AssistantResponse = {
  reply: string;
  transactions: AssistantDraft[];
  correction: AssistantCorrection | null;
  receipt: ReceiptDetails | null;
};

export type AssistantContext = {
  currency: string;
  periodLabel: string;
  referenceDate: string;
  periodRange?: { start: string | null; end: string; label: string };
  period: { incomeCents: number; expenseCents: number; balanceCents: number; savingsRate: number | null };
  allTime: { incomeCents: number; expenseCents: number; balanceCents: number };
  categories: { category: ExpenseCategory; amountCents: number }[];
  budgets: { category: ExpenseCategory; limitCents: number; spentCents: number; remainingCents: number }[];
  transactions: Pick<Transaction, "id" | "name" | "category" | "date" | "amountCents" | "type" | "paymentMethod">[];
};
export type AssistantRequestContext = Pick<AssistantContext, "currency" | "referenceDate"> & Partial<Omit<AssistantContext, "currency" | "referenceDate">>;

/** Minimize per-request data: entry extraction gets no ledger rows or totals; queries get only matching facts. */
export function selectAssistantContext(context: AssistantContext, prompt: string): AssistantRequestContext {
  const lower = prompt.toLocaleLowerCase();
  const base: AssistantRequestContext = { currency: context.currency, referenceDate: context.referenceDate, ...(context.periodRange ? { periodRange: context.periodRange } : {}) };
  if (/\b(receipt|invoice|bill|photo|image|pdf)\b/.test(lower)) return base;
  if (/\b(spent|paid|bought|received|salary|income|add|record)\b/.test(lower) && !/\b(how much|compare|largest|biggest|unusual|recurring|subscription)\b/.test(lower)) return base;
  if (/\b(correct|change|edit|delete|remove|duplicate|move|payment method)\b/.test(lower)) return { ...base, transactions: context.transactions };
  const selected: AssistantRequestContext = { ...base, periodLabel: context.periodLabel };
  if (/\b(budget|limit|left|remaining|over budget)\b/.test(lower)) selected.budgets = context.budgets;
  if (/\b(spend|spent|expense|income|saving|saved|largest|biggest|unusual|recurring|subscription|category|habit)\b/.test(lower)) {
    selected.period = context.period;
    selected.categories = context.categories;
  }
  if (/\b(balance|all.?time|overall|income|saved|compare|compared)\b/.test(lower)) selected.allTime = context.allTime;
  if (/\b(largest|biggest|unusual|recurring|subscription|merchant|transaction)\b/.test(lower)) selected.transactions = context.transactions;
  return selected;
}

export type DraftValidation = { valid: true; amountCents: number; error: null } | { valid: false; amountCents: null; error: string };

export function validateAssistantDraft(draft: AssistantDraft, referenceDate: Date, currency = CURRENCY): DraftValidation {
  if (draft.currency !== currency) return { valid: false, amountCents: null, error: `This ledger uses ${currency}. ${draft.currency} cannot be saved without currency conversion or a separate-currency ledger.` };
  const amountCents = parseMoneyToCents(draft.amount);
  if (amountCents === null) return { valid: false, amountCents: null, error: "Enter a positive amount with no more than two decimal places, within the supported limit." };
  if (!draft.merchant.trim() || draft.merchant.trim().length > MAX_TEXT_LENGTH) return { valid: false, amountCents: null, error: "Add a description under 120 characters." };
  if (draft.type === "income" ? draft.category !== "Income" : !CATEGORIES.includes(draft.category as ExpenseCategory)) return { valid: false, amountCents: null, error: "Choose a category that matches the transaction type." };
  const dateError = getPostedDateError(draft.date, referenceDate);
  if (dateError) return { valid: false, amountCents: null, error: dateError };
  if (!Number.isFinite(draft.confidence) || draft.confidence < 0 || draft.confidence > 1) return { valid: false, amountCents: null, error: "The extracted details need review before saving." };
  return { valid: true, amountCents, error: null };
}

export function isAssistantResponse(value: unknown): value is AssistantResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  if (typeof result.reply !== "string" || result.reply.length > 4000 || !Array.isArray(result.transactions)) return false;
  if (result.transactions.length > 5) return false;
  const transactionsValid = result.transactions.every((item) => {
    if (!item || typeof item !== "object") return false;
    const draft = item as Record<string, unknown>;
    const validCategory = draft.type === "income" ? draft.category === "Income" : CATEGORIES.includes(draft.category as ExpenseCategory);
    return (draft.type === "expense" || draft.type === "income") && typeof draft.amount === "string" && draft.amount.length <= 32 && (draft.currency === "USD" || draft.currency === "INR") && validCategory && typeof draft.merchant === "string" && draft.merchant.length <= MAX_TEXT_LENGTH && typeof draft.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(draft.date) && typeof draft.paymentMethod === "string" && draft.paymentMethod.length <= 48 && typeof draft.confidence === "number" && Number.isFinite(draft.confidence) && draft.confidence >= 0 && draft.confidence <= 1 && typeof draft.needsClarification === "boolean";
  });
  if (!transactionsValid) return false;
  if (result.correction !== null) {
    if (!result.correction || typeof result.correction !== "object" || Array.isArray(result.correction)) return false;
    const correction = result.correction as Record<string, unknown>;
    if ((correction.action !== "edit" && correction.action !== "delete") || typeof correction.transactionId !== "string" || correction.transactionId.length > 128 || typeof correction.needsClarification !== "boolean") return false;
    for (const key of ["amount", "currency", "date", "name", "paymentMethod", "category"] as const) if (correction[key] !== null && typeof correction[key] !== "string") return false;
    if (correction.currency !== null && correction.currency !== "USD" && correction.currency !== "INR" || correction.amount !== null && correction.currency === null) return false;
    if (typeof correction.amount === "string" && correction.amount.length > 32 || typeof correction.date === "string" && !/^\d{4}-\d{2}-\d{2}$/.test(correction.date) || typeof correction.name === "string" && correction.name.length > MAX_TEXT_LENGTH || typeof correction.paymentMethod === "string" && correction.paymentMethod.length > 48) return false;
    if (typeof correction.category === "string" && correction.category !== "Income" && !CATEGORIES.includes(correction.category as ExpenseCategory)) return false;
  }
  if (result.receipt !== null) {
    if (!result.receipt || typeof result.receipt !== "object" || Array.isArray(result.receipt)) return false;
    const receipt = result.receipt as Record<string, unknown>;
    const optionalText = (item: unknown, max = 240) => item === null || typeof item === "string" && item.length <= max;
    if (typeof receipt.isReceipt !== "boolean" || !optionalText(receipt.merchant, MAX_TEXT_LENGTH) || !optionalText(receipt.total, 32) || !optionalText(receipt.currency, 3) || receipt.currency !== null && receipt.currency !== "USD" && receipt.currency !== "INR" || !optionalText(receipt.date, 10) || !optionalText(receipt.tax, 32) || !Array.isArray(receipt.items) || receipt.items.length > 40 || !Array.isArray(receipt.warnings) || receipt.warnings.length > 12) return false;
    if (receipt.items.some((item) => !item || typeof item !== "object" || typeof (item as Record<string, unknown>).name !== "string" || ((item as Record<string, unknown>).name as string).length > MAX_TEXT_LENGTH || !optionalText((item as Record<string, unknown>).amount, 32) || ((item as Record<string, unknown>).category !== null && ((item as Record<string, unknown>).category !== "Other" && !CATEGORIES.includes((item as Record<string, unknown>).category as ExpenseCategory))))) return false;
    if (receipt.warnings.some((warning) => typeof warning !== "string" || warning.length > 240)) return false;
  }
  return true;
}

export function findPotentialDuplicate(draft: AssistantDraft, amountCents: number, transactions: Transaction[]) {
  const merchant = draft.merchant.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return transactions.find((item) => {
    const existingMerchant = item.name.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    return item.date === draft.date && item.amountCents === amountCents && item.type === draft.type && (merchant === existingMerchant || merchant.includes(existingMerchant) || existingMerchant.includes(merchant));
  }) ?? null;
}
