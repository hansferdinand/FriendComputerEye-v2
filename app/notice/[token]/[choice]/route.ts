import { NextRequest } from "next/server";
import { createFriendComputerSupabase } from "@/lib/fc-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char] ?? char);
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string; choice: string }> },
) {
  const { token, choice } = await context.params;
  const safeToken = token.trim();
  const normalizedChoice = choice.toLowerCase() === "acknowledge" ? "ACKNOWLEDGED" : choice.toLowerCase() === "deny" ? "DENIED" : "";

  let accepted = false;
  let seat: number | null = null;
  let recordedChoice = normalizedChoice;

  if (/^[A-Za-z0-9_-]{24,256}$/.test(safeToken) && normalizedChoice) {
    const supabase = createFriendComputerSupabase();
    const { data, error } = await supabase.rpc("fc_record_notice_response", {
      p_token: safeToken,
      p_choice: normalizedChoice,
    });
    if (!error && Array.isArray(data) && data[0]?.accepted === true) {
      accepted = true;
      seat = Number(data[0].seat) || null;
      recordedChoice = String(data[0].choice || normalizedChoice);
    }
  }

  const headline = accepted
    ? recordedChoice === "ACKNOWLEDGED"
      ? "Acknowledgement recorded."
      : "Denial recorded."
    : "Response not accepted.";
  const detail = accepted
    ? recordedChoice === "ACKNOWLEDGED"
      ? "Friend Computer appreciates your prompt compliance. Your enthusiasm has been noted for future evaluation."
      : "Your denial has been entered into the permanent record. Denying the existence of a permanent record is not recommended."
    : "This communication token is invalid, expired, or above your security clearance.";
  const seatLine = seat ? `CITIZEN SEAT ${seat}` : "UNVERIFIED CITIZEN";

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark"><title>Alpha Complex Response</title><style>*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#020405;color:#dcfcff}body{min-height:100vh;display:grid;place-items:center;padding:24px;font-family:"Courier New",monospace}main{width:min(560px,100%);border:1px solid #27646a;background:#071214;padding:28px;box-shadow:0 0 60px rgba(72,246,255,.08)}small{color:#7aa9ad;letter-spacing:.12em}h1{margin:10px 0 12px;font-size:30px;line-height:1.08}p{color:#a7c7ca;line-height:1.55}.stamp{margin-top:18px;padding:12px;border:1px solid ${recordedChoice === "DENIED" ? "#7a3438" : "#27646a"};color:${recordedChoice === "DENIED" ? "#ffaaa5" : "#87f6fb"};font-weight:900;letter-spacing:.08em;text-align:center}.note{margin-top:18px;font-size:12px;color:#6e9499}</style></head><body><main><small>ALPHA COMPLEX CITIZEN RESPONSE TERMINAL</small><h1>${escapeHtml(headline)}</h1><p>${escapeHtml(detail)}</p><div class="stamp">${escapeHtml(seatLine)} · ${escapeHtml(recordedChoice || "INVALID")}</div><div class="note">Happiness is mandatory. Browser navigation away from this page is permitted.</div></main></body></html>`;

  return new Response(html, {
    status: accepted ? 200 : 400,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}
