import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ArrowLeftRight,
  TrainFront,
  Bus,
  TramFront,
  Footprints,
  ShieldCheck,
  Accessibility,
  Network,
  Sparkles,
} from "lucide-react";
import TransitMap from "../components/TransitMap";
import {
  Autocomplete,
  Button,
  Panel,
  SectionHead,
  TextLink,
  Status,
  EvidenceBadge,
  Go,
} from "../components/ui";
import { useApp } from "../lib/state";
import { journeys } from "../data/demo";
export default function Overview() {
  const [origin, setOrigin] = useState("Chennai Airport");
  const [destination, setDestination] = useState("Chennai Central");
  const navigate = useNavigate();
  const { reports, saved, preferences } = useApp();
  return (
    <>
      <div className="overview-heading">
        <div>
          <div className="eyebrow">YOUR CITY, WITH CONTEXT</div>
          <h1>
            {preferences.language === "ta"
              ? "வணக்கம், சென்னை."
              : "Hello, Chennai."}
            <span>Let’s make the connections.</span>
          </h1>
          <p>A little more clarity for wherever you’re headed.</p>
        </div>
        <span className="city-coordinate">
          13.0827° N<br />
          80.2707° E
        </span>
      </div>
      <div className="overview-grid">
        <div className="overview-plan">
          <span className="eyebrow">THE JOURNEY STARTS HERE</span>
          <h2>Where are we going?</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              navigate(
                `/app/planner?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`,
              );
            }}
          >
            <Autocomplete label="From" value={origin} onChange={setOrigin} />
            <button
              type="button"
              className="swap-button overview-swap"
              aria-label="Swap locations"
              onClick={() => {
                setOrigin(destination);
                setDestination(origin);
              }}
            >
              <ArrowLeftRight size={16} />
            </button>
            <Autocomplete
              label="To"
              value={destination}
              onChange={setDestination}
            />
            <Button type="submit">
              Find a demonstration journey <ArrowRight size={17} />
            </Button>
          </form>
          <div className="transport-shortcuts">
            {[
              { label: "Metro", icon: TrainFront },
              { label: "Bus", icon: Bus },
              { label: "Rail", icon: TramFront },
              { label: "Walk", icon: Footprints },
            ].map((m) => (
              <button
                key={m.label}
                onClick={() => navigate(`/app/planner?mode=${m.label}`)}
              >
                <m.icon size={18} />
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div className="overview-map">
          <TransitMap
            route={journeys[0]}
            onStation={(s) => navigate(`/app/access?station=${s.id}`)}
          />
          <div className="overview-map-caption">
            <span>One city. Many ways to move.</span>
            <TextLink to="/app/planner">Explore the map</TextLink>
          </div>
        </div>
      </div>
      <div className="overview-lower">
        <Panel>
          <SectionHead
            title="A familiar way through"
            meta="Example journeys to start exploring"
            action={<TextLink to="/app/saved">Saved ({saved.length})</TextLink>}
          />
          {[journeys[0], journeys[3]].map((j) => (
            <button
              className="recent-journey"
              key={j.id}
              onClick={() =>
                navigate(
                  `/app/planner?origin=${encodeURIComponent(j.origin)}&destination=${encodeURIComponent(j.destination)}`,
                )
              }
            >
              <span className="mini-icon">
                <TrainFront size={19} />
              </span>
              <div>
                <strong>
                  {j.origin} <ArrowRight size={12} /> {j.destination}
                </strong>
                <small>
                  {j.minutes} min · {j.transfers} transfers · illustrative
                  journey
                </small>
              </div>
              <ArrowUpIcon />
            </button>
          ))}
        </Panel>
        <Panel>
          <SectionHead
            title="Confidence, in context"
            meta="Evidence across the sample network"
          />
          <div className="trust-overview">
            <span className="trust-number">
              62<small>%</small>
            </span>
            <div>
              <EvidenceBadge status="Verified" />
              <p>of sample records have consistent evidence</p>
            </div>
          </div>
          <div className="trust-bar">
            <i />
            <i />
            <i />
            <i />
          </div>
          <TextLink to="/app/trust">See what’s behind the data</TextLink>
        </Panel>
      </div>
      <div className="overview-bottom">
        <Panel>
          <SectionHead
            title="From the community"
            meta="Sample observations, not live reports"
            action={<TextLink to="/app/community">View all</TextLink>}
          />
          {reports.slice(0, 3).map((r) => (
            <div key={r.id} className="report-mini">
              <span className="report-mini-dot" />
              <div>
                <strong>{r.category}</strong>
                <small>
                  {r.station} · {r.id}
                </small>
              </div>
              <Status value={r.status} />
            </div>
          ))}
        </Panel>
        <div className="explore-tools">
          <Go to="/app/access" className="tool-link">
            <Accessibility />
            <span>
              <strong>Access, on your terms.</strong>
              <small>Find a profile that fits your journey</small>
            </span>
            <ArrowRight size={17} />
          </Go>
          <Go to="/app/resilience" className="tool-link">
            <Network />
            <span>
              <strong>A different perspective.</strong>
              <small>Explore the network’s connections</small>
            </span>
            <ArrowRight size={17} />
          </Go>
          <Go to="/app/assistant" className="tool-link dark">
            <Sparkles />
            <span>
              <strong>A little help, in your language.</strong>
              <small>Try the Tamil / English demo assistant</small>
            </span>
            <ArrowRight size={17} />
          </Go>
        </div>
      </div>
      <div className="module-directory">
        <ShieldCheck size={16} />
        <span>
          Explore all nine modules through the sidebar. Every insight is marked
          as demonstration data.
        </span>
      </div>
    </>
  );
}
function ArrowUpIcon() {
  return <ArrowRight size={16} />;
}
