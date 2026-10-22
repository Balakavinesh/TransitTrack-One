# TransitTrack One: Implementation Plan & Progress Tracking

## Overview
This document tracks the end-to-end implementation of the TransitTrack One backend, geospatial and transit routing services, evidence model, data ingestion pipeline, security infrastructure, automated test suite, and frontend integration.

---

## Architecture & Technology Stack
- **Frontend**: Existing React 19 + TypeScript + Vite + Tailwind CSS 4 + React Leaflet + Recharts application.
- **Backend API**: Node.js 24 + TypeScript + Fastify + OpenAPI/Swagger (`/api/v1`).
- **Database Engine**: PostgreSQL with PostGIS support. Built with a dual-mode adapter:
  - Standard PostgreSQL via `pg` connection pool when `DATABASE_URL` is provided.
  - In-process WebAssembly PostgreSQL via `@electric-sql/pglite` (with PostGIS support) for zero-dependency local development, deterministic offline testing, and portable execution on laptop environments without requiring external daemon setup.
- **Data Pipeline**: Python 3.14 ingestion, validation, GTFS parsing, calendar checking, MTC placeholder time detection, OSM matching, and provenance tracking.
- **Routing Engine**: Timetable-aware Multi-Criteria RAPTOR (McRAPTOR) algorithm incorporating arrival time, transfers, walking distance, and weakest evidence band.
- **Resilience Engine**: Graph-based network analysis (reachability, lost pairs, travel delays, betweenness centrality) with station, transfer, and edge closure simulations.
- **Coverage Engine**: Walking-shed reachability, feeder gap score calculations, accessibility statistics, and POI proximity analysis.
- **Assistant**: Dual-mode grounded conversational agent with structured tool-calling against internal APIs, supporting both Tamil and English with rule-based fallback and zero unsupported facility claims.

---

## Phase Status Checklist

### Phase 1: Audit and Foundations
- [x] Inspect existing project structure, routes, models, tests, and documentation.
- [x] Establish test and build baseline (`vitest run` 30/30 passed; `tsc -b && vite build` passed).
- [x] Commit baseline git state.
- [x] Create server scaffolding (`server/package.json`, `tsconfig.json`, `server/src`).
- [x] Implement Fastify server, OpenAPI Swagger docs, standardized JSON Schema validation, structured error handlers, and CORS.
- [x] Implement database migration runner and core SQL schema (`migrations/001_initial_schema.sql`).
- [x] Implement database connection manager (PostgreSQL + PGlite fallback).
- [x] Expose health check (`GET /api/v1/health`) and OpenAPI docs (`GET /api/v1/docs`).

### Phase 2: Real Transit Data & Ingestion Pipeline
- [x] Implement data pipeline (`data-pipeline/`) in Python with GTFS parsing and validation.
- [x] Implement Chennai-specific GTFS validation rules:
  - [x] Expired CMRL calendar detection (`CHENNAI_CALENDAR_EXPIRED`).
  - [x] MTC placeholder departure (`00:00:15`) detection and quarantine (`CHENNAI_MTC_PLACEHOLDER_TIME`).
  - [x] Geometry validation and coordinate bounding box check (`CHENNAI_MISSING_COORDINATES`).
  - [x] Referential integrity check (`CHENNAI_BROKEN_REFERENTIAL_INTEGRITY`).
  - [x] Pathway and accessibility completeness audit (`CHENNAI_UNKNOWN_ACCESSIBILITY`).
- [x] Build deterministic test feeds (`valid_chennai_gtfs`, `invalid_expired_calendar`, `invalid_placeholder_times`, `invalid_broken_refs`).
- [x] Implement feed staging, atomic publishing, diff detection, and rollback safety.
- [x] Ingest primary Chennai multimodal network (MTC, CMRL, Suburban, MRTS, pedestrian links) into the database.

