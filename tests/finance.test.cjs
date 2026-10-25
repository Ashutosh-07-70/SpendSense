/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
const Module = require("node:module");
const loadModule = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "server-only") return {};
  return loadModule.call(this, request, parent, isMain);
};

require.extensions[".ts"] = (loadedModule, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  loadedModule._compile(output, filename);
};

const finance = require(path.resolve(__dirname, "../lib/finance.ts"));
const storageApi = require(path.resolve(__dirname, "../lib/storage.ts"));
const assistant = require(path.resolve(__dirname, "../lib/assistant.ts"));
const repository = require(path.resolve(__dirname, "../lib/finance-repository.ts"));
const themeState = require(path.resolve(__dirname, "../lib/theme-state.ts"));
const assistantRoute = require(path.resolve(__dirname, "../app/api/assistant/route.ts"));
const supabaseServer = require(path.resolve(__dirname, "../lib/supabase/server.ts"));
const originalCreateServerClient = supabaseServer.createClient;
const intelligence = require(path.resolve(__dirname, "../lib/financial-intelligence.ts"));
const referenceDate = new Date(2024, 2, 15, 12);

test("theme choices persist, cycle through all appearances, and reject invalid stored values", () => {
  const values = new Map();
  const localThemeStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.equal(themeState.readThemePreference(localThemeStorage), "light");
  themeState.persistThemePreference(localThemeStorage, "spider-man");
  assert.equal(themeState.readThemePreference(localThemeStorage), "spider-man");
  values.set(themeState.THEME_STORAGE_KEY, "ultraviolet");
  assert.equal(themeState.readThemePreference(localThemeStorage, "dark"), "dark");
  assert.equal(themeState.readThemePreference({ getItem() { throw new Error("blocked"); } }), "light");
  assert.deepEqual([themeState.nextTheme("light"), themeState.nextTheme("dark"), themeState.nextTheme("spider-man")], ["dark", "spider-man", "light"]);
});

function mockAuthenticatedSupabase() {
  supabaseServer.createClient = async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "test-user" } }, error: null }) },
    from(table) {
      const result = { data: [], error: null };
      const query = {
        select() { return this; },
        eq(column, value) { assert.equal(column, "user_id"); assert.equal(value, "test-user"); return this; },
        order() { return this; },
        range() { return Promise.resolve(result); },
        then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
      };
      assert.ok(["finance_transactions", "finance_budgets"].includes(table));
      return query;
    },
  });
  return () => { supabaseServer.createClient = originalCreateServerClient; };
}

function setSupabaseTestConfig() {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_URL = "https://test-project.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
  return () => {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY = previousKey;
  };
}
function clearSupabaseTestConfig() {
  const names = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  return () => names.forEach((name) => { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; });
}

class MemoryStorage {
  values = new Map();
  writes = [];
  failGet = false;
  failSet = false;
  failPrefix = null;
  getItem(key) {
    if (this.failGet) throw new Error("read denied");
    return this.values.has(key) ? this.values.get(key) : null;
  }
  setItem(key, value) {
    this.writes.push(key);
    if (this.failSet || (this.failPrefix && key.startsWith(this.failPrefix))) throw new Error("write denied");
    this.values.set(key, value);
  }
}

function transaction({ id = "tx-1", date = "2024-03-10", amountCents = 100, type = "expense", category = type === "income" ? "Income" : "Food & drink", note } = {}) {
  return { id, name: "Ledger item", category, date, amountCents, type, ...(note === undefined ? {} : { note }) };
}

function currentEnvelope(transactions = [], budgets = []) {
  return JSON.stringify({ version: 3, currency: "INR", amountUnit: "cents", transactions, budgets });
}

test("local month boundaries include leap days and cross year boundaries", () => {
  const february = finance.getDateRange("last-month", referenceDate);
  assert.equal(february.start, "2024-02-01");
  assert.equal(february.end, "2024-02-29");
  const january = finance.getDateRange("last-month", new Date(2025, 0, 4, 12));
  assert.equal(january.start, "2024-12-01");
  assert.equal(january.end, "2024-12-31");
});

