# TransitTrack One

A complete React frontend demonstration of an evidence-aware multimodal mobility workspace for Chennai. Includes a public landing page, overview, nine dedicated feature modules, and supporting product pages.

## Run locally

Requires Node.js 22.12+ (Node 24 recommended) and npm.

```sh
npm install
npm run dev
```

Open the Local URL printed by Vite (normally http://localhost:5173).

```sh
npm run build
npm run preview
npm test
```

The build checks TypeScript before generating `dist/`. When hosting elsewhere, configure SPA fallback to `index.html` so direct `/app/*` links work.

## Explore the demonstration

- Search **Chennai Airport → Chennai Central**, **Tambaram → Guindy**, or **Chennai Central → Thiruvanmiyur**. Other pairs show an honest empty state.
- Select an itinerary to update its highlighted Leaflet route and timeline. Preference filters work against fixture attributes; they do not run a routing algorithm.
- Save trips and refresh: saved IDs persist locally. Access profiles, language, compact navigation, and reduced motion preferences also persist.
- Select station markers and accessibility profiles. Evidence labels expand by click, keyboard, or touch.
- Add a community report and exercise the local status workflow. Reports and attachments are not uploaded and reset on reload.
- Preview a trip manually, toggle the offline UI preview, and inspect a prepared recovery alternative. No GPS is used.
- Activate resilience closures and explore coverage layers. Values are explicitly illustrative; no graph calculations, walking catchments, or population analysis are performed.
- Download JSON/CSV correction files and plain-text issue/OSM drafts. Exports contain demo markers and are never sent externally.
- Try the rule-based assistant in English or Tamil. It requires no API key and links to relevant demo pages.

## Architecture

`src/data/demo.ts` owns typed station, journey, leg, evidence, report, scenario, coverage, and assistant fixtures. IDs are stable. `findJourneys` and `assistantReply` form the small local behaviour boundary; replace these with backend calls when real services exist. UI modules live in `src/pages`, reusable components in `src/components`, persistent UI state in `src/lib/state.tsx`, and design tokens/responsive styling in `src/styles/global.css`. Feature pages are lazy loaded. Tailwind 4 uses its current Vite plugin, alongside custom semantic component CSS.

Stack: React, TypeScript, Vite, Tailwind CSS, React Router, Lucide, Framer Motion, Recharts, React Leaflet/OpenStreetMap. Native form validation and explicit local validation keep the report form dependency-free.

## Testing and accessibility

Vitest + Testing Library cover all routes and the primary local workflows. Leaflet is mocked in DOM tests because map geometry requires a real browser; inspect the running application to verify tiles and route rendering. Native dialog elements provide keyboard focus containment and Escape behaviour. Inputs have labels, status changes use live regions, evidence has textual labels, and reduced-motion preferences are respected.

Responsive layouts target desktop, tablet, and 360–390px mobile screens. Mobile navigation is a drawer; the planner provides map/results switching. The interface uses a single considered light appearance. Tamil covers key navigation and assistant responses, not every detailed page.

## Limitations and external requests

No backend, actual routing engine, live tracking, operational timetables, authentication, real verification, live AI, or external correction submission is connected. An offline switch previews UI only; there is no service worker. Local storage may be unavailable in restrictive browser modes. Maps request public OpenStreetMap tiles; a readable overlay/marker fallback remains when tiles fail. Google Fonts is optional and has system-font fallbacks. Essential controls do not depend on fonts, tiles, or photos loading.

Do not use sample journey times, fares, accessibility records, or disruption values for real travel decisions. The UI displays this limitation throughout.

## Asset attribution

`public/images/chennai-metro.jpg`: **Chennai Metro Rail at Koyambedu**, KARTY JazZ, 5 July 2015. [Original Wikimedia Commons file](https://commons.wikimedia.org/wiki/File:Chennai_Metro_Rail_at_Koyambedu.JPG), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Displayed with CSS cropping and colour overlay; the original file is retained. Any adapted image must retain the same licence. Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright).

See [docs/UI_PAGES.md](docs/UI_PAGES.md) for route coverage and [docs/VERIFICATION.md](docs/VERIFICATION.md) for actual check results.
