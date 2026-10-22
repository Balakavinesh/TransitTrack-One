import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Plus,
  List,
  Map,
  MessageSquare,
  Upload,
  Check,
  AlertTriangle,
  History,
  ShieldCheck,
} from "lucide-react";
import { useApp } from "../lib/state";
import { stations, reportCategories, type Report } from "../data/demo";
import {
  PageTitle,
  Panel,
  Button,
  Status,
  Empty,
  Modal,
  DemoNote,
} from "../components/ui";
import TransitMap from "../components/TransitMap";
import { api } from "../lib/api";

function ReportForm({
  onClose,
  initialStation,
}: {
  onClose: () => void;
  initialStation: string;
}) {
  const { setReports, notify } = useApp();
  const [category, setCategory] = useState("Broken lift");
  const [station, setStation] = useState(initialStation);
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("2026-10-22");
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  return (
    <Modal title="Share an observation" onClose={onClose}>
      <p className="body-copy">
        A clearer picture begins with a specific observation. This report stays
        in the current demo session.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (description.trim().length < 15) {
            setError("Please describe the issue in at least 15 characters.");
            return;
          }
          if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            setError("Choose a valid observation date.");
            return;
          }
          if (
            file &&
            (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024)
          ) {
            setError("Choose an image smaller than 5 MB.");
            return;
          }
          const newReport: Report = {
            id: `TT-DEMO-${Date.now().toString().slice(-6)}`,
            category,
            station,
            description:
              description.trim() +
              (file ? ` [Demo attachment: ${file.name}]` : ""),
            status: "Pending",
            date,
          };
          setReports((list) => [newReport, ...list]);
          notify("Observation recorded — checking community evidence");
          onClose();

          api.createReport({
            category,
            station,
            description: newReport.description,
            date,
          }).then((created) => {
            if (created) {
              setReports((list) => [created, ...list.filter((r) => r.id !== newReport.id)]);
            }
          });
        }}
        noValidate
      >
        <div className="form-grid">
          <label>
            Report category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {reportCategories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Station or location
            <select
              value={station}
              onChange={(e) => setStation(e.target.value)}
            >
              {stations.map((s) => (
                <option key={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Description
          <textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What did you observe? Include the entrance or platform if possible."
            aria-invalid={!!error}
            aria-describedby={error ? "report-error" : undefined}
          />
        </label>
        <label>
          Observation date
          <input
            type="date"
            value={date}
            required
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="file-upload">
          <Upload size={23} />
          <strong>{file ? file.name : "Add an image (optional)"}</strong>
          <span>JPG, PNG, or other image · up to 5 MB · local demo only</span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </label>
        {error && (
          <p className="form-error" id="report-error" role="alert">
            <AlertTriangle size={15} />
            {error}
          </p>
        )}
        <DemoNote>
          Demo Mode — not submitted to a live service. Attachments are not
          uploaded.
        </DemoNote>
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">
            Add demo report <Plus size={16} />
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export default function Community() {
  const { reports, setReports, notify } = useApp();
  const [params] = useSearchParams();
  const initialStation =
    stations.find((s) => s.id === params.get("station"))?.name || "Guindy";
  const [form, setForm] = useState(!!params.get("station"));
  const [view, setView] = useState("List");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All categories");
  const [status, setStatus] = useState("All statuses");
  const [selected, setSelected] = useState<Report | null>(null);

  useEffect(() => {
    let mounted = true;
    api.getReports().then((data) => {
      if (mounted && data && data.length > 0) {
        setReports(data);
      }
    });
    return () => {
      mounted = false;
    };
  }, [setReports]);

  const filtered = reports.filter(
    (r) =>
      (category === "All categories" || r.category === category) &&
      (status === "All statuses" || r.status === status) &&
      `${r.station} ${r.category} ${r.description}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const update = async (value: Report["status"]) => {
    if (!selected) return;
    setReports((list) =>
      list.map((r) => (r.id === selected.id ? { ...r, status: value } : r)),
    );
    setSelected({ ...selected, status: value });

    if (value === "Verified") {
      await api.verifyReport(selected.id, "Verified during community review");
    } else if (value === "Rejected") {
      await api.rejectReport(selected.id, "Rejected during community review");
    } else if (value === "Corroborated") {
      await api.confirmReport(selected.id);
    }

    notify(`Status changed to ${value}. Evidence updated.`);
  };
  return (
    <>
      <PageTitle
        eyebrow="COMMUNITY REPORTS & VERIFICATION"
        title="The city, seen together."
        description="Explore observations, inspect the evidence, and try a local verification workflow."
        action={
          <Button onClick={() => setForm(true)}>
            <Plus size={17} />
            New demo report
          </Button>
        }
      />
      <div className="community-intro">
        <div>
          <MessageSquare size={25} />
          <span>
            <strong>Every detail can help someone move.</strong>
            <small>
              Specific observations. Visible history. Honest uncertainty.
            </small>
          </span>
        </div>
        <div>
          <b>{reports.length}</b>
          <span>sample observations</span>
          <b>{reports.filter((r) => r.status === "Verified").length}</b>
          <span>sample verified</span>
        </div>
      </div>
      <Panel>
        <div className="filter-bar">
          <label className="sr-only" htmlFor="report-search">
            Search reports
          </label>
          <input
            id="report-search"
            placeholder="Search reports or locations…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <label>
            <span className="sr-only">Category filter</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {["All categories", ...reportCategories].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Status filter</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {[
                "All statuses",
                "Pending",
                "Corroborated",
                "Verified",
                "Rejected",
                "Stale",
              ].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <div className="segmented">
            {["List", "Map"].map((v) => (
              <button
                key={v}
                className={view === v ? "active" : ""}
                onClick={() => setView(v)}
              >
                {v === "List" ? <List size={15} /> : <Map size={15} />} {v}
              </button>
            ))}
          </div>
        </div>
        {!filtered.length ? (
          <Empty title="No matching reports" />
        ) : view === "Map" ? (
          <div className="community-map">
            <TransitMap
              onStation={(s) => {
                const report = filtered.find((r) => r.station === s.name);
                if (report) setSelected(report);
                else notify(`No matching sample reports at ${s.name}`);
              }}
            />
          </div>
        ) : (
          <div className="reports-list">
            {filtered.map((r) => (
              <button
                className="report-row"
                key={r.id}
                onClick={() => setSelected(r)}
              >
                <span className={`report-icon ${r.status.toLowerCase()}`}>
                  <AlertTriangle size={19} />
                </span>
                <span className="report-row-main">
                  <strong>{r.category}</strong>
                  <span>{r.station}</span>
                  <small>{r.description}</small>
                </span>
                <span className="report-row-meta">
                  <Status value={r.status} />
                  <small>
                    {r.id} · {r.date}
                  </small>
                </span>
                <span className="report-open">↗</span>
              </button>
            ))}
          </div>
        )}
        <DemoNote>
          These records illustrate a possible review process. Status changes are
          local to this demo session.
        </DemoNote>
      </Panel>
      {form && (
        <ReportForm
          initialStation={initialStation}
          onClose={() => setForm(false)}
        />
      )}{" "}
      {selected && (
        <Modal title="Observation details" onClose={() => setSelected(null)}>
          <div className="section-head">
            <div>
              <span className="eyebrow">
                {selected.id} · {selected.station}
              </span>
              <h3>{selected.category}</h3>
            </div>
            <Status value={selected.status} />
          </div>
          <p className="body-copy">{selected.description}</p>
          <div className="evidence-callout">
            <ShieldCheck size={19} />
            <p>
              <strong>Sample evidence</strong>
              <br />A demonstration description and two illustrative
              corroborations. No independently verified image or operational
              feed is connected.
            </p>
          </div>
          <h3 className="spaced-heading">
            <History size={17} /> Example review history
          </h3>
          <div className="change-timeline">
            <div>
              <Check size={15} />
              <span>
                <strong>Observation recorded</strong>
                <small>{selected.date} · sample submission</small>
              </span>
            </div>
            <div>
              <MessageSquare size={15} />
              <span>
                <strong>Corroboration added</strong>
                <small>Illustrative reviewer · not a real identity</small>
              </span>
            </div>
            <div>
              <ShieldCheck size={15} />
              <span>
                <strong>Current status: {selected.status}</strong>
                <small>Try changing the demonstration state below.</small>
              </span>
            </div>
          </div>
          <label>
            Demo verification status
            <select
              value={selected.status}
              onChange={(e) => update(e.target.value as Report["status"])}
            >
              {["Pending", "Corroborated", "Verified", "Rejected", "Stale"].map(
                (s) => (
                  <option key={s}>{s}</option>
                ),
              )}
            </select>
          </label>
          <DemoNote>
            Changing this status does not verify a real-world condition.
          </DemoNote>
        </Modal>
      )}
    </>
  );
}
