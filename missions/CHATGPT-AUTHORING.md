# Building a Friend Computer Mission with ChatGPT

This guide lets a GM turn a story outline or complete adventure into a file that the current Mission Director can import.

## Easier option: use the private Mission Author connection

When ChatGPT or another AI client is connected to the Friend Computer Mission Author MCP, it can fetch the current guide, schema, and example automatically. Ask it to plan the mission first, validate the approved draft, and then send that draft to the Workshop inbox for your room.

The connection is intentionally review-first:

1. The author and ChatGPT agree on a scene plan.
2. ChatGPT generates and validates the mission.
3. ChatGPT calls `save_mission_draft` only after the author explicitly asks it to send the approved draft.
4. The GM opens `/workshop/[room]`, checks **ChatGPT Draft Inbox**, loads the draft, reviews it, and separately saves it to the Mission Library.

The MCP cannot control the live projector or any live-game system. If the connection is unavailable, use the manual file workflow below.

## What you need

Give ChatGPT these files from the repository:

1. `missions/CHATGPT-MISSION-PROMPT.md`
2. `missions/friend-computer-mission.schema.json`
3. `missions/example.mission.json`
4. Your story, outline, notes, or source document

If the ChatGPT conversation cannot accept file uploads, paste the authoring prompt first and then paste the story between the source markers it provides.

The prompt deliberately states the role, constraints, review process, and exact output requirements. This follows official OpenAI prompting guidance to provide the goal, relevant context, hard constraints, success criteria, and required output format clearly rather than relying on the model to infer them.

## Recommended workflow

### 1. Start the conversation

Upload the prompt, schema, example, and story. Then say:

> Build a Friend Computer Mission JSON v1 package from the attached story. Follow the authoring prompt. Begin with the mission plan and questions; do not produce the final JSON until I approve the plan.

### 2. Review the mission plan

Check that ChatGPT correctly separated:

- player-safe facts from GM-only secrets;
- scenes from background information;
- story events from projector cues;
- handout names from actual handout contents;
- required plot beats from optional improvisational material.

Ask for changes before approving the plan. It is easier to correct scene structure at this stage than after the JSON is generated.

### 3. Generate the file

When the plan is correct, say:

> Approved. Generate the complete importable mission file now. Validate every field and command against the attached schema. Return the JSON file and a short validation summary, with no unapproved story additions.

If ChatGPT offers a downloadable file, use a filename ending in `.mission.json`. Otherwise, copy the JSON code block into a UTF-8 plain-text file with that extension. The contents must begin with `{` and end with `}`; do not include explanatory prose inside the file.

### 4. Import and verify

Open **Mission Director**, select **LOAD MISSION JSON**, and choose the generated file. Importing validates the file but does not prove that the story is enjoyable or that every cue is paced correctly.

Before the live game:

- open every scene and review its public and GM-only text;
- test speech for pronunciation and length;
- test every effect and projector cue;
- ensure scene and cue labels are recognizable under pressure;
- confirm important moments create useful Session Log entries;
- export or retain the `.mission.json` file, because imported custom missions currently remain only in the browser that loaded them.

## Current format limitations

Friend Computer Mission JSON v1 supports ordered scenes and safe declarative projector commands. It does not currently support:

- custom countdown engines like the built-in **90 Minutes to Treason** system;
- conditional logic or branching automation;
- attached images, audio, PDFs, or actual handout files;
- arbitrary URLs, scripts, API calls, or JavaScript;
- custom projector overlays outside the existing safe commands.

Represent unsupported mechanics as GM guidance, scene objectives, or named handouts. Do not ask ChatGPT to invent unsupported command types: the importer will reject them.

## Troubleshooting

- **Mission file is not valid JSON** — Ask ChatGPT to return only one JSON object, then save only that object.
- **Unsupported command** — Ask it to replace the command with one of the exact commands in the schema.
- **Missing field** — Ask it to fill every required mission, scene, cue, and log field with a non-empty value.
- **Duplicate or confusing labels** — Ask for short, unique scene and cue IDs plus readable button labels.
- **The story contains a timer** — Keep it as GM guidance for v1, or use the Manual Controls loading timer during the game.
- **The mission imported on one device but not another** — Transfer and import the original `.mission.json` file on the other GM browser.

## Human review remains required

Treat generated mission files as drafts. The GM should verify secrets, safety boundaries, character names, tone, rules assumptions, and all player-facing text. ChatGPT should not decide which private information may be revealed during play.
