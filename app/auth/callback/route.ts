import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

function safeNext(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export async function GET(request: NextRequest) {
  const config = getSupabasePublicConfig();
  if (!config) return NextResponse.redirect(new URL("/auth?configuration=missing", request.url));
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/auth?verification=failed", request.url));
  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/auth?verification=failed", request.url));
  return NextResponse.redirect(new URL(safeNext(url.searchParams.get("next")), request.url));
}
