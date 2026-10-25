"use client";

import dynamic from "next/dynamic";
import LocalMigrationPanel from "@/components/local-migration-panel";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Activity, ArrowDownLeft, ArrowUpRight, Bell, CalendarDays, Check, ChevronDown, CircleHelp, Command, CreditCard, Gauge, LayoutDashboard, ListFilter, LogOut, Menu, Pencil, Plus, RotateCcw, Search, Settings2, Sparkles, Trash2, Wallet, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Budget, CATEGORY_META, Category, CATEGORIES, CURRENCY, DEMO_BUDGETS, ExpenseCategory, formatMoney, centsToInput, getBudgetMonth, getDateRange, getPostedDateError, isInDateRange, isPostedDate, localDateString, makeDemoTransactions, makeInsights, MAX_AMOUNT_CENTS, MAX_TEXT_LENGTH, parseMoneyToCents, PeriodKey, PERIODS, summarize, Transaction, buildChartSeries, categoryTotals, sumMoneyCents, validateTransactions } from "@/lib/finance";
import { FinanceLoadResult, loadFinanceData, FINANCE_STORAGE_KEY, LEGACY_TRANSACTION_KEY, LEGACY_BUDGET_KEY } from "@/lib/storage";
import FinanceAssistant from "@/components/finance-assistant";
import ThemeSwitcher from "@/components/theme-switcher";
import { useTheme } from "@/components/theme-provider";
import FinancialOutlook from "@/components/financial-outlook";
import { AssistantCorrection, AssistantDraft, validateAssistantDraft } from "@/lib/assistant";
import { createClient } from "@/lib/supabase/client";
import { fetchFinanceData, insertTransaction, updateTransaction, deleteTransaction as deleteRemoteTransaction, saveBudget as saveRemoteBudget, deleteBudget as deleteRemoteBudget, replaceFinanceData, migrateLocalFinanceData, type MigrationResult } from "@/lib/finance-repository";

const PlanetScene = dynamic(() => import("@/app/planet-scene"), { ssr: false, loading: () => <div className="planet-fallback" aria-label="Loading interactive financial planet"><div className="fallback-orbit"><div className="fallback-planet" /></div></div> });
const dateLabel = (date: string) => {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });
};
const newId = (prefix: string) => globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

type Dialog = { kind: "transaction"; type: "income" | "expense"; transaction?: Transaction } | { kind: "budget"; budget?: Budget } | null;
type TxTypeFilter = "all" | "income" | "expense";
type PageTab = "dashboard" | "transactions" | "budgets" | "analytics";
const PAGE_TABS: { id: PageTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "transactions", label: "Transactions", icon: CreditCard },
  { id: "budgets", label: "Budgets", icon: Gauge },
  { id: "analytics", label: "Analytics", icon: Activity },
];

type DashboardProps = { userId: string; userEmail: string };

