import Link from "next/link";
import { redirect } from "next/navigation";
import Dashboard from "@/components/dashboard";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseSetupError, getSupabasePublicConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  if (!getSupabasePublicConfig()) return <main className="auth-page"><section className="auth-form-side"><h1>Account storage is not configured</h1><p>{getSupabaseSetupError()}</p><Link href="/auth">Return to sign in</Link></section></main>;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || typeof claims?.sub !== "string") redirect("/auth?next=%2Fdashboard");
  return <Dashboard userId={claims.sub} userEmail={typeof claims.email === "string" ? claims.email : ""} />;
}
