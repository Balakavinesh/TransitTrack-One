# Verification report

Verified on 22 October 2026 in the local Windows workspace.

## Build and dependencies

- `npm install`: completed successfully.
- `npm run dev`: Vite serves the app at `http://localhost:5173/`.
- `npm run build`: TypeScript and production bundling completed successfully.
- `npm audit`: no vulnerabilities after updating the build/test toolchain.

## Automated tests

`npm test`: **30 passed, 0 failed** in Vitest with Testing Library.

Coverage includes exact fixture matching and unsupported pairs; mode, transfer and walking filters; Tamil and fallback assistant responses; the landing page, overview, all nine modules, five supporting pages and not-found route; navigation; itinerary selection and map-state props; illustrative arrival-time display; keyboard evidence expansion; global search; saved journeys across remounts and removal; access profile selection; verified-lift filtering; report validation, insertion and status changes; resilience closures and reset; real Blob/download generation; assistant input/actions; preference persistence and navigation drawer state.

The DOM tests mock the Leaflet view. The following browser checks exercise the real map and browser storage separately.

## Browser checks

Used the Codex in-app Chromium browser against the running local app.

- Visited the landing page, overview, all nine modules, and all supporting pages.
- Checked 1440 × 900 desktop, 1280 × 800 laptop, 768 × 1024 tablet, 390 × 844 mobile, and 360 × 800 narrow mobile layouts.
- Checked document width across all 16 main routes at laptop, tablet, and mobile sizes. No horizontal page overflow remained after fixing the mobile landing header. Tables and profile strips use intentional local scrolling.
- Inspected the landing, overview, planner, trust, and mobile-map compositions visually. Local Chennai photography loads; the hero overlay renders; charts settle to their fixture values.
- OpenStreetMap tiles loaded. Real Leaflet pan/zoom controls, highlighted geometry, and marker popups are present. The Guindy station marker was activated with Enter and updated the station summary.
- Switched the mobile planner to map mode; its map resized and fitted the selected route.
- Opened the mobile navigation drawer and closed it with Escape. The drawer traps focus; hidden mobile navigation is inert.
- Submitted an invalid report, observed its validation message, then added a valid session-local report and observed the updated list.
- Selected and saved an itinerary, reloaded, and confirmed the saved state remained.
- Activated the Alandur closure and observed the changed scenario state.
- Sent an assistant question and observed a local response and working station-evidence action.
- Searched for Guindy globally and opened its station explorer result using Enter.
- Downloaded a real JSON correction file, read its contents, and retained a copy at `docs/samples/transittrack-demo-correction.json`. It contains `demonstration: true` and `submitted: false`.
- Inspected captured browser error/warning logs: none were reported during these checks.

Screenshots in `docs/screenshots/` document representative desktop and mobile views.

## Verification boundaries

This is a local frontend demonstration, not a connected transportation service. No operational accuracy, real routing, current station access, real report verification, real simulation, or live AI is claimed. The tile-failure message and runtime error boundary are implemented but were not fault-injected in the browser. Accessibility was checked through semantic controls and keyboard flows; no formal screen-reader or WCAG certification audit was performed. Testing covered the in-app Chromium browser, not an exhaustive cross-browser/device matrix. Tamil support covers key navigation and assistant responses; detailed data pages remain English. Offline mode is a UI preview rather than a service worker.
