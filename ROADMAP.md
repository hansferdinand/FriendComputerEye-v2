# Friend Computer Eye v2 — Product Roadmap

## Product direction

Friend Computer Eye should become a complete game-running console: easy for a new GM to learn, easy to load with a new story, safe to rehearse, and reliable during a live game. The eye and projector remain the theatrical center, while authoring, communications, and session tools should feel like parts of one coherent product rather than unrelated pages.

The next game is approximately one month away. The recommended milestone is **Partner-Ready Mission Operations**.

## Current implementation status

- **Built locally:** unified, grouped GM navigation with current-page descriptions and responsive layouts.
- **Built locally:** Mission Library import, replacement warning, portable download, duplicate-as-custom, source/type summary, and custom-mission removal.
- **Built locally:** visual Mission Workshop with room-scoped draft recovery, mission metadata, ordered scenes, handouts, public/private context, visual projector-cue composition, optional Session Log entries, validation, connected-display preview, library save, and download.
- **Built locally:** rehearsal mode with an embedded simulated projector, room-scoped isolation banner, cue and scene checklist, specialized countdown practice, accelerated timers, clean reset, and pre-show readiness handoff.
- **Built locally:** Story Importer for pasted text and `.txt` / `.md` files, with secured structured AI conversion, a local Markdown fallback, source separation, scene/cue regeneration, unsupported-mechanics detection, explicit per-scene approval, and Workshop handoff.
- **Built locally:** versioned GM Handoff Package export/import with SHA-256 validation, safe roster labels, mission and Workshop restore, preset sharing, display/audio recommendations, handout manifest, paused rehearsal recovery, selective target-room import, and explicit credential exclusions.
- **Built locally:** identity-scoped private messaging with disclosed privacy rules, revocable 30-day participant links, encrypted message bodies, unread state, GM quick replies, configurable retention, optional player-to-player channels that remain unreadable through the GM RPC, and mobile-first inboxes.
- **Built locally:** private Mission Author MCP and shareable AI-client plugin with current schema/example access, structured validation, human-approved draft delivery, a GM-authenticated Workshop inbox, and no access to live-game controls.

## Success criteria for the next game

- A GM who did not build the app can understand where every major feature lives.
- She can create or import a mission without hand-editing JSON.
- A mission can be exported from one browser and restored on another device.
- She can rehearse the entire mission without contaminating live context or logs.
- The pre-show check confirms the projector, audio role, mission, handouts, and communications are ready.
- Players can privately contact the GM and, if enabled for the room, one another.
- The live interface keeps the current scene, likely next actions, and emergency controls close at hand.

## Workstream 1 — Navigation and UI cleanup

### Unified Game Console

Replace the collection of loosely related page names with one clear room-scoped console and four understandable sections:

1. **RUN GAME** — Live Director, current scene, cues, timers, projector controls, and emergency actions.
2. **BUILD MISSION** — Mission Library, visual editor, story import, handouts, presets, validation, and export.
3. **COMMUNICATIONS** — Player roster, private messages, notices, and secret-society traffic.
4. **SETUP** — Displays, primary audio, invitations, room access, readiness checks, and rehearsal mode.

Each screen should include:

- a persistent room name and active mission indicator;
- a plain-language page description;
- consistent primary navigation instead of a differently ordered link collection;
- breadcrumbs or a visible section title;
- display, audio, transport, and authorization status in the same location;
- a compact GM Tools drawer for emergency access;
- responsive layouts suitable for a laptop or tablet;
- keyboard focus, contrast, labels, and confirmation behavior appropriate for a dark room.

### Live-running workspace

- Current scene and one-click next/previous scene navigation.
- Pinned or favorite cues.
- Recent-command history with a safe Undo where possible.
- Private GM reminders and scene completion markers.
- Persistent access to speech, projector states, loading timer, reset, and all-clear.
- Clear separation between commands that affect the projector and changes that only affect GM notes.

## Workstream 2 — Mission Workshop

### Mission Library

- Create, rename, duplicate, archive, delete, import, and export missions.
- Show format version, last edited time, scene count, validation state, and storage location.
- Preserve the two built-in missions as read-only templates that can be duplicated.
- Warn before replacing an imported mission with the same ID.
- Add automatic local drafts and recovery after a refresh or crash.

### Visual Mission Builder

- Forms for title, subtitle, premise, public context, and private GM guidance.
- Drag-and-drop scene ordering.
- Scene forms for location, description, objective, public context, GM guidance, handouts, and log visibility.
- Cue composer using friendly controls for expression, threat level, gaze target, status text, speech, effects, and session-log entries.
- Duplicate and reorder scenes or cues.
- Preview an individual cue on a simulated display.
- Advanced JSON view for inspection and troubleshooting, without making JSON the default workflow.

### Story Importer

- Paste story text or upload `.txt` and `.md` initially; add `.docx` and `.pdf` after extraction and layout handling are verified.
- Convert the source into a draft mission, never directly into the live library without review.
- Present a review step for scene boundaries, public versus GM-only information, suggested dialogue, cues, handouts, and logs.
- Identify unsupported mechanics such as specialized countdowns or external media instead of silently dropping them.
- Keep source material clearly separated from authoring instructions.
- Allow regeneration of one scene or cue without rewriting approved sections.

### Validation and preflight

- Human-readable errors that point to the exact mission, scene, cue, or command.
- Checks for missing required fields, duplicate IDs, empty scenes, invalid command values, excessively long speech, and unsupported features.
- Warnings for missions without an opening cue, conclusion, important log entry, or public context.
- A final **READY TO REHEARSE** and **READY TO RUN** status.

