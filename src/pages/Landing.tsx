import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  ArrowLeftRight,
  ShieldCheck,
  Accessibility,
  Network,
  MapPin,
  Check,
  Menu,
  X,
  Route,
  TrainFront,
  Bus,
  TramFront,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Brand } from "../components/Layout";
import { Autocomplete, Button, Go, EvidenceBadge } from "../components/ui";
export default function Landing() {
  const reduced = useReducedMotion();
  const [origin, setOrigin] = useState("Chennai Airport");
  const [destination, setDestination] = useState("Chennai Central");
  const [menu, setMenu] = useState(false);
  const navigate = useNavigate();
  const plan = () =>
    navigate(
      `/app/planner?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`,
    );
  return (
    <div className="landing">
      <header className="landing-nav">
        <Brand />
        <nav className={menu ? "show" : ""}>
          <a href="#platform">The platform</a>
          <a href="#evidence">Why evidence matters</a>
          <Link to="/app/about">About us</Link>
        </nav>
        <Go to="/app" className="button secondary nav-launch">
          Explore workspace <ArrowUpRight size={16} />
        </Go>
        <button
          aria-label="Toggle navigation"
          className="icon-button landing-menu"
          onClick={() => setMenu(!menu)}
        >
          {menu ? <X /> : <Menu />}
        </button>
      </header>
      <section className="hero">
        <img
          className="hero-photo"
          src="/images/chennai-metro.jpg"
          alt="A real Chennai Metro train arriving at Koyambedu station"
          width="2592"
          height="1728"
        />
        <div className="hero-shade" />
        <div className="hero-grid" />
        <motion.div
          className="hero-copy"
          initial={reduced ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="hero-eyebrow">
            <span className="dot" /> ONE CITY. EVERY CONNECTION.
          </div>
          <h1>
            Move Through
            <br />
            Chennai.
            <br />
            <span>
              Know What
              <br />
              You Can Trust.
            </span>
          </h1>
          <p>
            One thoughtful way to connect your journey.
            <br />
            Metro, bus, rail, and the confidence to move.
          </p>
          <a className="hero-explore" href="#platform">
            Discover a better-connected city <ArrowDownIcon />
          </a>
        </motion.div>
        <div className="hero-location">
          <MapPin size={15} />
          <span>
            Koyambedu, Chennai<small>13.0733° N · 80.1948° E</small>
          </span>
        </div>
        <div className="hero-index">
          01 <span>/ THE CITY, WITH CONTEXT</span>
        </div>
      </section>
      <div className="landing-search-wrap">
        <form
          className="landing-search"
          onSubmit={(e) => {
            e.preventDefault();
            plan();
          }}
        >
          <div className="search-heading">
            <span className="mini-icon">
              <Route size={20} />
            </span>
            <div>
              <strong>Where will Chennai take you?</strong>
              <p>Every connection. A little more confidence.</p>
            </div>
            <span className="demo-pill">INTERACTIVE DEMO</span>
          </div>
          <div className="landing-fields">
            <Autocomplete label="From" value={origin} onChange={setOrigin} />
            <button
              type="button"
              className="swap-button"
              aria-label="Swap origin and destination"
              onClick={() => {
                setOrigin(destination);
                setDestination(origin);
              }}
            >
              <ArrowLeftRight size={18} />
            </button>
            <Autocomplete
              label="To"
              value={destination}
              onChange={setDestination}
            />
            <Button type="submit">
              Plan your journey <ArrowRight size={18} />
            </Button>
          </div>
          <div className="search-foot">
            <ShieldCheck size={14} /> Evidence-aware journeys <span>·</span>
            <Accessibility size={14} /> Accessibility in context{" "}
            <span className="search-disclaimer">
              Local demonstration · no live routing
            </span>
          </div>
        </form>
      </div>
      <section className="network-strip">
        <span>
          A city of possibilities.
          <br />
          <strong>One connected perspective.</strong>
        </span>
        <div>
          <TrainFront />
          <span>
            Chennai Metro<small>Across the city</small>
          </span>
        </div>
        <div>
          <Bus />
          <span>
            MTC buses<small>The everyday connections</small>
          </span>
        </div>
        <div>
          <TrainFront />
          <span>
            Suburban rail<small>Beyond the centre</small>
          </span>
        </div>
        <div>
          <TramFront />
          <span>
            MRTS + walking<small>The last mile matters</small>
          </span>
        </div>
      </section>
      <section className="landing-section platform-section" id="platform">
        <div className="editorial-heading">
          <div>
            <span className="eyebrow">A CLEARER WAY FORWARD</span>
            <h2>
              More than a route.
              <br />A fuller picture.
            </h2>
          </div>
          <p>
            The best journey isn’t always the shortest.
            <br />
            Understand the connections, the accessibility,
            <br />
            and the information behind every choice.
          </p>
        </div>
        <div className="platform-grid">
          <Link to="/app/planner" className="feature-big">
            <div className="feature-top">
              <span>01 / JOURNEY COMPOSER</span>
              <ArrowUpRight />
            </div>
            <h3>
              Your city.
              <br />
              Your way through it.
            </h3>
            <p>
              Compare modes, understand transfers, and explore the evidence
              behind each leg.
            </p>
            <div className="mini-route">
              <span>
                <TrainFront size={17} />
                Airport
              </span>
              <i />
              <b>Alandur</b>
              <i />
              <span>
                <TrainFront size={17} />
                Central
              </span>
            </div>
            <div className="feature-bottom">
              <span>Plan with perspective</span>
              <ArrowRight size={19} />
            </div>
          </Link>
          <div className="feature-access">
            <div className="feature-top">
              <Accessibility size={25} />
              <ArrowUpRight size={20} />
            </div>
            <h3>
              <Link to="/app/access">
                Access is personal.
                <br />
                Your plan should be, too.
              </Link>
            </h3>
            <p>
              Explore lifts, walking connections, and what still needs to be
              confirmed.
            </p>
            <div className="access-sample">
              <span>Guindy · Lift at entrance B</span>
              <EvidenceBadge status="Uncertain" />
            </div>
          </div>
          <Link to="/app/community" className="feature-community">
            <div className="feature-top">
              <span>THE HUMAN LAYER</span>
              <ArrowUpRight size={20} />
            </div>
            <h3>
              Better journeys start
              <br />
              with shared knowledge.
            </h3>
            <p>
              Explore community observations and how evidence can be reviewed.
            </p>
            <span className="people">
              <b>AK</b>
              <b>SR</b>
              <b>MV</b>
              <small>Every observation adds context.</small>
            </span>
          </Link>
        </div>
      </section>
      <section className="evidence-section" id="evidence">
        <div className="evidence-editorial">
          <span className="eyebrow">TRANSPARENCY, BY DESIGN</span>
          <h2>
            Knowing what we
            <br />
            don’t know.
            <br />
            <em>That’s progress.</em>
          </h2>
          <p>
            A timetable is only as helpful as its evidence. We make information
            quality visible, so you can make an informed choice.
          </p>
          <Go to="/app/reliability" className="button secondary">
            Meet the evidence bands <ArrowRight size={16} />
          </Go>
        </div>
        <div className="evidence-stack">
          {(["Verified", "Likely", "Uncertain", "Unknown"] as const).map(
            (s, i) => (
              <div key={s} className="evidence-example">
                <span className="evidence-number">0{i + 1}</span>
                <div>
                  <EvidenceBadge status={s} />
                  <p>
                    {
                      [
                        "Consistent sample evidence. Greater confidence.",
                        "A useful signal. More confirmation needed.",
                        "Conflicting or incomplete information.",
                        "A visible gap. Never an assumption.",
                      ][i]
                    }
                  </p>
                </div>
                <Check size={17} />
              </div>
            ),
          )}
          <small>
            Evidence describes information quality. It does not predict
            punctuality.
          </small>
        </div>
      </section>
      <section className="landing-section intelligence-section">
        <div>
          <span className="eyebrow">SEE THE BIGGER PICTURE</span>
          <h2>
            A resilient city
            <br />
            starts with better questions.
          </h2>
          <p>
            What happens when an interchange closes? Where could a feeder
            connection help? Explore illustrative network scenarios and the gaps
            between the lines.
          </p>
          <Go to="/app/resilience" className="button secondary">
            Enter the Resilience Lab <ArrowUpRight size={16} />
          </Go>
        </div>
        <div
          className="network-art"
          aria-label="Illustrative connected network"
        >
          <Network size={180} strokeWidth={0.65} />
          <span className="network-art-label top">
            CHENNAI CENTRAL <i />
          </span>
          <span className="network-art-label bottom">
            <i /> ALANDUR INTERCHANGE
          </span>
          <div className="network-stat">
            <b>What if?</b>
            <span>Explore. Compare. Understand.</span>
          </div>
        </div>
      </section>
      <section className="landing-cta">
        <span className="eyebrow">LET’S CONNECT THE DOTS</span>
        <h2>
          Your next journey.
          <br />A little more considered.
        </h2>
        <Go to="/app" className="button primary">
          Explore TransitTrack One <ArrowRight size={18} />
        </Go>
        <p>
          A frontend demonstration built around real places. No account needed.
        </p>
      </section>
      <footer className="landing-footer">
        <Brand />
        <div>
          <Link to="/app/about">About</Link>
          <Link to="/app/reliability">Data & reliability</Link>
          <Link to="/app/limitations">Limitations</Link>
        </div>
        <p>
          Made for Chennai. Designed for clarity.
          <br />
          <small>
            Photo: KARTY JazZ / Wikimedia Commons ·{" "}
            <a href="https://creativecommons.org/licenses/by-sa/4.0/">
              CC BY-SA 4.0
            </a>{" "}
            · cropped with overlay.
          </small>
        </p>
      </footer>
    </div>
  );
}
function ArrowDownIcon() {
  return <ArrowRight className="arrow-down" size={17} />;
}