export default function Home({ userId, userEmail }: DashboardProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const isSpiderMan = theme === "spider-man";
  const isLight = theme === "light";
  const incomeColor = isSpiderMan ? "#e63946" : isLight ? "#749e32" : "#c5f36c";
  const expenseColor = isSpiderMan ? "#38bdf8" : isLight ? "#e06d53" : "#ff9f84";
  const chartGridColor = isSpiderMan ? "#1c2b48" : isLight ? "#e2e6de" : "#252a27";
  const clientRef = useRef<ReturnType<typeof createClient> | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [periodKey, setPeriodKey] = useState<PeriodKey>("this-month");
  const [ready, setReady] = useState(false);
  const [persistence, setPersistence] = useState<"loading" | "saved" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [migrationPreview, setMigrationPreview] = useState<FinanceLoadResult | null>(null);
  const [migrationBusy, setMigrationBusy] = useState(false);
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const assistantIds = useRef(new Map<string, string>());
  const includesSampleRecords = transactions.some((transaction) => transaction.id.startsWith("demo-"));
  const accountLabel = userEmail.split("@")[0] || "Your account";
  const userInitial = accountLabel.slice(0, 1).toLocaleUpperCase() || "A";
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TxTypeFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [limit, setLimit] = useState(7);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PageTab>("dashboard");
  const [tabDirection, setTabDirection] = useState(1);
  const reduceMotion = useReducedMotion();
  const focusSearchAfterTransition = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const dialogOpen = dialog !== null;
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let active = true;
    const frame = window.requestAnimationFrame(() => {
      try {
        const client = createClient();
        clientRef.current = client;
        try {
          const localExists = [FINANCE_STORAGE_KEY, LEGACY_TRANSACTION_KEY, LEGACY_BUDGET_KEY].some((key) => window.localStorage.getItem(key) !== null);
          if (localExists) {
            const preview = loadFinanceData(window.localStorage, new Date());
            if (preview.status !== "unavailable") setMigrationPreview(preview);
          }
        } catch { setToast("Browser storage could not be checked. Supabase account data will continue to load; local records were not changed."); }
        void fetchFinanceData(client, userId).then((snapshot) => {
          if (!active) return;
          setTransactions(snapshot.transactions);
          setBudgets(snapshot.budgets);
          setPersistence("saved");
          setLoadError("");
        }).catch((error: unknown) => {
          if (!active) return;
          setLoadError(error instanceof Error ? error.message : "Finance data could not be loaded. Retry when your connection is available.");
          setPersistence("error");
        }).finally(() => { if (active) setReady(true); });
      } catch {
        setLoadError("Supabase is not configured. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY, then restart the app.");
        setPersistence("error");
        setReady(true);
      }
    });
    return () => { active = false; window.cancelAnimationFrame(frame); };
  }, [userId, loadAttempt]);
  useEffect(() => {
    let timer = 0;
    const scheduleMidnightUpdate = () => {
      const current = new Date();
      const nextLocalMidnight = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1, 0, 0, 1);
      timer = window.setTimeout(() => {
        setNow(new Date());
        scheduleMidnightUpdate();
      }, Math.max(1000, nextLocalMidnight.getTime() - current.getTime()));
    };
    const refreshIfDateChanged = () => {
      if (document.visibilityState !== "visible") return;
      const current = new Date();
      setNow((previous) => localDateString(previous) === localDateString(current) ? previous : current);
    };
    scheduleMidnightUpdate();
    document.addEventListener("visibilitychange", refreshIfDateChanged);
    return () => { window.clearTimeout(timer); document.removeEventListener("visibilitychange", refreshIfDateChanged); };
  }, []);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 3800); return () => window.clearTimeout(timer); }, [toast]);
  useEffect(() => {
    if (!dialogOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => dialogRef.current?.querySelector<HTMLElement>("input, select, button")?.focus(), 0);
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setDialog(null); }
      if (event.key === "Tab" && dialogRef.current) {
        const elements = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]')];
        if (!elements.length) return;
        const first = elements[0]; const last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.clearTimeout(timer); window.removeEventListener("keydown", onKey); previous?.focus(); };
  }, [dialogOpen]);
  const navigateTab = useCallback((tab: PageTab) => {
    const currentIndex = PAGE_TABS.findIndex((item) => item.id === activeTab);
    const nextIndex = PAGE_TABS.findIndex((item) => item.id === tab);
    if (tab !== activeTab) setTabDirection(nextIndex >= currentIndex ? 1 : -1);
    setActiveTab(tab); setMobileNav(false);
    window.scrollTo({ top: 0, behavior: reduceMotion ? "instant" : "smooth" });
  }, [activeTab, reduceMotion]);
  const openTransactionSearch = useCallback(() => {
    if (activeTab === "transactions") { document.getElementById("transaction-search")?.focus(); return; }
    focusSearchAfterTransition.current = true;
    navigateTab("transactions");
  }, [activeTab, navigateTab]);
  useEffect(() => {
    const shortcut = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); openTransactionSearch();
      }
    };
    window.addEventListener("keydown", shortcut); return () => window.removeEventListener("keydown", shortcut);
  }, [openTransactionSearch]);

  const range = useMemo(() => getDateRange(periodKey, now), [periodKey, now]);
  const periodTransactions = useMemo(() => transactions.filter((item) => isInDateRange(item.date, range, now)), [transactions, range, now]);
  const allTimeTotals = useMemo(() => summarize(transactions, now), [transactions, now]);
  const periodTotals = useMemo(() => summarize(periodTransactions, now), [periodTransactions, now]);
  const chartData = useMemo(() => buildChartSeries(periodTransactions, range, now), [periodTransactions, range, now]);
  const categoryData = useMemo(() => categoryTotals(periodTransactions, now), [periodTransactions, now]);
  const budgetMonth = getBudgetMonth(periodKey, now);
  const budgetTransactions = useMemo(() => transactions.filter((item) => isPostedDate(item.date, now) && item.date.slice(0, 7) === budgetMonth), [transactions, budgetMonth, now]);
  const insights = useMemo(() => makeInsights(periodTransactions, budgets, budgetTransactions, range.label, now), [periodTransactions, budgets, budgetTransactions, range.label, now]);

  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return [...periodTransactions].filter((item) => {
      const textMatch = `${item.name} ${item.category}`.toLocaleLowerCase().includes(normalizedQuery);
      const typeMatch = typeFilter === "all" || item.type === typeFilter;
      const categoryMatch = categoryFilter === "all" || item.category === categoryFilter;
      return textMatch && typeMatch && categoryMatch;
    }).sort((a, b) => {
      if (sort === "oldest") return a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
      if (sort === "highest") return b.amountCents - a.amountCents || b.date.localeCompare(a.date);
      if (sort === "lowest") return a.amountCents - b.amountCents || b.date.localeCompare(a.date);
      return b.date.localeCompare(a.date) || b.id.localeCompare(a.id);
    });
  }, [periodTransactions, query, typeFilter, categoryFilter, sort]);

  const openDialog = (next: Dialog) => setDialog(next);
  const downloadLocalBackup = () => {
    if (!migrationPreview) { setToast("No local finance backup was found."); return; }
    const payload = migrationPreview.recoveryRaw ?? JSON.stringify({ version: 3, currency: CURRENCY, amountUnit: "cents", transactions: migrationPreview.transactions, budgets: migrationPreview.budgets }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "spendsense-local-backup.json"; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast("Local backup downloaded. It remains in this browser until you remove it yourself.");
  };
  const migrateLocal = async (includeSample: boolean) => {
    if (!migrationPreview || migrationBusy || !clientRef.current) return;
    const validTransactions = migrationPreview.transactions.filter((row) => includeSample || !row.id.startsWith("demo-"));
    const demoBudgetIds = new Set(CATEGORIES.map((category) => `budget-${category.toLowerCase().replaceAll(" ", "-")}`));
    const validBudgets = migrationPreview.budgets.filter((row) => includeSample || !demoBudgetIds.has(row.id));
    if (!window.confirm(`Import ${validTransactions.length} transaction${validTransactions.length === 1 ? "" : "s"} and ${validBudgets.length} budget${validBudgets.length === 1 ? "" : "s"} into ${userEmail || "this signed-in account"}? Existing local data will stay in this browser as a backup.`)) return;
    setMigrationBusy(true);
    try {
      const result = await migrateLocalFinanceData(clientRef.current, userId, migrationPreview, includeSample);
      const refreshed = await fetchFinanceData(clientRef.current, userId);
      setTransactions(refreshed.transactions); setBudgets(refreshed.budgets); setMigrationResult(result);
      setToast(result.verified ? `Verified ${result.importedTransactions} transactions and ${result.importedBudgets} budgets in this account. Local data was kept.` : `Imported ${result.importedTransactions} transactions and ${result.importedBudgets} budgets; ${result.failedRecords} need retry. Local data was kept.`);
    } catch (error) { setToast(error instanceof Error ? error.message : "Local finance data could not be migrated. The browser copy was not changed."); }
    finally { setMigrationBusy(false); }
  };
  const retryLoad = () => { setLoadError(""); setReady(false); setPersistence("loading"); setLoadAttempt((value) => value + 1); };
  const signOut = async () => {
    if (!clientRef.current || saving) return;
    setSaving(true);
    try {
      const { error } = await clientRef.current.auth.signOut();
      if (error) { setToast("Sign out did not complete. Retry when your connection is available."); return; }
      router.replace("/auth"); router.refresh();
    } catch { setToast("Sign out did not complete. Retry when your connection is available."); }
    finally { setSaving(false); }
  };
  const addTransaction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (saving) return;
    const form = event.currentTarget; const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim(); const amountCents = parseMoneyToCents(String(data.get("amount") ?? ""));
    const category = String(data.get("category")) as Category; const date = String(data.get("date") ?? "");
    const dateError = getPostedDateError(date, now);
    if (!name || name.length > MAX_TEXT_LENGTH || amountCents === null || !date || dateError) {
      setToast(dateError ?? `Enter a description and amount with up to two decimals, from ${formatMoney(1)} to ${formatMoney(MAX_AMOUNT_CENTS)}.`); return;
    }
    if (dialog?.kind !== "transaction") return;
    if (!clientRef.current) { setToast("Your account connection is unavailable. No changes were saved."); return; }
    setSaving(true);
    const item: Transaction = dialog.transaction
      ? { ...dialog.transaction, name, amountCents, date, category, type: dialog.type }
      : { id: newId("transaction"), name, amountCents, date, category, type: dialog.type };
    try {
      const saved = dialog.transaction ? await updateTransaction(clientRef.current, userId, item) : await insertTransaction(clientRef.current, userId, item);
      setTransactions((current) => dialog.transaction ? current.map((row) => row.id === saved.id ? saved : row) : [saved, ...current]);
      setPersistence("saved"); setLimit((value) => Math.max(value, 7)); setDialog(null);
      setToast(`Transaction ${dialog.transaction ? "updated" : "saved"}. Your totals and insights are updated.`);
    } catch (error) { setToast(error instanceof Error ? error.message : "Transaction could not be saved. Your account was not changed."); }
    finally { setSaving(false); }
  };
  const removeTransaction = async (item: Transaction) => {
    if (saving || !window.confirm(`Delete “${item.name}”? This cannot be undone.`)) return;
    if (!clientRef.current) { setToast("Your account connection is unavailable. No changes were made."); return; }
    setSaving(true);
    try { await deleteRemoteTransaction(clientRef.current, userId, item.id); setTransactions((current) => current.filter((row) => row.id !== item.id)); setPersistence("saved"); setToast("Transaction deleted. Dashboard totals have been updated."); }
    catch (error) { setToast(error instanceof Error ? error.message : "Transaction could not be deleted. No changes were made."); }
    finally { setSaving(false); }
  };
  const saveBudget = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (saving || dialog?.kind !== "budget") return;
    const data = new FormData(event.currentTarget); const category = String(data.get("category")) as ExpenseCategory; const limitCents = parseMoneyToCents(String(data.get("amount") ?? ""));
    if (!CATEGORIES.includes(category) || limitCents === null) { setToast(`Choose a spending category and enter a monthly limit from ${formatMoney(1)} to ${formatMoney(MAX_AMOUNT_CENTS)} with at most two decimals.`); return; }
    if (!dialog.budget && budgets.some((item) => item.category === category)) { setToast("A budget already exists for that category. Edit its existing limit."); return; }
    if (!clientRef.current) { setToast("Your account connection is unavailable. No changes were saved."); return; }
    setSaving(true);
    const budget: Budget = dialog.budget ? { ...dialog.budget, category, limitCents } : { id: newId("budget"), category, limitCents };
    try {
      const saved = await saveRemoteBudget(clientRef.current, userId, budget, Boolean(dialog.budget));
      setBudgets((current) => dialog.budget ? current.map((row) => row.id === saved.id ? saved : row) : [...current, saved]);
      setPersistence("saved"); setDialog(null); setToast("Monthly budget saved to your account.");
    } catch (error) { setToast(error instanceof Error ? error.message : "Budget could not be saved. No changes were made."); }
    finally { setSaving(false); }
  };
  const deleteBudget = async (budget: Budget) => {
    if (saving || !window.confirm(`Delete the ${budget.category} budget? Transaction history will remain.`)) return;
    if (!clientRef.current) { setToast("Your account connection is unavailable. No changes were made."); return; }
    setSaving(true);
    try { await deleteRemoteBudget(clientRef.current, userId, budget.id); setBudgets((current) => current.filter((row) => row.id !== budget.id)); setPersistence("saved"); setToast("Budget deleted from your account."); }
    catch (error) { setToast(error instanceof Error ? error.message : "Budget could not be deleted. No changes were made."); }
    finally { setSaving(false); }
  };
  const saveAssistantTransactions = async (drafts: AssistantDraft[]) => {
    if (saving || !clientRef.current) return { ok: false, message: "Your account is not ready to save transactions. Please retry." };
    const created: Transaction[] = [];
    setSaving(true);
    try {
    for (const draft of drafts) {
      const checked = validateAssistantDraft(draft, now);
      if (!checked.valid) return { ok: false, message: checked.error };
      const key = JSON.stringify(draft);
      let id = assistantIds.current.get(key);
      if (!id) { id = newId("transaction"); assistantIds.current.set(key, id); }
      created.push({ id, name: draft.merchant.trim(), category: draft.category, date: draft.date, amountCents: checked.amountCents, type: draft.type, ...(draft.paymentMethod.trim() ? { paymentMethod: draft.paymentMethod.trim() } : {}) });
    }
    const alreadyStored = created.filter((row) => transactions.some((existing) => existing.id === row.id));
    const pending = created.filter((row) => !transactions.some((existing) => existing.id === row.id));
    const validation = validateTransactions([...pending, ...transactions], now);
    if (!validation.valid) return { ok: false, message: "The proposed entries did not pass ledger validation. No records were saved." };
    const saved: Transaction[] = [...alreadyStored];
    for (const item of pending) {
      try { saved.push(await insertTransaction(clientRef.current, userId, item)); }
      catch { break; }
    }
    if (saved.length) { setTransactions((current) => [...saved.filter((row) => !current.some((existing) => existing.id === row.id)), ...current]); setPersistence("saved"); setLimit((value) => Math.max(value, 7)); }
    const complete = saved.length === created.length;
    const message = complete ? `${saved.length} transaction${saved.length === 1 ? "" : "s"} saved to your account. Balances, charts, budgets, and insights are updated.` : `${saved.length} of ${created.length} transactions were saved. Retry the remaining review; successful entries will not be duplicated.`;
    setToast(message);
    return { ok: complete, message };
    } finally { setSaving(false); }
  };
  const correctAssistantTransaction = async (correction: AssistantCorrection) => {
    if (saving || !clientRef.current) return { ok: false, message: "Your account is not ready to change transactions. Please retry." };
    if (correction.amount !== null && correction.currency !== CURRENCY) return { ok: false, message: `This ledger uses ${CURRENCY}. The proposed ${correction.currency ?? "unspecified currency"} amount was not converted or applied.` };
    const original = transactions.find((item) => item.id === correction.transactionId);
    if (!original) return { ok: false, message: "That transaction is no longer available. No changes were made." };
    const nextTransactions = correction.action === "delete"
      ? transactions.filter((item) => item.id !== original.id)
      : transactions.map((item) => item.id === original.id ? {
        ...item,
        ...(correction.amount !== null ? { amountCents: parseMoneyToCents(correction.amount) ?? -1 } : {}),
        ...(correction.category !== null ? { category: correction.category } : {}),
        ...(correction.date !== null ? { date: correction.date } : {}),
        ...(correction.name !== null ? { name: correction.name.trim() } : {}),
        ...(correction.paymentMethod !== null ? { paymentMethod: correction.paymentMethod.trim() } : {}),
      } : item);
    if (correction.action === "edit") {
      const validation = validateTransactions(nextTransactions, now);
      if (!validation.valid) return { ok: false, message: "The proposed edit is invalid. No changes were made." };
      const updated = validation.records.find((item) => item.id === original.id)!;
      setSaving(true);
      try { const saved = await updateTransaction(clientRef.current, userId, updated); setTransactions((current) => current.map((item) => item.id === saved.id ? saved : item)); setPersistence("saved"); }
      catch (error) { return { ok: false, message: error instanceof Error ? error.message : "The transaction edit failed; no change was saved." }; }
      finally { setSaving(false); }
    } else {
      setSaving(true);
      try { await deleteRemoteTransaction(clientRef.current, userId, original.id); setTransactions((current) => current.filter((item) => item.id !== original.id)); setPersistence("saved"); }
      catch (error) { return { ok: false, message: error instanceof Error ? error.message : "The transaction deletion failed; no change was made." }; }
      finally { setSaving(false); }
    }
    const message = correction.action === "delete" ? `Deleted ${original.name}. Dashboard totals and insights have been recalculated.` : `Updated ${original.name}. Dashboard totals and insights have been recalculated.`;
    setToast(message);
    return { ok: true, message };
  };
  const resetDemo = async () => {
    if (saving || !window.confirm("Restore sample transactions and budgets? This replaces the financial data in your signed-in account.")) return;
    if (!clientRef.current) { setToast("Your account connection is unavailable. No changes were made."); return; }
    setSaving(true);
    try {
      const nextTransactions = makeDemoTransactions(now);
      const refreshed = await replaceFinanceData(clientRef.current, userId, nextTransactions, DEMO_BUDGETS);
      setTransactions(refreshed.transactions); setBudgets(refreshed.budgets); setPersistence("saved"); setPeriodKey("this-month"); setSelectedCategory(null); setQuery(""); setTypeFilter("all"); setCategoryFilter("all"); setLimit(7);
      setToast("Sample data restored to your account.");
    } catch (error) { setToast(error instanceof Error ? error.message : "Sample data could not be restored. Your account was not changed."); }
    finally { setSaving(false); }
  };
  const chooseCategory = (category: string) => { setSelectedCategory(category); setCategoryFilter(category); setLimit(7); navigateTab("transactions"); };
  const clearFilters = () => { setQuery(""); setTypeFilter("all"); setCategoryFilter("all"); setSelectedCategory(null); setSort("newest"); setLimit(7); };
  const exportTransactions = () => {
    if (!visible.length) { setToast("There are no matching transactions to export."); return; }
    const reportWindow = window.open("", "_blank", "width=980,height=720");
    if (!reportWindow) { setToast("Allow pop-ups for SpendSense to print or save this report as a PDF."); return; }
    reportWindow.opener = null;
    const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]!);
    const rows = visible.map((item) => `<tr><td>${escapeHtml(dateLabel(item.date))}</td><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.category)}</td><td>${item.type === "income" ? "Income" : "Expense"}</td><td class="amount ${item.type === "income" ? "income" : ""}">${item.type === "income" ? "+" : "−"}${escapeHtml(formatMoney(item.amountCents))}</td></tr>`).join("");
    reportWindow.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>SpendSense · ${escapeHtml(range.label)} report</title><style>*{box-sizing:border-box}body{margin:0;padding:44px;color:#202820;font:14px/1.5 Inter,Arial,sans-serif}header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #b9df75;padding-bottom:18px;margin-bottom:26px}.brand{font-size:23px;font-weight:700;letter-spacing:-1px}.brand span{color:#719e2c}.muted{color:#697469;font-size:12px}.total{font-size:23px;font-weight:650;font-variant-numeric:tabular-nums}h1{font-size:20px;margin:26px 0 8px}table{width:100%;border-collapse:collapse;margin-top:16px}th{text-align:left;color:#637063;font-size:10px;text-transform:uppercase;letter-spacing:.08em}td,th{padding:11px 8px;border-bottom:1px solid #e5e9e2}td.amount{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.income{color:#548324}footer{margin-top:22px;color:#768075;font-size:11px}@media print{body{padding:14mm}button{display:none}}</style></head><body><header><div><div class="brand">spend<span>sense</span>.</div><div class="muted">Personal finance · ${escapeHtml(range.label)} · INR</div></div><div><div class="muted">${visible.length} transactions</div><div class="total">${escapeHtml(formatMoney(sumMoneyCents(visible.map((item) => item.type === "income" ? item.amountCents : -item.amountCents))))}</div></div></header><h1>Transaction report</h1><div class="muted">Generated ${escapeHtml(now.toLocaleDateString("en-IN", { dateStyle: "long" }))}. Use your browser’s print dialog to save as PDF.</div><table><thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Type</th><th style="text-align:right">Amount</th></tr></thead><tbody>${rows}</tbody></table><footer>SpendSense report · Data remains stored locally on your device.</footer><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250))</script></body></html>`);
    reportWindow.document.close();
    setToast("Report opened. Choose “Save as PDF” in the print dialog.");
  };

  if (!ready) return <main className="app-shell"><div className="dashboard-loading" role="status" aria-live="polite"><span className="live-dot" /> Loading your account data…</div></main>;
  if (loadError) return <main className="app-shell"><section className="storage-recovery" role="alert"><div className="storage-recovery-copy"><strong>Your account data could not be loaded</strong><p>{loadError}</p><p>SpendSense did not treat this failure as an empty account, and no records were changed.</p></div><div className="storage-recovery-actions"><button className="primary-button" onClick={retryLoad}>Retry</button><button className="secondary-button" onClick={() => void signOut()}>Sign out</button></div></section></main>;

  return <main className="app-shell">
    {mobileNav && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
      <a className="brand" href="#home" aria-label="SpendSense home" onClick={(event) => { event.preventDefault(); navigateTab("dashboard"); }}><span className="brand-mark"><Activity size={19} strokeWidth={2.5} /></span><span>spend<span className="brand-light">sense</span></span><span className="brand-dot">.</span></a>
      <button className="sidebar-close icon-button" aria-label="Close navigation" onClick={() => setMobileNav(false)}><X size={18} /></button>
      <div className="workspace-label">WORKSPACE</div>
      <div className="workspace-switch"><span className="workspace-avatar">{userInitial}</span><span className="workspace-name">{accountLabel}<small>Signed-in account</small></span><ChevronDown size={15} /></div>
      <div className="nav-group"><span className="nav-caption">OVERVIEW</span><div className="nav-tabs" role="tablist" aria-orientation="vertical" aria-label="SpendSense sections">{PAGE_TABS.map(({ id, label, icon: Icon }, index) => <button key={id} id={`tab-${id}`} role="tab" aria-selected={activeTab === id} aria-controls="page-tab-panel" tabIndex={activeTab === id ? 0 : -1} className={`nav-item ${activeTab === id ? "active" : ""}`} onClick={() => navigateTab(id)} onKeyDown={(event) => { if (["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(event.key)) { event.preventDefault(); const delta = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1; const next = PAGE_TABS[(index + delta + PAGE_TABS.length) % PAGE_TABS.length]; navigateTab(next.id); document.getElementById(`tab-${next.id}`)?.focus(); } else if (event.key === "Home" || event.key === "End") { event.preventDefault(); const next = event.key === "Home" ? PAGE_TABS[0] : PAGE_TABS[PAGE_TABS.length - 1]; navigateTab(next.id); document.getElementById(`tab-${next.id}`)?.focus(); } }}><Icon size={17} /> {label}{activeTab === id && <span className="nav-active-mark" />}</button>)}</div></div>
      <div className="nav-group nav-group-tools"><span className="nav-caption">PREFERENCES</span><button className="nav-item" onClick={resetDemo}><RotateCcw size={16} /> Reset sample data</button><button className="nav-item" onClick={() => setToast("Your transactions and budgets are stored in your private Supabase account.")}><Settings2 size={17} /> Local data settings</button><button className="nav-item" onClick={() => setToast("Use the date range, category filters, budgets, and transaction search to explore your data.")}><CircleHelp size={17} /> Help</button></div>
      <div className="sidebar-bottom"><div className="upgrade-card"><span className="upgrade-icon"><Sparkles size={15} /></span><strong>A clearer picture.</strong><p>Your financial story, at a glance.</p><button onClick={() => navigateTab("dashboard")}>Explore insights <span aria-hidden="true">↗</span></button></div><div className="profile"><div className="profile-avatar">{userInitial}</div><div className="profile-copy"><strong>{accountLabel}</strong><span>Signed-in account</span></div><button className="icon-button profile-more" aria-label="Sign out" title="Sign out" onClick={() => void signOut()}><LogOut size={18} /></button></div></div>
    </aside>

    <section className="main-column" id="home">
      <header className="topbar"><button className="icon-button mobile-menu" aria-label={mobileNav ? "Close navigation" : "Open navigation"} aria-expanded={mobileNav} onClick={() => setMobileNav((open) => !open)}><Menu size={19} /></button><div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{PAGE_TABS.find((item) => item.id === activeTab)?.label}</strong></div><div className="topbar-actions"><label className="period-pill"><CalendarDays size={14} /><select value={periodKey} onChange={(event) => { setPeriodKey(event.target.value as PeriodKey); setSelectedCategory(null); }} aria-label="Reporting date range">{PERIODS.map((period) => <option key={period.key} value={period.key}>{period.label}</option>)}</select><span className="period-current-label" aria-hidden="true">{PERIODS.find((period) => period.key === periodKey)?.label}</span><ChevronDown size={13} /></label><button className="icon-button top-search" aria-label="Search transactions" onClick={openTransactionSearch}><Search size={17} /></button><button className="icon-button notification-button" aria-label="Account data status" onClick={() => setToast(persistence === "saved" ? "Finance records are saved to your Supabase account." : "Account data is loading.")}><Bell size={17} /></button><ThemeSwitcher className="theme-switcher-dashboard" variant="compact" showSubtitle={false} /><button className="top-avatar auth-account-link" type="button" aria-label="Sign out" title="Sign out" onClick={() => void signOut()}>{userInitial}</button></div></header>

      <div className="content-wrap">
        <div className="page-heading"><div><div className="eyebrow"><span className="live-dot" /> YOUR MONEY, IN FOCUS <span className="sample-badge">{includesSampleRecords ? "SAMPLE DATA" : "PRIVATE ACCOUNT"}</span></div><h1>{activeTab === "dashboard" ? <>Good morning <span className="wave" aria-hidden="true">✳</span></> : PAGE_TABS.find((item) => item.id === activeTab)?.label}</h1><p>{activeTab === "dashboard" ? `Financial snapshot · ${range.label}` : `${activeTab === "budgets" ? monthTitle(budgetMonth) : range.label} · Your ${activeTab} overview`}</p></div><button className="primary-button" onClick={() => openDialog({ kind: "transaction", type: "expense" })}><Plus size={16} strokeWidth={2.5} /> Add transaction</button></div>

        {migrationPreview && <LocalMigrationPanel preview={migrationPreview} result={migrationResult} busy={migrationBusy} onImport={migrateLocal} onDownload={downloadLocalBackup} onDismiss={() => setMigrationPreview(null)} />}

        <div className={`tab-viewport tab-viewport-${activeTab}`}><AnimatePresence initial={false} mode="wait" custom={tabDirection}><motion.div key={activeTab} id="page-tab-panel" role="tabpanel" aria-labelledby={`tab-${activeTab}`} tabIndex={0} className="tab-plane" style={{ transformStyle: "preserve-3d" }} custom={tabDirection} variants={{ enter: (direction: number) => reduceMotion ? { opacity: 0 } : { opacity: 0, x: direction * 76, z: -160, rotateY: direction * 9, scale: .96 }, center: { opacity: 1, x: 0, z: 0, rotateY: 0, scale: 1 }, exit: (direction: number) => reduceMotion ? { opacity: 0 } : { opacity: 0, x: direction * -58, z: -110, rotateY: direction * -7, scale: .975 } }} initial="enter" animate="center" exit="exit" transition={reduceMotion ? { duration: .12 } : { type: "spring", stiffness: 92, damping: 19, mass: .9 }} onAnimationComplete={() => { if (activeTab === "transactions" && focusSearchAfterTransition.current) { focusSearchAfterTransition.current = false; document.getElementById("transaction-search")?.focus(); } }}>
        {activeTab === "dashboard" && <div className="stats-grid">
          <StatCard label="All-time net balance" value={formatMoney(allTimeTotals.balanceCents)} change="Income less expenses across all time" icon={<Wallet size={16} />} tone="lime" />
          <StatCard label="Income in period" value={formatMoney(periodTotals.incomeCents)} change={range.label} icon={<ArrowDownLeft size={16} />} tone="blue" />
          <StatCard label="Expenses in period" value={formatMoney(periodTotals.expenseCents)} change={range.label} icon={<ArrowUpRight size={16} />} tone="peach" />
          <StatCard label="Savings rate" value={periodTotals.savingsRate === null ? "—" : `${Math.round(periodTotals.savingsRate)}%`} change={periodTotals.savingsRate === null ? "No income recorded in range" : "Period net ÷ period income"} icon={<Sparkles size={16} />} tone="violet" />
        </div>}

        {(activeTab === "dashboard" || activeTab === "analytics") && <div className={`hero-grid hero-grid-${activeTab}`}>
          {activeTab === "dashboard" && <section className="panel planet-panel"><div className="panel-heading"><div><span className="section-kicker">YOUR MONEY, IN MOTION</span><h2>Financial orbit</h2></div><button className="icon-button subtle" aria-label="Planet information" onClick={() => setToast("Drag to rotate the planet. Select a category marker to filter transactions.")}><CircleHelp size={16} /></button></div><div className="planet-stage"><div className="planet-glow" /><PlanetScene categoryTotals={categoryData} onSelect={chooseCategory} selectedCategory={selectedCategory} /><div className="planet-center-label"><span>PERIOD NET</span><strong>{formatMoney(periodTotals.balanceCents)}</strong><small>{range.label}</small></div>{categoryData.slice(0, 2).map((item, index) => <button key={item.category} className={`orbit-label orbit-label-${index === 0 ? "a" : "b"}`} onClick={() => chooseCategory(item.category)}><span style={{ background: item.color }} />{item.category} · {formatMoney(item.amountCents)}</button>)}{selectedCategory && <div className="planet-selection" aria-live="polite"><span className="planet-selection-kicker">SELECTED CATEGORY</span><strong>{selectedCategory}</strong><span>{formatMoney(categoryData.find((item) => item.category === selectedCategory)?.amountCents ?? 0)} spent this period</span><button onClick={() => { setSelectedCategory(null); setCategoryFilter("all"); }}>Clear selection</button></div>}</div><div className="planet-legend"><span><i className="legend-lime" /> Spending</span><span><i className="legend-blue" /> Income</span><span className="planet-hint">Drag to explore</span></div></section>}
          {activeTab === "analytics" && <section className="panel chart-panel" id="analytics"><div className="panel-heading"><div><span className="section-kicker">CASH FLOW · {range.label.toUpperCase()}</span><h2>Income vs. expenses</h2></div><span className="select-pill chart-range-label">{chartData.length ? `${chartData.length} ${periodKey === "this-month" || periodKey === "last-month" ? "days" : "months"}` : "No activity"}</span></div><div className="chart-legend"><span><i className="legend-lime" style={{ background: incomeColor }} /> Income</span><span><i className="legend-peach" style={{ background: expenseColor }} /> Expenses</span><span className="chart-net">Net <b>{formatMoney(periodTotals.balanceCents)}</b></span></div><div className="chart-area" role={chartData.length ? "img" : undefined} aria-label={chartData.length ? `Income and expenses in ${range.label}, in Indian rupees` : undefined}>{chartData.length ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 12, right: 5, left: -18, bottom: 0 }}><defs><linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={incomeColor} stopOpacity={0.25} /><stop offset="95%" stopColor={incomeColor} stopOpacity={0} /></linearGradient><linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={expenseColor} stopOpacity={0.2} /><stop offset="95%" stopColor={expenseColor} stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke={chartGridColor} vertical={false} strokeDasharray="3 5" /><XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd" tick={{ fill: "#929a91", fontSize: 10 }} dy={7} /><YAxis tickLine={false} axisLine={false} width={48} domain={[0, "auto"]} tick={{ fill: "#929a91", fontSize: 9 }} tickFormatter={(value: number) => formatCompact(value)} /><Tooltip contentStyle={{ background: isSpiderMan ? "#0c1527" : isLight ? "#fff" : "#1a1e1b", border: `1px solid ${isSpiderMan ? "#1e3056" : isLight ? "#dfe5dc" : "#323833"}`, borderRadius: 10, color: isLight ? "#19251d" : "#fff", fontSize: 12 }} labelStyle={{ color: isLight ? "#58675c" : "#b8c0b4" }} formatter={(value, name) => [formatMoney(Number(value)), String(name).toLowerCase().includes("income") ? "Income" : "Expenses"]} /><Area type="monotone" dataKey="incomeCents" name="Income" stroke={incomeColor} strokeWidth={2} fill="url(#incomeFill)" /><Area type="monotone" dataKey="expenseCents" name="Expenses" stroke={expenseColor} strokeWidth={1.8} fill="url(#expenseFill)" /></AreaChart></ResponsiveContainer> : <ChartEmptyState />}</div><div className="chart-footer"><span><span className="chart-footer-dot" style={{ background: incomeColor }} /> {periodTransactions.length ? `${periodTransactions.length} transactions included` : "No transactions in this range"}</span><span>INR · ₹</span></div></section>}
        </div>}

        <div className={`lower-grid lower-grid-${activeTab}`}>
          {(activeTab === "dashboard" || activeTab === "analytics") && <section className="panel category-panel"><div className="panel-heading"><div><span className="section-kicker">SPENDING BREAKDOWN</span><h2>By category</h2></div><span className="select-pill">{range.label}</span></div>{categoryData.length ? <div className="category-list">{categoryData.map((item) => <div className="category-row" key={item.category}><div className="category-row-top"><span><i style={{ background: item.color }} />{item.category}</span><strong>{formatMoney(item.amountCents)} <small>{periodTotals.expenseCents > 0 ? `${Math.round(item.amountCents / periodTotals.expenseCents * 100)}%` : "0%"}</small></strong></div><div className="category-track"><i style={{ width: `${periodTotals.expenseCents > 0 ? Math.min(100, Math.max(0, item.amountCents / periodTotals.expenseCents * 100)) : 0}%`, background: item.color }} /></div></div>)}</div> : <div className="compact-empty">No spending to break down in this period.</div>}</section>}
          {activeTab === "budgets" && <section className="panel budget-panel" id="budgets"><div className="panel-heading"><div><span className="section-kicker">SPEND WITH INTENTION</span><h2>Monthly budgets</h2><p className="budget-month-label">Usage for {monthTitle(budgetMonth)}</p></div><div className="budget-heading-actions"><button className="text-button" disabled={budgets.length >= CATEGORIES.length} title={budgets.length >= CATEGORIES.length ? "Every spending category already has a budget" : "Create a monthly budget"} onClick={() => openDialog({ kind: "budget" })}>{budgets.length >= CATEGORIES.length ? "All set" : "Add budget"} <Plus size={13} /></button><button className="icon-button subtle" aria-label="Reset sample budgets" title="Reset sample budgets" onClick={resetBudgets}><RotateCcw size={14} /></button></div></div><BudgetList budgets={budgets} transactions={budgetTransactions} onEdit={(budget) => openDialog({ kind: "budget", budget })} onDelete={deleteBudget} onChoose={chooseCategory} /><div className="budget-footer"><span>Monthly category limits</span><button onClick={resetBudgets}>Reset demo budgets <RotateCcw size={12} /></button></div></section>}
        </div>

        {(activeTab === "dashboard" || activeTab === "analytics") && <div className="lower-grid insights-grid"><section className="panel insights-panel" id="insights"><div className="panel-heading"><div><span className="section-kicker">A LITTLE PERSPECTIVE</span><h2>Money insights <span className="sparkle-small">✳</span></h2></div><span className="select-pill">{range.label}</span></div><div className="insights-list">{insights.map((item, index) => <motion.div className="insight-row" key={`${item.title}-${index}`} initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}><span className="insight-icon" style={{ color: item.tone, borderColor: `${item.tone}35`, background: `${item.tone}0d` }}>{item.icon}</span><div><strong>{item.title}</strong><p>{item.detail}</p></div></motion.div>)}</div><div className="insight-note"><Sparkles size={14} /><span>Calculated from your selected period and saved budgets.</span></div></section></div>}

        {activeTab === "analytics" && <FinancialOutlook transactions={transactions} referenceDate={now} />}

        {activeTab === "transactions" && <section className="panel transactions-panel" id="transactions"><div className="panel-heading transaction-heading"><div><span className="section-kicker">ACTIVITY · {range.label.toUpperCase()}</span><h2>Transactions <span className="transaction-count">{visible.length}</span></h2></div><div className="transaction-heading-actions"><button className="text-button view-all" onClick={exportTransactions} disabled={!visible.length}>Print / Save PDF</button><button className="text-button view-all" onClick={clearFilters}>Clear filters <X size={13} /></button></div></div><div className="table-toolbar"><label className="search-field"><Search size={15} /><input id="transaction-search" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(7); }} placeholder="Search transactions..." aria-label="Search transactions in selected period" /><kbd><Command size={10} /> K</kbd></label><label className="filter-field"><ListFilter size={14} /><select value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value as TxTypeFilter); setLimit(7); }} aria-label="Filter by transaction type"><option value="all">All types</option><option value="income">Income</option><option value="expense">Expenses</option></select></label><label className="filter-field category-filter"><select value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); setSelectedCategory(event.target.value === "all" ? null : event.target.value); setLimit(7); }} aria-label="Filter by category"><option value="all">All categories</option><option value="Income">Income</option>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select><ChevronDown size={13} /></label><label className="filter-field sort-filter"><select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort transactions"><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="highest">Amount high</option><option value="lowest">Amount low</option></select><ChevronDown size={13} /></label><button className="table-add" onClick={() => openDialog({ kind: "transaction", type: "expense" })}><Plus size={14} /> Add</button></div>
          <div className="transaction-table"><div className="table-row table-head"><span>NAME</span><span>CATEGORY</span><span>DATE</span><span>AMOUNT</span><span /></div><AnimatePresence initial={false}>{visible.slice(0, limit).map((item) => <motion.div layout key={item.id} className="table-row transaction-row" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: 12 }}><div className="merchant-cell"><span className="merchant-icon" style={{ "--merchant-color": CATEGORY_META[item.category].color } as React.CSSProperties}>{CATEGORY_META[item.category].icon}</span><span className="merchant-name">{item.name}{item.note && <small>{item.note}</small>}</span></div><span className="category-chip" style={{ "--chip-color": CATEGORY_META[item.category].color } as React.CSSProperties}><i />{item.category}</span><span className="transaction-date">{dateLabel(item.date)}</span><strong className={`amount ${item.type === "income" ? "amount-income" : ""}`}>{item.type === "income" ? "+" : "−"}{formatMoney(item.amountCents)}</strong><div className="transaction-actions"><button className="edit-transaction" aria-label={`Edit ${item.name}`} onClick={() => openDialog({ kind: "transaction", type: item.type, transaction: item })}><Pencil size={13} /></button><button className="delete-transaction" aria-label={`Delete ${item.name}`} onClick={() => removeTransaction(item)}><Trash2 size={14} /></button></div></motion.div>)}</AnimatePresence>{visible.length === 0 && <div className="empty-state"><Search size={18} /><strong>{periodTransactions.length ? "No matching transactions" : "No transactions in this period"}</strong><span>{periodTransactions.length ? "Clear a filter or try another search." : "Choose another date range or add a transaction."}</span></div>}</div>
          {visible.length > limit && <button className="load-more" onClick={() => setLimit((value) => value + 7)}>Show {Math.min(7, visible.length - limit)} more · {visible.length - limit} remaining <ChevronDown size={13} /></button>}
        </section>}
        </motion.div></AnimatePresence></div>
        <footer className="app-footer"><span>© {now.getFullYear()} SpendSense</span><span className={`save-status save-status-${persistence}`} role="status"><i /> {persistence === "saved" ? "Saved to your account" : persistence === "error" ? "Account connection error" : "Syncing account data"}</span><button onClick={() => setToast("Your finance data is stored in your private account; theme and Money Lens conversation preferences stay in this browser.")}>Made for clarity <span>✳</span></button></footer>
      </div>
    </section>

    <AnimatePresence>{dialog && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null); }}><motion.div ref={dialogRef} className="transaction-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabIndex={-1} initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.98 }}>
      {dialog.kind === "transaction" ? <><div className="modal-heading"><div><span className="section-kicker">KEEP YOUR PICTURE CURRENT</span><h2 id="modal-title">{dialog.transaction ? "Edit transaction" : `Add ${dialog.type === "income" ? "income" : "an expense"}`}</h2></div><button className="icon-button subtle" onClick={() => setDialog(null)} aria-label="Close dialog"><X size={17} /></button></div><div className="type-switch"><button type="button" className={dialog.type === "expense" ? "selected" : ""} onClick={() => setDialog({ kind: "transaction", type: "expense" })}>Expense</button><button type="button" className={dialog.type === "income" ? "selected" : ""} onClick={() => setDialog({ kind: "transaction", type: "income" })}>Income</button></div><form onSubmit={addTransaction}><label>Description<input name="name" placeholder="e.g. Coffee with a friend" defaultValue={dialog.transaction?.name ?? ""} required maxLength={MAX_TEXT_LENGTH} autoFocus /></label><div className="form-grid"><label>Amount<input name="amount" type="number" min="0.01" max="10000000" step="0.01" defaultValue={dialog.transaction ? centsToInput(dialog.transaction.amountCents) : ""} placeholder="0.00" required /></label><label>Date<input name="date" type="date" max={localDateString(now)} defaultValue={dialog.transaction?.date ?? localDateString(now)} required /></label></div><label>Category<select name="category" key={dialog.type} defaultValue={dialog.transaction && (dialog.type === "income" ? dialog.transaction.category === "Income" : dialog.transaction.category !== "Income") ? dialog.transaction.category : dialog.type === "income" ? "Income" : "Food & drink"}>{(dialog.type === "income" ? ["Income"] : CATEGORIES).map((category) => <option key={category}>{category}</option>)}</select></label><p className="privacy-note"><Check size={13} /> Saved privately to your account.</p><button className="primary-button modal-submit" type="submit" disabled={saving}><Plus size={15} /> {saving ? "Saving…" : dialog.transaction ? "Save transaction changes" : "Save transaction"}</button></form></> : <><div className="modal-heading"><div><span className="section-kicker">MONTHLY SPENDING PLAN</span><h2 id="modal-title">{dialog.budget ? "Edit budget" : "Create budget"}</h2></div><button className="icon-button subtle" onClick={() => setDialog(null)} aria-label="Close dialog"><X size={17} /></button></div><p className="dialog-description">Set a monthly limit for a spending category. Usage updates with your transactions.</p><form onSubmit={saveBudget}><label>Category<select name="category" defaultValue={dialog.budget?.category ?? CATEGORIES.find((category) => !budgets.some((budget) => budget.category === category)) ?? CATEGORIES[0]}>{CATEGORIES.filter((category) => dialog.budget?.category === category || !budgets.some((budget) => budget.category === category)).map((category) => <option key={category}>{category}</option>)}</select></label><label>Monthly limit<input name="amount" type="number" min="0.01" max="10000000" step="0.01" defaultValue={dialog.budget ? centsToInput(dialog.budget.limitCents) : ""} placeholder="0.00" required /></label><p className="privacy-note"><Check size={13} /> Budget is stored in your account.</p><div className="dialog-actions"><button className="secondary-button" type="button" onClick={() => setDialog(null)}>Cancel</button><button className="primary-button modal-submit" type="submit" disabled={saving}>{saving ? "Saving…" : dialog.budget ? "Save changes" : "Create budget"}</button></div></form></>}
    </motion.div></div>}</AnimatePresence>
    <AnimatePresence>{toast && <motion.div className="toast" role="status" aria-live="polite" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}><span><Check size={14} /></span>{toast}<button aria-label="Dismiss notification" onClick={() => setToast("")}><X size={14} /></button></motion.div>}</AnimatePresence>
    <FinanceAssistant transactions={transactions} budgets={budgets} periodTransactions={periodTransactions} budgetTransactions={budgetTransactions} periodLabel={range.label} periodRange={{ start: range.start, end: range.end ?? localDateString(now), label: range.label }} referenceDate={now} onSaveTransactions={saveAssistantTransactions} onCorrectTransaction={correctAssistantTransaction} />
  </main>;

  async function resetBudgets() {
    if (!window.confirm("Reset monthly budgets to the SpendSense sample limits?")) return;
    if (saving || !clientRef.current) { setToast("Your account connection is unavailable. No changes were made."); return; }
    setSaving(true);
    try {
      const refreshed = await replaceFinanceData(clientRef.current, userId, transactions, DEMO_BUDGETS);
      setTransactions(refreshed.transactions); setBudgets(refreshed.budgets); setPersistence("saved"); setToast("Sample monthly budgets restored to your account.");
    } catch (error) { setToast(error instanceof Error ? error.message : "Budgets could not be reset. Your account was not changed."); }
    finally { setSaving(false); }
  }
}

