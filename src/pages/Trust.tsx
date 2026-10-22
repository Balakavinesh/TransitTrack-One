import { useState, useEffect } from "react";
import { useReducedMotion } from "framer-motion";
import { useApp } from "../lib/state";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  Database,
  ShieldCheck,
  FileWarning,
  Layers,
  ChevronDown,
  ArrowUpDown,
  Clock3,
} from "lucide-react";
import {
  PageTitle,
  Panel,
  SectionHead,
  EvidenceBadge,
  DemoNote,
  Modal,
} from "../components/ui";
import { sources, evidenceDistribution } from "../data/demo";
import { api } from "../lib/api";

export default function Trust() {
  const { preferences } = useApp();
  const systemReduced = useReducedMotion();
  const reduced = systemReduced || preferences.reducedMotion;
  const [filter, setFilter] = useState("All modes");
  const [version, setVersion] = useState("v2026.10-demo");
  const [ascending, setAscending] = useState(false);
  const [detail, setDetail] = useState<(typeof sources)[number] | null>(null);
  const [issue, setIssue] = useState("Missing accessibility fields");
  const [sourceList, setSourceList] = useState(sources);
  const [summaryData, setSummaryData] = useState<any>(null);

  useEffect(() => {
    let mounted = true;
    api.getTrustSummary(version).then((data) => {
      if (mounted && data) {
        setSummaryData(data);
        if (data.sources) {
          setSourceList(data.sources);
        }
      }
    });
    return () => {
      mounted = false;
    };
  }, [version]);

  const visible = sourceList
    .filter((s) => filter === "All modes" || s.mode === filter)
    .sort((a, b) =>
      ascending
        ? a.completeness - b.completeness
        : b.completeness - a.completeness,
    );
  const old = version === "v2026.09-demo";
  const chartSources = visible.map((s) => ({
    ...s,
    completeness: Math.max(0, s.completeness - (old ? 8 : 0)),
  }));
  return (
    <>
      <PageTitle
        eyebrow="DATA TRUST CENTRE"
        title="Confidence has a source."
        description="Look behind the journey. Explore the quality, provenance, and gaps in our sample data."
        action={
          <label className="inline-label">
            Feed version
            <select
              value={version}
              onChange={(e) => setVersion(e.target.value)}
            >
              <option>v2026.10-demo</option>
              <option>v2026.09-demo</option>
            </select>
          </label>
        }
      />
      <div className="metrics-grid">
        {[
          {
            label: "Sample data sources",
            value: summaryData?.metrics?.totalSources
              ? String(summaryData.metrics.totalSources).padStart(2, "0")
              : "04",
            sub: "Four modes, one perspective",
            icon: Database,
          },
          {
            label: "Sample completeness",
            value: summaryData?.metrics?.completeness || (old ? "70%" : "78%"),
            sub: "Across fixture records",
            icon: Layers,
          },
          {
            label: "Consistent evidence",
            value:
              summaryData?.metrics?.consistentEvidence ||
              (old ? "54%" : "62%"),
            sub: "Illustrative evidence coverage",
            icon: ShieldCheck,
          },
          {
            label: "Validation findings",
            value:
              summaryData?.metrics?.validationFindings !== undefined
                ? String(summaryData.metrics.validationFindings)
                : old
                  ? "34"
                  : "28",
            sub: "Sample issues to investigate",
            icon: FileWarning,
          },
        ].map((m) => (
          <Panel key={m.label} className="metric-card">
            <span>
              {m.label}
              <m.icon size={17} />
            </span>
            <strong>{m.value}</strong>
            <p>{m.sub}</p>
          </Panel>
        ))}
      </div>
      <div className="trust-charts">
        <Panel>
          <SectionHead
            title="Evidence, by confidence"
            meta={`Demonstration distribution · ${version}`}
          />
          <div className="donut-layout">
            <div className="donut-chart">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    isAnimationActive={!reduced}
                    data={evidenceDistribution.map((d, i) => ({
                      ...d,
                      value: old ? d.value + [-8, 3, 3, 2][i] : d.value,
                    }))}
                    innerRadius={68}
                    outerRadius={92}
                    dataKey="value"
                    strokeWidth={4}
                  >
                    {evidenceDistribution.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => `${v}% of sample records`} />
                </PieChart>
              </ResponsiveContainer>
              <div className="donut-label">
                <strong>{old ? 54 : 62}%</strong>
                <span>verified sample</span>
              </div>
            </div>
            <div className="chart-legend">
              {evidenceDistribution.map((d) => (
                <span key={d.name}>
                  <i style={{ background: d.color }} />
                  {d.name}
                  <b>
                    {old
                      ? d.value + [-8, 3, 3, 2][evidenceDistribution.indexOf(d)]
                      : d.value}
                    %
                  </b>
                </span>
              ))}
            </div>
          </div>
        </Panel>
        <Panel>
          <SectionHead
            title="Completeness across modes"
            meta="Demonstration records with required fields (%)"
          />
          <ResponsiveContainer width="100%" height={245}>
            <BarChart
              data={chartSources}
              margin={{ left: -20, right: 10, top: 12, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#e8edf1"
              />
              <XAxis
                dataKey="mode"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "#657487" }}
              />
              <YAxis
                domain={[0, 100]}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "#657487" }}
              />
              <Tooltip />
              <Bar
                isAnimationActive={!reduced}
                dataKey="completeness"
                name="Complete sample records (%)"
                fill="#20a69a"
                radius={[5, 5, 0, 0]}
                barSize={40}
              />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>
      <Panel>
        <SectionHead
          title="Source catalogue"
          meta="Versioned demonstration metadata, not an active import pipeline"
          action={
            <label>
              <span className="sr-only">Filter data sources</span>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                {["All modes", "Metro", "Bus", "Suburban", "MRTS"].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
          }
        />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Source / sample feed</th>
                <th>Import metadata</th>
                <th>
                  <button
                    className="table-sort"
                    onClick={() => setAscending(!ascending)}
                  >
                    Completeness <ArrowUpDown size={13} />
                  </button>
                </th>
                <th>Freshness</th>
                <th>Findings</th>
              </tr>
            </thead>
            <tbody>
              {chartSources.map((s) => (
                <tr key={s.name}>
                  <td>
                    <button
                      className="source-name"
                      onClick={() => setDetail(s)}
                    >
                      <Database size={16} />
                      {s.name}
                    </button>
                    <small>{version}</small>
                  </td>
                  <td>
                    Demo import
                    <small>
                      {old ? "2026-09-15" : "2026-10-15"} · fixture snapshot
                    </small>
                  </td>
                  <td>
                    <div className="table-progress">
                      <i style={{ width: `${s.completeness}%` }} />
                    </div>
                    <span>{s.completeness}%</span>
                  </td>
                  <td>
                    <span
                      className={`freshness ${s.freshness === "Recent sample" ? "good" : ""}`}
                    >
                      {s.freshness}
                    </span>
                  </td>
                  <td>{s.issues + (old ? 2 : 0)} sample issues</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="two-columns trust-bottom">
        <Panel>
          <SectionHead
            title="What needs attention"
            meta="Sample validation findings"
          />
          {[
            {
              name: "Missing accessibility fields",
              count: 12,
              text: "Lift status is absent in 12 sample entrance records. Missing information is classified as Unknown, not accessible.",
            },
            {
              name: "Conflicting stop coordinates",
              count: 9,
              text: "Nine sample stop coordinates differ between source versions. Candidate corrections need independent review.",
            },
            {
              name: "Incomplete service calendars",
              count: 7,
              text: "Seven sample schedules are missing a complete calendar. Journey times remain illustrative.",
            },
          ].map((i) => (
            <div className="issue" key={i.name}>
              <button
                onClick={() => setIssue(issue === i.name ? "" : i.name)}
                aria-expanded={issue === i.name}
              >
                <FileWarning size={16} />
                {i.name}
                <b>{i.count}</b>
                <ChevronDown size={16} />
              </button>
              {issue === i.name && <p>{i.text}</p>}
            </div>
          ))}
        </Panel>
        <Panel>
          <SectionHead
            title="A record of change"
            meta="Demonstration history"
          />
          <div className="change-timeline">
            <div>
              <Clock3 size={15} />
              <span>
                <strong>15 Oct · Sample version prepared</strong>
                <small>
                  Fixture records reviewed for the interface demonstration.
                </small>
              </span>
            </div>
            <div>
              <Clock3 size={15} />
              <span>
                <strong>08 Oct · Accessibility gaps identified</strong>
                <small>
                  Unknown fields made explicit across station examples.
                </small>
              </span>
            </div>
            <div>
              <Clock3 size={15} />
              <span>
                <strong>15 Sep · Baseline sample assembled</strong>
                <small>Four sample mode catalogues added.</small>
              </span>
            </div>
          </div>
          <DemoNote>
            Real source licensing and pipeline validation will be reviewed
            during backend integration.
          </DemoNote>
        </Panel>
      </div>
      {detail && (
        <Modal title="Source provenance" onClose={() => setDetail(null)}>
          <h3>{detail.name}</h3>
          <p className="body-copy">
            This local fixture is designed to demonstrate feed versioning,
            completeness, and provenance. It is not downloaded from a production
            transit feed.
          </p>
          <dl className="detail-list">
            <dt>Version</dt>
            <dd>{version}</dd>
            <dt>Licence</dt>
            <dd>{detail.license}</dd>
            <dt>Accessibility coverage</dt>
            <dd>Sample fields only; not a facility survey.</dd>
          </dl>
          <EvidenceBadge status="Uncertain" />
        </Modal>
      )}
    </>
  );
}
