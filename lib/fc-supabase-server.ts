import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://jtbmzdydmxettzqmzgoz.supabase.co";

// This is the same intentionally-public anon/publishable credential used by the
// browser Realtime transport. Private Friend Computer tables are inaccessible
// directly; only GM-key-gated SECURITY DEFINER RPCs are executable.
const SUPABASE_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0Ym16ZHlkbXhldHR6cW16Z296Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwMDExOTgsImV4cCI6MjA5OTU3NzE5OH0.PpfObycaMGjH0WizQ--BoPyZrORSewV4g2P8Pq-s7Fg";

export function createFriendComputerSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
