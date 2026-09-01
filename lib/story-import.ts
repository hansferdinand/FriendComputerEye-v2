import {
  MISSION_FILE_FORMAT,
  MISSION_FILE_VERSION,
  parseMissionPackageFile,
  type SceneMissionPackageFile,
} from "@/lib/mission-package-format";
import type { MissionCue, MissionScene } from "@/lib/mission-package";

export type UnsupportedMechanic = {
  label: string;
  detail: string;
  sourceExcerpt: string;
};

export type StoryImportPlan = {
  mission: SceneMissionPackageFile;
  sourceSummary: string;
  assumptions: string[];
  warnings: string[];
  unsupportedMechanics: UnsupportedMechanic[];
  model?: string;
  method?: "ai" | "local";
};

type SourceSection = { title: string; lines: string[] };

const HEADING_PATTERN = /^(?:#{2,6}\s+|scene\s+\d+\s*[:.\-–—]\s*)(.+)$/i;
const MARKER_PATTERN = /^\s*(location|objective|public|players?|gm|secret|private|handouts?|friend computer|computer|announcement)\s*:\s*(.*)$/i;

function slugify(value: string, fallback: string) {
  const slug = value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 58);
  return slug || fallback;
}

function cleanLine(value: string) {
  return value.replace(/^[-*+]\s+/, "").replace(/\*\*/g, "").trim();
}