test("posted-date validation rejects future records against an injected local date", () => {
  assert.equal(finance.isPostedDate("2024-03-15", referenceDate), true);
  assert.equal(finance.isPostedDate("2024-03-16", referenceDate), false);
  assert.match(finance.getPostedDateError("2024-03-16", referenceDate), /cannot be dated after 2024-03-15/);
  assert.equal(finance.getPostedDateError("2024-02-30", referenceDate), "Enter a valid calendar date.");
  const normalized = finance.validateTransactions([transaction({ date: "2024-03-16" })], referenceDate);
  assert.equal(normalized.records.length, 0);
  assert.match(normalized.issues[0].reason, /Future-dated/);
});

test("demo transactions never exceed the injected local date", () => {
  const demos = finance.makeDemoTransactions(referenceDate);
  assert.ok(demos.length > 0);
  assert.ok(demos.every((row) => row.date <= "2024-03-15"));
  assert.ok(demos.every((row) => row.amountCents > 0 && Number.isInteger(row.amountCents)));
  assert.equal(demos.find((row) => row.name === "Monthly salary").amountCents, 8_500_000);
  assert.equal(finance.DEMO_BUDGETS.find((budget) => budget.category === "Housing").limitCents, 3_500_000);
});

test("decimal input converts to exact integer cents and formats only at the boundary", () => {
  const tenCents = finance.parseMoneyToCents("0.10");
  const twentyCents = finance.parseMoneyToCents("0.20");
  assert.equal(tenCents + twentyCents, 30);
  assert.equal(finance.formatMoney(tenCents + twentyCents), "₹0.30");
  assert.equal(finance.parseMoneyToCents("0.201"), null);
  assert.equal(finance.parseMoneyToCents("1e3"), null);
});

test("zero-income periods have no savings rate and posted summaries exclude future records", () => {
  const values = [transaction({ amountCents: 250 }), transaction({ id: "future", date: "2024-03-16", amountCents: 9_000 })];
  const totals = finance.summarize(values, referenceDate);
  assert.equal(totals.incomeCents, 0);
  assert.equal(totals.expenseCents, 250);
  assert.equal(totals.balanceCents, -250);
  assert.equal(totals.savingsRate, null);
});

test("maximum supported amounts remain finite and non-finite formatting is guarded", () => {
  assert.equal(finance.parseMoneyToCents("10000000.00"), finance.MAX_AMOUNT_CENTS);
  assert.equal(finance.parseMoneyToCents("10000000.01"), null);
  assert.equal(finance.parseMoneyToCents("999999999999999999999999999999"), null);
  const totals = finance.summarize([
    transaction({ id: "income", type: "income", category: "Income", amountCents: 1 }),
    transaction({ id: "expense", amountCents: finance.MAX_AMOUNT_CENTS }),
  ], referenceDate);
  assert.ok(Number.isFinite(totals.balanceCents));
  assert.ok(Number.isFinite(totals.savingsRate));
  assert.equal(finance.formatMoney(Number.POSITIVE_INFINITY), "—");
});

test("invalid optional notes and malformed transaction records are reported, not rendered", () => {
  const result = finance.validateTransactions([
    transaction({ id: "valid", note: "A valid note" }),
    transaction({ id: "object-note", note: { unexpected: true } }),
    { id: "missing-fields" },
  ], referenceDate);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].note, "A valid note");
  assert.equal(result.issues.length, 2);
  assert.ok(result.issues.every((issue) => issue.reason.length > 0));
});

test("corrupted JSON is copied for recovery and never overwritten during load", () => {
  const store = new MemoryStorage();
  const raw = "{this is not json";
  store.values.set(storageApi.FINANCE_STORAGE_KEY, raw);
  const result = storageApi.loadFinanceData(store, referenceDate);
  assert.equal(result.status, "recovery");
  assert.equal(result.requiresRecovery, true);
  assert.equal(store.getItem(storageApi.FINANCE_STORAGE_KEY), raw);
  assert.equal(result.recoverySaved, true);
  assert.ok([...store.values.keys()].some((key) => key.startsWith(storageApi.RECOVERY_KEY_PREFIX)));
});

test("unsupported storage versions are preserved and writes remain gated", () => {
  const store = new MemoryStorage();
  const raw = JSON.stringify({ version: 99, transactions: [], budgets: [] });
  store.values.set(storageApi.FINANCE_STORAGE_KEY, raw);
  const result = storageApi.loadFinanceData(store, referenceDate);
  assert.equal(result.requiresRecovery, true);
  assert.equal(result.transactions.length, 0);
  assert.equal(store.getItem(storageApi.FINANCE_STORAGE_KEY), raw);
  assert.ok(result.recoveryRaw.includes("99"));
});

