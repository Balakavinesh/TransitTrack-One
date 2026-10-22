# TransitTrack One

An Evidence-Aware Multimodal Journey Planning Web Platform with Accessibility Routing, Community Verification, and Network Resilience Analysis for Chennai.

---

## 1. System Overview

TransitTrack One integrates public transit data across the four primary modes in Chennai:
- **Chennai Metro (CMRL)** (Blue Line & Green Line)
- **Metropolitan Transport Corporation (MTC)** (Bus network)
- **Southern Railway (Chennai Suburban)** (South, West, and North lines)
- **Mass Rapid Transit System (MRTS)** (Beach to Velachery elevated corridor)
- **Pedestrian Connections & GTFS Pathways** (Walking transfers and step-free routes)

The central contribution is the **Mobility Evidence Graph**, ensuring information quality directly informs journey recommendations, accessibility ratings, community review, and network resilience.

### Feature Modules (M1–M9)
- **M1: Evidence-Aware Journey Planning** — Multi-criteria timetable routing (McRAPTOR) with weakest-link confidence aggregation.
- **M2: Access Profiles & Station Explorer** — Station topological pathways, lift/ramp operational evidence, and step-free routing.
- **M3: Data Trust Centre** — Provenance tracking, completeness metrics, and feed version change history.
- **M4: Community Ground Truth** — Passenger observations with anti-abuse corroboration and evidence updating.
- **M5: Evidence-Aware Trip Companion** — Step-by-step guidance, saved trips, and dynamic disruption recovery.
- **M6: Network Resilience Lab** — Station, transfer, and edge closure simulations with reachability and delay metrics.
- **M7: Feeder Gap Insights** — Isochrone walking catchments, feeder gap scoring, and nearby POI access.
- **M8: Open Data Bridge** — Export structured correction drafts (JSON, CSV, GitHub issue, OSM note) with integrity hashes.
- **M9: Grounded Bilingual Mobility Assistant** — Conversational agent in Tamil and English with internal tool grounding and zero unsupported claims.

---

## 2. Quick Start

### Prerequisites
- Node.js 20+ (Node 24 recommended) and npm
- Python 3.10+ (for the data validation pipeline)
- Docker & Docker Compose (optional, for containerized PostgreSQL 16 + PostGIS)

### Option A: Local Development (Zero-Config with In-Process PGlite)

```sh
# 1. Install root dependencies
npm install

# 2. Install server dependencies
npm --prefix server install

# 3. Run database migrations & seed baseline data
npm run server:migrate
npm run server:seed

# 4. Start backend server (port 3000)
npm run server:dev

# 5. In a separate terminal, start frontend client (port 5173)
npm run dev
```

Open `http://localhost:5173` to explore the application. Interactive OpenAPI documentation is available at `http://localhost:3000/api/v1/docs`.

### Option B: Docker Compose (Full-System Containerized)

```sh
docker compose up --build
```
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3000/api/v1`
- OpenAPI Docs: `http://localhost:3000/api/v1/docs`
- PostgreSQL + PostGIS: `localhost:5432`

---

## 3. Automated Test Suites

TransitTrack One includes 66 automated tests across three distinct test runners:

```sh
# Run all automated tests across the entire stack
npm run test:all
```

Individual test commands:
```sh
# Frontend test suite (30 tests: page coverage & critical interactions)
npm test

# Server integration test suite (31 tests: auth, M1-M9 endpoints, database staging)
npm run server:test

# Python GTFS validation pipeline test suite (5 tests: Chennai rules & gating)
npm run pipeline:test
```

---

## 4. Production Client Build

```sh
# TypeScript check and Vite production bundling
npm run build

# Preview production build locally
npm run preview
```

---

## 5. Technology Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS 4, React Router 7, React Leaflet, Recharts, Framer Motion, Lucide Icons.
- **Backend API:** Fastify 5, TypeScript, OpenAPI / Swagger UI, Zod validation, JWT, scrypt password hashing.
- **Database:** PostgreSQL 16 with PostGIS spatial extensions, or zero-config in-process `@electric-sql/pglite` (WebAssembly Postgres).
- **Data Ingestion:** Python 3, GTFS validation engine with Chennai transit constraints (expired calendars, MTC placeholder departures, coordinate bounds, referential integrity).
- **Routing Engine:** Multi-Criteria RAPTOR (McRAPTOR) with weakest-link evidence aggregation and disruption-aware graph traversal.

---

## 6. Architecture & Documentation Directory

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — Comprehensive architectural specifications, database schema, McRAPTOR routing, and evidence graph engine.
- [docs/API.md](docs/API.md) — REST API reference across all `/api/v1` endpoints with request/response schemas.
- [docs/DATA_PIPELINE.md](docs/DATA_PIPELINE.md) — GTFS ingestion pipeline, Chennai validation rules, feed staging, and transactional promotion.
- [docs/DATA_LIMITATIONS.md](docs/DATA_LIMITATIONS.md) — Transit data realities in Chennai, truthfulness principles, and 4-band evidence model.
- [docs/TEST_REPORT.md](docs/TEST_REPORT.md) — Full automated test report (66/66 tests passing).
- [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md) — Operational considerations, PGlite vs PostgreSQL, and roadmap enhancements.
- [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) — Implementation phase checklist and delivery status.
- [docs/UI_PAGES.md](docs/UI_PAGES.md) — Route and page interaction catalog.

---

## 7. Asset Attribution

- `public/images/chennai-metro.jpg`: **Chennai Metro Rail at Koyambedu**, KARTY JazZ, 5 July 2015. [Original Wikimedia Commons file](https://commons.wikimedia.org/wiki/File:Chennai_Metro_Rail_at_Koyambedu.JPG), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Displayed with CSS cropping and colour overlay. Any adapted image must retain the same licence.
- Map tiles © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright).
