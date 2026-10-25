"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import { Activity, ArrowUp, Bot, Check, CircleHelp, FileImage, FileText, Mic, Paperclip, RotateCcw, Send, Sparkles, Trash2, X } from "lucide-react";
import { ChangeEvent, DragEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AssistantContext, AssistantCorrection, AssistantDraft, AssistantResponse, findPotentialDuplicate, isAssistantResponse, ReceiptDetails, selectAssistantContext, validateAssistantDraft } from "@/lib/assistant";
import { Budget, CATEGORIES, Category, CURRENCY, ExpenseCategory, formatMoney, getBudgetMonth, getDateRange, localDateString, summarize, Transaction } from "@/lib/finance";

type Message = { id: string; role: "user" | "assistant"; content: string; time: number };
type SpeechAlternative = { transcript: string };
type SpeechRecognitionResult = { length: number; isFinal: boolean; [index: number]: SpeechAlternative };
type SpeechEvent = { resultIndex: number; results: { length: number; [index: number]: SpeechRecognitionResult } };
type SpeechRecognitionLike = { lang: string; interimResults: boolean; continuous: boolean; onresult: ((event: SpeechEvent) => void) | null; onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null; start(): void; stop(): void };
type SpeechConstructor = new () => SpeechRecognitionLike;
declare global { interface Window { SpeechRecognition?: SpeechConstructor; webkitSpeechRecognition?: SpeechConstructor } }

type Props = {
  transactions: Transaction[];
  budgets: Budget[];
  periodTransactions: Transaction[];
  budgetTransactions: Transaction[];
  periodLabel: string;
  periodRange: { start: string | null; end: string; label: string };
  referenceDate: Date;
  onSaveTransactions: (drafts: AssistantDraft[]) => Promise<{ ok: boolean; message: string }>;
  onCorrectTransaction: (correction: AssistantCorrection) => Promise<{ ok: boolean; message: string }>;
};

