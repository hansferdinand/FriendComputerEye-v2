import { randomBytes, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createFriendComputerSupabase } from "@/lib/fc-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC_ORIGIN = process.env.FRIEND_COMPUTER_PUBLIC_ORIGIN ?? "https://www.alphacomplex.space";
const MAX_CITIZENS = 16;

const SENDERS = {
  friend_computer: { label: "Friend Computer", email: "friendcomputer@alphacomplex.space" },
  citizen_services: { label: "Citizen Services", email: "citizen-services@alphacomplex.space" },
  internal_security: { label: "Internal Security", email: "internal-security@alphacomplex.space" },
  happiness_office: { label: "Happiness Office", email: "happiness-office@alphacomplex.space" },
  termination_services: { label: "Termination Services", email: "termination-services@alphacomplex.space" },
} as const;

type OfficialSenderKey = keyof typeof SENDERS;
type SenderKey = OfficialSenderKey | "secret_society";

type CitizenRow = {
  seat: number;
  citizen_id: string;
  display_name: string;
  clearance: string;
  clone_number: number;
  email: string | null;
  secret_society: string | null;
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

function emailLooksValid(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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

function paragraphHtml(body: string, color = "#d8f6f8") {
  return body
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:${color};margin-top:0;margin-bottom:18px;">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function societySlug(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "classified-society";
}

function responseButtons(acknowledgeUrl?: string, denyUrl?: string) {
  return acknowledgeUrl && denyUrl
    ? `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr><td style="padding-top:10px;padding-bottom:6px;"><table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr><td bgcolor="#48f6ff" style="background-color:#48f6ff;padding-top:12px;padding-right:18px;padding-bottom:12px;padding-left:18px;"><a href="${escapeHtml(acknowledgeUrl)}" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:18px;color:#001315;text-decoration:none;font-weight:bold;">ACKNOWLEDGE</a></td><td style="width:10px;"></td><td bgcolor="#40171a" style="background-color:#40171a;padding-top:12px;padding-right:18px;padding-bottom:12px;padding-left:18px;"><a href="${escapeHtml(denyUrl)}" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:18px;color:#ffb4ae;text-decoration:none;font-weight:bold;">DENY</a></td></tr></table></td></tr></table>`
    : "";
}

function officialNoticeHtml(input: {
  citizen: CitizenRow;
  senderLabel: string;
  subject: string;
  body: string;
  acknowledgeUrl?: string;
  denyUrl?: string;
}) {
  const { citizen, senderLabel, subject, body, acknowledgeUrl, denyUrl } = input;
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="X-UA-Compatible" content="IE=edge"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#020405;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr><td align="center" bgcolor="#020405" style="background-color:#020405;padding-top:28px;padding-right:14px;padding-bottom:28px;padding-left:14px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="max-width:600px;border-collapse:collapse;border:1px solid #27646a;background-color:#071214;">
<tr><td bgcolor="#0b2427" style="background-color:#0b2427;padding-top:18px;padding-right:22px;padding-bottom:18px;padding-left:22px;border-bottom:1px solid #27646a;"><p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:16px;color:#75cbd1;margin-top:0;margin-bottom:5px;letter-spacing:1px;">ALPHA COMPLEX OFFICIAL COMMUNICATION</p><p style="font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:30px;color:#e8feff;margin-top:0;margin-bottom:0;font-weight:bold;">${escapeHtml(subject)}</p></td></tr>
<tr><td style="padding-top:22px;padding-right:22px;padding-bottom:8px;padding-left:22px;"><p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#8fbfc3;margin-top:0;margin-bottom:14px;">RECIPIENT: <strong style="color:#d8f6f8;">${escapeHtml(citizen.citizen_id)}</strong><br>CLEARANCE: ${escapeHtml(citizen.clearance)} · CLONE ${citizen.clone_number}<br>ISSUING AUTHORITY: ${escapeHtml(senderLabel)}</p>${paragraphHtml(body)}${responseButtons(acknowledgeUrl, denyUrl)}</td></tr>
<tr><td bgcolor="#041013" style="background-color:#041013;padding-top:14px;padding-right:22px;padding-bottom:14px;padding-left:22px;border-top:1px solid #1e4347;"><p style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:17px;color:#6e9499;margin-top:0;margin-bottom:0;">This communication is intended for the designated Citizen only. Unauthorized comprehension may exceed your security clearance. Happiness is mandatory.</p></td></tr>
</table></td></tr></table></body></html>`;
}

function societyNoticeHtml(input: { citizen: CitizenRow; society: string; subject: string; body: string }) {
  const { citizen, society, subject, body } = input;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head><body style="margin:0;background:#050505;color:#f2efe4"><table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td align="center" style="padding:28px 14px"><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;border:1px solid #6b5f34;background:#11100c"><tr><td style="padding:18px 22px;border-bottom:1px solid #6b5f34;background:#1b180e"><p style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:1.4px;color:#c7b76b;margin:0 0 6px">UNAUTHORIZED ENCRYPTED CHANNEL</p><p style="font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:30px;color:#fff8cf;margin:0;font-weight:bold">${escapeHtml(subject)}</p></td></tr><tr><td style="padding:22px"><p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#b7ad87;margin-top:0;margin-bottom:16px">TO: <strong style="color:#f7efca">${escapeHtml(citizen.citizen_id)}</strong><br>SOURCE: ${escapeHtml(society)}<br>CHANNEL STATUS: DENIABLE</p>${paragraphHtml(body, "#eee8cd")}</td></tr><tr><td style="padding:14px 22px;border-top:1px solid #4d472d;background:#0b0a07"><p style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:17px;color:#82795b;margin:0">Delete after reading. If deletion is impossible, deny reading. If denial is impossible, blame Communications & Recording.</p></td></tr></table></td></tr></table></body></html>`;
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

  if (!room || !Number.isInteger(seat) || seat < 1 || seat > MAX_CITIZENS || !subject || !messageBody || (!(senderPersona in SENDERS) && senderPersona !== "secret_society")) {
    return NextResponse.json({ error: "Notice is incomplete or invalid." }, { status: 400 });
  }

  const supabase = createFriendComputerSupabase();
  const { data: sessionAccepted, error: sessionError } = await supabase.rpc("fc_ensure_session", {
    p_room: room,
    p_gm_key: providedKey,
  });
  if (sessionError) {
    console.error("Notice room authorization failed", sessionError.message);
    return NextResponse.json({ error: "Unable to authorize the Alpha Complex mail room." }, { status: 502 });
  }
  if (sessionAccepted !== true) {
    return NextResponse.json(
      { error: "This room is bound to a different GM passphrase. Reopen the current Join Menu or use the passphrase that created this room." },
      { status: 409 },
    );
  }

  const { data: rosterData, error: rosterError } = await supabase.rpc("fc_get_roster_private", {
    p_room: room,
    p_gm_key: providedKey,
  });
  if (rosterError) {
    console.error("Notice recipient lookup failed", rosterError.message);
    return NextResponse.json({ error: "Unable to resolve citizen recipient." }, { status: 502 });
  }

  const citizen = ((rosterData ?? []) as CitizenRow[]).find((row) => Number(row.seat) === seat);
  if (!citizen) return NextResponse.json({ error: "That citizen is not saved in the directory. Save the Citizen before sending mail." }, { status: 404 });
  if (!citizen.email) return NextResponse.json({ error: "That citizen has no saved email address." }, { status: 400 });
  if (!emailLooksValid(citizen.email)) return NextResponse.json({ error: "That citizen's saved email address is invalid. Correct and save it before sending." }, { status: 400 });

  const isSociety = senderPersona === "secret_society";
  const society = cleanText(citizen.secret_society, 100);
  if (isSociety && !society) return NextResponse.json({ error: "That citizen has no secret society configured." }, { status: 400 });

  const sender = isSociety
    ? { label: society, email: `society-${societySlug(society)}@alphacomplex.space`, ledger: `society:${societySlug(society)}` }
    : { ...SENDERS[senderPersona as OfficialSenderKey], ledger: senderPersona };

  // Secret-society messages are deliberately deniable and never link back to the Alpha Complex response terminal.
  const includeResponse = !isSociety && body.includeResponse !== false;
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
      p_sender_persona: sender.ledger,
      p_subject: subject,
    });
    if (registerError || registered !== true) {
      console.error("Notice ledger registration failed", registerError?.message ?? "rpc rejected");
      return NextResponse.json({ error: "Unable to register the official notice." }, { status: 502 });
    }
  }

  const text = isSociety
    ? `UNAUTHORIZED ENCRYPTED CHANNEL\n\n${subject}\n\nTo: ${citizen.citizen_id}\nSource: ${society}\n\n${messageBody}\n\nDelete after reading. If deletion is impossible, deny reading.`
    : `ALPHA COMPLEX OFFICIAL COMMUNICATION\n\n${subject}\n\nRecipient: ${citizen.citizen_id}\nClearance: ${citizen.clearance} · Clone ${citizen.clone_number}\nIssuing authority: ${sender.label}\n\n${messageBody}${token ? `\n\nACKNOWLEDGE: ${acknowledgeUrl}\nDENY: ${denyUrl}` : ""}\n\nHappiness is mandatory.`;

  const html = isSociety
    ? societyNoticeHtml({ citizen, society, subject, body: messageBody })
    : officialNoticeHtml({ citizen, senderLabel: sender.label, subject, body: messageBody, acknowledgeUrl, denyUrl });

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
        html,
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
    return NextResponse.json({ ok: true, emailId: data.id ?? null, senderLabel: sender.label });
  } catch (error) {
    console.error("Alpha Complex mail delivery failed", error instanceof Error ? error.message : "unknown error");
    if (token) {
      await supabase.rpc("fc_remove_notice", { p_room: room, p_gm_key: providedKey, p_token: token });
    }
    return NextResponse.json({ error: "Unable to reach Alpha Complex mail delivery." }, { status: 502 });
  }
}