function formatCompact(value: number) {
  if (!Number.isFinite(value)) return "—";
  const majorUnits = value / 100;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: CURRENCY, notation: "compact", maximumFractionDigits: 1 }).format(majorUnits);
}
function monthTitle(month: string) {
  const [year, number] = month.split("-").map(Number);
  const date = new Date(0); date.setHours(12, 0, 0, 0); date.setFullYear(year, number - 1, 1);
  return date.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}function StatCard({ label, value, change, icon, tone }: { label: string; value: string; change: string; icon: React.ReactNode; tone: string }) {
  return <motion.div className={`stat-card stat-${tone}`} initial={{ opacity: 0, y: 9 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}><div className="stat-top"><span>{label}</span><i>{icon}</i></div><strong className="stat-value">{value}</strong><div className="stat-bottom"><span className="stat-change">{change}</span></div></motion.div>;
}

function BudgetList({ budgets, transactions, onEdit, onDelete, onChoose }: { budgets: Budget[]; transactions: Transaction[]; onEdit: (budget: Budget) => void; onDelete: (budget: Budget) => void; onChoose: (category: string) => void }) {
  if (budgets.length === 0) return <div className="budget-empty"><strong>No monthly budgets yet</strong><span>Create one to track spending against a limit.</span></div>;
  const sorted = [...budgets].sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category));
  return <div className="budget-list">{sorted.map((budget) => {
    const spentCents = sumMoneyCents(transactions.filter((item) => item.type === "expense" && item.category === budget.category).map((item) => item.amountCents));
    const remainingCents = budget.limitCents - spentCents; const progress = budget.limitCents > 0 ? Math.max(0, spentCents / budget.limitCents * 100) : 0; const over = remainingCents < 0;
    return <div className="budget-row" key={budget.id}><button className="budget-row-main" onClick={() => onChoose(budget.category)} aria-label={`Filter transactions by ${budget.category}`}><div className="budget-info"><span className="budget-name"><i style={{ background: CATEGORY_META[budget.category].color }} />{budget.category}</span><span className={`budget-amount ${over ? "over-budget" : ""}`}><b>{formatMoney(spentCents)}</b> <span>/ {formatMoney(budget.limitCents)}</span></span></div><div className="budget-track" role="progressbar" aria-label={`${budget.category} budget used`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, progress)}><i style={{ width: `${Math.min(100, progress)}%`, background: over ? "#ff846f" : CATEGORY_META[budget.category].color }} /></div><span className={`budget-warning ${over ? "is-over" : ""}`}>{over ? `${formatMoney(Math.abs(remainingCents))} over budget` : `${formatMoney(remainingCents)} remaining`}</span></button><div className="budget-row-actions"><button aria-label={`Edit ${budget.category} budget`} onClick={() => onEdit(budget)}><Settings2 size={12} /></button><button aria-label={`Delete ${budget.category} budget`} onClick={() => onDelete(budget)}><Trash2 size={12} /></button></div></div>;
  })}</div>;
}
function ChartEmptyState() { return <div className="chart-empty"><Activity size={20} /><strong>No activity to chart</strong><span>There are no transactions in this date range.</span></div>; }