test("v2 USD ledger migrates to INR only after preserving the original payload", () => {
  const store = new MemoryStorage();
  const original = JSON.stringify({ version: 2, currency: "USD", amountUnit: "cents", transactions: [transaction({ amountCents: 12345 })], budgets: [] });
  store.values.set(storageApi.FINANCE_STORAGE_KEY, original);
  const result = storageApi.loadFinanceData(store, referenceDate);
  assert.equal(result.status, "migrated");
  assert.equal(result.transactions[0].amountCents, 12345);
  assert.match(result.message, /no exchange-rate conversion/);
  const migrated = JSON.parse(store.getItem(storageApi.FINANCE_STORAGE_KEY));
  assert.equal(migrated.version, 3);
  assert.equal(migrated.currency, "INR");
  const recovery = [...store.values.entries()].find(([key]) => key.startsWith(storageApi.RECOVERY_KEY_PREFIX));
  assert.ok(recovery);
  assert.equal(JSON.parse(recovery[1]).raw, original);
});

test("failed INR currency migration leaves v2 payload recoverable and gates writes", () => {
  const store = new MemoryStorage();
  const original = JSON.stringify({ version: 2, currency: "USD", amountUnit: "cents", transactions: [transaction()], budgets: [] });
  store.values.set(storageApi.FINANCE_STORAGE_KEY, original);
  store.failPrefix = storageApi.FINANCE_STORAGE_KEY;
  const result = storageApi.loadFinanceData(store, referenceDate);
  assert.equal(result.status, "recovery");
  assert.equal(result.requiresRecovery, true);
  assert.equal(store.getItem(storageApi.FINANCE_STORAGE_KEY), original);
  assert.ok([...store.values.keys()].some((key) => key.startsWith(storageApi.RECOVERY_KEY_PREFIX)));
});

test("legacy v1 data migrates safely to cents after retaining originals", () => {
  const store = new MemoryStorage();
  const txRaw = JSON.stringify([{ id: "old-tx", name: "Old item", category: "Food & drink", date: "2024-02-29", amount: 0.1, type: "expense", note: "kept" }]);
  const budgetRaw = JSON.stringify([{ id: "old-budget", category: "Food & drink", amount: 0.3 }]);
  store.values.set(storageApi.LEGACY_TRANSACTION_KEY, txRaw);
  store.values.set(storageApi.LEGACY_BUDGET_KEY, budgetRaw);
  const result = storageApi.loadFinanceData(store, referenceDate);
  assert.equal(result.status, "migrated");
  assert.equal(result.transactions[0].amountCents, 10);
  assert.equal(result.transactions[0].note, "kept");
  assert.equal(result.budgets[0].limitCents, 30);
  assert.equal(store.getItem(storageApi.LEGACY_TRANSACTION_KEY), txRaw);
  assert.equal(store.getItem(storageApi.LEGACY_BUDGET_KEY), budgetRaw);
  assert.ok(store.writes.indexOf(storageApi.FINANCE_STORAGE_KEY) > store.writes.findIndex((key) => key.startsWith(storageApi.RECOVERY_KEY_PREFIX)));
});

test("failed persistence leaves the previous envelope untouched", () => {
  const store = new MemoryStorage();
  const original = currentEnvelope([transaction()]);
  store.values.set(storageApi.FINANCE_STORAGE_KEY, original);
  store.failPrefix = storageApi.FINANCE_STORAGE_KEY;
  assert.throws(() => storageApi.saveFinanceData(store, { transactions: [], budgets: [] }, referenceDate), /Could not save/);
  assert.equal(store.getItem(storageApi.FINANCE_STORAGE_KEY), original);
});

test("legacy migration stops when its recovery copy cannot be written", () => {
  const store = new MemoryStorage();
  store.values.set(storageApi.LEGACY_TRANSACTION_KEY, JSON.stringify([]));
  store.values.set(storageApi.LEGACY_BUDGET_KEY, JSON.stringify([]));
  store.failPrefix = storageApi.RECOVERY_KEY_PREFIX;
  const result = storageApi.loadFinanceData(store, referenceDate);
  assert.equal(result.requiresRecovery, true);
  assert.equal(store.getItem(storageApi.FINANCE_STORAGE_KEY), null);
  assert.notEqual(store.getItem(storageApi.LEGACY_TRANSACTION_KEY), null);
});

