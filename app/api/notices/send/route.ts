import { randomBytes, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createFriendComputerSupabase } from "@/lib/fc-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC_ORIGIN = process.env.FRIEND_COMPUTER_PUBLIC_ORIGIN ?? "https://www.alphacomplex.space";

const SENDERS = {
  friend_computer: { label: "Friend Computer", email: "friendcomputer@alphacomplex.space" },
  citizen_services: { label: "Citizen Services", email: "citizen-services@alphacomplex.space" },
  internal_security: { label: "Internal Security", email: "internal-security@alphacomplex.space" },
  happiness_office: { label: "Happiness Office", email: "happiness-office@alphacomplex.space" },
  termination_services: { label: "Termination Services", email: "termination-services@alphacomplex.space" },
} as const;

type SenderKey = keyof typeof SENDERS;

type CitizenRow = {
  seat: number;
  citizen_id: string;
  display_name: string;
  clearance: string;
  clone_number: number;
  email: string | null;
};

function secureMatch(provided: string, expected: string) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.replace(/\r/g, "").trim().slice(0, maxLength);
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

function paragraphHtml(body: string) {
  return body
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#d8f6f8;margin-top:0;margin-bottom:18px;">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function noticeHtml(input: {
  citizen: CitizenRow;
  senderLabel: string;
  subject: string;
  body: string;
  acknowledgeUrl?: string;
  denyUrl?: string;
}) {
  const { citizen, senderLabel, subject, body, acknowledgeUrl, denyUrl } = input;
  const buttons = acknowledgeUrl && denyUrl
    ? `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr><td style="padding-top:10px;padding-bottom:6px;"><table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr><td bgcolor="#48f6ff" style="background-color:#48f6ff;padding-top:12px;padding-right:18px;padding-bottom:12px;padding-left:18px;"><a href="${escapeHtml(acknowledgeUrl)}" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:18px;color:#001315;text-decoration:none;font-weight:bold;">ACKNOWLEDGE</a></td><td style="width:10px;"></td><td bgcolor="#40171a" style="background-color:#40171a;padding-top:12px;padding-right:18px;padding-bottom:12px;padding-left:18px;"><a href="${escapeHtml(denyUrl)}" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:18px;color:#ffb4ae;text-decoration:none;font-weight:bold;">DENY</a></td></tr></table></td></tr></table>`
    : "";

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="X-UA-Compatible" content="IE=edge"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#020405;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr><td align="center" bgcolor="#020405" style="background-color:#020405;padding-top:28px;padding-right:14px;padding-bottom:28px;padding-left:14px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="max-width:600px;border-collapse:collapse;border:1px solid #27646a;background-color:#071214;">
<tr><td bgcolor="#0b2427" style="background-color:#0b2427;padding-top:18px;padding-right:22px;padding-bottom:18px;padding-left:22px;border-bottom:1px solid #27646a;"><p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:16px;color:#75cbd1;margin-top:0;margin-bottom:5px;letter-spacing:1px;">ALPHA COMPLEX OFFICIAL COMMUNICATION</p><p style="font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:30px;color:#e8feff;margin-top:0;margin-bottom:0;font-weight:bold;">${escapeHtml(subject)}</p></td></tr>
<tr><td style="padding-top:22px;padding-right:22px;padding-bottom:8px;padding-left:22px;"><p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#8fbfc3;margin-top:0;margin-bottom:14px;">RECIPIENT: <strong style="color:#d8f6f8;">${escapeHtml(citizen.citizen_id)}</strong><br>CLEARANCE: ${escapeHtml(citizen.clearance)} · CLONE ${citizen.clone_number}<br>ISSUING AUTHORITY: ${escapeHtml(senderLabel)}</p>${paragraphHtml(body)}${buttons}</td></tr>
<tr><td bgcolor="#041013" style="background-color:#041013;padding-top:14px;padding-right:22px;padding-bottom:14px;padding-left:22px;border-top:1px solid #1e4347;"><p style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:17px;color:#6e9499;margin-top:0;margin-bottom:0;">This communication is intended for the designated Citizen only. Unauthorized comprehension may exceed your security clearance. Happiness is mandatory.</p></td></tr>
</table></td></tr></table></body></html>`;
}

export async function POST(request: NextRequest) {
  const gmKey = process.env.FRIEND_COMPUTER_GM_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!gmKey) return NextResponse.json({ error: "Friend Computer GM authorization is not configured." }, { status: 503 });
  if (!resendKey) return NextResponse.json({ error: "Alpha Complex mail delivery is not configured on this deployment." }, { status: 503 });

  const providedKey = request.headers.get("x-friend-computer-gm-key") ?? "";
  if (!secureMatch(providedKey, gmKey)) return NextResponse.json({ error: "GM authorization rejected." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid notice request." }, { status: 400 });
  }

  const room = cleanText(body.room, 96);
  const seat = Number(body.seat);
  const senderPersona = cleanText(body.senderPersona, 48) as SenderKey;
  const noticeKind = cleanText(body.noticeKind, 48) || "official_notice";
  const subject = cleanText(body.subject, 160).replace(/[\n\t]+/g, " ");
  const messageBody = cleanText(body.body, 4000);
  const includeResponse = body.includeResponse !== false;

  if (!room || !Number.isInteger(seat) || seat < 1 || seat > 4 || !subject || !messageBody || !(senderPersona in SENDERS)) {
    return NextResponse.json({ error: "Notice is incomplete or invalid." }, { status: 400 });
  }

  const supabase = createFriendComputerSupabase();
  const { data: rosterData, error: rosterError } = await supabase.rpc("fc_get_roster", {
    p_room: room,
    p_gm_key: providedKey,
  });
  if (rosterError) {
    console.error("Notice recipient lookup failed", rosterError.message);
    return NextResponse.json({ error: "Unable to resolve citizen recipient." }, { status: 502 });
  }

  const citizen = ((rosterData ?? []) as CitizenRow[]).find((row) => Number(row.seat) === seat);
  if (!citizen) return NextResponse.json({ error: "That citizen is not in the directory." }, { status: 404 });
  if (!citizen.email) return NextResponse.json({ error: "That citizen has no email address on file." }, { status: 400 });

  const sender = SENDERS[senderPersona];
  const token = includeResponse ? randomBytes(24).toString("base64url") : null;
  const acknowledgeUrl = token ? `${PUBLIC_ORIGIN}/notice/${encodeURIComponent(token)}/acknowledge` : undefined;
  const denyUrl = token ? `${PUBLIC_ORIGIN}/notice/${encodeURIComponent(token)}/deny` : undefined;

  if (token) {
    const { data: registered, error: registerError } = await supabase.rpc("fc_register_notice", {
      p_room: room,
      p_gm_key: providedKey,
      p_seat: seat,
      p_token: token,
      p_notice_kind: noticeKind,
      p_sender_persona: senderPersona,
      p_subject: subject,
    });
    if (registerError || registered !== true) {
      console.error("Notice ledger registration failed", registerError?.message ?? "rpc rejected");
      return NextResponse.json({ error: "Unable to register the official notice." }, { status: 502 });
    }
  }

  const textResponse = token
    ? `\n\nACKNOWLEDGE: ${acknowledgeUrl}\nDENY: ${denyUrl}`
    : "";
  const text = `ALPHA COMPLEX OFFICIAL COMMUNICATION\n\n${subject}\n\nRecipient: ${citizen.citizen_id}\nClearance: ${citizen.clearance} · Clone ${citizen.clone_number}\nIssuing authority: ${sender.label}\n\n${messageBody}${textResponse}\n\nHappiness is mandatory.`;

  try {
    const upstream = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${sender.label} <${sender.email}>`,
        to: [citizen.email],
        subject,
        text,
        html: noticeHtml({ citizen, senderLabel: sender.label, subject, body: messageBody, acknowledgeUrl, denyUrl }),
        tags: [
          { name: "system", value: "friend-computer" },
          { name: "notice_kind", value: noticeKind.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48) || "official_notice" },
        ],
      }),
      cache: "no-store",
    });

    if (!upstream.ok) {
      const errorText = await upstream.text();
      console.error("Resend notice delivery failed", upstream.status, errorText.slice(0, 500));
      if (token) {
        await supabase.rpc("fc_remove_notice", { p_room: room, p_gm_key: providedKey, p_token: token });
      }
      return NextResponse.json({ error: `Alpha Complex mail delivery failed (${upstream.status}).` }, { status: 502 });
    }

    const data = (await upstream.json()) as { id?: string };
    return NextResponse.json({ ok: true, emailId: data.id ?? null });
  } catch (error) {
    console.error("Alpha Complex mail delivery failed", error instanceof Error ? error.message : "unknown error");
    if (token) {
      await supabase.rpc("fc_remove_notice", { p_room: room, p_gm_key: providedKey, p_token: token });
    }
    return NextResponse.json({ error: "Unable to reach Alpha Complex mail delivery." }, { status: 502 });
  }
}
