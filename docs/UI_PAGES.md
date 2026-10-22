# UI route inventory

All data-heavy pages use clearly labelled local demonstrations.

| Route              | Purpose                                                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `/`                | Cinematic landing page, photo attribution, fixture autocomplete, journey entry, editorial platform introduction            |
| `/app`             | Overview, journey search, mode shortcuts, sample map, recent examples, evidence summary, reports                           |
| `/app/planner`     | Evidence-aware journey composer, filters, results, selected route, map, itinerary, saving                                  |
| `/app/access`      | Five access profiles, station search, filters, map selection, facility evidence, report entry                              |
| `/app/trust`       | Source catalogue, versions, completeness sorting/filtering, charts, findings, provenance                                   |
| `/app/community`   | Session-local report creation, validation, optional local image metadata, list/map, filters, history, status workflow      |
| `/app/companion`   | Saved/recent examples, manual trip progress, offline UI preview, blocked-leg recovery                                      |
| `/app/resilience`  | Three fixture scenarios, station/transfer/edge closure controls, baseline/disrupted comparison                             |
| `/app/coverage`    | Layer and walking-threshold controls, lift filter, illustrative POIs, station selection, ranked gaps, chart, JSON download |
| `/app/open-data`   | Eligible corrections, observed/expected review, JSON/CSV files, repository and OSM text drafts                             |
| `/app/assistant`   | Deterministic English/Tamil response catalogue, local history, input validation, relevant page actions                     |
| `/app/saved`       | Search, reopen, confirm removal of locally persisted example journeys                                                      |
| `/app/settings`    | Persistent language, access defaults, reduced motion, compact navigation, reset                                            |
| `/app/about`       | Product purpose, multimodal context, all nine module links                                                                 |
| `/app/reliability` | Evidence definitions, intended source approach, licences and attribution                                                   |
| `/app/limitations` | Explicit boundary between working frontend and unconnected backend capabilities                                            |
| `*`                | Branded not-found page with a home action                                                                                  |

The workspace includes global keyboard search (`Ctrl/⌘ K`), navigation drawer, collapsed desktop sidebar, demonstration notifications with read state, and accessible preferences access. Search supports arrow keys and Enter. Native dialogs support Escape and focus containment. Error boundaries, loading states, empty results, field errors, missing evidence, and unavailable map tile messaging are included.
