import { NextRequest } from "next/server";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return map[char] ?? char;
  });
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ room: string }> },
) {
  const { room } = await context.params;
  const safeRoom = escapeHtml(room.toUpperCase());
  const controlPath = `/control/${encodeURIComponent(room)}`;
  const copilotPath = `/copilot/${encodeURIComponent(room)}`;
  const communicationsPath = `/communications/${encodeURIComponent(room)}`;
  const readinessPath = `/readiness/${encodeURIComponent(room)}`;
  const sessionPath = `/session/${encodeURIComponent(room)}`;

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <title>Alpha Complex Connection</title>
  <style>
    *{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#020405;color:#dcfcff}
    body{min-height:100vh;display:grid;place-items:center;padding:24px;font-family:"Courier New",monospace}
    main{width:min(560px,100%);border:1px solid #27646a;background:#071214;padding:28px;box-shadow:0 0 60px rgba(72,246,255,.08)}
    small{color:#7aa9ad;letter-spacing:.12em}h1{margin:10px 0 12px;font-size:32px;line-height:1.05}
    p{color:#a7c7ca;line-height:1.5}.room{padding:10px;border:1px solid #1e555a;background:#020607;color:#87f6fb;word-break:break-all}
    a{display:block;margin-top:18px;padding:14px 16px;text-align:center;text-decoration:none;font-weight:900;letter-spacing:.08em;color:#001315;background:#48f6ff}
    a.secondary{margin-top:10px;color:#9cf5f8;background:#020607;border:1px solid #27646a}
    .note{margin-top:14px;font-size:12px;color:#6e9499;line-height:1.4}
  </style>
</head>
<body>
  <main>
    <small>ALPHA COMPLEX NETWORK</small>
    <h1>Connection established.</h1>
    <p>Your phone reached Friend Computer successfully. Choose a terminal for this room:</p>
    <div class="room">${safeRoom}</div>
    <a href="${controlPath}">OPEN GM CONSOLE</a>
    <a class="secondary" href="${readinessPath}">RUN SHOW READINESS CHECK</a>
    <a class="secondary" href="${sessionPath}">OPEN MISSION CONTEXT</a>
    <a class="secondary" href="${copilotPath}">OPEN AI COPILOT</a>
    <a class="secondary" href="${communicationsPath}">OPEN CITIZEN COMMUNICATIONS</a>
    <div class="note">Manual controls remain isolated from AI, communications, mission context, and diagnostic features so an experimental subsystem failure cannot take down the show controller.</div>
  </main>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
