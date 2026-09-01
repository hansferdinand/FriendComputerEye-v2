import { timingSafeEqual } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMissionAuthorServer } from "@/lib/mission-author-mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const attempts = new Map<string, { count: number; resetAt: number }>();
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Last-Event-ID, MCP-Protocol-Version, MCP-Session-Id",
  "Access-Control-Expose-Headers": "MCP-Protocol-Version, MCP-Session-Id",
};

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } });
}

function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function rateLimited(request: Request) {
  const ip = clientIp(request);
  const now = Date.now();
  const current = attempts.get(ip);
  if (!current || current.resetAt <= now) {
    attempts.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  current.count += 1;
  return current.count > 120;
}

function authorized(request: Request) {
  const expected = process.env.FRIEND_COMPUTER_MCP_TOKEN;
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(request: Request) {
  if (!process.env.FRIEND_COMPUTER_MCP_TOKEN) return jsonError("Mission author MCP is not configured.", 503);
  if (rateLimited(request)) return jsonError("Too many MCP requests. Try again shortly.", 429);
  if (!authorized(request)) return jsonError("Bearer authorization required.", 401);

  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  const server = createMissionAuthorServer();
  await server.connect(transport);
  const response = await transport.handleRequest(request);
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(CORS_HEADERS)) headers.set(name, value);
  headers.set("Cache-Control", "no-store, max-age=0");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}

export async function DELETE(request: Request) {
  return handle(request);
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
