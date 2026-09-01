# Friend Computer Eye v2

A ground-up rebuild of the Friend Computer display/GM prop for a *Paranoia*-style tabletop game.

## Milestone 1 — Friend Computer Lives

Milestone 1 is deliberately **offline-first**. Once the page is loaded, the actual show controls do not depend on Supabase, OpenAI, Resend, or any other service.

### Included

- Next.js 16 + React 19 + TypeScript 6
- Full-screen CRT display: `/display/[room]`
- Mobile/laptop GM controller: `/control/[room]`
- The landing page defaults to the simple `alpha` room, remembers the last room used, and can generate an optional four-digit room code.
- SVG eye with organic gaze, idle scanning, micro-saccades, pupil breathing, perspective compression, expressions, automatic blinking and manual double-blinks
- Four player gaze presets plus pointer tracking and patrol mode
- Full Paranoia security/threat spectrum from INFRARED through ULTRAVIOLET
- System error, clone delivery, interrogation, drugged, glitch, degauss, eye hide/show, and reset effects
- Five legacy propaganda images, recompressed for fast loading
- Legacy CRT startup + hum audio, including speech ducking
- Browser speech synthesis for typed Friend Computer dialogue
- Random Alpha Complex status messages
- Direct keyboard emergency controls on the display
- `BroadcastChannel` command bus with a `localStorage` cross-tab fallback
- Player labels persisted locally in the GM browser
- GitHub Actions verification for dependency install, TypeScript, and the production Next.js build

## Run locally

```bash
npm install
npm run dev
```

Open both pages under the same browser origin:

- `http://localhost:3000/display/alpha`
- `http://localhost:3000/control/alpha`

The display must be clicked once on **INITIALIZE FRIEND COMPUTER** so the browser permits CRT audio.

## Emergency display hotkeys

| Key | Action |
| --- | --- |
| `1`–`4` | Look at player positions |
| `A` | Angry |
| `S` | Suspicious / squint |
| `I` | Interrogation |
| `B` | Propaganda |
| `C` | Clone alert |
| `D` | Degauss |
| `G` | Glitch |
| `H` | Eye on/off |
| `L` | Drugged |
| `P` | Patrol on/off |
| `Space` | Blink |
| `Esc` | Reset display |

## Current platform

The repository now includes the later show-running systems as well as the original display and manual controller:

- Supabase Realtime Broadcast, presence, display acknowledgements, and local browser fallbacks
- multi-display naming with primary-audio and visual-only roles
- text and realtime AI Copilot surfaces with GM-controlled projector actions
- persistent Mission Context and Session Event Log
- Mission Director packages and projector cues
- Manual Controls loading bar with minute, hour, day, week, and year countdown labels
- citizen roster, notices, secret-society mail, invitations, and Resend delivery
- show-readiness diagnostics

The manual controller remains isolated at `/control/[room]`; optional GM tools are linked from its menu and the zero-JavaScript `/join/[room]` checkpoint.

## Mission Director scenarios

Open `/mission/[room]` and select a mission package. Existing general Friend Computer behavior remains available while a package is active.

Planning and authoring resources:

- [`ROADMAP.md`](./ROADMAP.md) — partner-ready product roadmap, including the Mission Workshop, rehearsal, handoff, navigation redesign, and private messaging.
- [`missions/CHATGPT-AUTHORING.md`](./missions/CHATGPT-AUTHORING.md) — step-by-step instructions for building an importable mission with ChatGPT.
- [`missions/CHATGPT-MISSION-PROMPT.md`](./missions/CHATGPT-MISSION-PROMPT.md) — the reusable authoring instructions to attach to a ChatGPT conversation.
- `/importer/[room]` — review-first Story Importer for pasted text and `.txt` / `.md` files; AI conversion is optional and local Markdown outlining remains available.
- `/handoff/[room]` — create and verify credential-safe GM Handoff JSON packages, preview every imported category, and restore selected items into a new room.
- `/messages/[room]` — GM private-messaging console with revocable player inbox links, unread states, retention controls, quick replies, and optional player-to-player channels.
- `/inbox/[token]` — mobile-first participant inbox; links are private capability credentials and should be shared only with their intended player.
- [`missions/example.mission.json`](./missions/example.mission.json) — the smallest practical mission example.
- [`missions/friend-computer-mission.schema.json`](./missions/friend-computer-mission.schema.json) — the authoritative Friend Computer Mission JSON v1 schema.

### Mission Author MCP

The private authoring MCP at `https://www.alphacomplex.space/api/mcp` lets an approved AI client read the current authoring guide, schema, and example; validate a mission; and send a human-approved draft to the room's Mission Workshop inbox.

- The server requires `Authorization: Bearer <FRIEND_COMPUTER_MCP_TOKEN>`.
- It exposes authoring and draft-transfer tools only. It cannot operate displays, speech, timers, messages, or live-game controls.
- Saving a draft never publishes it or changes the active mission. A GM must open `/workshop/[room]`, authenticate, review the draft, and deliberately save it to the local Mission Library.
- The shareable plugin source is in [`plugins/friend-computer-mission-author`](./plugins/friend-computer-mission-author).
- Keep the MCP token private. Rotate the Vercel environment variable if a copy is lost or shared with the wrong person.

### 90 Minutes to Treason

The `90-minutes-to-treason` package adds a show-safe SATIATE-7 runtime:

- paused-by-default `01:30:00` real-time countdown
- automatic persistent Mission Context activation when the package is selected
- start, pause/resume, reset, add/remove, manual time, and manual zero controls
- GM-only, dismissible pacing reminders
- Friend Computer, R&D, treason, and device-warning presentation presets
- explicitly armed final pre-service sequence
- selectable lunch, malfunction, weaponized, and destroyed-device endings
- structured SATIATE subsystem tracking and Session Log notes
- room-scoped local recovery plus resynchronization when displays join

The display derives its countdown from an absolute deadline, preventing drift across throttled tabs or multiple projectors. Returning to another package or using **Return to Friend Computer** exits scenario presentation without replacing the normal Eye, Copilot, speech, communications, or logging systems.
