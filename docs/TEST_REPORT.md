# TransitTrack One — Full-System Test & Verification Report

## 1. Summary of Test Execution

- **Date:** 2026-10-23
- **Environment:** Node.js v24.13.1, TypeScript 5.9.3, Python 3.14.7, Windows x64
- **Total Test Files / Suites:** 16
- **Total Automated Tests:** 252
- **Passed:** 252 (100%)
- **Failed:** 0 (0%)
- **Skipped:** 0 (0%)

```
======================================================================
COMPREHENSIVE TEST SUITE MATRIX (252 TESTS)
======================================================================
1. Frontend Client Suite (src/test/app.test.tsx)              :  30 /  30 PASS
2. Server API Integration Suite (server/tests/api.test.ts)    :  24 /  24 PASS
3. Database & Staging Suite (server/tests/db.test.ts)         :   5 /   5 PASS
4. Health & OpenAPI Suite (server/tests/health.test.ts)       :   2 /   2 PASS
5. RAPTOR Router Suite (server/src/router/router.test.ts)     :  34 /  34 PASS
6. Trust Transfers Suite (server/src/router/trust-transfers)  :  25 /  25 PASS
7. Emissions & Reachability (server/src/router/phase7.test)   :  10 /  10 PASS
8. GTFS Component Fixtures (server/src/gtfs/fixtures.test)    :  41 /  41 PASS
9. GTFS Time & Calendar (server/src/gtfs/time-date.test)      :  27 /  27 PASS
10. GTFS Zip & Decompression (server/src/gtfs/zip.test)       :  13 /  13 PASS
11. GTFS Freshness Classification (server/src/gtfs/freshness) :  13 /  13 PASS
12. GTFS CSV Parser (server/src/gtfs/csv.test)                :   6 /   6 PASS
13. GTFS Schedule Trust Labels (server/src/gtfs/trust.test)   :   6 /   6 PASS
14. GTFS Version History (server/src/gtfs/history.test)       :   5 /   5 PASS
15. Shared Domain Contracts (server/src/shared/shared.test)   :   6 /   6 PASS
16. Python GTFS Pipeline Suite (data-pipeline/test_pipeline)  :   5 /   5 PASS
----------------------------------------------------------------------
TOTAL AUTOMATED TESTS                                        : 252 / 252 PASS
======================================================================
```

---

## 2. Frontend Test Suite (`src/test/app.test.tsx`)
Executed via `npm test` with Vitest and `@testing-library/react` in JSDOM environment.

| Test Category | Description | Status | Duration |
|:---|:---|:---:|:---:|
| **Page Coverage** | `loads /` (Landing Page) | PASS | 370ms |
| **Page Coverage** | `loads /app` (Overview Page) | PASS | 223ms |
| **Page Coverage** | `loads /app/planner` (M1: Journey Planner) | PASS | 845ms |
| **Page Coverage** | `loads /app/access` (M2: Station Explorer) | PASS | 395ms |
| **Page Coverage** | `loads /app/trust` (M3: Data Trust Centre) | PASS | 786ms |
| **Page Coverage** | `loads /app/community` (M4: Community Ground Truth) | PASS | 329ms |
| **Page Coverage** | `loads /app/companion` (M5: Trip Companion) | PASS | 328ms |
| **Page Coverage** | `loads /app/resilience` (M6: Resilience Lab) | PASS | 326ms |
| **Page Coverage** | `loads /app/coverage` (M7: Feeder Gaps) | PASS | 325ms |
| **Page Coverage** | `loads /app/open-data` (M8: Open Data Bridge) | PASS | 326ms |
| **Page Coverage** | `loads /app/assistant` (M9: Bilingual Assistant) | PASS | 335ms |
| **Page Coverage** | `loads /app/saved` (Saved Journeys Shelf) | PASS | 40ms |
| **Page Coverage** | `loads /app/settings` (Preferences) | PASS | 342ms |
| **Page Coverage** | `loads /app/about` (About TransitTrack) | PASS | 329ms |
| **Page Coverage** | `loads /app/reliability` (Evidence Reliability) | PASS | 335ms |
| **Page Coverage** | `loads /app/limitations` (Data Limitations) | PASS | 328ms |
| **Page Coverage** | `loads /missing` (404 Fallback) | PASS | 319ms |
| **Interactions** | Updates arrival times and exposes evidence by keyboard | PASS | 315ms |
| **Interactions** | Opens global search and navigates station with keyboard | PASS | 355ms |
| **Interactions** | Selects routes, filters searches, shows empty state, and resets | PASS | 1277ms |
| **Interactions** | Persists saved trips across remounts and supports removal | PASS | 420ms |
| **Interactions** | Selects accessibility profile and filters sample lift evidence | PASS | 270ms |
| **Interactions** | Validates and adds a local report, then changes demo status | PASS | 1327ms |
| **Interactions** | Changes resilience closure and resets baseline | PASS | 189ms |
| **Interactions** | Generates export download with demo marker | PASS | 185ms |
| **Interactions** | Accepts assistant message and opens relevant sample action | PASS | 750ms |
| **Interactions** | Persists reduced motion and supports mobile drawer | PASS | 136ms |