### Phase 3: Core Backend (M1, M2, M3, M4)
- [x] **Evidence Model**: Multi-tier evidence graph (`Verified`, `Likely`, `Uncertain`, `Unknown`), freshness evaluation, weakest-link aggregation, and propagation.
- [x] **M1 — Journey Planning**:
  - `GET /api/v1/locations/search`
  - `POST /api/v1/journeys/plan`
  - McRAPTOR routing with Asia/Kolkata timezone, multi-modal transfer building, walking limits, and evidence rating.
- [x] **M2 — Access Profiles & Station Explorer**:
  - `GET /api/v1/stations`
  - `GET /api/v1/stations/:id`
  - Accessibility profiles: Wheelchair, Low walking, Elderly, Pram/luggage, Low vision.
  - Broken lift / ramp impact analysis on step-free route feasibility.
- [x] **M3 — Data Trust Centre**:
  - `GET /api/v1/data-sources`
  - `GET /api/v1/feeds`
  - `GET /api/v1/feeds/:id/findings`
  - `GET /api/v1/evidence/summary`
- [x] **M4 — Community Reports & Verification**:
  - `POST /api/v1/reports`
  - `GET /api/v1/reports`
  - `POST /api/v1/reports/:id/confirm` (Anti-abuse 1-vote constraint)
  - `POST /api/v1/reports/:id/verify` (Evidence promotion)
  - `POST /api/v1/reports/:id/reject`
  - Lifecycle: Pending -> Corroborated -> Verified / Rejected / Stale.
  - Downstream evidence updating (verified broken lift immediately updates station facility evidence).

### Phase 4: Passenger Services & Analytics (M5, M6, M7)
- [x] **M5 — Trip Companion & Recovery**:
  - `GET /api/v1/trips`
  - `POST /api/v1/trips`
  - `DELETE /api/v1/trips/:id`
  - `POST /api/v1/trips/recover` (Dynamic alternative calculation from remaining station).
- [x] **M6 — Network Resilience Lab**:
  - `GET /api/v1/resilience/scenarios`
  - `POST /api/v1/resilience/scenarios/:id/run`
  - Graph-based reachability, lost pairs, delay quantification, betweenness centrality.
- [x] **M7 — Coverage & Feeder Gap Insights**:
  - `POST /api/v1/coverage/analyse`
  - `GET /api/v1/coverage/feeder-gaps`
  - Isochrone walking thresholds, ranked feeder gap scoring, and nearby POIs.

### Phase 5: Contributions & Assistant (M8, M9)
- [x] **M8 — Open Data Bridge**:
  - `GET /api/v1/exports/eligible-corrections`
  - `POST /api/v1/exports/generate`
  - Formats: JSON, CSV, GitHub Issue draft, OSM changeset note with SHA-256 integrity hash.
- [x] **M9 — Grounded Tamil/English Assistant**:
  - `POST /api/v1/assistant/chat`
  - Service-grounded tool invocation (journey search, station lookup, evidence verification, trust status).
  - Bilingual support (Tamil / English) with rule-based fallback and zero unsupported facility claims.

### Phase 6: Authentication & Security
- [x] User registration, login, profile checks (`/api/v1/auth/*`).
- [x] Secure password hashing (scrypt with cryptographically random salt).
- [x] Role-based access control (Admin, Verifier, Contributor, Passenger).
- [x] Rate limiting, CORS, input sanitization with Zod, SQL injection prevention.

### Phase 7: Full Frontend Integration
- [x] Typed API client in `src/lib/api.ts`.
- [x] Environment variable configuration (`VITE_API_BASE_URL`, `VITE_ENABLE_BACKEND`).
- [x] Connect Planner, Access, Trust, Community, Companion, Resilience, Coverage, OpenData, and Assistant.
- [x] Seamless fallback to demo mode when backend is unreachable or disabled.
- [x] Ensure existing test suite and frontend build pass with zero regressions.

### Phase 8: Verification, Testing & Documentation
- [x] Unit tests for all business logic and routing algorithms.
- [x] Database integration tests with isolated test schemas.
- [x] Full automated test suite passes: **66 of 66 tests passing**.
- [x] Production client build (`npm run build`) passing.
- [x] Final verification report and documentation deliverables completed.
