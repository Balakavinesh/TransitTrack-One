import { useState, useEffect } from "react";
import { useReducedMotion } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Network,
  RotateCcw,
  ArrowRight,
  AlertTriangle,
  Download,
  Layers,
  MapPin,
  Check,
  GitPullRequestArrow,
  FileJson,
  ShieldCheck,
} from "lucide-react";
import {
  PageTitle,
  Panel,
  Button,
  SectionHead,
  DemoNote,
  Status,
  Empty,
} from "../components/ui";
import TransitMap from "../components/TransitMap";
import { scenarios, coverage, stations, type Report } from "../data/demo";
import { downloadFile, useApp } from "../lib/state";
import { api } from "../lib/api";

export function Resilience() {
  const [scenario, setScenario] = useState(scenarios[0]);
  const [closed, setClosed] = useState(false);
  const [kind, setKind] = useState("Station");
  const [analysisResult, setAnalysisResult] = useState<any>(null);

  useEffect(() => {
    let mounted = true;
    api.runResilienceScenario(scenario.id, closed).then((res) => {
      if (mounted && res) {
        setAnalysisResult(res);
      }
    });
    return () => {
      mounted = false;
    };
  }, [scenario.id, closed]);

  const baselineReachable =
    analysisResult?.baselineReachable ?? scenario.baseline;
  const reachableCount =
    analysisResult?.disruptedReachable ??
    (closed ? scenario.reachable : scenario.baseline);
  const delayMinutes =
    analysisResult?.additionalDelayMinutes ?? (closed ? scenario.delay : 0);
  return (
    <>
      <PageTitle
        eyebrow="NETWORK RESILIENCE LAB"
        title="What happens between the lines?"
        description="Explore a disruption. Compare the possibilities. See a sample network differently."
        action={
          <Button
            variant="secondary"
            onClick={() => {
              setClosed(false);
              setKind("Station");
              setScenario(scenarios[0]);
            }}
          >
            <RotateCcw size={16} />
            Reset scenario
          </Button>
        }
      />
      <div className="analysis-layout">
        <Panel className="scenario-controls">
          <span className="eyebrow">SCENARIO BUILDER</span>
          <h2>
            A small change.
            <br />A wider perspective.
          </h2>
          <p className="body-copy">
            Choose an example connection, then explore a prepared disruption
            scenario.
          </p>
          <label>
            Network element
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setScenario(scenarios.find((s) => s.kind === e.target.value)!);
                setClosed(false);
              }}
            >
              <option>Station</option>
              <option>Transfer</option>
              <option>Network edge</option>
            </select>
          </label>
          <label>
            Sample closure
            <select
              value={scenario.id}
              onChange={(e) => {
                setScenario(scenarios.find((s) => s.id === e.target.value)!);
                setClosed(false);
              }}
            >
              {scenarios
                .filter((s) => s.kind === kind)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </label>
          <div className={`closure-control ${closed ? "active" : ""}`}>
            <span>
              <strong>Close this connection</strong>
              <small>
                {closed ? "Disrupted example active" : "Baseline network"}
              </small>
            </span>
            <button
              className="toggle"
              role="switch"
              aria-label="Activate sample closure"
              aria-checked={closed}
              onClick={() => setClosed(!closed)}
            >
              <i />
            </button>
          </div>
          <div className="scenario-explanation">
            <Network size={23} />
            <p>{scenario.description}</p>
          </div>
          <DemoNote>
            Impact values are prepared fixtures, not graph calculations or
            passenger impacts.
          </DemoNote>
        </Panel>
        <div className="analysis-map">
          <TransitMap
            closed={closed ? scenario.id : undefined}
            selected={scenario.id}
            onStation={(s) => {
              const next = scenarios.find((x) => x.id === s.id);
              if (next) {
                setKind(next.kind);
                setScenario(next);
                setClosed(false);
              }
            }}
          />
          <div className={`scenario-banner ${closed ? "disrupted" : ""}`}>
            <span className="dot" />
            {closed
              ? `Closure active: ${scenario.name}`
              : "Baseline example · all sample connections available"}
          </div>
        </div>
      </div>
      <div className="comparison-grid">
        <Panel>
          <SectionHead
            title="Connectivity comparison"
            meta="Prepared illustrative scenario results"
          />
          <div className="comparison-values">
            <div>
              <span>Baseline</span>
              <strong>
                {baselineReachable}
                <small> / 10</small>
              </strong>
              <p>sample nodes reachable</p>
            </div>
            <ArrowRight />
            <div className={closed ? "amber-text" : ""}>
              <span>{closed ? "Disrupted example" : "Current example"}</span>
              <strong>
                {reachableCount}
                <small> / 10</small>
              </strong>
              <p>sample nodes reachable</p>
            </div>
          </div>
          <div className="comparison-bars">
            <i style={{ width: "100%" }} />
            <i
              style={{
                width: `${closed ? Math.min(100, reachableCount * 10) : 100}%`,
              }}
            />
          </div>
        </Panel>
        <Panel className="impact-panel">
          <div className="mini-icon">
            <AlertTriangle size={21} />
          </div>
          <span className="eyebrow">ILLUSTRATIVE JOURNEY IMPACT</span>
          <strong>
            +{delayMinutes}
            <small> min</small>
          </strong>
          <h3>Airport → Central example</h3>
          <p>
            {closed
              ? "The prepared alternative adds a transfer or a longer connection."
              : "Activate a closure to inspect the prepared alternative."}
          </p>
          <Status value={closed ? "Uncertain" : "Verified"} />
        </Panel>
        <Panel>
          <SectionHead
            title="Scenario notebook"
            meta="Select a prepared example"
          />
          {scenarios.map((s) => (
            <button
              className={`scenario-item ${scenario.id === s.id ? "selected" : ""}`}
              key={s.id}
              onClick={() => {
                setScenario(s);
                setKind(s.kind);
                setClosed(false);
              }}
            >
              <span>
                <strong>{s.name}</strong>
                <small>{s.kind} · illustrative fixture</small>
              </span>
              <ArrowRight size={16} />
            </button>
          ))}
        </Panel>
      </div>
    </>
  );
}
export function Coverage() {
  const [threshold, setThreshold] = useState(10);
  const [layer, setLayer] = useState("Reachability");
  const [pois, setPois] = useState(false);
  const [access, setAccess] = useState(false);
  const [maxGap, setMaxGap] = useState(20);
  const [selected, setSelected] = useState("Thiruvanmiyur");
  const { notify, preferences } = useApp();
  const systemReduced = useReducedMotion();
  const [gapData, setGapData] = useState<any[]>(coverage);

  useEffect(() => {
    let mounted = true;
    api.getFeederGaps(threshold, maxGap, access).then((data) => {
      if (mounted && data && data.length > 0) {
        setGapData(data);
      }
    });
    return () => {
      mounted = false;
    };
  }, [threshold, maxGap, access]);

  const rows = gapData.filter(
    (c) => c.gap <= maxGap && (!access || c.access >= 60),
  );
  const station = stations.find((s) => s.name === selected);
  const values = rows.map((c) => ({
    ...c,
    displayGap:
      c.displayGap !== undefined
        ? c.displayGap
        : Math.max(1, c.gap - (threshold - 10) / 2),
  }));
  return (
    <>
      <PageTitle
        eyebrow="COVERAGE & FEEDER GAP INSIGHTS"
        title="Look closer at the last mile."
        description="Explore sample connections, walking thresholds, and the spaces a feeder could help bridge."
        action={
          <Button
            variant="secondary"
            onClick={() => {
              downloadFile(
                "transittrack-demo-coverage.json",
                JSON.stringify(
                  {
                    demo: true,
                    analysis:
                      "Illustrative fixture, not population accessibility",
                    threshold,
                    layer,
                    results: values,
                  },
                  null,
                  2,
                ),
              );
              notify("Demonstration coverage file downloaded");
            }}
          >
            <Download size={16} />
            Export sample
          </Button>
        }
      />
      <div className="coverage-workspace">
        <div className="coverage-map">
          <TransitMap
            coverage={layer === "Reachability"}
            gaps={layer === "Feeder gaps"}
            visibleStations={rows.map((r) => r.station)}
            pois={pois}
            accessible={access}
            threshold={threshold}
            selected={station?.id}
            onStation={(s) => setSelected(s.name)}
          />
          <div className="coverage-caption">
            <Layers size={16} />
            {layer} · {threshold}-minute illustrative threshold
          </div>
        </div>
        <Panel className="layer-panel">
          <SectionHead title="Map perspective" meta="Demonstration analysis" />
          <div className="layer-options">
            {["Reachability", "Feeder gaps", "Accessibility"].map((l) => (
              <button
                className={layer === l ? "selected" : ""}
                key={l}
                onClick={() => {
                  setLayer(l);
                  setAccess(l === "Accessibility");
                }}
              >
                <Layers size={17} />
                <span>
                  {l}
                  <small>
                    {l === "Reachability"
                      ? "Indicative walking-radius overlay"
                      : l === "Feeder gaps"
                        ? "Ranked sample connection gaps"
                        : "Stations with sample lift evidence"}
                  </small>
                </span>
                {layer === l && <Check size={16} />}
              </button>
            ))}
          </div>
          <label>
            Walking threshold <b>{threshold} min</b>
            <input
              type="range"
              min="5"
              max="20"
              step="5"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
            />
          </label>
          <label>
            Maximum sample gap score <b>{maxGap}</b>
            <input
              type="range"
              min="5"
              max="20"
              value={maxGap}
              onChange={(e) => setMaxGap(Number(e.target.value))}
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={pois}
              onChange={(e) => setPois(e.target.checked)}
            />{" "}
            Sample hospitals & colleges
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={access}
              onChange={(e) => setAccess(e.target.checked)}
            />{" "}
            Verified sample lifts only
          </label>
          <div className="selected-place">
            <MapPin size={18} />
            <div>
              <strong>{selected}</strong>
              <p>
                {station?.mode || "Station"} · {station?.area || "Chennai"}
              </p>
              <small>Exact paths and population data are not connected.</small>
            </div>
          </div>
        </Panel>
      </div>
      <div className="two-columns">
        <Panel>
          <SectionHead
            title="Where a connection could help"
            meta="Ranked fixture results · score is illustrative"
          />
          {values.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Station</th>
                    <th>Gap score</th>
                    <th>Sample walk</th>
                    <th>Access fields</th>
                  </tr>
                </thead>
                <tbody>
                  {values
                    .sort((a, b) => b.displayGap - a.displayGap)
                    .map((c) => (
                      <tr
                        key={c.station}
                        className={selected === c.station ? "selected-row" : ""}
                        onClick={() => setSelected(c.station)}
                      >
                        <td>
                          <button
                            className="table-link"
                            onClick={() => setSelected(c.station)}
                          >
                            {c.station}
                          </button>
                        </td>
                        <td>{c.displayGap.toFixed(0)}</td>
                        <td>{c.walk} min</td>
                        <td>{c.access}% sample</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty />
          )}
        </Panel>
        <Panel>
          <SectionHead
            title="Access-information coverage"
            meta="Demonstration facility fields present (%)"
          />
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={values}
              layout="vertical"
              margin={{ left: 15, right: 15 }}
            >
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="station"
                width={95}
                tick={{ fontSize: 11 }}
              />
              <Tooltip />
              <Bar
                isAnimationActive={!systemReduced && !preferences.reducedMotion}
                dataKey="access"
                name="Sample fields present (%)"
                radius={[0, 4, 4, 0]}
                onClick={(_data, index) => {
                  if (values[index]) setSelected(values[index].station);
                }}
              >
                {values.map((v) => (
                  <Cell
                    key={v.station}
                    fill={selected === v.station ? "#101c2c" : "#20a69a"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>
      <DemoNote>
        Map circles are illustrative proximity overlays, not computed walk
        sheds. Scores describe sample network records, not people or actual
        population accessibility.
      </DemoNote>
    </>
  );
}
export function OpenData() {
  const { reports, notify } = useApp();
  const [selected, setSelected] = useState("TT-1041");
  const [format, setFormat] = useState("JSON");
  const [preview, setPreview] = useState("Structured change");
  const [remoteEligible, setRemoteEligible] = useState<Report[] | null>(null);

  useEffect(() => {
    let mounted = true;
    api.getEligibleCorrections().then((data) => {
      if (mounted && data && data.length > 0) {
        setRemoteEligible(data);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const eligible =
    remoteEligible ||
    reports.filter(
      (r) => r.status === "Verified" || r.status === "Corroborated",
    );
  const report = eligible.find((r) => r.id === selected) || eligible[0];
  const payload = report
    ? {
        demonstration: true,
        submitted: false,
        report_id: report.id,
        location: report.station,
        category: report.category,
        evidence_status: report.status,
        expected:
          "Wayfinding and facility information matches the observed condition",
        observed: report.description,
        proposed_change:
          "Review the source record using independent evidence before applying any correction",
      }
    : null;
  const json = JSON.stringify(payload, null, 2);
  const issue = report
    ? `[DEMO DRAFT] ${report.category} — ${report.station}\n\nExpected: Accurate, confirmed facility information.\nObserved: ${report.description}\n\nEvidence: ${report.status} in local demonstration only.\nThis draft has not been submitted to a repository.`
    : "";
  const osm = report
    ? `OSM correction draft — demonstration only\n\nLocation: ${report.station}\nObservation: ${report.description}\n\nCheck survey evidence and the existing OSM object before proposing any tags. No OSM element ID or tags are fabricated. Nothing has been uploaded.`
    : "";
  const csv = report
    ? Object.keys(payload!).join(",") +
      "\n" +
      Object.values(payload!)
        .map((v) => '"' + String(v).replaceAll('"', '""') + '"')
        .join(",")
    : "";
  const content =
    preview === "Repository issue draft"
      ? issue
      : preview === "OSM correction draft"
        ? osm
        : format === "CSV"
          ? csv
          : json;
  return (
    <>
      <PageTitle
        eyebrow="OPEN DATA BRIDGE"
        title="From observation to a useful correction."
        description="Inspect the evidence. Prepare a structured draft. Keep the review trail intact."
      />
      <div className="export-layout">
        <Panel className="correction-list">
          <SectionHead
            title="Eligible sample corrections"
            meta="Verified or corroborated demo records"
          />
          {eligible.length ? (
            eligible.map((r) => (
              <button
                key={r.id}
                className={`correction-item ${report?.id === r.id ? "selected" : ""}`}
                onClick={() => setSelected(r.id)}
              >
                <GitPullRequestArrow size={20} />
                <span>
                  <strong>{r.category}</strong>
                  <small>
                    {r.station} · {r.id}
                  </small>
                  <Status value={r.status} />
                </span>
              </button>
            ))
          ) : (
            <Empty
              title="No eligible corrections"
              description="Try the local verification workflow in Community Reports."
            />
          )}
          <div className="evidence-callout">
            <ShieldCheck size={19} />
            <p>
              Export eligibility is a demo rule. It does not independently
              establish that a correction is accurate.
            </p>
          </div>
        </Panel>
        <div className="export-main">
          <Panel>
            <SectionHead
              title="Change review"
              meta={
                report
                  ? `${report.station} · sample evidence record`
                  : "Select a correction"
              }
            />
            <div className="before-after">
              <div>
                <span>EXPECTED</span>
                <p>
                  Clear, accurate wayfinding and accessible facility
                  information.
                </p>
              </div>
              <ArrowRight size={20} />
              <div>
                <span>OBSERVED · SAMPLE</span>
                <p>{report?.description || "No correction available."}</p>
              </div>
            </div>
          </Panel>
          <Panel className="code-panel">
            <div className="section-head">
              <div>
                <FileJson size={18} />
                <h2>Export preview</h2>
              </div>
              <label>
                Format
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                >
                  <option>JSON</option>
                  <option>CSV</option>
                </select>
              </label>
            </div>
            <div className="segmented code-tabs">
              {[
                "Structured change",
                "Repository issue draft",
                "OSM correction draft",
              ].map((p) => (
                <button
                  key={p}
                  className={preview === p ? "active" : ""}
                  onClick={() => setPreview(p)}
                >
                  {p}
                </button>
              ))}
            </div>
            <pre tabIndex={0}>
              <code>{content}</code>
            </pre>
            <div className="export-validation">
              <span>
                <Check size={16} />{" "}
                {report
                  ? "Required fields present · demo flag included"
                  : "No eligible records"}
              </span>
              <Button
                disabled={!report}
                onClick={async () => {
                  api.generateExport(report.id, format as any, preview);
                  downloadFile(
                    `transittrack-demo-correction.${preview !== "Structured change" ? "txt" : format === "CSV" ? "csv" : "json"}`,
                    content,
                    preview !== "Structured change"
                      ? "text/plain"
                      : format === "CSV"
                        ? "text/csv"
                        : "application/json",
                  );
                  notify(
                    "Demo export downloaded — nothing submitted externally",
                  );
                }}
              >
                <Download size={16} />
                Download {preview === "Structured change" ? format : "draft"}
              </Button>
            </div>
          </Panel>
          <DemoNote>
            Files are generated locally. No issue, OSM edit, or external
            correction is submitted.
          </DemoNote>
        </div>
      </div>
    </>
  );
}