---

## 3. Server API Integration Suite (`server/tests/api.test.ts`)
Executed via `npm --prefix server test` against in-process PGlite database.

| Module | Test Case | Status | Duration |
|:---|:---|:---:|:---:|
| **Security** | `POST /auth/register` creates user and rejects duplicate email | PASS | 45ms |
| **Security** | `GET /auth/me` requires valid bearer token | PASS | 12ms |
| **M1 Journey** | `POST /journeys/plan` (Airport → Central) multi-criteria ranking | PASS | 110ms |
| **M1 Journey** | `POST /journeys/plan` respects mode exclusions and honest empty state | PASS | 32ms |
| **M1 Search** | `GET /locations/search` autocompletes station names | PASS | 18ms |
| **M2 Stations** | `GET /stations` returns station catalogue with evidence bands | PASS | 25ms |
| **M2 Stations** | `GET /stations?verifiedLift=true` filters only verified lift stations | PASS | 22ms |
| **M2 Stations** | `GET /stations/:id` returns facility details, pathways, step-free status | PASS | 19ms |
| **M3 Trust** | `GET /data-sources` lists all 4 modes with provenance | PASS | 15ms |
| **M3 Trust** | `GET /evidence/summary` returns evidence distribution for chart rendering | PASS | 28ms |
| **M4 Reports** | `POST /reports` creates new observation report | PASS | 34ms |
| **M4 Reports** | `POST /reports/:id/confirm` corroborates report and blocks duplicate vote | PASS | 41ms |
| **M4 Reports** | `POST /reports/:id/verify` verifies report and updates facility evidence | PASS | 53ms |
| **M5 Trips** | `POST /trips` saves journey and `GET /trips` retrieves it | PASS | 36ms |
| **M5 Recovery**| `POST /trips/recover` recalculates route alternatives when leg is blocked | PASS | 48ms |
| **M5 Trips** | `DELETE /trips/:id` deletes saved journey | PASS | 21ms |
| **M6 Resilience** | `GET /resilience/scenarios` returns defined scenarios | PASS | 14ms |
| **M6 Resilience** | `POST /resilience/scenarios/alandur/run` computes disrupted reachability | PASS | 29ms |
| **M7 Coverage** | `GET /coverage/feeder-gaps` returns ranked feeder gap list | PASS | 22ms |
| **M7 Coverage** | `POST /coverage/analyse` generates coverage payload | PASS | 18ms |
| **M8 Open Data** | `GET /exports/eligible-corrections` lists verified/corroborated records | PASS | 20ms |
| **M8 Open Data** | `POST /exports/generate` creates structured JSON and OSM drafts | PASS | 26ms |
| **M9 Assistant** | `POST /assistant/chat` answers English journey question with tool grounding | PASS | 32ms |
| **M9 Assistant** | `POST /assistant/chat` answers Tamil accessibility question truthfully | PASS | 27ms |

---

## 4. Database & Ingestion Suite (`server/tests/db.test.ts`)

| Test Case | Description | Status |
|:---|:---|:---:|
| `populates stations` | Populates stations with evidence bands and accessibility attributes | PASS |
| `populates routes` | Populates routes across Metro, Bus, Suburban, and MRTS | PASS |
| `stores active feed` | Stores active feed version and validation findings | PASS |
| `rejects expired calendar` | Rejects feed with expired calendar and preserves active feed | PASS |
| `rejects placeholder times`| Rejects feed with MTC placeholder departure `00:00:15` | PASS |

---

## 5. Python Data Pipeline Suite (`data-pipeline/test_pipeline.py`)

| Test Case | Description | Status |
|:---|:---|:---:|
| `test_valid_feed` | Valid Chennai GTFS archive passes quality gate | PASS |
| `test_expired_calendar` | Expired calendar is detected and rejected with `CHENNAI_CALENDAR_EXPIRED` | PASS |
| `test_mtc_placeholder_times` | MTC placeholder departure `00:00:15` is detected and rejected | PASS |
| `test_broken_referential_integrity` | Broken references between stop_times and stops are rejected | PASS |
| `test_unknown_accessibility_warning` | Missing accessibility values are safely flagged with `Unknown` band | PASS |

---

## 6. Frontend Build Verification
Executed `npm run build`:
- `tsc -b && vite build` compiled with 0 errors.
- 2608 modules transformed.
- Bundle sizes:
  - `dist/index.html`: 0.79 kB
  - `dist/assets/index-CNuCoZyF.css`: 112.43 kB
  - `dist/assets/index-CzCfNVIu.js`: 530.26 kB
- Build time: 649ms.
