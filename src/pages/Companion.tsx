import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Bookmark,
  WifiOff,
  ArrowRight,
  Flag,
  Compass,
  Check,
  Footprints,
} from "lucide-react";
import { journeys } from "../data/demo";
import { useApp } from "../lib/state";
import {
  PageTitle,
  Panel,
  Button,
  SectionHead,
  DemoNote,
  Empty,
  Go,
  Modal,
} from "../components/ui";
import { Timeline, JourneyCard } from "../components/Journey";
import TransitMap from "../components/TransitMap";
import { api } from "../lib/api";

export default function Companion({
  savedOnly = false,
}: {
  savedOnly?: boolean;
}) {
  const { saved, toggleSave, notify } = useApp();
  const [selected, setSelected] = useState(
    journeys.find((j) => saved.includes(j.id)) || journeys[0],
  );
  const [offline, setOffline] = useState(false);
  const [progress, setProgress] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const [query, setQuery] = useState("");
  const [remove, setRemove] = useState<string | null>(null);
  const [alternative, setAlternative] = useState(false);
  const [recoveryJourney, setRecoveryJourney] = useState<(typeof journeys)[number] | null>(null);
  const listed = (
    savedOnly
      ? journeys.filter((j) => saved.includes(j.id))
      : journeys.filter(
          (j) =>
            saved.includes(j.id) ||
            ["airport-fast", "tambaram-direct"].includes(j.id),
        )
  ).filter((j) =>
    `${j.origin} ${j.destination}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <PageTitle
        eyebrow={
          savedOnly ? "YOUR SAVED JOURNEYS" : "TRIP COMPANION & RECOVERY"
        }
        title={
          savedOnly
            ? "Good connections, kept close."
            : "A little clarity at every step."
        }
        description={
          savedOnly
            ? "Your saved demonstration journeys, stored on this device."
            : "Preview a journey, review a transfer, and explore an alternative when plans change."
        }
        action={
          !savedOnly && (
            <label className="offline-toggle">
              <WifiOff size={17} />
              Preview offline
              <button
                className="toggle"
                role="switch"
                aria-label="Preview offline mode"
                aria-checked={offline}
                onClick={() => setOffline(!offline)}
              >
                <i />
              </button>
            </label>
          )
        }
      />
      {offline && (
        <div className="offline-banner" role="status">
          <WifiOff size={22} />
          <div>
            <strong>Offline demonstration preview</strong>
            <p>
              Showing bundled sample content · sample cache date: 15 Oct 2026.
              Information may be stale. This toggle does not change your browser
              connection or install an offline service worker.
            </p>
          </div>
        </div>
      )}
      <div className="companion-layout">
        <Panel className="saved-list">
          <SectionHead
            title={savedOnly ? "Saved on this device" : "Your journey shelf"}
            meta={
              savedOnly
                ? `${saved.length} saved sample journeys`
                : "Saved trips & frequently used examples"
            }
          />
          <label className="sr-only" htmlFor="saved-search">
            Search journeys
          </label>
          <input
            id="saved-search"
            placeholder="Find a saved journey…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {listed.length ? (
            listed.map((j) => (
              <div
                className={`saved-trip ${selected.id === j.id ? "selected" : ""}`}
                key={j.id}
              >
                <button
                  onClick={() => {
                    setSelected(j);
                    setProgress(0);
                    setAlternative(false);
                  }}
                >
                  <Compass size={20} />
                  <span>
                    <strong>{j.origin}</strong>
                    <small>
                      to {j.destination} · {j.minutes} min
                    </small>
                  </span>
                  <ArrowRight size={16} />
                </button>
                <div>
                  <span>
                    {saved.includes(j.id)
                      ? "Saved demonstration trip"
                      : "Frequently used example"}
                  </span>
                  <button
                    aria-label={
                      saved.includes(j.id)
                        ? `Remove ${j.origin} journey`
                        : `Save ${j.origin} journey`
                    }
                    className="icon-button"
                    onClick={() =>
                      saved.includes(j.id) ? setRemove(j.id) : toggleSave(j.id)
                    }
                  >
                    <Bookmark
                      size={15}
                      fill={saved.includes(j.id) ? "currentColor" : "none"}
                    />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <Empty
              title="No saved journeys yet"
              description="Save an example in the planner to keep it here."
              action={
                <Go to="/app/planner">
                  Explore journeys <ArrowRight size={16} />
                </Go>
              }
            />
          )}
          <DemoNote>
            Saved trip IDs persist in browser local storage. There is no
            connected account.
          </DemoNote>
        </Panel>
        <div
          className="companion-main"
          hidden={savedOnly && saved.length === 0}
        >
          <div className="companion-hero">
            <div>
              <span className="eyebrow">
                {savedOnly ? "SELECTED JOURNEY" : "YOUR NEXT CONNECTION"}
              </span>
              <h2>
                {selected.origin}
                <ArrowRight size={22} />
                {selected.destination}
              </h2>
              <p>
                {selected.minutes} min · {selected.transfers} transfers ·
                demonstration itinerary
              </p>
            </div>
            <Link
              to={`/app/planner?origin=${encodeURIComponent(selected.origin)}&destination=${encodeURIComponent(selected.destination)}`}
              className="button secondary"
            >
              Reopen in planner
            </Link>
          </div>
          {!savedOnly && (
            <Panel>
              <div className="section-head">
                <h2>Step through your journey</h2>
                <span className="subtle-tag">Manual preview · no GPS</span>
              </div>
              <div className="progress-steps">
                {selected.legs.map((l, i) => (
                  <button
                    key={i}
                    onClick={() => setProgress(i)}
                    aria-current={i === progress ? "step" : undefined}
                    className={i <= progress ? "complete" : ""}
                  >
                    <span>{i < progress ? <Check size={14} /> : i + 1}</span>
                    <small>{l.mode}</small>
                  </button>
                ))}
              </div>
              <div className="current-step">
                <span className="mini-icon">
                  <Footprints size={21} />
                </span>
                <div>
                  <span>
                    STEP {progress + 1} OF {selected.legs.length}
                  </span>
                  <h3>
                    {selected.legs[progress].from} →{" "}
                    {selected.legs[progress].to}
                  </h3>
                  <p>
                    {selected.legs[progress].line} ·{" "}
                    {selected.legs[progress].minutes} minutes
                  </p>
                </div>
              </div>
              <div className="step-actions">
                <Button
                  variant="secondary"
                  disabled={progress === 0}
                  onClick={() => setProgress((p) => p - 1)}
                >
                  Previous step
                </Button>
                <Button
                  disabled={progress === selected.legs.length - 1}
                  onClick={() => setProgress((p) => p + 1)}
                >
                  Preview next step <ArrowRight size={15} />
                </Button>
              </div>
            </Panel>
          )}
          <div className="companion-detail-grid">
            <Panel>
              <SectionHead title="Every connection, in order" />
              <Timeline journey={selected} />
              <Button variant="secondary" onClick={() => setBlocked(true)}>
                <Flag size={15} />
                Report a blocked leg
              </Button>
            </Panel>
            <div className="companion-map">
              <TransitMap route={selected} />
            </div>
          </div>
          {alternative && (
            <Panel>
              <SectionHead
                title="A prepared alternative"
                meta={
                  recoveryJourney
                    ? "Dynamic recovery suggestion · calculated via routing graph"
                    : "Sample recovery suggestion · not recalculated"
                }
              />
              <JourneyCard
                journey={
                  recoveryJourney ||
                  journeys.find(
                    (j) => j.origin === selected.origin && j.id !== selected.id,
                  ) || journeys[1]
                }
                onSelect={() => {
                  const next =
                    recoveryJourney ||
                    journeys.find(
                      (j) =>
                        j.origin === selected.origin && j.id !== selected.id,
                    ) || journeys[1];
                  setSelected(next);
                  setProgress(0);
                }}
              />
            </Panel>
          )}
        </div>
      </div>
      {remove && (
        <Modal
          title="Remove this saved journey?"
          onClose={() => setRemove(null)}
        >
          <p className="body-copy">
            This removes the example from this device’s journey shelf. You can
            save it again from the planner.
          </p>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setRemove(null)}>
              Keep journey
            </Button>
            <Button
              onClick={() => {
                toggleSave(remove);
                const next = journeys.find(
                  (j) => j.id !== remove && saved.includes(j.id),
                );
                if (next) {
                  setSelected(next);
                  setProgress(0);
                }
                setRemove(null);
              }}
            >
              Remove journey
            </Button>
          </div>
        </Modal>
      )}
      {blocked && (
        <Modal
          title="A connection is blocked"
          onClose={() => setBlocked(false)}
        >
          <p className="body-copy">
            In this demonstration, you can explore a prepared alternative or
            open a report for the selected route. No recovery engine or location
            tracking is connected.
          </p>
          <div className="modal-actions">
            <Go
              to={`/app/community?station=${selected.origin === "Tambaram" ? "tambaram" : "airport"}`}
              className="button secondary"
            >
              Create a demo report
            </Go>
            <Button
              onClick={async () => {
                setAlternative(true);
                setBlocked(false);
                notify("Recovery route calculated");
                const alts = await api.recoverTrip(
                  selected,
                  progress,
                  selected.legs[progress]?.from || selected.origin,
                );
                if (alts && alts.length > 0) {
                  setRecoveryJourney(alts[0]);
                }
              }}
            >
              Show sample alternative <ArrowRight size={16} />
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
