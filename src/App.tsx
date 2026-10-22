import { lazy, Suspense, Component, type ReactNode } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { AppProvider, useApp } from "./lib/state";
import Layout from "./components/Layout";
import { Loading } from "./components/ui";
import Landing from "./pages/Landing";
import Overview from "./pages/Overview";
const Planner = lazy(() => import("./pages/Planner"));
const Access = lazy(() => import("./pages/Access"));
const Trust = lazy(() => import("./pages/Trust"));
const Community = lazy(() => import("./pages/Community"));
const Companion = lazy(() => import("./pages/Companion"));
const Assistant = lazy(() => import("./pages/Assistant"));
const Resilience = lazy(() =>
  import("./pages/Intelligence").then((m) => ({ default: m.Resilience })),
);
const Coverage = lazy(() =>
  import("./pages/Intelligence").then((m) => ({ default: m.Coverage })),
);
const OpenData = lazy(() =>
  import("./pages/Intelligence").then((m) => ({ default: m.OpenData })),
);
const About = lazy(() =>
  import("./pages/Supporting").then((m) => ({ default: m.About })),
);
const Reliability = lazy(() =>
  import("./pages/Supporting").then((m) => ({ default: m.Reliability })),
);
const Limitations = lazy(() =>
  import("./pages/Supporting").then((m) => ({ default: m.Limitations })),
);
const Settings = lazy(() =>
  import("./pages/Supporting").then((m) => ({ default: m.Settings })),
);
const NotFound = lazy(() =>
  import("./pages/Supporting").then((m) => ({ default: m.NotFound })),
);
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="fatal-error">
        <h1>This view couldn’t load.</h1>
        <p>Your saved journeys remain on this device. Reload to try again.</p>
        <button
          className="button primary"
          onClick={() => window.location.reload()}
        >
          Reload workspace
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
function AppRoutes() {
  const { preferences } = useApp();
  return (
    <MotionConfig reducedMotion={preferences.reducedMotion ? "always" : "user"}>
      <div className={preferences.reducedMotion ? "reduce-motion" : ""}>
        <BrowserRouter>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/app" element={<Layout />}>
                <Route index element={<Overview />} />
                <Route path="planner" element={<Planner />} />
                <Route path="access" element={<Access />} />
                <Route path="trust" element={<Trust />} />
                <Route path="community" element={<Community />} />
                <Route path="companion" element={<Companion />} />
                <Route path="resilience" element={<Resilience />} />
                <Route path="coverage" element={<Coverage />} />
                <Route path="open-data" element={<OpenData />} />
                <Route path="assistant" element={<Assistant />} />
                <Route path="saved" element={<Companion savedOnly />} />
                <Route path="settings" element={<Settings />} />
                <Route path="about" element={<About />} />
                <Route path="reliability" element={<Reliability />} />
                <Route path="limitations" element={<Limitations />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </div>
    </MotionConfig>
  );
}
export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <AppRoutes />
      </AppProvider>
    </ErrorBoundary>
  );
}