const HISTORY_KEY = "spendsense.assistant.history.v1";
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
const ASSISTANT_NAME = "Money Lens";
const PROMPTS = ["How much did I spend this week?", "Analyze my spending habits.", "How much of my monthly budget is left?", "Compare this month with last month."];
const newMessageId = () => globalThis.crypto?.randomUUID?.() ?? `message-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function FinanceAssistant(props: Props) {
  const { transactions, budgets, periodTransactions, budgetTransactions, periodLabel, periodRange, referenceDate, onSaveTransactions, onCorrectTransaction } = props;
  const reducedMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [historyReady, setHistoryReady] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [drafts, setDrafts] = useState<AssistantDraft[]>([]);
  const [pendingCorrection, setPendingCorrection] = useState<AssistantCorrection | null>(null);
  const [receiptDetails, setReceiptDetails] = useState<ReceiptDetails | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState("");
  const [receiptName, setReceiptName] = useState("");
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [recording, setRecording] = useState(false);
  const [speechLanguage, setSpeechLanguage] = useState("en-IN");
  const [transcript, setTranscript] = useState("");
  const [historyError, setHistoryError] = useState(false);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef("");
  const commitLock = useRef(false);

  const context = useMemo<AssistantContext>(() => {
    const current = summarize(periodTransactions, referenceDate);
    const all = summarize(transactions, referenceDate);
    const categoryTotals = new Map<ExpenseCategory, number>();
    for (const transaction of periodTransactions) if (transaction.type === "expense") categoryTotals.set(transaction.category as ExpenseCategory, (categoryTotals.get(transaction.category as ExpenseCategory) ?? 0) + transaction.amountCents);
    const month = getBudgetMonth("this-month", referenceDate);
    const recentTransactions = [...transactions].filter((item) => item.date <= localDateString(referenceDate)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 80);
    return {
      currency: CURRENCY, periodLabel, referenceDate: localDateString(referenceDate), periodRange,
      period: current, allTime: { incomeCents: all.incomeCents, expenseCents: all.expenseCents, balanceCents: all.balanceCents },
      categories: [...categoryTotals].map(([category, amountCents]) => ({ category, amountCents })).sort((a, b) => b.amountCents - a.amountCents),
      budgets: budgets.map((budget) => {
        const spentCents = budgetTransactions.filter((item) => item.type === "expense" && item.category === budget.category && item.date.slice(0, 7) === month).reduce((sum, item) => sum + item.amountCents, 0);
        return { category: budget.category, limitCents: budget.limitCents, spentCents, remainingCents: budget.limitCents - spentCents };
      }),
      transactions: recentTransactions.map(({ id, name, category, date, amountCents, type, paymentMethod }) => ({ id, name, category, date, amountCents, type, ...(paymentMethod ? { paymentMethod } : {}) })),
    };
  }, [transactions, budgets, periodTransactions, budgetTransactions, periodLabel, periodRange, referenceDate]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const raw = window.localStorage.getItem(HISTORY_KEY);
        if (raw) {
          const parsed: unknown = JSON.parse(raw);
          if (Array.isArray(parsed)) setMessages(parsed.slice(-80).filter((item): item is Message => Boolean(item && typeof item === "object" && (item.role === "user" || item.role === "assistant") && typeof item.content === "string" && item.content.length <= 4000 && typeof item.time === "number" && typeof item.id === "string")));
        }
      } catch { setHistoryError(true); }
      setHistoryReady(true);
    });
    fetch("/api/assistant").then((response) => response.ok ? response.json() : null).then((value) => { if (value && typeof value.configured === "boolean") setConfigured(value.configured); }).catch(() => setConfigured(false));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!historyReady) return;
    try { window.localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-80))); }
    catch { const timer = window.setTimeout(() => setHistoryError(true), 0); return () => window.clearTimeout(timer); }
  }, [messages, historyReady]);

  useEffect(() => { messagesEnd.current?.scrollIntoView({ behavior: reducedMotion ? "instant" : "smooth" }); }, [messages, busy, drafts, open, reducedMotion]);
  useEffect(() => () => { if (receiptPreview) URL.revokeObjectURL(receiptPreview); recognition.current?.stop(); }, [receiptPreview]);

  const append = useCallback((role: Message["role"], content: string) => {
    const message: Message = { id: newMessageId(), role, content: content.slice(0, 4000), time: Date.now() };
    setMessages((current) => [...current, message].slice(-80));
  }, []);

  const localAnswer = (prompt: string) => {
    const lower = prompt.toLocaleLowerCase();
    const today = localDateString(referenceDate);
    const monthRange = getDateRange("this-month", referenceDate);
    const lastMonthRange = getDateRange("last-month", referenceDate);
    if (/how much.*(spend|spent).*(today|today\?)/.test(lower) || /spent today/.test(lower)) {
      const total = summarize(transactions.filter((item) => item.date === today), referenceDate).expenseCents;
      return `You recorded ${formatMoney(total)} in expenses today (${today}).`;
    }
    if (/this week|week so far|weekly spend/.test(lower)) {
      const mondayOffset = (referenceDate.getDay() + 6) % 7; const start = new Date(referenceDate); start.setDate(start.getDate() - mondayOffset);
      const startDate = localDateString(start); const total = summarize(transactions.filter((item) => item.date >= startDate && item.date <= today), referenceDate).expenseCents;
      return `Recorded expenses this week (${startDate} to ${today}): ${formatMoney(total)}.`;
    }
    if (/budget.*(left|remain)|how much.*budget/.test(lower)) {
      if (!context.budgets.length) return "There are no monthly budgets yet. Add category budgets to track how much remains.";
      return `Monthly budget status for ${monthTitle(getBudgetMonth("this-month", referenceDate))}: ${context.budgets.map((item) => `${item.category}: ${formatMoney(item.remainingCents)} ${item.remainingCents < 0 ? "over" : "remaining"}`).join(" · ")}.`;
    }
    if (/compare|compared|versus|vs\.?/.test(lower) && /month/.test(lower)) {
      const current = summarize(transactions.filter((item) => item.date >= monthRange.start! && item.date <= monthRange.end!), referenceDate).expenseCents;
      const previous = summarize(transactions.filter((item) => item.date >= lastMonthRange.start! && item.date <= lastMonthRange.end!), referenceDate).expenseCents;
      const difference = current - previous; const change = difference === 0 ? "the same as" : `${formatMoney(Math.abs(difference))} ${difference > 0 ? "more than" : "less than"}`;
      return `Recorded expenses month to date: ${formatMoney(current)} this month (${monthRange.label}, through ${today}) and ${formatMoney(previous)} last month (${lastMonthRange.label}). This month to date is ${change} last month.`;
    }
    if (/largest|biggest|top expense/.test(lower)) {
      const biggest = periodTransactions.filter((item) => item.type === "expense").sort((a, b) => b.amountCents - a.amountCents)[0];
      return biggest ? `Your largest recorded expense in ${periodLabel} is ${biggest.name}: ${formatMoney(biggest.amountCents)} on ${biggest.date}.` : `There are no recorded expenses in ${periodLabel}.`;
    }
    if (/analy[sz]e|spending habits|reduce|cut back|save more/.test(lower)) {
      const top = context.categories[0];
      const savings = summarize(periodTransactions, referenceDate).savingsRate;
      if (!top) return `There is no expense activity in ${periodLabel} to analyze yet.`;
      const budgetWarnings = context.budgets.filter((item) => item.remainingCents < 0).map((item) => `${item.category} is ${formatMoney(Math.abs(item.remainingCents))} over its monthly limit`);
      return `In ${periodLabel}, ${top.category} is your largest spending category at ${formatMoney(top.amountCents)}. ${savings === null ? "No income is recorded, so a savings rate is unavailable." : `Your recorded savings rate is ${Math.round(savings)}%.`}${budgetWarnings.length ? ` Current-month budget check: ${budgetWarnings.join("; ")}.` : " No current-month budget overruns are recorded."}`;
    }
    return null;
  };

  function monthTitle(month: string) { const [year, monthNumber] = month.split("-").map(Number); return new Date(year, monthNumber - 1, 1, 12).toLocaleDateString("en-US", { month: "long", year: "numeric" }); }

  const handleResponse = (result: AssistantResponse) => {
    append("assistant", result.reply || "Review the details below before recording anything.");
    if (result.transactions.length) {
      setDrafts(result.transactions.map((draft) => ({ ...draft, merchant: draft.merchant.slice(0, 120), paymentMethod: draft.paymentMethod.slice(0, 48) })));
      setAllowDuplicate(false); setReceiptDetails(result.receipt);
    } else if (result.receipt?.isReceipt && result.receipt.total && result.receipt.merchant) {
      const itemCategories = [...new Set(result.receipt.items.map((item) => item.category).filter((category): category is ExpenseCategory => Boolean(category)))];
      const category: Category = itemCategories.length === 1 ? itemCategories[0] : "Other";
      setDrafts([{ type: "expense", amount: result.receipt.total, currency: result.receipt.currency ?? "", category, merchant: result.receipt.merchant, date: result.receipt.date ?? "", paymentMethod: "", confidence: 0.5, needsClarification: !result.receipt.currency || !result.receipt.date || result.receipt.warnings.length > 0 }]);
      setAllowDuplicate(false);
    }
    if (result.correction) {
      const selected = transactions.find((item) => item.id === result.correction!.transactionId);
      const idWasProvidedToModel = context.transactions.some((item) => item.id === result.correction!.transactionId);
      if (selected && idWasProvidedToModel && !result.correction.needsClarification) setPendingCorrection(result.correction);
      else append("assistant", "I could not uniquely identify that transaction from the saved records. Please include more detail, such as the merchant and date.");
    }
    if (result.receipt) {
      setReceiptDetails(result.receipt);
      if (!result.receipt.isReceipt || !result.receipt.total || !result.receipt.merchant) append("assistant", "I could not read a clear receipt total and merchant. You can retry with a sharper image or enter the details manually.");
    }
  };

  const sendMessage = async (event?: FormEvent, suggested?: string) => {
    event?.preventDefault();
    const message = (suggested ?? input).trim();
    if (!message || busy) return;
    setError(""); setDrafts([]); setPendingCorrection(null); setReceiptDetails(null);
    const history = messages.slice(-8).map(({ role, content }) => ({ role, content }));
    append("user", message); setInput("");
    const local = localAnswer(message);
    if (local) { append("assistant", local); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "chat", message, history, context: selectAssistantContext(context, message) }) });
      const payload: unknown = await response.json();
      if (!response.ok) { const reason = typeof payload === "object" && payload && "error" in payload && typeof payload.error === "string" ? payload.error : "The assistant could not respond. Please retry."; setError(reason); setInput(message); return; }
      if (!isAssistantResponse(payload)) { setError("The assistant response could not be validated. Please retry."); setInput(message); return; }
      handleResponse(payload);
    } catch { setError("Could not reach the assistant. Check your connection and retry."); setInput(message); }
    finally { setBusy(false); }
  };

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (file) void uploadReceipt(file);
    if (event.target) event.target.value = "";
  };

  const uploadReceipt = async (file: File) => {
    const allowed = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
    if (!allowed.includes(file.type) || file.size > MAX_RECEIPT_BYTES || file.size === 0) { setError("Choose a PNG, JPEG, WEBP, or PDF receipt under 5 MB."); return; }
    setError(""); setDrafts([]); setPendingCorrection(null); setReceiptDetails(null); setReceiptFile(file); setReceiptName(file.name); setProgress(0);
    const nextPreview = file.type.startsWith("image/") ? URL.createObjectURL(file) : "";
    setReceiptPreview(nextPreview);
    append("user", `Receipt added: ${file.name}`);
    setBusy(true);
    const form = new FormData(); form.set("kind", "receipt"); form.set("file", file); form.set("context", JSON.stringify({ currency: CURRENCY, referenceDate: localDateString(referenceDate) })); form.set("referenceDate", localDateString(referenceDate));
    try {
      const payload = await uploadWithProgress(form, setProgress);
      if (!isAssistantResponse(payload)) throw new Error("Receipt extraction could not be validated. Retry with a clearer image.");
      handleResponse(payload);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Receipt processing failed. Retry the upload."); }
    finally { setBusy(false); }
  };

  const uploadWithProgress = (form: FormData, onProgress: (value: number) => void) => new Promise<unknown>((resolve, reject) => {
    const request = new XMLHttpRequest(); request.open("POST", "/api/assistant");
    request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.min(99, Math.round(event.loaded / event.total * 100))); };
    request.onload = () => {
      let payload: unknown; try { payload = JSON.parse(request.responseText); } catch { reject(new Error("The server returned an unreadable response.")); return; }
      if (request.status < 200 || request.status >= 300) { const message = typeof payload === "object" && payload && "error" in payload && typeof payload.error === "string" ? payload.error : "Receipt processing failed."; reject(new Error(message)); return; }
      onProgress(100); resolve(payload);
    };
    request.onerror = () => reject(new Error("Receipt upload failed. Check your connection and retry.")); request.onabort = () => reject(new Error("Receipt upload was cancelled.")); request.send(form);
  });

  const startVoice = () => {
    if (recording) { recognition.current?.stop(); return; }
    const Constructor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Constructor) { setError("Voice input is not supported in this browser. Type your transaction instead."); return; }
    setError(""); setTranscript(""); transcriptRef.current = "";
    const instance = new Constructor(); recognition.current = instance; instance.lang = speechLanguage; instance.continuous = true; instance.interimResults = true;
    instance.onresult = (event) => { let text = ""; for (let index = 0; index < event.results.length; index += 1) text += `${event.results[index][0].transcript}${event.results[index].isFinal ? " " : ""}`; transcriptRef.current = text.trim(); setTranscript(transcriptRef.current); };
    instance.onerror = (event) => { setRecording(false); setError(event.error === "not-allowed" ? "Microphone permission was denied. You can type your request instead." : "Speech recognition failed. No transaction was created."); };
    instance.onend = () => { setRecording(false); setInput((current) => current || transcriptRef.current); };
    try { instance.start(); setRecording(true); } catch { setRecording(false); setError("Could not start voice recognition. Type your request instead."); }
  };

  const updateDraft = (index: number, key: keyof AssistantDraft, value: string) => setDrafts((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: key === "amount" || key === "merchant" || key === "date" || key === "paymentMethod" ? value : item[key] } : item));
  const validateDrafts = () => drafts.map((draft) => validateAssistantDraft(draft, referenceDate));
  const draftChecks = validateDrafts();
  const duplicates = drafts.map((draft, index) => draftChecks[index].valid ? findPotentialDuplicate(draft, draftChecks[index].amountCents, transactions) : null);
  const confirmDrafts = async () => {
    if (!drafts.length || busy || commitLock.current || draftChecks.some((item) => !item.valid)) return;
    if (duplicates.some(Boolean) && !allowDuplicate) { setAllowDuplicate(true); append("assistant", "One or more entries resemble an existing transaction. Review the warning and choose whether to save anyway."); return; }
    commitLock.current = true;
    setBusy(true);
    try {
      const result = await onSaveTransactions(drafts);
      append("assistant", result.message);
      if (result.ok) { setDrafts([]); setReceiptDetails(null); setReceiptFile(null); setReceiptPreview(""); setReceiptName(""); setAllowDuplicate(false); }
    } catch { setError("The reviewed transactions could not be saved. Check your account connection and retry."); }
    finally { commitLock.current = false; setBusy(false); }
  };

  const confirmCorrection = async () => {
    if (!pendingCorrection || busy || commitLock.current) return;
    commitLock.current = true;
    setBusy(true);
    try {
      const result = await onCorrectTransaction(pendingCorrection);
      append("assistant", result.message); if (result.ok) setPendingCorrection(null);
    } catch { setError("The reviewed transaction change could not be saved. Check your account connection and retry."); }
    finally { commitLock.current = false; setBusy(false); }
  };

  const clearHistory = () => {
    if (!window.confirm("Clear this device's assistant conversation history? Saved financial records will not change.")) return;
    setMessages([]); setDrafts([]); setPendingCorrection(null); setReceiptDetails(null); setError("");
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file) void uploadReceipt(file); };
  const openAssistant = () => { setOpen((value) => !value); setError(""); };
  const today = localDateString(referenceDate);

  return <>
    <motion.button className={`assistant-launcher ${open ? "is-open" : ""}`} onClick={openAssistant} aria-label={open ? "Close SpendSense Money Lens" : "Open SpendSense Money Lens"} aria-expanded={open} aria-controls="finance-assistant-panel" whileTap={reducedMotion ? undefined : { scale: .96 }}><AnimatePresence mode="wait" initial={false}>{open ? <motion.span key="close" initial={reducedMotion ? false : { rotate: -70, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 70, opacity: 0 }}><X size={20} /></motion.span> : <motion.span key="assistant" initial={reducedMotion ? false : { rotate: 50, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -50, opacity: 0 }}><Sparkles size={20} /></motion.span>}</AnimatePresence><span className="assistant-launcher-label">{ASSISTANT_NAME}</span></motion.button>
    <AnimatePresence>{open && <motion.aside id="finance-assistant-panel" className="assistant-panel" aria-label="SpendSense AI assistant" initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 28, scale: .96, rotateX: 5 }} animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }} exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 20, scale: .98 }} transition={{ type: "spring", stiffness: 180, damping: 22 }} onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDragging(true); } }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={handleDrop}>
      <header className="assistant-header"><div className="assistant-avatar"><Bot size={18} /></div><div className="assistant-title"><strong>SpendSense {ASSISTANT_NAME}</strong><span><i /> Private financial workspace</span></div><button className="assistant-icon-button" aria-label="Clear conversation history" title="Clear conversation history" onClick={clearHistory}><RotateCcw size={15} /></button><button className="assistant-icon-button" aria-label="Close assistant" onClick={() => setOpen(false)}><X size={17} /></button></header>
      {configured === false && <div className="assistant-config-note" role="status"><CircleHelp size={14} /><span>AI chat and receipt reading need <code>OPENAI_API_KEY</code>. Local finance questions still work.</span></div>}
      {historyError && <div className="assistant-error" role="status">Conversation history could not be saved locally. Your ledger is unchanged.</div>}
      <div className={`assistant-messages ${dragging ? "is-dragging" : ""}`}>
        {dragging && <div className="assistant-drop-overlay"><FileImage size={23} /><strong>Drop a receipt to review it</strong><span>PNG, JPEG, WEBP or PDF · up to 5 MB</span></div>}
        {!messages.length && <div className="assistant-welcome"><span className="assistant-orbit-icon"><Activity size={21} /></span><span className="assistant-eyebrow">YOUR FINANCIAL LENS</span><h2>What would you like to understand?</h2><p>Ask about recorded spending, prepare an entry, or share a receipt for review.</p><div className="assistant-suggestions">{PROMPTS.map((prompt) => <button key={prompt} onClick={() => void sendMessage(undefined, prompt)} disabled={busy}>{prompt}<ArrowUp size={12} /></button>)}</div></div>}
        {messages.map((message) => <motion.div key={message.id} className={`assistant-message assistant-message-${message.role}`} initial={reducedMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .2 }}><span className="assistant-message-icon">{message.role === "assistant" ? <Sparkles size={12} /> : "You"}</span><p>{message.content}</p></motion.div>)}
        {receiptPreview && <div className="assistant-receipt-preview">{receiptFile?.type.startsWith("image/") ? <Image src={receiptPreview} width={96} height={96} unoptimized alt={`Preview of ${receiptName}`} /> : <span className="assistant-pdf-icon"><FileText size={24} /></span>}<div><strong>{receiptName}</strong><span>{progress < 100 ? `Uploading ${progress}%` : busy ? "Reading receipt…" : "Receipt ready for review"}</span><progress max={100} value={progress} aria-label="Receipt upload progress" /></div><button aria-label="Remove receipt" onClick={() => { setReceiptFile(null); setReceiptPreview(""); setReceiptName(""); setProgress(0); }}><X size={14} /></button></div>}
        {receiptDetails && <div className="assistant-receipt-details"><div className="assistant-receipt-details-head"><FileText size={14} /><strong>Receipt extraction</strong></div><p>{receiptDetails.merchant ?? "Merchant unreadable"} · Total {receiptDetails.total ? `${receiptDetails.currency ?? "Currency unclear"} ${receiptDetails.total}` : "unreadable"}{receiptDetails.date ? ` · ${receiptDetails.date}` : ""}</p>{receiptDetails.tax && <small>Tax detected: {receiptDetails.tax}</small>}{receiptDetails.items.length > 0 && <ul>{receiptDetails.items.slice(0, 8).map((item, index) => <li key={`${item.name}-${index}`}>{item.name}{item.amount ? ` · ${item.amount}` : ""}{item.category ? ` · ${item.category}` : ""}</li>)}</ul>}{receiptDetails.warnings.map((warning, index) => <small className="receipt-warning" key={index}>{warning}</small>)}</div>}
        {drafts.map((draft, index) => <div className="assistant-draft" key={`${draft.date}-${index}`}><div className="assistant-draft-heading"><span>{draft.type === "income" ? "INCOME PREVIEW" : "EXPENSE PREVIEW"}</span><button aria-label={`Remove transaction draft ${index + 1}`} onClick={() => setDrafts((items) => items.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={13} /></button></div><div className="assistant-draft-grid"><label>Type<select value={draft.type} onChange={(event) => setDrafts((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, type: event.target.value as "income" | "expense", category: event.target.value === "income" ? "Income" : item.category === "Income" ? "Food & drink" : item.category } : item))}><option value="expense">Expense</option><option value="income">Income</option></select></label><label>Description<input value={draft.merchant} maxLength={120} onChange={(event) => updateDraft(index, "merchant", event.target.value)} /></label><label>Amount<input type="number" min="0.01" max="10000000" step="0.01" value={draft.amount} onChange={(event) => updateDraft(index, "amount", event.target.value)} /></label><label>Currency<select value={draft.currency} onChange={(event) => setDrafts((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, currency: event.target.value } : item))}><option value="">Select currency</option><option value="USD">Other currency (not converted)</option><option value="INR">INR</option></select></label><label>Date<input type="date" max={today} value={draft.date} onChange={(event) => updateDraft(index, "date", event.target.value)} /></label><label>Category<select value={draft.category} onChange={(event) => setDrafts((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, category: event.target.value as Category } : item))}>{(draft.type === "income" ? ["Income"] : CATEGORIES).map((category) => <option key={category}>{category}</option>)}</select></label><label>Payment method<input value={draft.paymentMethod} maxLength={48} placeholder="Optional" onChange={(event) => updateDraft(index, "paymentMethod", event.target.value)} /></label></div>{draft.needsClarification && <p className="assistant-validation">Please review the details; the assistant marked this entry as uncertain.</p>}{!draftChecks[index].valid && <p className="assistant-validation">{draftChecks[index].error}</p>}{duplicates[index] && <p className="assistant-duplicate">Possible duplicate: {duplicates[index].name}, {duplicates[index].date}, {formatMoney(duplicates[index].amountCents)}.</p>}{draft.currency !== CURRENCY && <p className="assistant-validation">Your saved ledger is in {CURRENCY}. This entry is not converted or saved as a different amount.</p>}{draft.currency === CURRENCY && <p className="assistant-validation">Currency selection does not convert the amount. Only Indian rupee amounts can be saved to this ledger.</p>}</div>)}
        {pendingCorrection && <CorrectionCard correction={pendingCorrection} transaction={transactions.find((item) => item.id === pendingCorrection.transactionId)} onConfirm={confirmCorrection} onCancel={() => setPendingCorrection(null)} />}
        {busy && <div className="assistant-typing" role="status" aria-label={receiptFile ? "Reading receipt" : recording ? "Listening" : "Assistant is thinking"}><i /><i /><i /><span>{receiptFile ? "Reading receipt" : "Thinking"}</span></div>}
        {error && <div className="assistant-error" role="alert">{error}{receiptFile && <button onClick={() => void uploadReceipt(receiptFile)}>Retry receipt <RotateCcw size={12} /></button>}</div>}
        <div ref={messagesEnd} />
      </div>
      {!!drafts.length && <div className="assistant-review-actions"><button className="assistant-save-button" onClick={confirmDrafts} disabled={busy || !drafts.length || draftChecks.some((item) => !item.valid)}><Check size={14} /> {allowDuplicate ? "Save despite duplicate warning" : `Confirm ${drafts.length > 1 ? `${drafts.length} transactions` : "transaction"}`}</button><button className="assistant-cancel-button" onClick={() => { setDrafts([]); setReceiptDetails(null); setAllowDuplicate(false); }}>Cancel</button></div>}
      <form className="assistant-composer" onSubmit={(event) => void sendMessage(event)}><textarea aria-label={`Message SpendSense ${ASSISTANT_NAME}`} value={input} onChange={(event) => setInput(event.target.value.slice(0, 1600))} placeholder="Ask about your finances or describe an entry…" rows={2} disabled={busy} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} /><div className="assistant-composer-tools"><div className="assistant-composer-left"><input ref={fileInput} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" capture="environment" onChange={chooseFile} aria-label="Choose a receipt image or PDF" /><button type="button" className="assistant-tool-button" aria-label="Attach receipt or invoice" title="Attach receipt" disabled={busy} onClick={() => fileInput.current?.click()}><Paperclip size={16} /></button><button type="button" className={`assistant-tool-button ${recording ? "recording" : ""}`} aria-label={recording ? "Stop voice input" : "Start voice input"} title="Speak a transaction" onClick={startVoice}><Mic size={15} /></button><select value={speechLanguage} onChange={(event) => setSpeechLanguage(event.target.value)} aria-label="Voice recognition language"><option value="en-IN">English (India)</option><option value="hi-IN">Hindi</option><option value="en-US">English (US)</option></select></div><button className="assistant-send-button" aria-label="Send message" type="submit" disabled={!input.trim() || busy}><Send size={15} /></button></div></form>
      {transcript && <div className="assistant-transcript" aria-live="polite"><span>{recording ? "Listening…" : "Recognized transcript"}</span><p>{transcript}</p><button onClick={() => setInput(transcript)}>Use transcript</button></div>}
      <div className="assistant-footnote">Your ledger is stored in your private Supabase account. When Money Lens is configured, relevant account context and uploaded receipts are sent to OpenAI for processing; SpendSense does not retain receipt files. Voice recognition may use your browser provider.</div>
    </motion.aside>}</AnimatePresence>
  </>;
}

function CorrectionCard({ correction, transaction, onConfirm, onCancel }: { correction: AssistantCorrection; transaction?: Transaction; onConfirm: () => void; onCancel: () => void }) {
  if (!transaction) return null;
  const deleting = correction.action === "delete";
  return <div className="assistant-correction"><span className="assistant-draft-heading">{deleting ? "DELETE REVIEW" : "EDIT REVIEW"}</span><strong>{transaction.name}</strong><span>{transaction.date} · {formatMoney(transaction.amountCents)} · {transaction.category}</span>{!deleting && <span>Proposed: {correction.name ?? transaction.name} · {correction.amount ?? "unchanged amount"} · {correction.category ?? "unchanged category"} · {correction.date ?? "unchanged date"}{correction.paymentMethod ? ` · ${correction.paymentMethod}` : ""}</span>}<p>{deleting ? "This permanently deletes the selected transaction from your account. Confirm only if this is the correct record." : "Review the exact transaction and proposed changes before applying them."}</p><div><button className={deleting ? "assistant-delete-button" : "assistant-save-button"} onClick={onConfirm}>{deleting ? "Confirm delete" : "Confirm edit"}</button><button className="assistant-cancel-button" onClick={onCancel}>Cancel</button></div></div>;
}
