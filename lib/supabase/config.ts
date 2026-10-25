import "server-only";

export type SupabasePublicConfig = { url: string; publishableKey: string };

export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") return null;
  } catch { return null; }
  return { url, publishableKey };
}

export function getSupabaseSetupError() {
  return "Supabase is not configured. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or the NEXT_PUBLIC_ variants), then restart the app.";
}
