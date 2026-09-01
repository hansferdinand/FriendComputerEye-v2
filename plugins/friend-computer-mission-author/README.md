# Friend Computer Mission Author

This private plugin helps an AI turn story notes into a validated Friend Computer Mission JSON v1 draft and, with explicit author approval, send it to a GM's Mission Workshop inbox.

## Connection

- MCP URL: `https://www.alphacomplex.space/api/mcp`
- Authentication: bearer token from `FRIEND_COMPUTER_MCP_TOKEN`
- Local plugin configuration: [`.mcp.json`](./.mcp.json)

Set `FRIEND_COMPUTER_MCP_TOKEN` in the client that loads this plugin. Do not commit or publish the token.

## Safe workflow

1. Ask the AI to read the authoring guide and propose a scene plan.
2. Review and revise the plan.
3. Ask it to generate and validate the complete mission.
4. Only after approving the result, ask it to send the draft to your room.
5. In Friend Computer Eye, open `/workshop/[room]`, authenticate, and use **ChatGPT Draft Inbox** to review the received draft.

Sending a draft does not change the active mission or control the game. The MCP has no projector, speech, timer, communications, or live-session tools.