function compact(value: string, maxLength: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function firstUsefulLine(source: string) {
  return source.split(/\r?\n/).map((line) => cleanLine(line.replace(/^#+\s*/, ""))).find(Boolean) ?? "Imported Mission";
}

function missionPreamble(source: string) {
  const lines = source.replace(/\r/g, "").split("\n");
  const preamble: string[] = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (HEADING_PATTERN.test(line)) break;
    if (/^#\s+/.test(line)) continue;
    if (line) preamble.push(cleanLine(line));
  }
  return preamble.join(" ");
}

function sectionSource(source: string, desiredSceneCount?: number): SourceSection[] {
  const lines = source.replace(/\r/g, "").split("\n");
  const hasExplicitSceneHeadings = lines.some((line) => HEADING_PATTERN.test(line.trim()));
  const sections: SourceSection[] = [];
  let current: SourceSection | null = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const heading = line.match(HEADING_PATTERN);
    if (heading) {
      if (current && current.lines.some((item) => item.trim())) sections.push(current);
      current = { title: cleanLine(heading[1]).replace(/^scene\s+\d+\s*[:.\-–—]\s*/i, ""), lines: [] };
      continue;
    }
    if (!current && hasExplicitSceneHeadings) continue;
    if (!current) current = { title: "Opening", lines: [] };
    current.lines.push(rawLine);
  }
  if (current && current.lines.some((item) => item.trim())) sections.push(current);
  if (sections.length > 1) return sections;

  const paragraphs = source.replace(/\r/g, "").split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);
  const target = Math.min(12, Math.max(1, desiredSceneCount ?? Math.min(6, Math.max(2, Math.ceil(paragraphs.length / 3)))));
  if (paragraphs.length <= 1 || target === 1) return sections.length ? sections : [{ title: "Opening", lines }];
  const perScene = Math.max(1, Math.ceil(paragraphs.length / target));
  const chunks: SourceSection[] = [];
  for (let index = 0; index < paragraphs.length; index += perScene) {
    const chunk = paragraphs.slice(index, index + perScene);
    chunks.push({ title: `Scene ${chunks.length + 1}`, lines: chunk.flatMap((paragraph) => [paragraph, ""]) });
  }
  return chunks;
}

function dialogueCue(text: string, sceneIndex: number, cueIndex: number): MissionCue {
  const speech = compact(text.replace(/^["“]|["”]$/g, ""), 700);
  const labelStem = speech.split(/[.!?]/)[0] || `Announcement ${cueIndex + 1}`;
  return {
    id: `scene-${sceneIndex + 1}-cue-${cueIndex + 1}`,
    label: compact(labelStem, 38).toUpperCase(),
    note: "Suggested from a Friend Computer or announcement line in the source. Review before use.",
    commands: [
      { type: "set-status", text: compact(speech, 100).toUpperCase() },
      { type: "speak", text: speech },
    ],
  };
}

function sourceSectionToScene(section: SourceSection, index: number): MissionScene {
  let location = "Alpha Complex";
  let objective = "Determine the intended objective for this scene during review.";
  const publicLines: string[] = [];
  const gmLines: string[] = [];
  const storyLines: string[] = [];
  const handouts: string[] = [];
  const announcements: string[] = [];

  for (const rawLine of section.lines) {
    const line = cleanLine(rawLine);
    if (!line) continue;
    const marker = line.match(MARKER_PATTERN);
    if (!marker) {
      storyLines.push(line);
      continue;
    }
    const [, rawKind, rawValue] = marker;
    const kind = rawKind.toLowerCase();
    const value = rawValue.trim();
    if (!value) continue;
    if (kind === "location") location = value;
    else if (kind === "objective") objective = value;
    else if (kind === "public" || kind.startsWith("player")) publicLines.push(value);
    else if (kind === "gm" || kind === "secret" || kind === "private") gmLines.push(value);
    else if (kind.startsWith("handout")) handouts.push(...value.split(/[,;]/).map((item) => item.trim()).filter(Boolean));
    else if (kind === "friend computer" || kind === "computer" || kind === "announcement") announcements.push(value);
  }

  const sceneText = storyLines.join("\n") || [objective, ...publicLines, ...gmLines].filter(Boolean).join("\n");
  const publicContext = publicLines.join("\n") || compact(storyLines[0] ?? `${section.title} begins.`, 500);
  const gmGuidance = gmLines.join("\n") || `Review this imported scene against the original source. Confirm secrets, pacing, opposition, and consequences before rehearsal.`;
  return {
    id: slugify(section.title, `scene-${index + 1}`),
    number: String(index + 1).padStart(2, "0"),
    title: compact(section.title, 100).toUpperCase(),
    location: compact(location, 160),
    scene: sceneText.slice(0, 2600),
    objective: compact(objective, 700),
    publicContext: publicContext.slice(0, 1200),
    gmGuidance: gmGuidance.slice(0, 1800),
    handouts,
    logVisibility: gmLines.length ? "GM_ONLY" : "COMPUTER",
    cues: announcements.slice(0, 8).map((announcement, cueIndex) => dialogueCue(announcement, index, cueIndex)),
  };
}

function detectUnsupportedMechanics(source: string): UnsupportedMechanic[] {
  const checks: Array<{ label: string; pattern: RegExp; detail: string }> = [
    { label: "CUSTOM TIMER OR COUNTDOWN", pattern: /\b(countdown|count-down|timer|timed sequence|minutes remaining|hours remaining)\b/i, detail: "Mission JSON v1 cannot define a custom countdown engine. Preserve timing instructions in GM guidance and run the timer manually." },
    { label: "EXTERNAL OR ATTACHED MEDIA", pattern: /\b(video|audio file|music|soundtrack|image|picture|map file|slide|projector file|https?:\/\/|www\.)\b/i, detail: "Mission JSON v1 stores handout names but cannot attach media or open URLs. Add the asset to the handoff package separately." },
    { label: "BRANCHING OR CONDITIONAL AUTOMATION", pattern: /\b(if the players|if they choose|branch|conditional|depending on|random table|roll on)\b/i, detail: "Branches remain GM decisions. Record the choices and consequences in scene guidance rather than automated commands." },
    { label: "CUSTOM SCRIPT OR INTEGRATION", pattern: /\b(script|javascript|python|api call|webhook|integration|execute|run command)\b/i, detail: "Mission files cannot run scripts, API calls, or custom integrations. Handle this outside the mission package." },
  ];
  const lines = source.replace(/\r/g, "").split("\n").map((line) => line.trim()).filter(Boolean);
  return checks.flatMap((check) => {
    const match = lines.find((line) => check.pattern.test(line));
    return match ? [{ label: check.label, detail: check.detail, sourceExcerpt: compact(match, 240) }] : [];
  });
}

export function createLocalStoryImport(
  source: string,
  options: { titleHint?: string; sceneCountHint?: string } = {},
): StoryImportPlan {
  const desiredScenes = Number(options.sceneCountHint);
  const sections = sectionSource(source, Number.isInteger(desiredScenes) && desiredScenes > 0 ? desiredScenes : undefined);
  const seenSceneIds = new Set<string>();
  const scenes = sections.map(sourceSectionToScene).map((scene, index) => {
    let id = scene.id;
    let suffix = 2;
    while (seenSceneIds.has(id)) {
      id = `${scene.id.slice(0, 54)}-${suffix}`;
      suffix += 1;
    }
    seenSceneIds.add(id);
    return { ...scene, id, number: String(index + 1).padStart(2, "0") };
  });
  const inferredTitle = compact(options.titleHint || firstUsefulLine(source), 120).replace(/^scene\s+\d+\s*[:.\-–—]\s*/i, "");
  const missionId = slugify(inferredTitle, "imported-mission");
  const publicContext = scenes.map((scene) => scene.publicContext).filter(Boolean).slice(0, 3).join("\n") || "Players begin with only their assigned mission briefing.";
  const gmGuidance = `LOCAL OUTLINE IMPORT: This draft was organized deterministically from headings and labels, without AI interpretation. Compare every scene with the original source before approval.\n\n${scenes.map((scene) => `${scene.number} ${scene.title}: ${scene.gmGuidance}`).join("\n")}`;
  const mission = parseMissionPackageFile({
    format: MISSION_FILE_FORMAT,
    version: MISSION_FILE_VERSION,
    id: missionId,
    title: inferredTitle.toUpperCase(),
    subtitle: "Imported story · review draft",
    premise: compact(missionPreamble(source) || scenes[0]?.scene || source, 900),
    publicContext: publicContext.slice(0, 2000),
    gmGuidance: gmGuidance.slice(0, 4000),
    director: { type: "scenes", scenes },
  });
  const cueCount = scenes.reduce((total, scene) => total + scene.cues.length, 0);
  return {
    mission,
    sourceSummary: `${source.length.toLocaleString()} characters organized into ${scenes.length} scene${scenes.length === 1 ? "" : "s"} and ${cueCount} suggested Friend Computer cue${cueCount === 1 ? "" : "s"}.`,
    assumptions: [
      "Markdown headings and lines beginning with SCENE were treated as scene boundaries.",
      "PUBLIC / PLAYER lines were treated as player-safe; GM / SECRET / PRIVATE lines were kept in GM guidance.",
      "FRIEND COMPUTER / COMPUTER / ANNOUNCEMENT lines became suggested projector and speech cues.",
    ],
    warnings: cueCount === 0 ? ["No explicit Friend Computer dialogue markers were found. Add projector cues in Mission Workshop."] : [],
    unsupportedMechanics: detectUnsupportedMechanics(source),
    method: "local",
  };
}
