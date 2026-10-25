"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useTheme } from "@/components/theme-provider";

export default function ResetPasswordPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => createClient().auth.getUser()).then(({ data, error }) => {
      if (!active) return;
      if (error || !data.user) router.replace("/auth");
      else setReady(true);
    }).catch(() => { if (active) router.replace("/auth"); });
    return () => { active = false; };
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    const confirm = String(data.get("confirm") ?? "");
    if (password.length < 10) { setNotice("Use at least 10 characters for your password."); return; }
    if (password !== confirm) { setNotice("The passwords do not match."); return; }
    setBusy(true);
    try {
      const { error } = await createClient().auth.updateUser({ password });
      if (error) { setNotice("Password could not be updated. Request a fresh reset link and try again."); return; }
      router.replace("/dashboard");
      router.refresh();
    } catch { setNotice("Could not reach the authentication service. Try again."); }
    finally { setBusy(false); }
  }

  const authThemeClass = theme === "spider-man" ? "auth-dark auth-spider-man" : `auth-${theme}`;
  if (!ready) return <main className={`auth-page ${authThemeClass}`}><p role="status">Checking password reset session…</p></main>;
  return <main className={`auth-page ${authThemeClass}`}><section className="auth-form-side auth-reset-panel"><Link className="auth-brand" href="/">SpendSense</Link><h1>Choose a new password</h1><p>Use at least 10 characters.</p><form className="auth-form" onSubmit={submit}><label className="auth-field">New password<input name="password" type="password" autoComplete="new-password" minLength={10} required /></label><label className="auth-field">Confirm password<input name="confirm" type="password" autoComplete="new-password" minLength={10} required /></label>{notice && <p className="auth-notice" role="alert">{notice}</p>}<button className="auth-submit" disabled={busy}>{busy ? "Updating…" : "Update password"}</button></form></section></main>;
}
