# TransitTrack One — Known Issues & Operational Considerations

## 1. Database Engines: PGlite vs. Production PostgreSQL

### Local Development / Testing (PGlite)
- TransitTrack One defaults to `@electric-sql/pglite` (WebAssembly Postgres) when `DATABASE_URL` is not provided.
- **Benefits:** Zero-configuration setup on development laptops without requiring Docker or a system-installed `psql` service.
- **Considerations:**
  - PGlite runs in a single Node.js thread. Running multiple concurrent test suites against the same on-disk SQLite/PGlite database file can lead to memory locks. For tests, `process.env.DB_DATA_DIR = ":memory:"` with `fileParallelism: false` is used.
  - Multi-statement SQL migration files must be executed using `db.exec(sql)` rather than `db.query(sql)`.

### Production Deployment (PostgreSQL 16 + PostGIS)
- When `DATABASE_URL` is configured (as provided in `docker-compose.yml`), the system seamlessly switches to `pg.Pool` with connection pooling, spatial PostGIS indexing (`GIST(coordinates)`), and full multi-worker concurrency.

---

## 2. Browser Environment & Offline Support

- **Demo Offline Preview:** The offline preview switch in the UI demonstrates how cached schedules and saved journeys appear when disconnected. It does not register a progressive web app (PWA) ServiceWorker caching live HTTP requests.
- **Local Storage Limitations:** Saved journeys and UI preferences are stored in `localStorage`. In browser private/incognito modes with strict third-party storage blocking, saved trips reset upon window close.
- **Leaflet in Headless Test Environments:** Leaflet requires a real DOM with computed dimensions to position SVG tiles and polylines. JSDOM unit tests mock map instances to avoid layout exceptions. Visual verification of Leaflet routes is performed in live browser sessions.

---

## 3. GTFS & Chennai Open Data Constraints

- **Frequency vs. Timetable:** Certain MTC bus routes operate on dynamic headway rather than fixed minute-level schedules. The router treats these routes with indicative wait times and marks their timetable evidence as `Likely` rather than `Verified`.
- **MRTS Infrastructure Upgrades:** Ongoing structural integration between Southern Railway and CMRL along the Beach-Velachery line causes intermittent lift availability. Facility records for MRTS stations reflect `Uncertain` or `Unknown` evidence until field inspections are corroborated.

---

## 4. Planned Enhancements (Roadmap)

1. **Crowdsourced Photo Evidence:** Implement signed object storage uploads (S3/MinIO) for elevator and ramp physical photos with EXIF timestamp verification.
2. **GTFS-RT VehiclePositions Connector:** Ingest certified real-time bus and metro vehicle GPS feeds if and when transit agencies open public streams.
3. **Multilingual Speech Input:** Add voice search in Tamil and English utilizing the Web Speech API.
