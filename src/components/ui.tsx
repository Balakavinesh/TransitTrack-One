import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
import {
  ArrowRight,
  TrainFront,
  Bus,
  Footprints,
  TramFront,
  ShieldCheck,
  CircleHelp,
  AlertTriangle,
  Check,
  X,
  Search,
  MapPin,
  LoaderCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
import { stations, evidenceHelp, type Evidence, type Mode } from "../data/demo";
export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) {
  return (
    <button className={`button ${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}
export function Go({
  to,
  children,
  className = "button primary",
}: {
  to: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link to={to} className={className}>
      {children}
    </Link>
  );
}
export function ModeIcon({ mode, size = 17 }: { mode: Mode; size?: number }) {
  const Icon =
    mode === "Walk"
      ? Footprints
      : mode === "Bus"
        ? Bus
        : mode === "MRTS"
          ? TramFront
          : TrainFront;
  return <Icon size={size} aria-hidden="true" />;
}
export function EvidenceBadge({ status }: { status: Evidence }) {
  const [open, setOpen] = useState(false);
  const Icon =
    status === "Verified"
      ? ShieldCheck
      : status === "Likely"
        ? Check
        : status === "Uncertain"
          ? AlertTriangle
          : CircleHelp;
  return (
    <span className="evidence-wrap">
      <button
        type="button"
        className={`evidence ${status.toLowerCase()}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(!open);
        }}
        aria-expanded={open}
      >
        <Icon size={12} />
        {status}
      </button>
      {open && (
        <span role="note" className="evidence-note">
          {evidenceHelp[status]}
        </span>
      )}
    </span>
  );
}
export function Status({ value }: { value: string }) {
  return <span className={`status ${value.toLowerCase()}`}>{value}</span>;
}
export function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`panel ${className}`}>{children}</section>;
}
export function SectionHead({
  title,
  meta,
  action,
}: {
  title: string;
  meta?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-head">
      <div>
        <h2>{title}</h2>
        {meta && <p>{meta}</p>}
      </div>
      {action}
    </div>
  );
}
export function Empty({
  title = "No matching examples",
  description = "Try a different search or reset your filters.",
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <Search size={30} />
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Loading() {
  return (
    <div className="empty" role="status">
      <LoaderCircle className="spin" />
      <p>Finding demonstration journeys…</p>
    </div>
  );
}
export function Autocomplete({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const options = stations.filter((s) =>
    s.name.toLowerCase().includes(value.toLowerCase()),
  );
  const id = label.toLowerCase().replaceAll(" ", "-");
  return (
    <div className="autocomplete">
      <label htmlFor={id}>{label}</label>
      <div className="input-icon">
        <MapPin size={16} />
        <input
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-options`}
          aria-activedescendant={
            open && options[active] ? `${id}-${active}` : undefined
          }
          autoComplete="off"
          placeholder="Search Chennai stations"
          value={value}
          onFocus={() => {
            setOpen(true);
            setActive(0);
          }}
          onBlur={() => setOpen(false)}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((i) => Math.min(i + 1, options.length - 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            }
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter" && open && options[active]) {
              e.preventDefault();
              onChange(options[active].name);
              setOpen(false);
            }
          }}
        />
      </div>
      {open && (
        <div className="suggestions" role="listbox" id={`${id}-options`}>
          {options.length ? (
            options.map((s, i) => (
              <button
                type="button"
                key={s.id}
                id={`${id}-${i}`}
                role="option"
                aria-selected={active === i}
                className={active === i ? "active" : ""}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(s.name);
                  setOpen(false);
                }}
              >
                <MapPin size={15} />
                <span>
                  {s.name}
                  <small>
                    {s.area} · {s.mode}
                  </small>
                </span>
              </button>
            ))
          ) : (
            <p>No demo station found</p>
          )}
        </div>
      )}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => previous?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="section-head">
        <h2>{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function DemoNote({
  children = "Illustrative data, thoughtfully connected. No live services are connected.",
}: {
  children?: ReactNode;
}) {
  return (
    <div className="demo-note">
      <CircleHelp size={15} />
      <span>{children}</span>
    </div>
  );
}
export function TextLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <Link className="text-link" to={to}>
      {children}
      <ArrowRight size={15} />
    </Link>
  );
}
