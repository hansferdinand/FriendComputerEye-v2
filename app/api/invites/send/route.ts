import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC_ORIGIN = process.env.FRIEND_COMPUTER_PUBLIC_ORIGIN ?? "https://www.alphacomplex.space";

function secureMatch(provided: string, expected: string) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, maxLength);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char] ?? char);
}

export async function POST(request: NextRequest) {
  const gmKey = process.env.FRIEND_COMPUTER_GM_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!gmKey) return NextResponse.json({ error: "Friend Computer GM authorization is not configured." }, { status: 503 });
  if (!resendKey) return NextResponse.json({ error: "Alpha Complex mail delivery is not configured." }, { status: 503 });

  const providedKey = request.headers.get("x-friend-computer-gm-key") ?? "";
  if (!secureMatch(providedKey, gmKey)) return NextResponse.json({ error: "GM authorization rejected." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid invitation request." }, { status: 400 });
  }

  const room = cleanText(body.room, 96);
  const email = cleanText(body.email, 254);
  const mode = cleanText(body.mode, 20) === "join" ? "join" : "display";
  if (!room || !email || positionOfAt(email) < 2) {
    return NextResponse.json({ error: "Room and a valid invitation email are required." }, { status: 400 });
  }

  const path = mode === "display" ? `/display/${encodeURIComponent(room)}` : `/join/${encodeURIComponent(room)}`;
  const url = `${PUBLIC_ORIGIN}${path}`;
  const action = mode === "display" ? "OPEN DISPLAY TERMINAL" : "OPEN ROOM MENU";
  const description = mode === "display"
    ? "This link opens Friend Computer directly on the invited device. On first load, name the display and choose PRIMARY AUDIO or VISUAL ONLY."
    : "This link opens the Alpha Complex room menu with access to GM tools for this room. GM-only features still require the GM passphrase.";

  const subject = mode === "display" ? "ALPHA COMPLEX DISPLAY TERMINAL INVITATION" : "ALPHA COMPLEX GM TERMINAL INVITATION";
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head><body style="margin:0;background:#020405;color:#d8f6f8;font-family:Arial,Helvetica,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td align="center" style="padding:28px 14px"><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;border:1px solid #27646a;background:#071214"><tr><td style="padding:20px 22px;border-bottom:1px solid #27646a;background:#0b2427"><div style="font-size:12px;letter-spacing:1px;color:#75cbd1">ALPHA COMPLEX NETWORK SERVICES</div><h1 style="margin:6px 0 0;font-size:24px;color:#e8feff">${escapeHtml(subject)}</h1></td></tr><tr><td style="padding:22px"><p style="font-size:16px;line-height:24px;color:#d8f6f8">A device has been invited to room <strong>${escapeHtml(room.toUpperCase())}</strong>.</p><p style="font-size:14px;line-height:22px;color:#9fc5c8">${escapeHtml(description)}</p><table cellpadding="0" cellspacing="0" role="presentation"><tr><td bgcolor="#48f6ff" style="padding:13px 18px"><a href="${escapeHtml(url)}" style="font-size:14px;font-weight:bold;color:#001315;text-decoration:none">${action}</a></td></tr></table><p style="margin-top:18px;font-size:12px;line-height:18px;color:#6e9499">The invitation contains the room address only. It does not contain or transmit the GM passphrase.</p></td></tr></table></td></tr></table></body></html>`;
  const text = `${subject}\n\nRoom: ${room.toUpperCase()}\n\n${description}\n\n${action}: ${url}\n\nThis invitation does not contain the GM passphrase.`;

  try {
    const upstream = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Alpha Complex Network <network@alphacomplex.space>",
        to: [email],
        subject,
        text,
        html,
        tags: [
          { name: "system", value: "friend-computer" },
          { name: "notice_kind", value: `device-invite-${mode}` },
        ],
      }),
      cache: "no-store",
    });

    if (!upstream.ok) {
      const errorText = await upstream.text();
      console.error("Device invitation delivery failed", upstream.status, errorText.slice(0, 500));
      return NextResponse.json({ error: `Device invitation delivery failed (${upstream.status}).` }, { status: 502 });
    }
    const data = (await upstream.json()) as { id?: string };
    return NextResponse.json({ ok: true, emailId: data.id ?? null, mode });
  } catch (error) {
    console.error("Device invitation delivery failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Unable to reach Alpha Complex mail delivery." }, { status: 502 });
  }
}

function positionOfAt(value: string) {
  return value.indexOf("@") + 1;
}
