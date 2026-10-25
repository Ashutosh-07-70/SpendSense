"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import "./auth.css";
import { useTheme } from "@/components/theme-provider";
import { useRouter } from "next/navigation";
import { createClient, hasSupabaseBrowserConfig } from "@/lib/supabase/client";
import ThemeSwitcher from "@/components/theme-switcher";

const AuthGlobe = dynamic(() => import("@/components/auth-globe"), { ssr: false, loading: () => <div className="auth-globe-fallback" aria-label="Loading 3D globe"><div className="auth-globe-fallback-sphere" /></div> });
type AuthMode = "signup" | "signin";

export default function AuthPage() {
  const [mode, setMode] = useState<AuthMode>("signup");
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [authAvailable] = useState(hasSupabaseBrowserConfig);
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const { theme } = useTheme();
  const isSignup = mode === "signup";

  useEffect(() => {
    let active = true;
    if (!authAvailable) return () => { active = false; };
    void Promise.resolve().then(() => createClient().auth.getUser()).then(({ data, error }) => {
      if (active && !error && data.user) router.replace("/dashboard");
    }).catch(() => { /* Network errors must not disable otherwise configured sign-in. */ });
    return () => { active = false; };
  }, [authAvailable, router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !authAvailable) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (isSignup && password.length < 10) {
      setNotice("Use at least 10 characters for your password.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const supabase = createClient();
      const next = new URLSearchParams(window.location.search).get("next");
      const returnPath = next?.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
      if (isSignup) {
        const name = String(form.get("name") ?? "").trim();
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(returnPath)}` } });
        if (error) { setNotice(authErrorMessage(error.message)); return; }
        if (data.session) { router.replace(returnPath); router.refresh(); }
        else setNotice("Account created. Check your email to verify the address before signing in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) { setNotice(authErrorMessage(error.message)); return; }
        router.replace(returnPath);
        router.refresh();
      }
    } catch { setNotice("Could not reach the authentication service. Check your connection and try again."); }
    finally { setBusy(false); }
  }

  function changeMode(next: AuthMode) {
    setMode(next);
    setNotice("");
  }

  return <main className={`auth-page auth-${theme === "spider-man" ? "dark auth-spider-man" : theme}`}>
    <div className="auth-shell">
      <section className="auth-form-side" aria-labelledby="auth-heading">
        <header className="auth-topline">
          <Link className="auth-brand" href="/" aria-label="SpendSense home"><span className="auth-brand-mark">S</span><span>Spend<span>Sense</span></span></Link>
          <ThemeSwitcher className="theme-switcher-auth" variant="compact" showSubtitle={false} />
        </header>

        <div className="auth-form-wrap">
          <div className="auth-heading-block">
            <span className="auth-eyebrow">A CLEARER FINANCIAL PICTURE</span>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={`heading-${mode}`} className="auth-heading-copy" initial={reduceMotion ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
                <h1 id="auth-heading">{isSignup ? "Make room for" : "Welcome back to"}<br /><em>what matters.</em></h1>
                <p>{isSignup ? "Bring your money into focus with a calmer, more intentional view." : "Your financial picture is right where you left it."}</p>
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="auth-mode-switch" role="group" aria-label="Account access">
            <button type="button" aria-pressed={isSignup} onClick={() => changeMode("signup")}>Create account</button>
            <button type="button" aria-pressed={!isSignup} onClick={() => changeMode("signin")}>Sign in</button>
            <motion.span className={`auth-mode-indicator ${isSignup ? "indicator-left" : "indicator-right"}`} aria-hidden="true" layout transition={{ duration: reduceMotion ? 0 : 0.24 }} />
          </div>

          <div className="auth-notice-slot" aria-live="polite">{notice && <p className="auth-notice" role="status">{notice}</p>}</div>
          <div className="auth-form-slot">
            <AnimatePresence mode="wait" initial={false}>
              <motion.form key={mode} id="auth-panel" className="auth-form" onSubmit={submit} initial={reduceMotion ? false : { opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: -5 }} transition={{ duration: 0.2 }}>
                {isSignup && <label className="auth-field">Your name<input name="name" type="text" autoComplete="name" placeholder="Alex Morgan" minLength={2} maxLength={80} required /></label>}
                <label className="auth-field">Email address<input name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></label>
                <label className="auth-field">Password<span className="auth-password-wrap"><input name="password" type={showPassword ? "text" : "password"} autoComplete={isSignup ? "new-password" : "current-password"} placeholder={isSignup ? "At least 10 characters" : "Your password"} minLength={isSignup ? 10 : 1} required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></span></label>
                {isSignup && <label className="auth-consent"><input type="checkbox" required /><span>I understand my financial records are stored in my private SpendSense account.</span></label>}
                {!isSignup && <button className="auth-forgot" type="button" disabled={busy} onClick={async () => {
                  const email = String(new FormData(document.getElementById("auth-panel") as HTMLFormElement).get("email") ?? "").trim();
                  if (!email) { setNotice("Enter your email address first so we can send a password reset link."); return; }
                  setBusy(true);
                  try {
                    const { error } = await createClient().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/auth/reset-password")}` });
                    setNotice(error ? authErrorMessage(error.message) : "If an account exists for that email, a password reset link has been sent.");
                  } catch { setNotice("Could not send a reset link. Check your connection and try again."); }
                  finally { setBusy(false); }
                }}>Forgot password?</button>}
                {!authAvailable && <p className="auth-notice" role="alert">Supabase is not configured. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to enable sign-in.</p>}
                <button className="auth-submit" type="submit" disabled={busy || !authAvailable}><span>{busy ? "Please wait…" : isSignup ? "Create your account" : "Sign in"}</span><ArrowRight size={16} /></button>
                <div className="auth-form-spacer" aria-hidden="true" />
              </motion.form>
            </AnimatePresence>
          </div>

          <div className="auth-divider"><span>PRIVATE BY DESIGN</span></div>
          <p className="auth-local-note"><ShieldCheck size={14} /> Your account keeps financial records private. Existing browser data can be reviewed and imported after sign in.</p>
        </div>
        <footer className="auth-footer"><span>© {new Date().getFullYear()} SpendSense</span><span><LockKeyhole size={11} /> Private account storage</span></footer>
      </section>

      <aside className="auth-visual" aria-label="SpendSense financial globe illustration">
        <div className="auth-visual-grain" />
        <div className="auth-visual-top"><span className="auth-live-dot" /> PERSONAL FINANCE, IN ORBIT</div>
        <div className="auth-globe-wrap"><AuthGlobe /><div className="auth-globe-halo" /></div>
        <div className="auth-visual-copy"><span>SEE THE WHOLE PICTURE</span><h2>Money moves.<br /><em>Find your center.</em></h2><p>A thoughtful space to understand where you are and decide what comes next.</p></div>
        <div className="auth-orbit-stat auth-orbit-stat-one"><span>01 / CLARITY</span><strong>Know your flow</strong></div>
        <div className="auth-orbit-stat auth-orbit-stat-two"><span>02 / CONTROL</span><strong>Set a steady pace</strong></div>
        <div className="auth-visual-foot"><span>PRIVATE BY DEFAULT</span><span>YOUR DATA · YOUR DEVICE</span></div>
      </aside>
    </div>
  </main>;
}

function authErrorMessage(message: string) {
  const normalized = message.toLocaleLowerCase();
  if (normalized.includes("invalid login") || normalized.includes("invalid credentials")) return "Email or password is incorrect.";
  if (normalized.includes("already registered") || normalized.includes("already been registered")) return "An account already exists for this email. Sign in instead.";
  if (normalized.includes("password") && normalized.includes("least")) return "Choose a longer password that meets the account requirements.";
  if (normalized.includes("rate limit")) return "Too many attempts. Wait a moment before trying again.";
  return "Authentication could not be completed. Check your details and try again.";
}
