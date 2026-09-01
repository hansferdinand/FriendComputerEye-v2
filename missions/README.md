# Friend Computer Mission JSON v1

Mission Director can load portable scene-and-cue missions without rebuilding or redeploying the app. On the Mission Director page, choose **LOAD MISSION JSON** and select a file that follows `friend-computer-mission.schema.json`.

Imported missions are validated before use and saved in the current GM browser. The projector receives only the selected cue commands; mission files cannot execute JavaScript or call arbitrary URLs.

## Author with ChatGPT

Use [`CHATGPT-AUTHORING.md`](./CHATGPT-AUTHORING.md) for the GM workflow. Attach [`CHATGPT-MISSION-PROMPT.md`](./CHATGPT-MISSION-PROMPT.md), this folder's schema, the example mission, and the source story to a new ChatGPT conversation. The prompt requires a reviewable scene plan before producing the final importable JSON.

## Required structure

- `format`: always `friend-computer-mission`
- `version`: currently `1`
- `id`: a stable lowercase identifier, 3–64 characters
- `title`, `subtitle`, `premise`: package information shown to the GM
- `publicContext`: baseline information the AI Copilot may know
- `gmGuidance`: private tone, secrets, and adjudication guidance
- `director.type`: currently `scenes` for portable files
- `director.scenes`: ordered scene cards, each with context, guidance, handouts, and projector cues

Use `example.mission.json` as the smallest practical starting point. Copy it, change the package ID and content, then load it from Mission Director.

## Portable cue commands

Mission files may use these existing projector commands:

- `set-gaze` — `x`, `y`, and optional `target`
- `set-expression` — `expression` and optional numeric `intensity`
- `set-threat` — `level`
- `set-status` — `text`
- `set-patrol` — `enabled`
- `speak` — `text`
- `effect` — `effect`

The validator rejects scenario-control, projector-overlay, networking, and unknown command types. Standard projector states remain available above every loaded mission.

## Specialized director engines

The built-in **90 Minutes to Treason** package uses the SATIATE-7 real-time countdown engine. Version 1 portable files focus on the reusable scene-and-cue format; additional specialized engines can be added later without changing existing mission files.