## Workstream 3 — Portability, sharing, and handoff

### Export and sharing

- Download any custom mission as a valid Friend Computer Mission JSON file.
- Copy or download a ChatGPT-ready authoring package containing the schema, example, and authoring instructions.
- Add a share link or cloud Mission Library after access control is defined.
- Preserve backwards compatibility with Friend Computer Mission JSON v1.

### GM Handoff Package

Define a versioned bundle that can contain:

- the mission file;
- player names and seat assignments;
- custom projector and speech presets;
- display and primary-audio recommendations;
- handout files or a handout manifest;
- rehearsal and preflight notes;
- optional room configuration without embedding the GM passphrase;
- checksums and a manifest version for validation.

Import must show exactly what will be changed and allow the receiving GM to choose a new room code. Secrets and credentials must never be exported in plaintext.

## Workstream 4 — Rehearsal mode

- A visible, unmistakable **REHEARSAL** banner across every GM screen.
- An embedded simulated projector for single-device practice.
- The ability to run every scene, cue, message, ending, timer, and projector state.
- No writes to live Mission Context, Session Log, player messages, or notices.
- Reset rehearsal state to a clean mission start.
- A cue checklist recording what has and has not been tested.
- Optional accelerated timers for testing long countdowns.
- A one-click transition from a successful rehearsal to pre-show readiness, never directly to a live session without confirmation.

## Workstream 5 — Private in-game communications

### Player and GM messaging

- A private inbox for every invited participant.
- Direct messages from a player to the GM and from the GM to an individual player.
- Optional player-to-player direct messages controlled by a room setting.
- Unread counts, delivery state, timestamps, and clear sender identity.
- Quick GM replies and Paranoia-themed message templates.
- Optional scene or mission links in GM messages without exposing GM-only text.
- Mobile-first player view accessed through an invite link or QR code.

### Privacy and access requirements

- “Private” must have an explicit product meaning. The recommended default is that only sender and recipient can read a direct message; do not give the GM silent access to player-to-player messages.
- If a game intentionally allows GM oversight, disclose that room policy to every participant before messaging begins.
- Use participant invite tokens or authenticated room identities rather than trusting a display name or room code alone.
- Enforce message access on the server, not only by hiding UI controls.
- Provide configurable session retention and a clear **Delete Session Messages** action.
- Do not place the GM passphrase, private context, or message contents in URLs, browser logs, or exported handoff files.
- Decide whether messages are retained for post-game review or automatically expire before implementation is considered complete.

## Workstream 6 — Generic mission mechanics

- Mission-defined countdowns and count-ups.
- Scheduled and conditional reminders.
- Named phases, escalating presentation states, and branching endings.
- Reusable timer labels and time scales.
- Mission-defined custom cue groups and standard presets.
- A safe declarative rule format; portable mission files must never execute arbitrary JavaScript.

This should become Friend Computer Mission JSON v2 only when the v1 migration and compatibility story is documented and tested.

## Workstream 7 — Handouts and player experience

- Upload and organize actual handout files rather than storing names alone.
- Deliver a handout privately, to a selected group, or to everyone.
- Track delivery without requiring the GM to leave the live-running screen.
- Add character/seat identities, secret-society channels, equipment notices, and clone-status updates.
- Allow players to respond to structured prompts without gaining access to GM tools.

## Workstream 8 — Session resilience and review

- Save and restore a complete session snapshot.
- Resume the active mission, scene, timers, player roster, and display state after a restart.
- Export a post-game report from Mission Context, important log events, cue history, and messages according to the room retention policy.
- Add command history, acknowledgements, and recovery guidance when a display disconnects.
- Provide a show-safe offline fallback for critical controls and clearly identify features that require the network.

## Recommended four-week build sequence

### Week 1 — Understandable foundation

- Finalize the information architecture and navigation labels.
- Build the Mission Library CRUD and export flow.
- Add validation summaries and local draft recovery.
- Test the existing ChatGPT authoring kit with at least two different mission outlines.

### Week 2 — Authoring

- Build the visual Mission Builder.
- Add paste/Markdown story import and review.
- Add cue preview and simulated projector.
- Design the handoff bundle manifest.

### Week 3 — Handoff and rehearsal

- Implement rehearsal isolation and accelerated timer testing.
- Implement handoff export/import without credentials.
- Add preflight checks for mission, handouts, display, audio, and communications.
- Conduct a complete partner-led rehearsal and record confusing UI moments.

### Week 4 — Messaging and show hardening

- Implement identity-scoped private GM/player messaging.
- Add unread indicators and quick replies to the live workspace.
- Apply the final navigation and responsive UI polish.
- Run restart, disconnect, multi-display, and full-show drills.
- Freeze risky feature work several days before the game and use the remaining time for fixes and rehearsal.

## Decisions made

1. Player-to-player messaging is disabled by default and must be enabled by the GM per room.
2. Player-to-player messages are genuinely private from the GM; the GM database function cannot return them.
3. Messages auto-delete after seven days by default, configurable from 24 hours to 30 days, with an explicit room purge action.
4. Should mission and handoff sharing remain file-based for the next game, or should cloud sharing be included this month?
5. Which story sources matter first: paste, Markdown, Word, PDF, or Google Docs?
6. Should generic mission timers be included in the next-game milestone or follow immediately afterward as Mission JSON v2?
