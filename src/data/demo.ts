export type Evidence = "Verified" | "Likely" | "Uncertain" | "Unknown";
export type Mode = "Metro" | "Bus" | "Suburban" | "MRTS" | "Walk";
export interface Station {
  id: string;
  name: string;
  mode: Mode;
  position: [number, number];
  area: string;
  evidence: Evidence;
  lift: Evidence;
  ramp: Evidence;
  stairs: boolean;
}
export interface Leg {
  mode: Mode;
  from: string;
  to: string;
  minutes: number;
  line: string;
  evidence: Evidence;
}
export interface Journey {
  id: string;
  origin: string;
  destination: string;
  minutes: number;
  transfers: number;
  walk: number;
  fare: number;
  evidence: Evidence;
  tag: string;
  legs: Leg[];
  points: [number, number][];
}
export interface Report {
  id: string;
  category: string;
  station: string;
  description: string;
  status: "Pending" | "Corroborated" | "Verified" | "Rejected" | "Stale";
  date: string;
}
export const stations: Station[] = [
  {
    id: "central",
    name: "Chennai Central",
    mode: "Metro",
    position: [13.0827, 80.2707],
    area: "Park Town",
    evidence: "Verified",
    lift: "Verified",
    ramp: "Likely",
    stairs: true,
  },
  {
    id: "egmore",
    name: "Egmore",
    mode: "Suburban",
    position: [13.0782, 80.261],
    area: "Egmore",
    evidence: "Likely",
    lift: "Unknown",
    ramp: "Uncertain",
    stairs: true,
  },
  {
    id: "koyambedu",
    name: "Koyambedu",
    mode: "Metro",
    position: [13.0733, 80.1948],
    area: "Koyambedu",
    evidence: "Verified",
    lift: "Verified",
    ramp: "Likely",
    stairs: true,
  },
  {
    id: "guindy",
    name: "Guindy",
    mode: "Metro",
    position: [13.0097, 80.212],
    area: "Guindy",
    evidence: "Verified",
    lift: "Uncertain",
    ramp: "Likely",
    stairs: true,
  },
  {
    id: "alandur",
    name: "Alandur",
    mode: "Metro",
    position: [13.004, 80.2014],
    area: "Alandur",
    evidence: "Verified",
    lift: "Verified",
    ramp: "Verified",
    stairs: true,
  },
  {
    id: "airport",
    name: "Chennai Airport",
    mode: "Metro",
    position: [12.9808, 80.1642],
    area: "Meenambakkam",
    evidence: "Likely",
    lift: "Likely",
    ramp: "Verified",
    stairs: true,
  },
  {
    id: "tambaram",
    name: "Tambaram",
    mode: "Suburban",
    position: [12.925, 80.1187],
    area: "Tambaram",
    evidence: "Likely",
    lift: "Unknown",
    ramp: "Uncertain",
    stairs: true,
  },
  {
    id: "thiruvanmiyur",
    name: "Thiruvanmiyur",
    mode: "MRTS",
    position: [12.9896, 80.251],
    area: "Thiruvanmiyur",
    evidence: "Uncertain",
    lift: "Unknown",
    ramp: "Uncertain",
    stairs: true,
  },
  {
    id: "saidapet",
    name: "Saidapet",
    mode: "Metro",
    position: [13.0213, 80.228],
    area: "Saidapet",
    evidence: "Verified",
    lift: "Verified",
    ramp: "Likely",
    stairs: true,
  },
  {
    id: "t-nagar",
    name: "T. Nagar",
    mode: "Bus",
    position: [13.0418, 80.2341],
    area: "T. Nagar",
    evidence: "Uncertain",
    lift: "Unknown",
    ramp: "Unknown",
    stairs: false,
  },
];
const airportPoints: [number, number][] = [
  [12.9808, 80.1642],
  [12.994, 80.183],
  [13.004, 80.2014],
  [13.0097, 80.212],
  [13.0213, 80.228],
  [13.036, 80.245],
  [13.056, 80.251],
  [13.072, 80.265],
  [13.0827, 80.2707],
];
const leg = (
  mode: Mode,
  from: string,
  to: string,
  minutes: number,
  line: string,
  evidence: Evidence = "Verified",
): Leg => ({ mode, from, to, minutes, line, evidence });
export const journeys: Journey[] = [
  {
    id: "airport-fast",
    origin: "Chennai Airport",
    destination: "Chennai Central",
    minutes: 48,
    transfers: 0,
    walk: 6,
    fare: 50,
    evidence: "Verified",
    tag: "Fastest",
    points: airportPoints,
    legs: [
      leg(
        "Walk",
        "Airport terminal",
        "Airport Metro",
        4,
        "Covered connection",
        "Likely",
      ),
      leg(
        "Metro",
        "Airport Metro",
        "Chennai Central",
        42,
        "Blue line · towards Wimco Nagar",
      ),
      leg("Walk", "Central Metro", "Central concourse", 2, "Exit B", "Likely"),
    ],
  },
  {
    id: "airport-trust",
    origin: "Chennai Airport",
    destination: "Chennai Central",
    minutes: 56,
    transfers: 1,
    walk: 8,
    fare: 50,
    evidence: "Verified",
    tag: "Most verified",
    points: [
      ...airportPoints.slice(0, 3),
      [13.038, 80.196],
      [13.0733, 80.1948],
      [13.0782, 80.261],
      [13.0827, 80.2707],
    ],
    legs: [
      leg("Walk", "Airport terminal", "Airport Metro", 4, "Covered connection"),
      leg("Metro", "Airport Metro", "Alandur", 10, "Blue line"),
      leg(
        "Metro",
        "Alandur",
        "Chennai Central",
        38,
        "Green line · platform change",
      ),
      leg(
        "Walk",
        "Central Metro",
        "Central concourse",
        4,
        "Lift access · sample verified",
      ),
    ],
  },
  {
    id: "airport-bus",
    origin: "Chennai Airport",
    destination: "Chennai Central",
    minutes: 74,
    transfers: 0,
    walk: 12,
    fare: 30,
    evidence: "Uncertain",
    tag: "Lower fare",
    points: [
      ...airportPoints.slice(0, 5),
      [13.0418, 80.2341],
      [13.0782, 80.261],
      [13.0827, 80.2707],
    ],
    legs: [
      leg(
        "Walk",
        "Airport terminal",
        "Airport bus stop",
        7,
        "Roadside path",
        "Uncertain",
      ),
      leg(
        "Bus",
        "Airport bus stop",
        "Central bus stop",
        62,
        "MTC · sample corridor",
        "Uncertain",
      ),
      leg(
        "Walk",
        "Central bus stop",
        "Central concourse",
        5,
        "Pedestrian crossing",
        "Likely",
      ),
    ],
  },
  {
    id: "tambaram-direct",
    origin: "Tambaram",
    destination: "Guindy",
    minutes: 39,
    transfers: 0,
    walk: 7,
    fare: 15,
    evidence: "Likely",
    tag: "Fewer transfers",
    points: [
      [12.925, 80.1187],
      [12.951, 80.141],
      [12.976, 80.176],
      [13.0097, 80.212],
    ],
    legs: [
      leg(
        "Walk",
        "Tambaram entrance",
        "Tambaram platform",
        4,
        "Footbridge · stairs",
        "Unknown",
      ),
      leg(
        "Suburban",
        "Tambaram",
        "Guindy",
        32,
        "Chennai Beach direction",
        "Likely",
      ),
      leg(
        "Walk",
        "Guindy platform",
        "Guindy exit",
        3,
        "Station exit",
        "Uncertain",
      ),
    ],
  },
  {
    id: "tambaram-access",
    origin: "Tambaram",
    destination: "Guindy",
    minutes: 61,
    transfers: 1,
    walk: 5,
    fare: 45,
    evidence: "Uncertain",
    tag: "Fewer stairs",
    points: [
      [12.925, 80.1187],
      [12.9808, 80.1642],
      [13.004, 80.2014],
      [13.0097, 80.212],
    ],
    legs: [
      leg(
        "Walk",
        "Tambaram entrance",
        "Bus stand",
        3,
        "Street connection",
        "Likely",
      ),
      leg(
        "Bus",
        "Tambaram",
        "Chennai Airport",
        39,
        "MTC · sample feeder",
        "Uncertain",
      ),
      leg("Metro", "Chennai Airport", "Guindy", 17, "Blue line", "Likely"),
      leg(
        "Walk",
        "Guindy Metro",
        "Guindy exit",
        2,
        "Lift status uncertain",
        "Uncertain",
      ),
    ],
  },
  {
    id: "central-mrts",
    origin: "Chennai Central",
    destination: "Thiruvanmiyur",
    minutes: 58,
    transfers: 1,
    walk: 12,
    fare: 25,
    evidence: "Uncertain",
    tag: "Fewer transfers",
    points: [
      [13.0827, 80.2707],
      [13.079, 80.279],
      [13.047, 80.277],
      [13.018, 80.266],
      [12.9896, 80.251],
    ],
    legs: [
      leg(
        "Walk",
        "Chennai Central",
        "Park Town",
        8,
        "Street connection",
        "Likely",
      ),
      leg(
        "MRTS",
        "Park Town",
        "Thiruvanmiyur",
        46,
        "Velachery direction",
        "Uncertain",
      ),
      leg(
        "Walk",
        "Thiruvanmiyur platform",
        "Station exit",
        4,
        "Stair access",
        "Unknown",
      ),
    ],
  },
];
export const reportCategories = [
  "Broken lift",
  "Moved bus stop",
  "Blocked footpath",
  "Flooded underpass",
  "Missing signage",
  "Incorrect transfer",
];
export const initialReports: Report[] = [
  {
    id: "TT-1042",
    category: "Broken lift",
    station: "Guindy",
    description:
      "The lift at entrance B was unavailable in this sample observation. Step-free access needs confirmation.",
    status: "Corroborated",
    date: "2026-10-15",
  },
  {
    id: "TT-1041",
    category: "Missing signage",
    station: "Chennai Central",
    description:
      "Platform interchange signage is missing at the north walkway in the demonstration record.",
    status: "Verified",
    date: "2026-10-14",
  },
  {
    id: "TT-1040",
    category: "Blocked footpath",
    station: "T. Nagar",
    description:
      "Construction materials obstruct the approach to the sample bus stop.",
    status: "Pending",
    date: "2026-10-14",
  },
  {
    id: "TT-1039",
    category: "Moved bus stop",
    station: "Tambaram",
    description:
      "A suggested stop relocation was not supported by the sample evidence.",
    status: "Rejected",
    date: "2026-10-12",
  },
  {
    id: "TT-1038",
    category: "Flooded underpass",
    station: "Egmore",
    description: "Older sample observation requires a fresh check before use.",
    status: "Stale",
    date: "2026-09-20",
  },
];
export const sources = [
  {
    name: "Chennai Metro · sample feed",
    mode: "Metro",
    version: "v2026.10-demo",
    completeness: 96,
    freshness: "Recent sample",
    issues: 2,
    license: "Source licence pending integration",
  },
  {
    name: "MTC · sample stop catalogue",
    mode: "Bus",
    version: "v2026.09-demo",
    completeness: 72,
    freshness: "Review needed",
    issues: 12,
    license: "Source licence pending integration",
  },
  {
    name: "Suburban · sample schedules",
    mode: "Suburban",
    version: "v2026.10-demo",
    completeness: 81,
    freshness: "Recent sample",
    issues: 5,
    license: "Source licence pending integration",
  },
  {
    name: "MRTS · sample connections",
    mode: "MRTS",
    version: "v2026.08-demo",
    completeness: 64,
    freshness: "Older sample",
    issues: 9,
    license: "Source licence pending integration",
  },
];
export const evidenceDistribution = [
  { name: "Verified", value: 62, color: "#20a69a" },
  { name: "Likely", value: 23, color: "#7d9bad" },
  { name: "Uncertain", value: 11, color: "#d99a35" },
  { name: "Unknown", value: 4, color: "#c5cdd5" },
];
export const coverage = [
  { station: "Thiruvanmiyur", gap: 18, walk: 14, access: 38 },
  { station: "Tambaram", gap: 15, walk: 12, access: 52 },
  { station: "Koyambedu", gap: 11, walk: 9, access: 74 },
  { station: "Guindy", gap: 8, walk: 7, access: 61 },
  { station: "Chennai Central", gap: 5, walk: 5, access: 89 },
];
export const scenarios = [
  {
    id: "alandur",
    name: "Alandur interchange",
    kind: "Station",
    baseline: 10,
    reachable: 7,
    delay: 18,
    description:
      "Sample loss of the Alandur interchange affects the Airport–Central corridor.",
  },
  {
    id: "central",
    name: "Central transfer walkway",
    kind: "Transfer",
    baseline: 10,
    reachable: 8,
    delay: 12,
    description:
      "Sample closure of the walking connection between Central and Park Town.",
  },
  {
    id: "guindy",
    name: "Guindy–Saidapet edge",
    kind: "Network edge",
    baseline: 10,
    reachable: 6,
    delay: 24,
    description: "Illustrative disruption of a single corridor connection.",
  },
];
export const evidenceHelp: Record<Evidence, string> = {
  Verified:
    "Supported by a consistent sample source and a corroborating sample observation. This is fixture evidence, not an operational guarantee.",
  Likely:
    "Supported by one sample source. Independent confirmation is missing.",
  Uncertain:
    "Sample sources conflict or the observation needs rechecking. Confirm before travelling.",
  Unknown:
    "No supporting sample information is available. Do not assume accessibility or service availability.",
};
export function findJourneys(
  origin: string,
  destination: string,
  options: {
    modes?: Mode[];
    transfers?: number;
    walking?: number;
    profile?: string;
  } = {},
) {
  return journeys
    .filter(
      (j) =>
        j.origin === origin &&
        j.destination === destination &&
        j.transfers <= (options.transfers ?? 3) &&
        j.walk <= (options.walking ?? 30) &&
        j.legs.every(
          (l) =>
            l.mode === "Walk" ||
            !options.modes ||
            options.modes.includes(l.mode),
        ),
    )
    .sort((a, b) =>
      options.profile === "Wheelchair users"
        ? a.walk - b.walk
        : a.minutes - b.minutes,
    );
}
export const assistantPrompts = [
  "Tambaram to Guindy with fewer stairs.",
  "Show the most verified route.",
  "Is the lift at this station verified?",
  "Why is this timetable uncertain?",
];
export function assistantReply(input: string, language: string) {
  const tamil = language === "ta" || /[\u0B80-\u0BFF]/.test(input);
  if (/lift|station|லிஃப்ட்/.test(input.toLowerCase()))
    return {
      text: tamil
        ? "கிண்டி நிலையத்தின் லிஃப்ட் தகவல் உறுதியற்றது. பயணத்திற்கு முன் நிலையத்தில் சரிபார்க்கவும். இது மாதிரித் தகவல் மட்டுமே."
        : "The Guindy lift has uncertain sample evidence. A community observation conflicts with the facility record. Check with station staff before travelling; this demo cannot confirm current access.",
      to: "/app/access",
      label: tamil ? "நிலையங்களைப் பார்க்க" : "Explore station evidence",
    };
  if (/uncertain|timetable|நேர/.test(input.toLowerCase()))
    return {
      text: tamil
        ? "மாதிரி அட்டவணைக்கு முழுமையான ஆதாரம் இல்லை. உறுதியற்றது என்பது ரயில் தாமதம் என்று பொருளல்ல."
        : "“Uncertain” means the sample timetable has incomplete or conflicting evidence. It is a statement about information quality, not a prediction of delays or punctuality.",
      to: "/app/trust",
      label: tamil ? "தரவு நம்பகத்தன்மை" : "Understand data quality",
    };
  if (/tambaram|stairs|படிக்கட்டு/.test(input.toLowerCase()))
    return {
      text: tamil
        ? "தாம்பரம் முதல் கிண்டி வரை குறைவான படிக்கட்டுகளுடன் ஒரு மாதிரி பேருந்து–மெட்ரோ பயணம் உள்ளது. கிண்டி லிஃப்ட் தகவலை சரிபார்க்கவும்."
        : "A sample Tambaram → Airport → Guindy itinerary uses a bus and Metro with less walking. Guindy lift access is uncertain, so this is not a confirmed step-free journey.",
      to: "/app/planner?origin=Tambaram&destination=Guindy",
      label: tamil ? "மாதிரி வழியைப் பார்க்க" : "Compare sample journeys",
    };
  if (/verified|route|வழி/.test(input.toLowerCase()))
    return {
      text: tamil
        ? "விமான நிலையம் முதல் சென்ட்ரல் வரை உள்ள மாதிரி மெட்ரோ வழியில் அதிக ஆதாரங்கள் உள்ளன. உண்மையான அட்டவணை இணைக்கப்படவில்லை."
        : "The Airport → Central example via Alandur has the strongest sample evidence. Open the planner and select “Most verified” to inspect each leg. No routing engine or live timetable is connected.",
      to: "/app/planner",
      label: tamil ? "பயணத் திட்டம்" : "Open journey planner",
    };
  return {
    text: tamil
      ? "நான் உள்ளூர் மாதிரி உதவியாளர். பயணங்கள், லிஃப்ட் வசதிகள் அல்லது தரவு நம்பகத்தன்மை பற்றி கேட்கவும்."
      : "I’m a local demonstration assistant with a small response catalogue. Try asking about Tambaram to Guindy, lift evidence, verified routes, or timetable uncertainty.",
    to: "/app/limitations",
    label: tamil ? "வரம்புகள்" : "What this demo can do",
  };
}