test("invalid future records remain in the recovery payload while valid rows are salvageable", () => {
  const store = new MemoryStorage();
  const raw = currentEnvelope([transaction({ id: "valid" }), transaction({ id: "future", date: "2024-03-16" })], []);
  store.values.set(storageApi.FINANCE_STORAGE_KEY, raw);
  const result = storageApi.loadFinanceData(store, referenceDate);
  assert.equal(result.transactions.length, 1);
  assert.equal(result.requiresRecovery, true);
  assert.equal(result.recoveryRaw, raw);
  assert.equal(store.getItem(storageApi.FINANCE_STORAGE_KEY), raw);
});

test("one-sided legacy storage is not guessed or migrated", () => {
  const store = new MemoryStorage();
  store.values.set(storageApi.LEGACY_TRANSACTION_KEY, JSON.stringify([]));
  const result = storageApi.loadFinanceData(store, referenceDate);
  assert.equal(result.requiresRecovery, true);
  assert.equal(result.budgets.length, 0);
  assert.equal(store.getItem(storageApi.FINANCE_STORAGE_KEY), null);
  assert.ok(result.issues.some((issue) => issue.reason.includes("Only one legacy dataset")));
});

test("browser storage read failures are not treated as empty and do not trigger writes", () => {
  const store = new MemoryStorage(); store.failGet = true;
  const result = storageApi.loadFinanceData(store, referenceDate);
  assert.equal(result.status, "unavailable");
  assert.equal(result.requiresRecovery, true);
  assert.equal(store.writes.length, 0);
});

test("budget comparisons stay exact at and one cent above the limit", () => {
  const budget = { id: "budget-food", category: "Food & drink", limitCents: 30 };
  const exact = [transaction({ id: "a", amountCents: 10 }), transaction({ id: "b", amountCents: 20 })];
  const above = [...exact, transaction({ id: "c", amountCents: 1 })];
  const exactSpent = finance.sumMoneyCents(exact.map((row) => row.amountCents));
  const aboveSpent = finance.sumMoneyCents(above.map((row) => row.amountCents));
  assert.equal(exactSpent - budget.limitCents, 0);
  assert.equal(aboveSpent - budget.limitCents, 1);
  assert.equal(finance.makeInsights(exact, [budget], exact, "March 2024", referenceDate).some((item) => item.title.includes("over its monthly budget")), false);
  assert.equal(finance.makeInsights(above, [budget], above, "March 2024", referenceDate).some((item) => item.title.includes("over its monthly budget")), true);
});

test("Supabase row adapters validate stored records and preserve integer paise", () => {
  const row = { source_id: "stable-id", name: "Lunch", category: "Food & drink", transaction_date: "2024-03-10", amount_cents: 30, type: "expense", note: null, payment_method: null };
  assert.equal(repository.transactionFromRow(row).amountCents, 30);
  assert.throws(() => repository.transactionFromRow({ ...row, amount_cents: "NaN" }), /invalid amount/i);
  assert.throws(() => repository.transactionFromRow({ ...row, transaction_date: "2099-01-01" }), /malformed transaction/i);
  assert.throws(() => repository.transactionFromRow({ ...row, note: { unsafe: true } }), /malformed transaction/i);
});

test("Supabase repository scopes reads to the authenticated user and surfaces query failures", async () => {
  const ownerFilters = [];
  const makeClient = (failure = false) => ({
    from(table) {
      const result = { data: [], error: failure && table === "finance_transactions" ? new Error("offline") : null };
      const query = {
        select() { return this; },
        eq(column, value) { ownerFilters.push([table, column, value]); return this; },
        order() { return this; },
        range() { return Promise.resolve(result); },
        then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
      };
      return query;
    },
  });
  const snapshot = await repository.fetchFinanceData(makeClient(), "account-user-a");
  assert.deepEqual(snapshot, { transactions: [], budgets: [] });
  assert.deepEqual(ownerFilters, [["finance_transactions", "user_id", "account-user-a"], ["finance_budgets", "user_id", "account-user-a"]]);
  await assert.rejects(repository.fetchFinanceData(makeClient(true), "account-user-a"), /could not be loaded/i);
});

