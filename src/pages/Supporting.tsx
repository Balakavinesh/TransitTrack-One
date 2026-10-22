import { Link } from "react-router-dom";
import {
  Accessibility,
  ArrowRight,
  ShieldCheck,
  Settings2,
  Globe2,
  Footprints,
  Sparkles,
  Network,
  Route,
  Database,
  MessageSquare,
  ScanLine,
  GitPullRequestArrow,
  Compass,
  MapPin,
} from "lucide-react";
import { useApp } from "../lib/state";
import {
  PageTitle,
  Panel,
  EvidenceBadge,
  Go,
  DemoNote,
} from "../components/ui";
import { navigation, Brand } from "../components/Layout";
export function Settings() {
  const { preferences, setPreferences, notify } = useApp();
  return (
    <>
      <PageTitle
        eyebrow="SETTINGS & PREFERENCES"
        title="Make a little room for you."
        description="Personalise this demo workspace. Preferences are stored on this device."
      />
      <div className="settings-layout">
        <Panel>
          <h2>
            <Settings2 size={20} />
            Workspace preferences
          </h2>
          <div className="setting-row">
            <div>
              <Globe2 size={20} />
              <span>
                <strong>Interface language</strong>
                <small>
                  Key navigation labels and assistant responses support Tamil.
                  Detailed data pages remain in English.
                </small>
              </span>
            </div>
            <label>
              <span className="sr-only">Interface language</span>
              <select
                value={preferences.language}
                onChange={(e) =>
                  setPreferences((p) => ({ ...p, language: e.target.value }))
                }
              >
                <option value="en">English</option>
                <option value="ta">தமிழ்</option>
              </select>
            </label>
          </div>
          <div className="setting-row">
            <div>
              <Accessibility size={20} />
              <span>
                <strong>Default access profile</strong>
                <small>
                  Used by the station explorer and journey preferences.
                </small>
              </span>
            </div>
            <label>
              <span className="sr-only">Default access profile</span>
              <select
                value={preferences.profile}
                onChange={(e) =>
                  setPreferences((p) => ({ ...p, profile: e.target.value }))
                }
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
          </div>
          <div className="setting-row">
            <div>
              <Footprints size={20} />
              <span>
                <strong>Reduced motion</strong>
                <small>
                  Minimise page transitions. Your system preference is also
                  respected.
                </small>
              </span>
            </div>
            <button
              className="toggle"
              role="switch"
              aria-label="Reduced motion"
              aria-checked={preferences.reducedMotion}
              onClick={() =>
                setPreferences((p) => ({
                  ...p,
                  reducedMotion: !p.reducedMotion,
                }))
              }
            >
              <i />
            </button>
          </div>
          <div className="setting-row">
            <div>
              <Settings2 size={20} />
              <span>
                <strong>Compact sidebar</strong>
                <small>A little more space for maps and details.</small>
              </span>
            </div>
            <button
              className="toggle"
              role="switch"
              aria-label="Compact sidebar"
              aria-checked={preferences.compact}
              onClick={() =>
                setPreferences((p) => ({ ...p, compact: !p.compact }))
              }
            >
              <i />
            </button>
          </div>
          <button
            className="button secondary"
            onClick={() => {
              setPreferences({
                language: "en",
                profile: "Standard",
                reducedMotion: false,
                compact: false,
              });
              notify("Workspace preferences reset");
            }}
          >
            Reset preferences
          </button>
        </Panel>
        <Panel className="settings-note">
          <Sparkles size={25} />
          <h2>A considered default.</h2>
          <p>
            The workspace uses a light canvas with navy navigation to keep
            detailed maps, evidence, and charts readable.
          </p>
          <DemoNote>
            No accounts, authentication, or cloud preference syncing are
            connected.
          </DemoNote>
        </Panel>
      </div>
    </>
  );
}
export function About() {
  const icons = [
    Route,
    Accessibility,
    Compass,
    ShieldCheck,
    MessageSquare,
    GitPullRequestArrow,
    Network,
    ScanLine,
    Sparkles,
  ];
  return (
    <>
      <PageTitle
        eyebrow="ABOUT TRANSITTRACK ONE"
        title="Chennai, connected with context."
        description="An evidence-aware multimodal journey planning platform for a city that moves in many ways."
      />
      <div className="about-hero">
        <div>
          <span className="eyebrow">ONE CITY. A FULLER PICTURE.</span>
          <h2>
            A journey is more
            <br />
            than its destination.
          </h2>
          <p>
            TransitTrack One brings together Metro, MTC buses, suburban rail,
            MRTS, and walking connections. Its focus is to make the quality of
            transportation information visible alongside the journey itself.
          </p>
        </div>
        <img
          src="/images/chennai-metro.jpg"
          alt="Chennai Metro train at Koyambedu"
          width="600"
          height="400"
        />
      </div>
      <Panel>
        <h2>Nine perspectives. One connected workspace.</h2>
        <div className="about-modules">
          {navigation
            .flatMap((g) => g.items)
            .filter((x) => x.to !== "/app")
            .map((item, i) => {
              const Icon = icons[i] || Route;
              return (
                <Link to={item.to} key={item.to}>
                  <Icon size={22} />
                  <span>
                    <small>0{i + 1} / EXPLORE</small>
                    <strong>{item.label}</strong>
                  </span>
                  <ArrowRight size={16} />
                </Link>
              );
            })}
        </div>
      </Panel>
      <DemoNote>
        Full project title: An Evidence-Aware Multimodal Journey Planning Web
        Platform with Accessibility Routing, Community Verification and Network
        Resilience Analysis for Chennai.
      </DemoNote>
    </>
  );
}
export function Reliability() {
  return (
    <>
      <PageTitle
        eyebrow="DATA & RELIABILITY"
        title="Clarity before certainty."
        description="Know where information comes from, what supports it, and what remains unknown."
      />
      <div className="reliability-layout">
        <Panel>
          <h2>Evidence is part of the journey.</h2>
          <p className="body-copy">
            Information quality is not the same as punctuality. A well-supported
            timetable does not guarantee an on-time train. A missing
            accessibility field does not confirm a step-free path. This
            interface keeps those distinctions visible.
          </p>
          <div className="evidence-definitions">
            {(["Verified", "Likely", "Uncertain", "Unknown"] as const).map(
              (s, i) => (
                <div key={s}>
                  <EvidenceBadge status={s} />
                  <p>
                    {
                      [
                        "Consistent source records plus a corroborating observation in the fixture.",
                        "One useful source, without independent corroboration.",
                        "Conflicting, incomplete, or potentially stale source information.",
                        "No supporting information available. Never interpreted as confirmation.",
                      ][i]
                    }
                  </p>
                </div>
              ),
            )}
          </div>
          <h2>Intended real-data sources</h2>
          <p className="body-copy">
            A future backend may integrate operator-published timetables and
            GTFS feeds where available, licensed geospatial data, station
            facility audits, and consented community observations. Source
            availability, licence terms, version history, and validation rules
            must be confirmed during that integration.
          </p>
          <Go to="/app/trust" className="button secondary">
            Inspect the sample catalogue <ArrowRight size={16} />
          </Go>
        </Panel>
        <div>
          <Panel>
            <Database size={25} />
            <h3>What is connected today?</h3>
            <p className="body-copy">
              Only local demonstration fixtures, browser storage, and
              OpenStreetMap base tiles. There are no active transit feeds.
            </p>
          </Panel>
          <Panel>
            <ShieldCheck size={25} />
            <h3>Photography & map attribution</h3>
            <p className="body-copy">
              Chennai Metro at Koyambedu, by KARTY JazZ. The image is displayed
              cropped with a colour overlay.
            </p>
            <a
              className="text-link"
              href="https://commons.wikimedia.org/wiki/File:Chennai_Metro_Rail_at_Koyambedu.JPG"
            >
              Original photograph ↗
            </a>
            <a
              className="text-link"
              href="https://creativecommons.org/licenses/by-sa/4.0/"
            >
              CC BY-SA 4.0 licence ↗
            </a>
            <p className="body-copy">Map data © OpenStreetMap contributors.</p>
            <a
              className="text-link"
              href="https://www.openstreetmap.org/copyright"
            >
              Map attribution & licence ↗
            </a>
          </Panel>
        </div>
      </div>
    </>
  );
}
export function Limitations() {
  return (
    <>
      <PageTitle
        eyebrow="CURRENT LIMITATIONS"
        title="An honest demonstration."
        description="A complete frontend experience, with clear boundaries around what is connected."
      />
      <Panel className="limitations-panel">
        <span className="demo-pill">FRONTEND DEMONSTRATION</span>
        <h2>Real places. Illustrative information.</h2>
        <p className="body-copy">
          Use this workspace to explore the product’s design and interactions.
          Do not use its example journeys as operational travel instructions.
        </p>
        {[
          {
            name: "Journey planning",
            text: "Matches locally defined origin–destination examples and filters their attributes. No McRAPTOR, timetable engine, real routing, fare calculation, or live vehicle tracking is implemented.",
          },
          {
            name: "Accessibility",
            text: "Facility records are illustrative. No current lift, entrance, ramp, or pathway availability is confirmed. Unknown information must be checked with an operator.",
          },
          {
            name: "Community verification",
            text: "Reports and review states exist only in the current browser session. No community database, real reviewer, image storage, or moderation service is connected.",
          },
          {
            name: "Network intelligence",
            text: "Disruption values, reachability scores, and coverage percentages are prepared fixtures. Map circles are proximity illustrations, not routing results or population statistics.",
          },
          {
            name: "Assistant",
            text: "Uses a deterministic local response catalogue in Tamil and English. No large language model, paid API, tool-calling agent, or external information retrieval is connected.",
          },
          {
            name: "Saved trips & offline preview",
            text: "Saved journey IDs and UI preferences use local storage. The offline switch is a UI preview; it does not cache map tiles or provide full offline operation.",
          },
          {
            name: "Exports & accounts",
            text: "Downloads are real local demonstration files. Nothing is submitted to GitHub, OSM, or an operator. Authentication and real account management are not connected.",
          },
        ].map((l, i) => (
          <div className="limitation-row" key={l.name}>
            <span>0{i + 1}</span>
            <div>
              <h3>{l.name}</h3>
              <p>{l.text}</p>
            </div>
          </div>
        ))}
      </Panel>
    </>
  );
}
export function NotFound() {
  return (
    <div className="not-found">
      <Brand />
      <div className="not-found-art">
        <MapPin size={60} />
        <span>404</span>
      </div>
      <span className="eyebrow">A SMALL DETOUR</span>
      <h1>This connection isn’t on the map.</h1>
      <p>The page may have moved. Let’s get you back to familiar ground.</p>
      <Go to="/">
        Return home <ArrowRight size={17} />
      </Go>
    </div>
  );
}
