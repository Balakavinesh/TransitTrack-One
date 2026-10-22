import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { initialReports, type Report } from "../data/demo";
export function useLocal<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) || "null") ?? initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* Storage may be disabled by the browser. */
    }
  }, [key, value]);
  return [value, setValue] as const;
}
export interface Preferences {
  language: string;
  profile: string;
  reducedMotion: boolean;
  compact: boolean;
}
function useAppState() {
  const [saved, setSaved] = useLocal<string[]>("tt-saved", []);
  const [preferences, setPreferences] = useLocal<Preferences>(
    "tt-preferences",
    {
      language: "en",
      profile: "Standard",
      reducedMotion: false,
      compact: false,
    },
  );
  const [reports, setReports] = useState<Report[]>(initialReports);
  const [toast, setToast] = useState("");
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  const toggleSave = (id: string) => {
    setSaved((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    setToast(
      saved.includes(id)
        ? "Journey removed from saved trips"
        : "Demo journey saved on this device",
    );
  };
  return {
    saved,
    toggleSave,
    preferences,
    setPreferences,
    reports,
    setReports,
    toast,
    notify: setToast,
  };
}
const AppContext = createContext<ReturnType<typeof useAppState> | null>(null);
export function AppProvider({ children }: { children: ReactNode }) {
  const value = useAppState();
  return (
    <AppContext.Provider value={value}>
      {children}
      <div className={`toast ${value.toast ? "visible" : ""}`} role="status">
        {value.toast}
      </div>
    </AppContext.Provider>
  );
}
export function useApp() {
  const state = useContext(AppContext);
  if (!state) throw new Error("AppProvider is required");
  return state;
}
export function downloadFile(
  name: string,
  content: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