test("local migration is explicit-data only, verified, and retry-safe", async () => {
  const state = { finance_transactions: [], finance_budgets: [] };
  const client = {
    from(table) {
      let filters = {};
      let operation = "select";
      let payload;
      const result = () => {
        if (operation === "select") return { data: state[table].filter((row) => Object.entries(filters).every(([key, value]) => row[key] === value)), error: null };
        const records = Array.isArray(payload) ? payload : [payload];
        for (const record of records) {
          if (table === "finance_transactions" && state[table].some((row) => row.user_id === record.user_id && row.source_id === record.source_id)) continue;
          if (table === "finance_budgets" && state[table].some((row) => row.user_id === record.user_id && row.category === record.category)) return { data: null, error: new Error("duplicate category") };
          state[table].push({ id: `db-${state[table].length}`, created_at: "2024-03-01T00:00:00Z", updated_at: "2024-03-01T00:00:00Z", ...record });
        }
        return { data: null, error: null };
      };
      const query = {
        select() { operation = "select"; return this; },
        eq(key, value) { filters[key] = value; return this; },
        order() { return this; },
        range() { return Promise.resolve(result()); },
        upsert(value) { operation = "upsert"; payload = value; return this; },
        insert(value) { operation = "insert"; payload = value; return this; },
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
      };
      return query;
    },
  };
  const preview = { transactions: [transaction()], budgets: [{ id: "budget-food", category: "Food & drink", limitCents: 5000 }], status: "loaded", issues: [], recoveryRaw: "original backup", recoverySaved: true, requiresRecovery: false, message: "" };
  const first = await repository.migrateLocalFinanceData(client, "account-user-a", preview, false);
  const second = await repository.migrateLocalFinanceData(client, "account-user-a", preview, false);
  assert.equal(first.verified, true);
  assert.equal(first.importedTransactions, 1);
  assert.equal(first.importedBudgets, 1);
  assert.equal(second.duplicateTransactions, 1);
  assert.equal(second.duplicateBudgets, 1);
  assert.equal(state.finance_transactions.length, 1);
  assert.equal(state.finance_budgets.length, 1);
  assert.equal(preview.recoveryRaw, "original backup");
});

function assistantDraft(overrides = {}) {
  return { type: "expense", amount: "0.30", currency: "INR", category: "Food & drink", merchant: "Lunch", date: "2024-03-15", paymentMethod: "", confidence: 0.9, needsClarification: false, ...overrides };
}
function minimalAssistantContext() {
  return { currency: "INR", periodLabel: "March 2024", referenceDate: "2024-03-15", period: { incomeCents: 0, expenseCents: 0, balanceCents: 0, savingsRate: null }, allTime: { incomeCents: 0, expenseCents: 0, balanceCents: 999999999 }, categories: [], budgets: [], transactions: [] };
}
function liveAssistantContext(overrides = {}) {
  const today = finance.localDateString(new Date());
  return { currency: "INR", referenceDate: today, periodRange: { ...finance.getDateRange("this-month", new Date()), end: today }, allTime: { incomeCents: 0, expenseCents: 0, balanceCents: 999999999 }, ...overrides };
}

test("assistant drafts validate cents, currency, and posted dates before ledger writes", () => {
  assert.equal(assistant.validateAssistantDraft(assistantDraft(), referenceDate).amountCents, 30);
  assert.equal(assistant.validateAssistantDraft(assistantDraft({ amount: "0.10" }), referenceDate).amountCents, 10);
  assert.match(assistant.validateAssistantDraft(assistantDraft({ currency: "USD" }), referenceDate).error, /uses INR/);
  assert.match(assistant.validateAssistantDraft(assistantDraft({ date: "2024-03-16" }), referenceDate).error, /cannot be dated after/);
  assert.equal(assistant.validateAssistantDraft(assistantDraft({ amount: "10000000.01" }), referenceDate).valid, false);
});

test("assistant response validation rejects malformed optional fields and unsafe correction shapes", () => {
  assert.equal(assistant.isAssistantResponse({ reply: "ok", transactions: [], correction: null, receipt: null }), true);
  assert.equal(assistant.isAssistantResponse({ reply: "ok", transactions: [{ ...assistantDraft(), merchant: "x".repeat(121) }], correction: null, receipt: null }), false);
  assert.equal(assistant.isAssistantResponse({ reply: "ok", transactions: [], correction: { action: "delete", transactionId: "x", amount: 4, category: null, date: null, name: null, paymentMethod: null, needsClarification: false }, receipt: null }), false);
});

