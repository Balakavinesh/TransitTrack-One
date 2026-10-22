import { useEffect, useRef, useState } from "react";
import {
  NavLink,
  Link,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  LayoutDashboard,
  Route,
  Accessibility,
  Compass,
  ShieldCheck,
  MessageSquare,
  GitPullRequestArrow,
  Network,
  ScanLine,
  Sparkles,
  Search,
  Menu,
  PanelLeftClose,
  Settings,
  Bookmark,
  ArrowUpRight,
  Bell,
  X,
  MapPin,
  ArrowRight,
  Globe2,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useApp } from "../lib/state";
import { stations } from "../data/demo";
import { Modal, Empty } from "./ui";
export const navigation = [
  {
    group: "PASSENGER TOOLS",
    items: [
      { to: "/app", label: "Overview", icon: LayoutDashboard },
      { to: "/app/planner", label: "Journey Planner", icon: Route },
      { to: "/app/access", label: "Access & Stations", icon: Accessibility },
      { to: "/app/companion", label: "Trip Companion", icon: Compass },
    ],
  },
  {
    group: "TRUST & COMMUNITY",
    items: [
      { to: "/app/trust", label: "Data Trust Centre", icon: ShieldCheck },
      { to: "/app/community", label: "Community Reports", icon: MessageSquare },
      {
        to: "/app/open-data",
        label: "Open Data Bridge",
        icon: GitPullRequestArrow,
      },
    ],
  },
  {
    group: "NETWORK INTELLIGENCE",
    items: [
      { to: "/app/resilience", label: "Resilience Lab", icon: Network },
      { to: "/app/coverage", label: "Coverage Insights", icon: ScanLine },
    ],
  },
  {
    group: "YOUR COPILOT",
    items: [
      {
        to: "/app/assistant",
        label: "Tamil / English Assistant",
        icon: Sparkles,
      },
    ],
  },
];
export function Brand() {
  return (
    <Link to="/" className="brand" aria-label="TransitTrack One home">
      <span className="brand-mark">
        <Route size={23} />
      </span>
      <span>
        TransitTrack<span className="brand-one"> One</span>
        <small>CHENNAI, CONNECTED.</small>
      </span>
    </Link>
  );
}
function GlobalSearch({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const pages = navigation
    .flatMap((g) => g.items)
    .filter((p) => p.label.toLowerCase().includes(query.toLowerCase()))
    .map((p) => ({ label: p.label, category: "Page", to: p.to }));
  const places = stations
    .filter((s) => s.name.toLowerCase().includes(query.toLowerCase()))
    .map((s) => ({
      label: s.name,
      category: s.mode,
      to: `/app/access?station=${s.id}`,
    }));
  const results = [...pages, ...places].slice(0, 9);
  const select = (to: string) => {
    navigate(to);
    onClose();
  };
  return (
    <Modal title="Find your way" onClose={onClose}>
      <label className="sr-only" htmlFor="global-query">
        Search pages and stations
      </label>
      <input
        autoFocus
        id="global-query"
        className="search-input"
        placeholder="Search stations, journeys, or tools…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, results.length - 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
          }
          if (e.key === "Enter" && results[active]) select(results[active].to);
        }}
      />
      {results.length ? (
        <div className="global-results">
          {results.map((r, i) => (
            <button
              key={r.to}
              className={active === i ? "active" : ""}
              onClick={() => select(r.to)}
            >
              <MapPin size={17} />
              <span>
                {r.label}
                <small>{r.category}</small>
              </span>
              <ArrowRight size={16} />
            </button>
          ))}
        </div>
      ) : (
        <Empty />
      )}
      <small className="muted">
        ↑ ↓ to navigate · Enter to open · Esc to close
      </small>
    </Modal>
  );
}
export default function Layout() {
  const { preferences, setPreferences, saved } = useApp();
  const [search, setSearch] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const [mobile, setMobile] = useState(
    () => window.matchMedia("(max-width: 760px)").matches,
  );
  const [notifications, setNotifications] = useState(false);
  const [read, setRead] = useState(false);
  const location = useLocation();
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const change = () => setMobile(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (!drawer || !mobile) return;
    const previous = document.activeElement as HTMLElement;
    sidebarRef.current?.querySelector<HTMLElement>("a")?.focus();
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
      previous?.focus();
    };
  }, [drawer, mobile]);
  const active =
    navigation.flatMap((g) => g.items).find((i) => i.to === location.pathname)
      ?.label || "Your workspace";
  useEffect(() => {
    setDrawer(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearch((x) => !x);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  return (
    <div className={`workspace ${preferences.compact ? "collapsed" : ""}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {drawer && (
        <button
          aria-label="Close navigation"
          className="drawer-backdrop"
          onClick={() => setDrawer(false)}
        />
      )}
      <aside
        ref={sidebarRef}
        className={`sidebar ${drawer ? "open" : ""}`}
        inert={mobile && !drawer}
        role={mobile && drawer ? "dialog" : undefined}
        aria-modal={mobile && drawer ? true : undefined}
        aria-label={mobile && drawer ? "Navigation" : undefined}
        onKeyDown={(e) => {
          if (e.key === "Escape") setDrawer(false);
          if (e.key === "Tab" && drawer && mobile) {
            const elements = Array.from(
              sidebarRef.current?.querySelectorAll<HTMLElement>("a,button") ||
                [],
            ).filter((el) => el.getClientRects().length > 0);
            const first = elements[0],
              last = elements[elements.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <Brand />
        <button
          className="sidebar-close icon-button"
          aria-label="Close navigation"
          onClick={() => setDrawer(false)}
        >
          <X />
        </button>
        <div className="workspace-label">
          <span className="dot" /> Chennai workspace <span>DEMO</span>
        </div>
        <nav aria-label="Main navigation">
          {navigation.map((group) => (
            <div className="nav-group" key={group.group}>
              <p>{group.group}</p>
              {group.items.map((item) => (
                <NavLink
                  end={item.to === "/app"}
                  to={item.to}
                  title={item.label}
                  key={item.to}
                >
                  <item.icon size={18} />
                  <span>
                    {preferences.language === "ta"
                      ? (
                          {
                            Overview: "கண்ணோட்டம்",
                            "Journey Planner": "பயணத் திட்டம்",
                            "Access & Stations": "நிலையங்கள்",
                          } as Record<string, string>
                        )[item.label] || item.label
                      : item.label}
                  </span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <NavLink to="/app/saved" title="Saved journeys">
            <Bookmark size={18} />
            <span>Saved journeys</span>
            <b>{saved.length}</b>
          </NavLink>
          <NavLink to="/app/settings" title="Settings">
            <Settings size={18} />
            <span>Settings & preferences</span>
          </NavLink>
          <Link to="/app/reliability" className="reliability-card">
            <ShieldCheck size={20} />
            <span>
              Clarity before certainty.<small>Understand our evidence</small>
            </span>
            <ArrowUpRight size={16} />
          </Link>
          <div className="sidebar-footer">
            <Link to="/app/about">About</Link>
            <Link to="/app/limitations">Limitations</Link>
            <button
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              onClick={() =>
                setPreferences((p) => ({ ...p, compact: !p.compact }))
              }
            >
              <PanelLeftClose size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            onClick={() => setDrawer(true)}
          >
            <Menu />
          </button>
          <div className="breadcrumbs">
            Workspace <span>/</span> <strong>{active}</strong>
          </div>
          <div className="topbar-right">
            <button
              className="global-search"
              aria-label="Open global search"
              onClick={() => setSearch(true)}
            >
              <Search size={16} />
              <span>Search anything…</span>
              <kbd>⌘ K</kbd>
            </button>
            <button
              className="language-button"
              onClick={() =>
                setPreferences((p) => ({
                  ...p,
                  language: p.language === "en" ? "ta" : "en",
                }))
              }
              title="Switch navigation language"
            >
              <Globe2 size={16} />
              {preferences.language === "en" ? "EN" : "தமிழ்"}
            </button>
            <div className="notification-wrap">
              <button
                className="icon-button"
                aria-label="Notifications"
                onClick={() => setNotifications(!notifications)}
              >
                <Bell size={18} />
                {!read && <i className="notification-dot" />}
              </button>
              {notifications && (
                <div className="notification-panel">
                  <h3>Demo notifications</h3>
                  <p>
                    {read
                      ? "All caught up."
                      : "A sample Guindy lift report needs review."}
                  </p>
                  <button className="text-link" onClick={() => setRead(true)}>
                    Mark all as read <CheckIcon />
                  </button>
                  <Link
                    to="/app/community"
                    onClick={() => setNotifications(false)}
                  >
                    Open community reports →
                  </Link>
                </div>
              )}
            </div>
            <Link
              className="avatar"
              to="/app/settings"
              aria-label="Open preferences"
            >
              C
            </Link>
          </div>
        </header>
        <main id="main" className="app-content">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{
                opacity: preferences.reducedMotion ? 1 : 0,
                y: preferences.reducedMotion ? 0 : 5,
              }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: preferences.reducedMotion ? 1 : 0 }}
              transition={{ duration: 0.14 }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
          <footer className="app-footer">
            <span>
              <span className="demo-pill">DEMO MODE</span> Built for clarity.
              All journeys and insights are illustrative.
            </span>
            <Link to="/app/reliability">
              Data & reliability <ArrowUpRight size={13} />
            </Link>
          </footer>
        </main>
      </div>
      {search && <GlobalSearch onClose={() => setSearch(false)} />}
    </div>
  );
}
function CheckIcon() {
  return <ShieldCheck size={14} />;
}
