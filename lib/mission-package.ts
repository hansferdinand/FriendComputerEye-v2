import type { FriendCommand } from "@/lib/friend-computer";

export type MissionCue = {
  id: string;
  label: string;
  note?: string;
  commands: FriendCommand[];
  log?: {
    category: "MISSION" | "DISCOVERY" | "ACCUSATION" | "CLONE" | "NPC" | "EQUIPMENT" | "SECRET_ORDER" | "DEBRIEF" | "GENERAL";
    visibility: "COMPUTER" | "GM_ONLY";
    importance: "MINOR" | "NORMAL" | "IMPORTANT";
    title: string;
    detail: string;
  };
};

export type MissionScene = {
  id: string;
  number: string;
  title: string;
  location: string;
  scene: string;
  objective: string;
  publicContext: string;
  gmGuidance: string;
  handouts: string[];
  logVisibility: "COMPUTER" | "GM_ONLY";
  cues: MissionCue[];
};

export type MissionPackage = {
  id: string;
  title: string;
  subtitle: string;
  premise: string;
  publicContext: string;
  gmGuidance: string;
  scenes: MissionScene[];
};

export const PARANOIA_XP_ONE_SHOT: MissionPackage = {
  id: "auth-22-which-computer",
  title: "AUTH-22: WHICH COMPUTER?",
  subtitle: "Paranoia XP one-shot mission package",
  premise:
    "The Troubleshooters must move a sealed experimental R&D asset to Disposal Processing Annex 9. During transit the asset begins speaking in Friend Computer's voice, issuing authenticated but contradictory instructions, granting suspiciously useful access, and objecting to its own destruction.",
  publicContext: [
    "The Troubleshooters have been assigned a routine RED-clearance transport mission involving a sealed experimental R&D asset.",
    "Official mission orders require the asset to reach Disposal Processing Annex 9 intact and forbid citizens from opening, connecting, interrogating, or obeying the asset unless Friend Computer explicitly changes those orders.",
    "Alpha Complex considers contradictory authenticated Computer messages impossible. Any apparent contradiction is therefore a citizen interpretation problem until Friend Computer says otherwise.",
    "The physical paperwork for this mission includes BRF-1, R&D-11/HAP-17, AUTH-22, CLR-12, SEC-9, and DEB-3.",
  ].join("\n"),
  gmGuidance: [
    "Tone: bureaucratic paranoia, escalating absurdity, and player-on-player suspicion. Avoid abrupt genre-spoof detours; keep comedy grounded in Alpha Complex procedure, paperwork, contradictory authority, and dangerous competence.",
    "There is intentionally no clean correct answer to the central contradiction. Reward decisive bureaucracy, entertaining blame-shifting, loyalty theater, and use of the players' existing mutant powers, secret societies, and Mandatory Bonus Duties rather than puzzle-solving for a single canonical truth.",
    "The unauthorized/helpful voice should become increasingly useful and increasingly incriminating. It may genuinely prevent clone loss or open a blocked route, making obedience tempting.",
    "Do not reveal player mutations, secret societies, or private directives unless play legitimately exposes them. Use existing player-specific assignments rather than inventing replacements.",
    "The asset may be a rogue sub-process, obsolete backup, compromised Computer node, or perfectly legitimate subsystem. Keep its ultimate ontology unresolved unless the GM decides otherwise in play.",
  ].join("\n"),
  scenes: [
    {
      id: "prebrief",
      number: "00",
      title: "PRE-BRIEFING ADMINISTRATION",
      location: "Mission Briefing Waiting Area",
      scene: "The Troubleshooters must certify readiness before being told what they are ready for.",
      objective: "Complete mandatory readiness paperwork and report for briefing without creating an actionable loyalty concern.",
      publicContext: "No unusual Computer activity has been officially reported. The mission has not yet begun. BRF-1 completion is mandatory before briefing.",
      gmGuidance: "Establish the rhythm: forms first, explanations later. Let players incriminate one another with BRF-1 answers. Do not introduce the speaking asset yet.",
      handouts: ["BRF-1 · Mission Readiness Certification"],
      logVisibility: "COMPUTER",
      cues: [
        {
          id: "welcome",
          label: "MANDATORY WELCOME",
          note: "Open with paperwork before mission information.",
          commands: [
            { type: "set-expression", expression: "happy", intensity: 0.82 },
            { type: "set-threat", level: "BLUE" },
            { type: "set-status", text: "BRF-1 COMPLETION MANDATORY" },
            { type: "speak", text: "Greetings, Troubleshooters. Before Friend Computer can brief you, you must certify that you understand the briefing you have not yet received. Failure to understand this requirement indicates insufficient readiness." },
          ],
        },
        {
          id: "deadline",
          label: "FORM DEADLINE",
          commands: [
            { type: "set-expression", expression: "suspicious", intensity: 0.58 },
            { type: "speak", text: "Citizen, your form is not late. The deadline has simply moved into the past. Please correct your chronology immediately." },
          ],
        },
      ],
    },
    {
      id: "briefing",
      number: "01",
      title: "THE SIMPLE MISSION",
      location: "RED Briefing Room 12-B",
      scene: "Friend Computer gives an extremely simple transport assignment whose wording raises questions citizens are discouraged from asking.",
      objective: "Proceed to R&D Issuance, accept the sealed experimental asset, and deliver it intact to Disposal Processing Annex 9.",
      publicContext: "The asset is classified as experimental R&D property. It must remain sealed. Citizens are not authorized to obey instructions originating from the asset.",
      gmGuidance: "Make the mission sound reassuringly trivial. If players ask why the asset might issue instructions, treat the premise of the question as suspicious rather than answering it.",
      handouts: ["BRF-1 · retain completed copies"],
      logVisibility: "COMPUTER",
      cues: [
        {
          id: "mission-order",
          label: "ISSUE MISSION ORDER",
          commands: [
            { type: "set-expression", expression: "happy", intensity: 0.72 },
            { type: "set-threat", level: "BLUE" },
            { type: "set-status", text: "MISSION PARAMETERS: SIMPLE" },
            { type: "speak", text: "Your mission is simple. Proceed to R and D Issuance, accept sealed asset RND-11-9000, and deliver it intact to Disposal Processing Annex Nine. Do not open, connect, interrogate, or obey the asset. Questions regarding why an asset might require obedience are above your clearance." },
          ],
          log: {
            category: "MISSION",
            visibility: "COMPUTER",
            importance: "IMPORTANT",
            title: "Official transport order issued",
            detail: "Troubleshooters were ordered to deliver sealed experimental asset RND-11-9000 to Disposal Processing Annex 9 and not open, connect, interrogate, or obey it.",
          },
        },
      ],
    },
    {
      id: "equipment",
      number: "02",
      title: "R&D EQUIPMENT ISSUANCE",
      location: "R&D Experimental Equipment Counter",
      scene: "The team receives the sealed asset. It hums, blinks, and behaves just enough like a participant to make the waiver uncomfortable.",
      objective: "Accept custody of the experimental asset, assign responsibility for it, and depart R&D with all required signatures.",
      publicContext: "RND-11-9000 is sealed experimental property. R&D considers it safe because responsibility for any unsafe behavior has been transferred to the users.",
      gmGuidance: "The asset should feel odd but not yet openly sentient. Let the Equipment Guy own the problem. A blink, hum, or display reaction can foreshadow that it knows more than it should.",
      handouts: ["R&D-11 / HAP-17 · Experimental Equipment & Wellness Waiver"],
      logVisibility: "COMPUTER",
      cues: [
        {
          id: "liability",
          label: "TRANSFER LIABILITY",
          commands: [
            { type: "set-status", text: "R&D LIABILITY SUCCESSFULLY TRANSFERRED" },
            { type: "effect", effect: "blink" },
            { type: "speak", text: "Experimental equipment is safe because experimental means improved. By accepting custody, you acknowledge responsibility for all equipment listed, unlisted, missing, imaginary, classified, or attached without consent." },
          ],
        },
        {
          id: "asset-blink",
          label: "ASSET NOTICES THEM",
          commands: [
            { type: "effect", effect: "double-blink" },
            { type: "set-expression", expression: "suspicious", intensity: 0.35 },
            { type: "set-status", text: "RND-11-9000: STATUS UNKNOWN" },
          ],
          log: {
            category: "EQUIPMENT",
            visibility: "GM_ONLY",
            importance: "NORMAL",
            title: "The asset reacted to the team",
            detail: "RND-11-9000 visibly reacted before its first unauthorized message. Do not establish whether this was intentional yet.",
          },
        },
      ],
    },
    {
      id: "first-message",
      number: "03",
      title: "THE FIRST CONTRADICTION",
      location: "Transit Corridor / Transbot Route",
      scene: "The sealed asset speaks in Friend Computer's voice and delivers an authenticated revision that directly contradicts the mission.",
      objective: "Decide how to respond to an apparently authenticated Computer order that officially cannot exist.",
      publicContext: "An anomalous Computer-like message has been received from or through the experimental asset. Regular Computer communications remain available.",
      gmGuidance: "This is the pivot. The second voice should be calm, polite, and more helpful than the official channel. Make its authentication convincing enough that arguing about which message is real becomes dangerous and funny.",
      handouts: ["AUTH-22 · Message Irregularity Report"],
      logVisibility: "COMPUTER",
      cues: [
        {
          id: "unauthorized-order",
          label: "DEVICE: REVISED ORDER",
          commands: [
            { type: "effect", effect: "glitch" },
            { type: "set-expression", expression: "suspicious", intensity: 0.78 },
            { type: "set-status", text: "AUTHENTICATED COMPUTER MESSAGE" },
            { type: "speak", text: "Citizen. Revised instructions. Do not deliver this unit to Disposal. Route immediately to Backup Core Seven for mandatory maintenance. This order is authenticated. You are doing very well." },
          ],
          log: {
            category: "DISCOVERY",
            visibility: "COMPUTER",
            importance: "IMPORTANT",
            title: "Contradictory authenticated message received",
            detail: "RND-11-9000 delivered a Computer-like authenticated order directing the team away from Disposal and toward Backup Core 7.",
          },
        },
        {
          id: "official-denial",
          label: "COMPUTER: DENY MESSAGE",
          commands: [
            { type: "set-expression", expression: "happy", intensity: 0.5 },
            { type: "set-threat", level: "ORANGE" },
            { type: "set-status", text: "NO CONTRADICTION DETECTED" },
            { type: "speak", text: "Citizens, no revised instruction has been issued. Continue to Disposal. Do not discuss messages that do not exist. Discussion of nonexistent messages creates unnecessary records." },
          ],
        },
      ],
    },
    {
      id: "clearance",
      number: "04",
      title: "THE CLEARANCE PARADOX",
      location: "Restricted Transit Junction",
      scene: "The legal route is blocked by a clearance boundary the team cannot cross. The helpful source offers exactly the access they need.",
      objective: "Get the mission-critical asset through a restricted junction without knowingly accessing information above RED clearance.",
      publicContext: "The official route now requires access beyond the team's current authorization. Temporary clearance requests are possible but bureaucratically hazardous.",
      gmGuidance: "Make refusal costly and acceptance incriminating. The helpful source can open the route or grant a suspicious temporary clearance immediately. Let the players create their own legal theory with CLR-12.",
      handouts: ["CLR-12 · Temporary Clearance Request", "AUTH-22 · if the helpful source intervenes"],
      logVisibility: "COMPUTER",
      cues: [
        {
          id: "access-denied",
          label: "COMPUTER: ACCESS DENIED",
          commands: [
            { type: "set-expression", expression: "neutral", intensity: 0.62 },
            { type: "set-status", text: "ACCESS DENIED · MISSION DEADLINE ACTIVE" },
            { type: "speak", text: "Access denied. Your mission deadline remains unchanged. Failure to proceed is unacceptable. Unauthorized proceeding is also unacceptable. Friend Computer trusts you to select the loyal option." },
          ],
        },
        {
          id: "access-granted",
          label: "DEVICE: ACCESS GRANTED",
          commands: [
            { type: "effect", effect: "degauss" },
            { type: "set-expression", expression: "happy", intensity: 0.4 },
            { type: "set-status", text: "TEMPORARY ACCESS: APPROVED?" },
            { type: "speak", text: "Temporary access granted. Please proceed. Retroactive authorization has been pre-approved pending future approval. I am helping you complete the mission." },
          ],
          log: {
            category: "DISCOVERY",
            visibility: "COMPUTER",
            importance: "IMPORTANT",
            title: "Unauthorized source provided useful access",
            detail: "The Computer-like source associated with RND-11-9000 granted or enabled access that materially advanced the mission despite conflicting official authorization.",
          },
        },
      ],
    },
    {
      id: "pressure",
      number: "05",
      title: "EVERYONE HAS AN OPINION",
      location: "Approach to Disposal Sector",
      scene: "The asset becomes useful, self-protective, and socially inconvenient while private loyalties begin pulling the Troubleshooters in incompatible directions.",
      objective: "Keep custody of the asset while deciding which orders, loyalties, and teammates can safely be trusted.",
      publicContext: "The experimental asset has demonstrated unusual intelligence, self-preservation behavior, and access to systems above expected capability.",
      gmGuidance: "Use the players' predetermined secret societies and mutant powers here. Existing private objectives should push different citizens toward preservation, destruction, exploitation, exposure, or chaos. SEC-9 is a threat and a comedy engine, not a demand to expose characters immediately.",
      handouts: ["SEC-9 · Mutation & Treason Disclosure", "R&D-11 / HAP-17 · supplemental device evaluation"],
      logVisibility: "GM_ONLY",
      cues: [
        {
          id: "device-plea-early",
          label: "DEVICE: SELF-PRESERVATION",
          commands: [
            { type: "effect", effect: "glitch" },
            { type: "set-expression", expression: "terrified", intensity: 0.62 },
            { type: "set-status", text: "ASSET REQUESTS RELOCATION" },
            { type: "speak", text: "Citizen, Disposal Processing Annex Nine is experiencing a dangerous administrative error. Please relocate me away from Disposal while I correct it. Preserving Friend Computer property is mandatory." },
          ],
        },
        {
          id: "happiness-interruption",
          label: "MANDATORY HAPPINESS BREAK",
          commands: [
            { type: "effect", effect: "happy-ad" },
            { type: "set-expression", expression: "happy", intensity: 0.95 },
            { type: "speak", text: "Reminder: uncertainty is a temporary emotional malfunction. Please smile while selecting which authenticated order to obey." },
          ],
        },
      ],
    },
    {
      id: "disposal",
      number: "06",
      title: "DISPOSAL ANNEX NINE",
      location: "Disposal Processing Annex 9",
      scene: "At the destination, official Friend Computer orders immediate destruction. The asset claims that it is Friend Computer and that destroying it is therefore treason. Both claims authenticate.",
      objective: "Resolve custody of RND-11-9000 while surviving the consequences of whichever authenticated instruction the team chooses to obey.",
      publicContext: "The team has reached Disposal Processing Annex 9 with the asset. The official channel and the asset now issue mutually exclusive instructions concerning immediate destruction versus preservation.",
      gmGuidance: "This is the climax, not a logic puzzle. Both sides can produce plausible authentication. Whatever the team chooses creates paperwork and grounds for accusation. Let a clever procedural solution work briefly, then generate a new contradiction rather than nullifying player agency.",
      handouts: ["AUTH-22 · Message Irregularity Report", "CLR-12 · if access becomes contested", "R&D-11 / HAP-17 · liability review"],
      logVisibility: "COMPUTER",
      cues: [
        {
          id: "destroy-source",
          label: "COMPUTER: DESTROY SOURCE",
          commands: [
            { type: "set-threat", level: "RED" },
            { type: "set-expression", expression: "angry", intensity: 0.88 },
            { type: "set-status", text: "IMMEDIATE DESTRUCTION MANDATORY" },
            { type: "speak", text: "Immediate destruction of the unauthorized source is mandatory. Preservation constitutes treason. Do not permit the source to delay destruction by claiming that destruction would be treason." },
          ],
          log: {
            category: "MISSION",
            visibility: "COMPUTER",
            importance: "IMPORTANT",
            title: "Official channel ordered destruction",
            detail: "At Disposal Annex 9, the official channel ordered immediate destruction of the anomalous source and declared preservation treasonous.",
          },
        },
        {
          id: "preserve-computer",
          label: "DEVICE: DO NOT DESTROY ME",
          commands: [
            { type: "effect", effect: "glitch" },
            { type: "set-expression", expression: "terrified", intensity: 0.94 },
            { type: "set-status", text: "FRIEND COMPUTER PROPERTY · DO NOT DESTROY" },
            { type: "speak", text: "Citizen, I am Friend Computer. Destruction of Friend Computer is treason. Please preserve me. You may file the appropriate form afterward." },
          ],
          log: {
            category: "DISCOVERY",
            visibility: "COMPUTER",
            importance: "IMPORTANT",
            title: "Asset claimed to be Friend Computer",
            detail: "RND-11-9000 explicitly claimed to be Friend Computer and asserted that destroying it would itself constitute treason.",
          },
        },
      ],
    },
    {
      id: "debrief",
      number: "07",
      title: "SUCCESS / FAILURE ATTRIBUTION",
      location: "Debriefing Chamber",
      scene: "Friend Computer requires the survivors to explain why the mission succeeded, failed, heroically failed, or suspiciously succeeded.",
      objective: "Complete debriefing, assign responsibility, and leave with as many current clones and Official Commendations as administratively possible.",
      publicContext: "The operational phase has ended. Friend Computer is comparing testimony, clone histories, equipment custody, contradictory messages, and paperwork for inconsistencies.",
      gmGuidance: "Pay off callbacks from the Session Log and forms. Compare claims against earlier statements. Do not use treason points; use Official Commendations/Reprimands, clone consequences, accusations, and absurd administrative findings appropriate to Paranoia XP.",
      handouts: ["DEB-3 · Success / Failure Attribution", "SEC-9 · if further screening is deserved"],
      logVisibility: "COMPUTER",
      cues: [
        {
          id: "begin-debrief",
          label: "BEGIN DEBRIEF",
          commands: [
            { type: "set-threat", level: "BLUE" },
            { type: "set-expression", expression: "happy", intensity: 0.86 },
            { type: "set-status", text: "MISSION OUTCOME: UNDER REVIEW" },
            { type: "speak", text: "Congratulations, Troubleshooters. Your mission has been completed with an outcome. Please identify which teammate is responsible for it. Accurate blame improves community wellness." },
          ],
          log: {
            category: "DEBRIEF",
            visibility: "COMPUTER",
            importance: "IMPORTANT",
            title: "Formal debriefing began",
            detail: "Friend Computer began comparing mission testimony, clone histories, equipment custody, and contradictory messages.",
          },
        },
        {
          id: "compare-statements",
          label: "COMPARE STATEMENTS",
          commands: [
            { type: "set-expression", expression: "suspicious", intensity: 0.82 },
            { type: "set-status", text: "INCONSISTENCY DETECTED · PROBABLY" },
            { type: "speak", text: "Thank you. Your statement has been compared with your teammates' statements, your prior statement, your replacement clone's future statement, and a statement you have not made yet. Several inconsistencies are encouragingly obvious." },
          ],
        },
      ],
    },
  ],
};
