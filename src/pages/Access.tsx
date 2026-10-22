import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Accessibility,
  Footprints,
  PersonStanding,
  Luggage,
  Eye,
  ArrowRight,
  ArrowUpDown,
  AlertTriangle,
  MapPin,
} from "lucide-react";
import {
  PageTitle,
  Panel,
  EvidenceBadge,
  Go,
  Empty,
  DemoNote,
  SectionHead,
} from "../components/ui";
import TransitMap from "../components/TransitMap";
import { stations } from "../data/demo";
import { useApp } from "../lib/state";
const profiles = [
  {
    name: "Wheelchair users",
    icon: Accessibility,
    text: "Step-free connections",
  },
  {
    name: "Low walking distance",
    icon: Footprints,
    text: "Shorter paths between modes",
  },
  {
    name: "Elderly passengers",
    icon: PersonStanding,
    text: "Fewer stairs, easier transfers",
  },
  { name: "Prams and luggage", icon: Luggage, text: "Space and lift access" },
  { name: "Low vision", icon: Eye, text: "Wayfinding and assistance" },
];
export default function Access() {
  const [params] = useSearchParams();
  const { preferences, setPreferences } = useApp();
  const [profile, setProfile] = useState(
    preferences.profile === "Standard"
      ? "Wheelchair users"
      : preferences.profile,
  );
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("All modes");
  const [onlyVerified, setOnlyVerified] = useState(false);
  const [selected, setSelected] = useState(
    stations.find((s) => s.id === params.get("station")) || stations[3],
  );
  const filtered = stations.filter(
    (s) =>
      s.name.toLowerCase().includes(query.toLowerCase()) &&
      (mode === "All modes" || s.mode === mode) &&
      (!onlyVerified || s.lift === "Verified"),
  );
  return (
    <>
      <PageTitle
        eyebrow="ACCESS PROFILES & STATION EXPLORER"
        title="Every journey is personal."
        description="Find the station details that matter to you. Missing information stays visible."
      />
      <div className="profile-grid">
        {profiles.map((p) => (
          <button
            key={p.name}
            onClick={() => {
              setProfile(p.name);
              setPreferences((s) => ({ ...s, profile: p.name }));
            }}
            className={`profile-card ${profile === p.name ? "selected" : ""}`}
            aria-pressed={profile === p.name}
          >
            <p.icon size={23} />
            <strong>{p.name}</strong>
            <span>{p.text}</span>
          </button>
        ))}
      </div>
      <div className="access-layout">
        <Panel className="station-list">
          <SectionHead
            title="Explore stations"
            meta={`${filtered.length} sample places · ${profile}`}
          />
          <label className="sr-only" htmlFor="station-search">
            Search stations
          </label>
          <input
            id="station-search"
            placeholder="Search a station…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="station-filters">
            <label className="sr-only" htmlFor="station-mode">
              Transport mode
            </label>
            <select
              id="station-mode"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              {["All modes", "Metro", "Suburban", "MRTS", "Bus"].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={onlyVerified}
                onChange={(e) => setOnlyVerified(e.target.checked)}
              />{" "}
              Sample verified lift
            </label>
          </div>
          {filtered.length ? (
            filtered.map((s) => (
              <button
                className={`station-card ${selected.id === s.id ? "selected" : ""}`}
                key={s.id}
                onClick={() => setSelected(s)}
              >
                <span className="mini-icon">
                  <MapPin size={18} />
                </span>
                <span>
                  <strong>{s.name}</strong>
                  <small>
                    {s.mode} · {s.area}
                  </small>
                  <span className={`plain-evidence ${s.lift.toLowerCase()}`}>
                    Lift: {s.lift}
                  </span>
                </span>
                <ArrowRight size={16} />
              </button>
            ))
          ) : (
            <Empty />
          )}
        </Panel>
        <div className="station-detail-column">
          <div className="access-map">
            <TransitMap
              onStation={setSelected}
              selected={selected.id}
              accessible={onlyVerified}
            />
          </div>
          <Panel className="station-detail">
            <div className="section-head">
              <div>
                <span className="eyebrow">
                  {selected.mode} · SAMPLE FACILITY RECORD
                </span>
                <h2>{selected.name}</h2>
              </div>
              <EvidenceBadge status={selected.evidence} />
            </div>
            <div className="facility-grid">
              {[
                { label: "Lift access", value: selected.lift },
                { label: "Entrance ramp", value: selected.ramp },
                { label: "Platform pathway", value: "Likely" as const },
                { label: "Tactile wayfinding", value: "Unknown" as const },
              ].map((f) => (
                <div key={f.label}>
                  <span>
                    <ArrowUpDown size={17} />
                    {f.label}
                  </span>
                  <EvidenceBadge status={f.value} />
                </div>
              ))}
            </div>
            <div className="access-warning">
              <AlertTriangle size={19} />
              <div>
                <strong>
                  {profile === "Low vision"
                    ? "Wayfinding information is incomplete."
                    : selected.lift === "Verified"
                      ? "Sample evidence supports lift access."
                      : "Step-free access is not confirmed."}
                </strong>
                <p>
                  {profile === "Low walking distance"
                    ? "Exact entrance-to-platform walking distances are missing."
                    : profile === "Prams and luggage"
                      ? "Lift dimensions and pram clearance are missing."
                      : profile === "Elderly passengers"
                        ? "Seating, rest points, and assistance availability are not documented."
                        : "A verified sample record does not confirm current operating conditions."}{" "}
                  Stairs {selected.stairs ? "are present" : "are not recorded"}{" "}
                  in this fixture.
                </p>
              </div>
            </div>
            <Go
              to={`/app/community?station=${selected.id}`}
              className="button secondary"
            >
              Report a station problem <ArrowRight size={16} />
            </Go>
            <DemoNote>
              Entrance B, platforms, lifts, ramps, and paths shown here are
              illustrative facility records.
            </DemoNote>
          </Panel>
        </div>
      </div>
    </>
  );
}