test("assistant request context sends only finance data needed by the current intent", () => {
  const context = { ...minimalAssistantContext(), period: { incomeCents: 5000, expenseCents: 1700, balanceCents: 3300, savingsRate: 66 }, categories: [{ category: "Food & drink", amountCents: 1700 }], budgets: [{ category: "Food & drink", limitCents: 3000, spentCents: 1700, remainingCents: 1300 }], transactions: [transaction()] };
  const entry = assistant.selectAssistantContext(context, "I spent ₹14 on lunch");
  assert.equal(entry.transactions, undefined);
  assert.equal(entry.period, undefined);
  const correction = assistant.selectAssistantContext(context, "Change yesterday's lunch transaction");
  assert.equal(correction.transactions.length, 1);
  assert.equal(correction.budgets, undefined);
});

test("assistant API refuses requests without Supabase configuration before contacting OpenAI", async () => {
  const restoreEnv = clearSupabaseTestConfig();
  const previous = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = "test-only";
  const originalFetch = global.fetch; let requested = false;
  global.fetch = async () => { requested = true; throw new Error("unexpected fetch"); };
  try {
    const response = await assistantRoute.POST(new Request("http://localhost/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "chat", message: "How much did I spend?", history: [], context: liveAssistantContext() }) }));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "SUPABASE_NOT_CONFIGURED");
    assert.equal(requested, false);
  } finally { global.fetch = originalFetch; restoreEnv(); if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous; }
});

test("assistant endpoint reports missing API setup without inventing a response", async () => {
  const previous = process.env.OPENAI_API_KEY; delete process.env.OPENAI_API_KEY;
  const restoreEnv = setSupabaseTestConfig(); const restoreClient = mockAuthenticatedSupabase();
  const originalFetch = global.fetch; let requested = false;
  global.fetch = async () => { requested = true; throw new Error("unexpected fetch"); };
  try {
    const status = await assistantRoute.GET();
    assert.equal((await status.json()).configured, false);
    const response = await assistantRoute.POST(new Request("http://localhost/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "chat", message: "hello", history: [], context: liveAssistantContext() }) }));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "AI_NOT_CONFIGURED");
    assert.equal(requested, false);
  } finally { global.fetch = originalFetch; restoreClient(); restoreEnv(); if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous; }
});

test("assistant upload rejects unsupported file bytes before provider access", async () => {
  const previous = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = "test-only";
  const restoreEnv = setSupabaseTestConfig(); const restoreClient = mockAuthenticatedSupabase();
  const originalFetch = global.fetch; let requested = false;
  global.fetch = async () => { requested = true; throw new Error("unexpected fetch"); };
  try {
    const form = new FormData(); form.set("file", new Blob(["not-a-receipt"], { type: "text/plain" }), "invoice.txt");
    const context = liveAssistantContext(); form.set("referenceDate", context.referenceDate); form.set("context", JSON.stringify(context));
    const response = await assistantRoute.POST(new Request("http://localhost/api/assistant", { method: "POST", body: form }));
    assert.equal(response.status, 415);
    assert.equal((await response.json()).code, "UNSUPPORTED_FILE");
    assert.equal(requested, false);
  } finally { global.fetch = originalFetch; restoreClient(); restoreEnv(); if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous; }
});

test("text entry proposals pass through structured server output for review, not direct saving", async () => {
  const previous = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = "test-only-key";
  const restoreEnv = setSupabaseTestConfig(); const restoreClient = mockAuthenticatedSupabase();
  const originalFetch = global.fetch; let outbound;
  const structured = { reply: "Review these two entries before saving.", transactions: [assistantDraft(), assistantDraft({ type: "income", amount: "25000.00", category: "Income", merchant: "Salary" })], correction: null, receipt: null };
  global.fetch = async (url, init) => { outbound = { url, init, payload: JSON.parse(init.body) }; return Response.json({ status: "completed", output_text: JSON.stringify(structured) }); };
  try {
    const response = await assistantRoute.POST(new Request("http://localhost/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "chat", message: "I spent ₹0.30 on lunch and received ₹25,000 salary", history: [], context: { currency: "INR", referenceDate: "2024-03-15" } }) }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).transactions.length, 2);
    assert.equal(outbound.url, "https://api.openai.com/v1/responses");
    assert.equal(outbound.payload.store, false);
    assert.equal(outbound.init.headers.Authorization, "Bearer test-only-key");
    assert.equal(outbound.payload.text.format.strict, true);
    assert.ok(!JSON.stringify(outbound.payload.input).includes("999999999"));
    assert.ok(!JSON.stringify(outbound.payload.input).includes("999999999"));
  } finally { global.fetch = originalFetch; restoreClient(); restoreEnv(); if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous; }
});

test("a valid receipt is forwarded for extraction and returns an editable draft without storing the file", async () => {
  const previous = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = "test-only-key";
  const restoreEnv = setSupabaseTestConfig(); const restoreClient = mockAuthenticatedSupabase();
  const originalFetch = global.fetch; let outbound;
  const structured = { reply: "Review the extracted total.", transactions: [assistantDraft({ amount: "12.50", merchant: "Corner Cafe" })], correction: null, receipt: { isReceipt: true, merchant: "Corner Cafe", total: "12.50", currency: "INR", date: "2024-03-15", tax: "0.90", items: [{ name: "Lunch", amount: "11.60", category: "Food & drink" }], warnings: [] } };
  global.fetch = async (_url, init) => { outbound = JSON.parse(init.body); return Response.json({ status: "completed", output_text: JSON.stringify(structured) }); };
  try {
    const form = new FormData(); form.set("file", new Blob([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: "image/png" }), "receipt.png");
    const context = liveAssistantContext(); form.set("referenceDate", context.referenceDate); form.set("context", JSON.stringify({ currency: "INR", referenceDate: context.referenceDate }));
    const response = await assistantRoute.POST(new Request("http://localhost/api/assistant", { method: "POST", body: form }));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.receipt.total, "12.50");
    assert.equal(result.transactions[0].merchant, "Corner Cafe");
    assert.equal(outbound.store, false);
    assert.ok(JSON.stringify(outbound.input).includes("input_image"));
  } finally { global.fetch = originalFetch; restoreClient(); restoreEnv(); if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous; }
});

test("assistant provider failures return a safe retry error without provider details", async () => {
  const previous = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = "test-only-key";
  const restoreEnv = setSupabaseTestConfig(); const restoreClient = mockAuthenticatedSupabase();
  const originalFetch = global.fetch;
  global.fetch = async () => Response.json({ error: { message: "secret account detail" } }, { status: 500 });
  try {
    const response = await assistantRoute.POST(new Request("http://localhost/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "chat", message: "analyze", history: [], context: { currency: "INR", referenceDate: "2024-03-15", periodLabel: "March", period: { incomeCents: 1, expenseCents: 1, balanceCents: 0, savingsRate: 0 } } }) }));
    assert.equal(response.status, 502);
    assert.equal(JSON.stringify(await response.json()).includes("secret account detail"), false);
  } finally { global.fetch = originalFetch; restoreClient(); restoreEnv(); if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous; }
});

test("recurring detection requires three consistently spaced expense records", () => {
  const rows = ["2024-01-15", "2024-02-15", "2024-03-15"].map((date, index) => ({ ...transaction({ id: `rent-${index}`, date, amountCents: 150000 }), name: "Studio rent", category: "Housing" }));
  assert.deepEqual(intelligence.detectRecurringExpenses(rows, referenceDate), [{ name: "Studio rent", category: "Housing", amountCents: 150000, frequency: "monthly", occurrences: 3, lastDate: "2024-03-15", nextExpectedDate: "2024-04-15" }]);
  assert.deepEqual(intelligence.detectRecurringExpenses(rows.slice(0, 2), referenceDate), []);
  assert.deepEqual(intelligence.detectRecurringExpenses(rows.map((row, index) => ({ ...row, date: ["2024-01-01", "2024-01-22", "2024-03-15"][index] })), referenceDate), []);
  assert.deepEqual(intelligence.detectRecurringExpenses([...rows, { ...rows[2], id: "future", date: "2024-03-16" }], referenceDate)[0].occurrences, 3);
});

test("spend pace is a bounded explicit estimate and requires adequate current-month activity", () => {
  const rows = Array.from({ length: 5 }, (_, index) => transaction({ id: `pace-${index}`, date: `2024-03-${String(index + 1).padStart(2, "0")}`, amountCents: 100 }));
  assert.equal(intelligence.estimateCurrentMonthSpend([...rows, transaction({ id: "future-pace", date: "2024-03-16", amountCents: 5000 })], referenceDate).projectedExpenseCents, 1033);
  assert.equal(intelligence.estimateCurrentMonthSpend(rows.slice(0, 4), referenceDate), null);
  assert.equal(intelligence.estimateCurrentMonthSpend(rows, new Date(2024, 2, 5, 12)), null);
});

