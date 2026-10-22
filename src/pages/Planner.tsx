import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowLeftRight,
  ArrowRight,
  SlidersHorizontal,
  Map,
  List,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import {
  Autocomplete,
  Button,
  PageTitle,
  Panel,
  Empty,
  Loading,
  DemoNote,
} from "../components/ui";
import { JourneyCard, Timeline, SavedButton } from "../components/Journey";
import TransitMap from "../components/TransitMap";
import { findJourneys, journeys, type Journey, type Mode } from "../data/demo";
import { useApp } from "../lib/state";
export default function Planner() {
  const [params] = useSearchParams();
  const { preferences } = useApp();
  const [origin, setOrigin] = useState(
    params.get("origin") || "Chennai Airport",
  );
  const [destination, setDestination] = useState(
    params.get("destination") || "Chennai Central",
  );
  const [modes, setModes] = useState<Mode[]>(
    params.get("mode") === "Bus"
      ? ["Bus"]
      : params.get("mode") === "Metro"
        ? ["Metro"]
        : ["Metro", "Bus", "Suburban", "MRTS"],
  );
  const [profile, setProfile] = useState(preferences.profile);
  const [transfers, setTransfers] = useState(3);
  const [walking, setWalking] = useState(30);
  const [sort, setSort] = useState("Fastest");
  const [filterOpen, setFilterOpen] = useState(false);
  const [view, setView] = useState("Results");
  const [results, setResults] = useState(() =>
    findJourneys(origin, destination, { modes }),
  );
  const [selected, setSelected] = useState<Journey | undefined>(
    () => findJourneys(origin, destination, { modes })[0],
  );
  const [loading, setLoading] = useState(false);
  const [time, setTime] = useState("09:00");
  const [timing, setTiming] = useState("Depart at");
  const [date, setDate] = useState("2026-10-22");
  const [searched, setSearched] = useState({ origin, destination });
  const [stationNote, setStationNote] = useState("");
  const search = (event?: React.FormEvent) => {
    event?.preventDefault();
    setLoading(true);
    setStationNote("");
    setTimeout(() => {
      const next = findJourneys(origin, destination, {
        modes,
        transfers,
        walking,
        profile,
      });
      setResults(next);
      setSelected(next[0]);
      setSearched({ origin, destination });
      setLoading(false);
    }, 350);
  };
  const reset = () => {
    setOrigin("Chennai Airport");
    setDestination("Chennai Central");
    setModes(["Metro", "Bus", "Suburban", "MRTS"]);
    setTransfers(3);
    setWalking(30);
    setProfile("Standard");
    setTime("09:00");
    setTiming("Depart at");
    setDate("2026-10-22");
    setResults(journeys.slice(0, 3));
    setSelected(journeys[0]);
    setSearched({ origin: "Chennai Airport", destination: "Chennai Central" });
  };
  const sorted = [...results].sort((a, b) =>
    sort === "Fewer transfers"
      ? a.transfers - b.transfers
      : sort === "Most verified"
        ? Number(b.tag === "Most verified") - Number(a.tag === "Most verified")
        : a.minutes - b.minutes,
  );
  return (
    <>
      <PageTitle
        eyebrow="EVIDENCE-AWARE JOURNEY COMPOSER"
        title="A better way through Chennai."
        description="See the journey. Understand the connections. Know the evidence."
        action={
          <span className="subtle-tag">
            <ShieldCheck size={14} /> Demo journey workspace
          </span>
        }
      />
      <div className="planner-layout">
        <div
          className={`planner-left ${view === "Map" ? "mobile-hidden" : ""}`}
        >
          <Panel className="planner-form-panel">
            <form onSubmit={search}>
              <div className="section-head">
                <h2>Plan your journey</h2>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Reset journey search"
                  onClick={reset}
                >
                  <RotateCcw size={16} />
                </button>
              </div>
              <div className="planner-locations">
                <Autocomplete
                  label="Origin"
                  value={origin}
                  onChange={setOrigin}
                />
                <button
                  type="button"
                  className="swap-button"
                  aria-label="Swap origin and destination"
                  onClick={() => {
                    setOrigin(destination);
                    setDestination(origin);
                  }}
                >
                  <ArrowLeftRight size={17} />
                </button>
                <Autocomplete
                  label="Destination"
                  value={destination}
                  onChange={setDestination}
                />
              </div>
              <div className="form-grid three">
                <label>
                  Journey time
                  <select
                    value={timing}
                    onChange={(e) => setTiming(e.target.value)}
                  >
                    <option>Depart at</option>
                    <option>Arrive by</option>
                  </select>
                </label>
                <label>
                  Time
                  <input
                    type="time"
                    value={time}
                    required
                    onChange={(e) => setTime(e.target.value)}
                  />
                </label>
                <label>
                  Date
                  <input
                    type="date"
                    value={date}
                    required
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
              </div>
              <div className="mode-filters">
                {(["Metro", "Bus", "Suburban", "MRTS"] as Mode[]).map(
                  (mode) => (
                    <button
                      className={modes.includes(mode) ? "active" : ""}
                      type="button"
                      aria-pressed={modes.includes(mode)}
                      key={mode}
                      onClick={() =>
                        setModes((m) =>
                          m.includes(mode)
                            ? m.filter((x) => x !== mode)
                            : [...m, mode],
                        )
                      }
                    >
                      {mode}
                    </button>
                  ),
                )}
              </div>
              <button
                className="filter-toggle"
                type="button"
                onClick={() => setFilterOpen(!filterOpen)}
                aria-expanded={filterOpen}
              >
                <SlidersHorizontal size={15} /> Accessibility & preferences{" "}
                <span>{filterOpen ? "−" : "+"}</span>
              </button>
              {filterOpen && (
                <div className="form-grid preferences-form">
                  <label>
                    Access profile
                    <select
                      value={profile}
                      onChange={(e) => setProfile(e.target.value)}
                    >
                      {[
                        "Standard",
                        "Wheelchair users",
                        "Low walking distance",
                        "Elderly passengers",
                        "Prams and luggage",
                        "Low vision",
                      ].map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Maximum transfers
                    <select
                      value={transfers}
                      onChange={(e) => setTransfers(Number(e.target.value))}
                    >
                      {[0, 1, 2, 3].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Maximum walking
                    <select
                      value={walking}
                      onChange={(e) => setWalking(Number(e.target.value))}
                    >
                      {[5, 10, 15, 30].map((n) => (
                        <option key={n} value={n}>
                          {n} minutes
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="field-note">
                    Profiles rank local examples by walking distance. Step-free
                    access is never guaranteed.
                  </p>
                </div>
              )}
              <Button type="submit" className="full" disabled={loading}>
                {loading ? "Finding examples…" : "Find sample journeys"}
                <ArrowRight size={17} />
              </Button>
            </form>
          </Panel>
          <div className="results-heading">
            <div>
              <h2>
                {loading
                  ? "Finding examples…"
                  : `${results.length} journey examples`}
              </h2>
              <p>
                {searched.origin} → {searched.destination}
              </p>
            </div>
          </div>
          <div className="segmented" aria-label="Sort journeys">
            {["Fastest", "Fewer transfers", "Most verified"].map((s) => (
              <button
                key={s}
                className={sort === s ? "active" : ""}
                aria-pressed={sort === s}
                onClick={() => {
                  setSort(s);
                  if (s === "Most verified")
                    setSelected(results.find((j) => j.tag === s) || results[0]);
                }}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="journey-results">
            {loading ? (
              <Loading />
            ) : sorted.length ? (
              sorted.map((j) => (
                <JourneyCard
                  key={j.id}
                  journey={j}
                  schedule={{ time, timing }}
                  selected={j.id === selected?.id}
                  onSelect={() => {
                    setSelected(j);
                    setStationNote("");
                  }}
                />
              ))
            ) : (
              <Panel>
                <Empty
                  title="No fixture matches this journey"
                  description="Try Airport → Central, Tambaram → Guindy, or Central → Thiruvanmiyur. Some filters may exclude available examples."
                  action={
                    <Button variant="secondary" onClick={reset}>
                      Try Airport → Central
                    </Button>
                  }
                />
              </Panel>
            )}
          </div>
        </div>
        <div
          className={`planner-right ${view === "Results" ? "mobile-map-hidden" : ""}`}
        >
          <div className="planner-map">
            <TransitMap
              route={selected}
              onStation={(s) =>
                setStationNote(
                  `${s.name}: ${s.evidence.toLowerCase()} sample evidence. Lift information: ${s.lift.toLowerCase()}.`,
                )
              }
            />
            {stationNote && (
              <div className="station-note" role="status">
                {stationNote}
                <button
                  aria-label="Close station summary"
                  onClick={() => setStationNote("")}
                >
                  ×
                </button>
              </div>
            )}
          </div>
          {selected && (
            <Panel className="itinerary-panel">
              <div className="section-head">
                <div>
                  <span className="eyebrow">YOUR SELECTED EXAMPLE</span>
                  <h2>
                    {selected.tag} · {selected.minutes} minutes
                  </h2>
                  <p>
                    {timing} {time} · {date} · illustrative schedule
                  </p>
                </div>
                <SavedButton journey={selected} />
              </div>
              <Timeline journey={selected} />
              <DemoNote>
                Connections, times, and fares are fixtures. Confirm schedules
                and access before travelling.
              </DemoNote>
            </Panel>
          )}
        </div>
      </div>
      <div className="mobile-view-switch">
        {["Results", "Map"].map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={view === v ? "active" : ""}
          >
            {v === "Map" ? <Map size={16} /> : <List size={16} />} {v}
          </button>
        ))}
      </div>
    </>
  );
}
