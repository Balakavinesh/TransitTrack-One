import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/app.js";
import { runMigrations } from "../src/db/migrate.js";
import { closeDb } from "../src/db/connection.js";
import { IngestionService } from "../src/services/ingestionService.js";
import { AuthService } from "../src/services/authService.js";
import { FastifyInstance } from "fastify";
import path from "path";

describe("Comprehensive TransitTrack One Full-System API Tests (M1 to M9)", () => {
  let app: FastifyInstance;
  let authToken: string;

  beforeAll(async () => {
    await runMigrations();
    const feedPath = path.resolve(process.cwd(), "..", "data-pipeline", "fixtures", "valid_chennai_gtfs");
    await IngestionService.ingestFeed(feedPath, "v2026.10-api-test");
    await AuthService.seedDefaultUsers();

    app = await buildApp();
    await app.ready();

    // Authenticate test user
    const loginRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "rider@transittrack.chennai",
        password: "Rider2026!",
      },
    });
    authToken = loginRes.json().token;
  });

  afterAll(async () => {
    if (app) await app.close();
    await closeDb();
  });

  // --- Security & Auth ---
  describe("Authentication & Security", () => {
    it("POST /api/v1/auth/register creates user and rejects duplicate email", async () => {
      const email = `test-${Date.now()}@chennai.test`;
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email,
          password: "SecurePassword123!",
          fullName: "Anand Kumar",
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().user.email).toBe(email);
      expect(res.json().token).toBeDefined();

      // Duplicate registration attempt
      const dup = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email,
          password: "SecurePassword123!",
          fullName: "Duplicate User",
        },
      });
      expect(dup.statusCode).toBe(400);
    });

    it("GET /api/v1/auth/me requires valid bearer token", async () => {
      const unauth = await app.inject({
        method: "GET",
        url: "/api/v1/auth/me",
      });
      expect(unauth.statusCode).toBe(401);

      const auth = await app.inject({
        method: "GET",
        url: "/api/v1/auth/me",
        headers: { authorization: `Bearer ${authToken}` },
      });
      expect(auth.statusCode).toBe(200);
      expect(auth.json().user.email).toBe("rider@transittrack.chennai");
    });
  });

  // --- M1 Journey Planning ---
  describe("M1 — Evidence-Aware Journey Planning", () => {
    it("POST /api/v1/journeys/plan (Airport → Central) returns multi-criteria ranked alternatives", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/journeys/plan",
        payload: {
          origin: "Chennai Airport",
          destination: "Chennai Central",
          modes: ["Metro", "Bus"],
        },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.journeys.length).toBeGreaterThanOrEqual(2);

      const fastest = json.journeys.find((j: any) => j.tag === "Fastest");
      expect(fastest).toBeDefined();
      expect(fastest.minutes).toBe(48);
      expect(fastest.evidence).toBe("Verified");
      expect(fastest.legs.length).toBe(3);

      const verified = json.journeys.find((j: any) => j.tag === "Most verified");
      expect(verified).toBeDefined();
      expect(verified.transfers).toBe(1);
    });

    it("POST /api/v1/journeys/plan respects mode exclusions and returns honest empty results", async () => {
      const emptyRes = await app.inject({
        method: "POST",
        url: "/api/v1/journeys/plan",
        payload: {
          origin: "Chennai Airport",
          destination: "Chennai Central",
          modes: [], // no transit modes allowed
        },
      });
      expect(emptyRes.statusCode).toBe(200);
      expect(emptyRes.json().journeys).toEqual([]);
    });

    it("GET /api/v1/locations/search autocompletes station names", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/locations/search?q=Central",
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().locations.some((l: any) => l.name === "Chennai Central")).toBe(true);
    });
  });

  // --- M2 Station Explorer & Accessibility ---
  describe("M2 — Access Profiles & Station Explorer", () => {
    it("GET /api/v1/stations returns station catalogue with evidence bands", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/stations",
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().stations.length).toBeGreaterThanOrEqual(10);
    });

    it("GET /api/v1/stations?verifiedLift=true filters only verified lift stations", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/stations?verifiedLift=true",
      });
      expect(res.statusCode).toBe(200);
      const stations = res.json().stations;
      expect(stations.every((s: any) => s.lift === "Verified")).toBe(true);
    });

    it("GET /api/v1/stations/:id returns facility details, pathways and step-free status", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/stations/guindy",
      });
      expect(res.statusCode).toBe(200);
      const station = res.json().station;
      expect(station.name).toBe("Guindy");
      expect(station.lift).toBe("Uncertain");
      expect(station.facilities.length).toBeGreaterThan(0);
      expect(station.stepFreeConfirmed).toBe(false); // Uncertain lift means not confirmed step-free
    });
  });

  // --- M3 Data Trust Centre ---
  describe("M3 — Data Trust Centre", () => {
    it("GET /api/v1/data-sources lists all 4 modes with provenance", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/data-sources",
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().sources.length).toBe(4);
      const modes = res.json().sources.map((s: any) => s.mode);
      expect(modes).toContain("Metro");
      expect(modes).toContain("Bus");
      expect(modes).toContain("Suburban");
      expect(modes).toContain("MRTS");
    });

    it("GET /api/v1/evidence/summary returns evidence distribution for chart rendering", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/evidence/summary",
      });
      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.evidenceDistribution.length).toBe(4);
      expect(json.metrics.findingsCount).toBeGreaterThanOrEqual(1);
    });
  });

  // --- M4 Community Reports & Verification ---
  describe("M4 — Community Reports & Verification Workflow", () => {
    let createdReportId: string;

    it("POST /api/v1/reports creates new observation report", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/reports",
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          category: "Broken lift",
          station: "Guindy",
          description: "Elevator door sensor failing on platform 2 approach.",
          date: "2026-10-22",
        },
      });
      expect(res.statusCode).toBe(201);
      createdReportId = res.json().report.id;
      expect(createdReportId).toBeDefined();
      expect(res.json().report.status).toBe("Pending");
    });

    it("POST /api/v1/reports/:id/confirm corroborates report and blocks duplicate user vote", async () => {
      const first = await app.inject({
        method: "POST",
        url: `/api/v1/reports/${createdReportId}/confirm`,
        headers: { authorization: `Bearer ${authToken}` },
      });
      expect(first.statusCode).toBe(200);

      // Duplicate confirmation by same user
      const dup = await app.inject({
        method: "POST",
        url: `/api/v1/reports/${createdReportId}/confirm`,
        headers: { authorization: `Bearer ${authToken}` },
      });
      expect(dup.statusCode).toBe(400);
      expect(dup.json().message).toContain("already corroborated");
    });

    it("POST /api/v1/reports/:id/verify verifies report and updates facility evidence", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/reports/${createdReportId}/verify`,
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          rationale: "Station manager confirmed broken sensor during morning audit.",
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("Verified");

      // Verify that the station lift status is updated to Uncertain in database
      const stationRes = await app.inject({
        method: "GET",
        url: "/api/v1/stations/guindy",
      });
      expect(stationRes.json().station.lift).toBe("Uncertain");
    });
  });

  // --- M5 Trip Companion & Recovery ---
  describe("M5 — Trip Companion & Recovery", () => {
    let savedTripId: string;

    it("POST /api/v1/trips saves journey and GET /api/v1/trips retrieves it", async () => {
      const journey = {
        id: "airport-fast",
        origin: "Chennai Airport",
        destination: "Chennai Central",
        minutes: 48,
        transfers: 0,
        walk: 6,
        fare: 50,
        evidence: "Verified",
        tag: "Fastest",
        legs: [],
        points: [],
      };

      const saveRes = await app.inject({
        method: "POST",
        url: "/api/v1/trips",
        headers: { authorization: `Bearer ${authToken}` },
        payload: { journey },
      });
      expect(saveRes.statusCode).toBe(201);
      savedTripId = saveRes.json().id;

      const getRes = await app.inject({
        method: "GET",
        url: "/api/v1/trips",
        headers: { authorization: `Bearer ${authToken}` },
      });
      expect(getRes.statusCode).toBe(200);
      expect(getRes.json().trips.some((t: any) => t.id === savedTripId)).toBe(true);
    });

    it("POST /api/v1/trips/recover recalculates route alternatives when a leg is blocked", async () => {
      const journey = {
        id: "airport-fast",
        origin: "Chennai Airport",
        destination: "Chennai Central",
        minutes: 48,
        transfers: 0,
        walk: 6,
        fare: 50,
        evidence: "Verified",
        tag: "Fastest",
        legs: [
          { mode: "Metro", from: "Chennai Airport", to: "Chennai Central", minutes: 42, line: "Blue line", evidence: "Verified" },
        ],
        points: [],
      };

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/trips/recover",
        payload: {
          journey,
          blockedLegIndex: 0,
          blockedStation: "guindy",
          reason: "Track maintenance",
        },
      });
      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.blockedStation).toBe("guindy");
      expect(json.recoveryAlternatives).toBeDefined();
    });

    it("DELETE /api/v1/trips/:id deletes saved journey", async () => {
      const del = await app.inject({
        method: "DELETE",
        url: `/api/v1/trips/${savedTripId}`,
      });
      expect(del.statusCode).toBe(200);
      expect(del.json().success).toBe(true);
    });
  });

  // --- M6 Resilience Lab ---
  describe("M6 — Network Resilience Lab", () => {
    it("GET /api/v1/resilience/scenarios returns defined scenarios", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/resilience/scenarios",
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().scenarios.length).toBeGreaterThanOrEqual(3);
    });

    it("POST /api/v1/resilience/scenarios/alandur/run computes disrupted reachability", async () => {
      const baseline = await app.inject({
        method: "POST",
        url: "/api/v1/resilience/scenarios/alandur/run",
        payload: { isClosed: false },
      });
      expect(baseline.statusCode).toBe(200);
      expect(baseline.json().disruptedReachable).toBe(10);
      expect(baseline.json().additionalDelayMinutes).toBe(0);

      const disrupted = await app.inject({
        method: "POST",
        url: "/api/v1/resilience/scenarios/alandur/run",
        payload: { isClosed: true },
      });
      expect(disrupted.statusCode).toBe(200);
      expect(disrupted.json().disruptedReachable).toBe(7);
      expect(disrupted.json().additionalDelayMinutes).toBe(18);
      expect(disrupted.json().criticalInterchanges.length).toBeGreaterThan(0);
    });
  });

  // --- M7 Coverage Insights ---
  describe("M7 — Coverage & Feeder Gaps", () => {
    it("GET /api/v1/coverage/feeder-gaps returns ranked feeder gap list", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/coverage/feeder-gaps?threshold=10",
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().gaps.length).toBeGreaterThanOrEqual(5);
      expect(res.json().gaps[0].station).toBe("Thiruvanmiyur");
    });

    it("POST /api/v1/coverage/analyse generates coverage payload", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/coverage/analyse",
        payload: { threshold: 15, layer: "Reachability" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().analysisType).toContain("Reachability");
      expect(res.json().results).toBeDefined();
    });
  });

  // --- M8 Open Data Bridge ---
  describe("M8 — Open Data Bridge", () => {
    it("GET /api/v1/exports/eligible-corrections lists verified/corroborated records", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/exports/eligible-corrections",
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().eligible.length).toBeGreaterThan(0);
    });

    it("POST /api/v1/exports/generate creates structured JSON and OSM correction drafts", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/exports/generate",
        payload: {
          reportId: "TT-1041",
          format: "JSON",
          preview: "Structured change",
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().isValid).toBe(true);
      expect(res.json().payload.demonstration).toBe(false);
      expect(res.json().payload.submitted).toBe(false);

      // Text issue draft
      const issueRes = await app.inject({
        method: "POST",
        url: "/api/v1/exports/generate",
        payload: {
          reportId: "TT-1041",
          preview: "Repository issue draft",
        },
      });
      expect(issueRes.statusCode).toBe(200);
      expect(issueRes.json().content).toContain("[GTFS CORRECTION PROPOSAL]");
    });
  });

  // --- M9 Assistant ---
  describe("M9 — Grounded Bilingual Mobility Assistant", () => {
    it("POST /api/v1/assistant/chat answers English journey question with tool grounding", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/assistant/chat",
        payload: {
          message: "How to travel from Tambaram to Guindy?",
          language: "en",
        },
      });
      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.text).toContain("Tambaram");
      expect(json.text).toContain("Guindy");
      expect(json.toolsCalled).toContain("plan_journey");
      expect(json.to).toBeDefined();
    });

    it("POST /api/v1/assistant/chat answers Tamil accessibility question truthfully", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/assistant/chat",
        payload: {
          message: "கிண்டி நிலையத்தில் லிஃப்ட் வசதி உள்ளதா?",
          language: "ta",
        },
      });
      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.text).toContain("கிண்டி");
      expect(json.toolsCalled).toContain("get_station_detail");
      expect(json.label).toBeDefined();
    });
  });
});
