import { resolveMx, resolveTxt } from "node:dns/promises";
import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createFriendComputerSupabase } from "@/lib/fc-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAIL_HOST = "send.alphacomplex.space";
const DKIM_HOST = "resend._domainkey.alphacomplex.space";
const EXPECTED_MX = "feedback-smtp.us-east-1.amazonses.com";
const EXPECTED_SPF = "v=spf1 include:amazonses.com ~all";

function secureMatch(provided: string, expected: string) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, maxLength);
}

async function checkMailDns() {
  const result = {
    mx: { ok: false, detail: "Not checked" },
    spf: { ok: false, detail: "Not checked" },
    dkim: { ok: false, detail: "Not checked" },
  };

  const [mxResult, txtResult, dkimResult] = await Promise.allSettled([
    resolveMx(MAIL_HOST),
    resolveTxt(MAIL_HOST),
    resolveTxt(DKIM_HOST),
  ]);

  if (mxResult.status === "fulfilled") {
    const match = mxResult.value.find(
      (record) => record.exchange.replace(/\.$/, "").toLowerCase() === EXPECTED_MX && record.priority === 10,
    );
    result.mx = match
      ? { ok: true, detail: `${EXPECTED_MX} · priority 10` }
      : { ok: false, detail: "Expected Resend MX record not visible" };
  } else {
    result.mx = { ok: false, detail: "MX lookup failed" };
  }

  if (txtResult.status === "fulfilled") {
    const records = txtResult.value.map((parts) => parts.join(""));
    const match = records.some((record) => record.trim() === EXPECTED_SPF);
    result.spf = match
      ? { ok: true, detail: EXPECTED_SPF }
      : { ok: false, detail: "Expected SPF TXT record not visible" };
  } else {
    result.spf = { ok: false, detail: "SPF lookup failed" };
  }

  if (dkimResult.status === "fulfilled") {
    const records = dkimResult.value.map((parts) => parts.join(""));
    const match = records.some((record) => record.trim().startsWith("p=MIG"));
    result.dkim = match
      ? { ok: true, detail: "Resend DKIM key published" }
      : { ok: false, detail: "DKIM record is present but unexpected" };
  } else {
    result.dkim = { ok: false, detail: "DKIM lookup failed" };
  }

  return result;
}

export async function POST(request: NextRequest) {
  const gmKey = process.env.FRIEND_COMPUTER_GM_KEY;
  if (!gmKey) {
    return NextResponse.json({ error: "Friend Computer GM authorization is not configured." }, { status: 503 });
  }

  const providedKey = request.headers.get("x-friend-computer-gm-key") ?? "";
  if (!secureMatch(providedKey, gmKey)) {
    return NextResponse.json({ error: "GM authorization rejected." }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // An empty body is fine; room will fall back below.
  }

  const room = cleanText(body.room, 96) || "readiness";

  let database = { ok: false, detail: "Not checked", citizenCount: 0 };
  try {
    const supabase = createFriendComputerSupabase();
    const { data, error } = await supabase.rpc("fc_get_roster", {
      p_room: room,
      p_gm_key: providedKey,
    });
    if (error) {
      database = { ok: false, detail: "Supabase roster RPC failed", citizenCount: 0 };
    } else {
      database = {
        ok: true,
        detail: "Supabase RPC authenticated",
        citizenCount: Array.isArray(data) ? data.length : 0,
      };
    }
  } catch {
    database = { ok: false, detail: "Unable to reach Supabase", citizenCount: 0 };
  }

  const mailDns = await checkMailDns();

  return NextResponse.json(
    {
      ok: true,
      configuration: {
        gmAuthorization: true,
        openAI: Boolean(process.env.OPENAI_API_KEY),
        resend: Boolean(process.env.RESEND_API_KEY),
      },
      database,
      mailDns,
      deployment: {
        commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? "local",
        environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
        region: process.env.VERCEL_REGION ?? "unknown",
      },
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
