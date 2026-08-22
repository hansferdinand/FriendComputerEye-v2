# Friend Computer Eye v2

A ground-up rebuild of the Friend Computer display/GM prop for a *Paranoia*-style tabletop game.

## Milestone 1 — Friend Computer Lives

Milestone 1 is deliberately **offline-first**. Once the page is loaded, the actual show controls do not depend on Supabase, OpenAI, Resend, or any other service.

### Included

- Next.js 16 + React 19 + TypeScript 6
- Full-screen CRT display: `/display/[room]`
- Mobile/laptop GM controller: `/control/[room]`
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

## Milestone 2

Milestone 2 adds Supabase Realtime as a cross-device transport so the controller can run from a phone/tablet while preserving the local transports above as show-safe fallbacks.
