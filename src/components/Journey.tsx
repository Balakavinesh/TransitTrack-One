import { Bookmark, ArrowRight, Clock3, ArrowLeftRight } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useApp } from "../lib/state";
import type { Journey } from "../data/demo";
import { Button, EvidenceBadge, ModeIcon } from "./ui";
export function Timeline({ journey }: { journey: Journey }) {
  const { preferences } = useApp();
  const reduced = useReducedMotion() || preferences.reducedMotion;
  return (
    <ol className="timeline">
      {journey.legs.map((l, i) => (
        <motion.li
          key={`${journey.id}-${i}`}
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * 0.04 }}
          className={l.mode === "Walk" ? "walk-leg" : ""}
        >
          <span className={`timeline-icon mode-${l.mode.toLowerCase()}`}>
            <ModeIcon mode={l.mode} />
          </span>
          <div>
            <div className="timeline-head">
              <strong>{l.from}</strong>
              <span>{l.minutes} min</span>
            </div>
            <p>
              {l.mode === "Walk" ? "Walk" : l.mode} · {l.line}
            </p>
            <div className="timeline-end">
              <span>to {l.to}</span>
              <EvidenceBadge status={l.evidence} />
            </div>
          </div>
        </motion.li>
      ))}
    </ol>
  );
}
export function JourneyCard({
  journey,
  selected = false,
  onSelect,
  schedule,
}: {
  journey: Journey;
  selected?: boolean;
  onSelect: () => void;
  schedule?: { time: string; timing: string };
}) {
  const { saved, toggleSave } = useApp();
  const [hour, minute] = (schedule?.time || "09:00").split(":").map(Number);
  const chosen = hour * 60 + minute;
  const depart =
    schedule?.timing === "Arrive by" ? chosen - journey.minutes : chosen;
  const displayTime = (minutes: number) => {
    const normalized = ((minutes % 1440) + 1440) % 1440;
    return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
  };
  return (
    <article className={`journey-card ${selected ? "selected" : ""}`}>
      <div className="journey-card-top">
        <span className="route-tag">{journey.tag}</span>
        <button
          className={`icon-button ${saved.includes(journey.id) ? "saved" : ""}`}
          aria-label={
            saved.includes(journey.id) ? "Remove saved journey" : "Save journey"
          }
          onClick={() => toggleSave(journey.id)}
        >
          <Bookmark
            size={18}
            fill={saved.includes(journey.id) ? "currentColor" : "none"}
          />
        </button>
      </div>
      <button
        className="journey-select"
        onClick={onSelect}
        aria-pressed={selected}
      >
        <div className="journey-summary">
          <strong>
            {journey.minutes}
            <small>min</small>
          </strong>
          <span>
            {displayTime(depart)} <ArrowRight size={13} />{" "}
            {displayTime(depart + journey.minutes)}
            <small>Illustrative departure</small>
          </span>
          <b>
            ₹{journey.fare}
            <small>sample fare</small>
          </b>
        </div>
        <div className="mode-sequence">
          {journey.legs.map((l, i) => (
            <span key={i}>
              <span className={`mode-chip mode-${l.mode.toLowerCase()}`}>
                <ModeIcon mode={l.mode} />
                {l.mode !== "Walk" && l.mode}
              </span>
              {i < journey.legs.length - 1 && <ArrowRight size={11} />}
            </span>
          ))}
        </div>
        <div className="journey-meta">
          <span>
            <ArrowLeftRight size={13} />
            {journey.transfers} transfers
          </span>
          <span>
            <Clock3 size={13} />
            {journey.walk} min walk
          </span>
          <span className="view-route">
            {selected ? "Route selected" : "View route"}{" "}
            <ArrowRight size={13} />
          </span>
        </div>
      </button>
      <div className="journey-evidence">
        <EvidenceBadge status={journey.evidence} />
        <span>Sample evidence · not a service guarantee</span>
      </div>
    </article>
  );
}
export function SavedButton({ journey }: { journey: Journey }) {
  const { saved, toggleSave } = useApp();
  return (
    <Button variant="secondary" onClick={() => toggleSave(journey.id)}>
      <Bookmark size={16} />
      {saved.includes(journey.id) ? "Remove saved trip" : "Save journey"}
    </Button>
  );
}
