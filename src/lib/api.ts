import {
  findJourneys as demoFindJourneys,
  stations as demoStations,
  sources as demoSources,
  evidenceDistribution as demoEvidenceDist,
  coverage as demoCoverage,
  scenarios as demoScenarios,
  initialReports,
  assistantReply as demoAssistantReply,
  type Journey,
  type Station,
  type Report,
  type Mode,
} from "../data/demo";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api/v1";
const BACKEND_ENABLED = import.meta.env.VITE_ENABLE_BACKEND !== "false";

let backendAvailable: boolean | null = null;

async function fetchJson<T>(endpoint: string, options?: RequestInit): Promise<T | null> {
  if (!BACKEND_ENABLED) return null;
  try {
    const url = endpoint.startsWith("http") ? endpoint : `${BASE_URL}${endpoint}`;
    const res = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
      ...options,
    });
    if (!res.ok) return null;
    backendAvailable = true;
    return await res.json();
  } catch {
    backendAvailable = false;
    return null;
  }
}

export const api = {
  isBackendConnected(): boolean {
    return backendAvailable === true;
  },

  async checkHealth(): Promise<boolean> {
    const data = await fetchJson<{ status: string }>("/health");
    backendAvailable = data?.status === "healthy";
    return backendAvailable;
  },

  // M1: Journey Composer
  async planJourneys(
    origin: string,
    destination: string,
    options: {
      modes?: Mode[];
      transfers?: number;
      walking?: number;
      profile?: string;
      time?: string;
      timing?: string;
      date?: string;
    } = {}
  ): Promise<Journey[]> {
    const data = await fetchJson<{ journeys: Journey[] }>("/journeys/plan", {
      method: "POST",
      body: JSON.stringify({
        origin,
        destination,
        modes: options.modes,
        transfers: options.transfers,
        walking: options.walking,
        profile: options.profile,
        time: options.time,
        timing: options.timing,
        date: options.date,
      }),
    });

    if (data?.journeys) {
      return data.journeys;
    }
    // Fallback to local deterministic demo search
    return demoFindJourneys(origin, destination, options);
  },

  // M2: Station Explorer & Access Profiles
  async getStations(mode?: string, onlyVerified?: boolean): Promise<Station[]> {
    const params = new URLSearchParams();
    if (mode && mode !== "All modes") params.set("mode", mode);
    if (onlyVerified) params.set("verifiedLift", "true");

    const data = await fetchJson<{ stations: Station[] }>(`/stations?${params.toString()}`);
    if (data?.stations) {
      return data.stations;
    }

    return demoStations.filter(
      (s) =>
        (!mode || mode === "All modes" || s.mode === mode) &&
        (!onlyVerified || s.lift === "Verified")
    );
  },

  async getStationDetail(id: string): Promise<any | null> {
    const data = await fetchJson<{ station: any }>(`/stations/${id}`);
    if (data?.station) return data.station;
    return demoStations.find((s) => s.id === id) || null;
  },

  // M3: Data Trust Centre
  async getDataSources(mode?: string): Promise<typeof demoSources> {
    const params = mode && mode !== "All modes" ? `?mode=${mode}` : "";
    const data = await fetchJson<{ sources: typeof demoSources }>(`/data-sources${params}`);
    if (data?.sources) return data.sources;
    return demoSources.filter((s) => !mode || mode === "All modes" || s.mode === mode);
  },

  async getTrustSummary(version?: string): Promise<any> {
    const params = version ? `?version=${version}` : "";
    const data = await fetchJson<any>(`/evidence/summary${params}`);
    if (data) return data;

    const old = version === "v2026.09-demo";
    return {
      sources: demoSources.map((s) => ({
        ...s,
        completeness: Math.max(0, s.completeness - (old ? 8 : 0)),
      })),
      evidenceDistribution: demoEvidenceDist,
      metrics: {
        totalSources: 4,
        completeness: old ? "70%" : "78%",
        consistentEvidence: old ? "54%" : "62%",
        validationFindings: old ? 34 : 28,
      },
    };
  },

  // M4: Community Reports
  async getReports(filters?: { status?: string; station?: string }): Promise<Report[]> {
    const params = new URLSearchParams();
    if (filters?.status && filters.status !== "All") params.set("status", filters.status);
    if (filters?.station) params.set("station", filters.station);

    const data = await fetchJson<{ reports: Report[] }>(`/reports?${params.toString()}`);
    if (data?.reports) return data.reports;
    return initialReports;
  },

  async createReport(report: { category: string; station: string; description: string; date?: string }): Promise<Report | null> {
    const data = await fetchJson<{ report: Report }>("/reports", {
      method: "POST",
      body: JSON.stringify(report),
    });
    return data?.report || null;
  },

  async confirmReport(id: string): Promise<boolean> {
    const data = await fetchJson<{ success: boolean }>(`/reports/${id}/confirm`, {
      method: "POST",
    });
    return Boolean(data?.success);
  },

  async verifyReport(id: string, rationale?: string): Promise<boolean> {
    const data = await fetchJson<{ success: boolean }>(`/reports/${id}/verify`, {
      method: "POST",
      body: JSON.stringify({ rationale }),
    });
    return Boolean(data?.success);
  },

  async rejectReport(id: string, rationale?: string): Promise<boolean> {
    const data = await fetchJson<{ success: boolean }>(`/reports/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ rationale }),
    });
    return Boolean(data?.success);
  },

  // M5: Trip Companion & Recovery
  async recoverTrip(journey: Journey, blockedLegIndex: number, blockedStation: string): Promise<Journey[]> {
    const data = await fetchJson<{ recoveryAlternatives: Journey[] }>("/trips/recover", {
      method: "POST",
      body: JSON.stringify({
        journey,
        blockedLegIndex,
        blockedStation,
      }),
    });
    if (data?.recoveryAlternatives && data.recoveryAlternatives.length > 0) {
      return data.recoveryAlternatives;
    }

    // Demo recovery fallback
    return demoFindJourneys("Tambaram", "Guindy", { profile: "Fewer stairs" });
  },

  // M6: Network Resilience Lab
  async getResilienceScenarios(): Promise<typeof demoScenarios> {
    const data = await fetchJson<{ scenarios: typeof demoScenarios }>("/resilience/scenarios");
    if (data?.scenarios) return data.scenarios;
    return demoScenarios;
  },

  async runResilienceScenario(id: string, isClosed: boolean): Promise<any> {
    const data = await fetchJson<any>(`/resilience/scenarios/${id}/run`, {
      method: "POST",
      body: JSON.stringify({ isClosed }),
    });
    if (data) return data;

    const s = demoScenarios.find((x) => x.id === id) || demoScenarios[0];
    return {
      scenario: s,
      isClosed,
      baselineReachable: s.baseline,
      disruptedReachable: isClosed ? s.reachable : s.baseline,
      additionalDelayMinutes: isClosed ? s.delay : 0,
    };
  },

  // M7: Coverage & Feeder Gaps
  async getFeederGaps(threshold: number = 10, maxGap: number = 20, accessOnly: boolean = false): Promise<any[]> {
    const params = new URLSearchParams({
      threshold: String(threshold),
      maxGap: String(maxGap),
      accessibleOnly: String(accessOnly),
    });
    const data = await fetchJson<{ gaps: any[] }>(`/coverage/feeder-gaps?${params.toString()}`);
    if (data?.gaps) return data.gaps;

    return demoCoverage
      .filter((c) => c.gap <= maxGap && (!accessOnly || c.access >= 60))
      .map((c) => ({
        ...c,
        displayGap: Math.max(1, c.gap - (threshold - 10) / 2),
      }));
  },

  // M8: Open Data Bridge
  async getEligibleCorrections(): Promise<Report[]> {
    const data = await fetchJson<{ eligible: Report[] }>("/exports/eligible-corrections");
    if (data?.eligible) return data.eligible;
    return initialReports.filter((r) => r.status === "Verified" || r.status === "Corroborated");
  },

  async generateExport(reportId: string, format: "JSON" | "CSV" = "JSON", preview: string = "Structured change"): Promise<any> {
    const data = await fetchJson<any>("/exports/generate", {
      method: "POST",
      body: JSON.stringify({ reportId, format, preview }),
    });
    return data;
  },

  // M9: Grounded Assistant
  async askAssistant(message: string, language: string = "en"): Promise<{ text: string; to?: string; label?: string }> {
    const data = await fetchJson<{ text: string; to?: string; label?: string }>("/assistant/chat", {
      method: "POST",
      body: JSON.stringify({ message, language }),
    });
    if (data?.text) {
      return data;
    }
    return demoAssistantReply(message, language);
  },
};
