"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://jtbmzdydmxettzqmzgoz.supabase.co";

// The legacy anon key is intentionally client-public. Environment overrides let us
// rotate to a modern sb_publishable_ key later without changing application code.
const SUPABASE_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0Ym16ZHlkbXhldHR6cW16Z296Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwMDExOTgsImV4cCI6MjA5OTU3NzE5OH0.PpfObycaMGjH0WizQ--BoPyZrORSewV4g2P8Pq-s7Fg";

let browserClient: SupabaseClient | null = null;

export function getSupabaseClient() {
  if (!browserClient) {
    browserClient = createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  return browserClient;
}
