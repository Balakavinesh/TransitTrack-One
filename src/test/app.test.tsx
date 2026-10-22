import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  waitFor,
  within,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { findJourneys, assistantReply } from "../data/demo";
import App from "../App";
vi.mock("../components/TransitMap", () => ({
  default: ({ route }: { route?: { id: string } }) => (
    <div data-testid="map" data-route={route?.id}>
      Interactive Chennai map
    </div>
  ),
}));
const open = (path: string) => {
  window.history.replaceState({}, "", path);
  return render(<App />);
};
beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("fixture boundaries", () => {
  it("matches exact endpoints and honours modes, transfers, and walking limits", () => {
    expect(findJourneys("Chennai Airport", "Chennai Central")).toHaveLength(3);
    expect(
      findJourneys("Tambaram", "Guindy", { modes: ["Suburban"], transfers: 0 }),
    ).toHaveLength(1);
    expect(findJourneys("Tambaram", "Guindy", { walking: 5 })).toHaveLength(1);
    expect(findJourneys("Guindy", "Tambaram")).toEqual([]);
    expect(
      findJourneys("Chennai Airport", "Chennai Central", { modes: [] }),
    ).toEqual([]);
  });
  it("supports Tamil and safe fallback assistant responses", () => {
    expect(
      assistantReply("படிக்கட்டுகள் குறைவாக உள்ள வழியை காட்டு.", "ta").to,
    ).toContain("Tambaram");
    expect(assistantReply("tell me the weather", "en").text).toContain(
      "response catalogue",
    );
  });
});
describe("page coverage", () => {
  it.each([
    ["/", "Move Through"],
    ["/app", "Hello, Chennai."],
    ["/app/planner", "A better way through Chennai."],
    ["/app/access", "Every journey is personal."],
    ["/app/trust", "Confidence has a source."],
    ["/app/community", "The city, seen together."],
    ["/app/companion", "A little clarity at every step."],
    ["/app/resilience", "What happens between the lines?"],
    ["/app/coverage", "Look closer at the last mile."],
    ["/app/open-data", "From observation to a useful correction."],
    ["/app/assistant", "A little help finding your way."],
    ["/app/saved", "Good connections, kept close."],
    ["/app/settings", "Make a little room for you."],
    ["/app/about", "Chennai, connected with context."],
    ["/app/reliability", "Clarity before certainty."],
    ["/app/limitations", "An honest demonstration."],
    ["/missing", "This connection isn’t on the map."],
  ])("loads %s", async (path, heading) => {
    open(path);
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: new RegExp(heading.replace(/[.?]/g, ".")),
      }),
    ).toBeInTheDocument();
  });
});
describe("critical local interactions", () => {
  it("updates illustrative arrival times and exposes evidence by keyboard", async () => {
    const user = userEvent.setup();
    open("/app/planner");
    await screen.findByRole("heading", { name: "3 journey examples" });
    fireEvent.change(screen.getByLabelText("Time", { exact: true }), {
      target: { value: "10:30" },
    });
    await user.selectOptions(
      screen.getByLabelText("Journey time"),
      "Arrive by",
    );
    const first = document.querySelector(".journey-card") as HTMLElement;
    expect(first.querySelector(".journey-summary")).toHaveTextContent(
      /09:42.*10:30/,
    );
    const evidence = within(first).getByRole("button", { name: "Verified" });
    evidence.focus();
    await user.keyboard("{Enter}");
    expect(within(first).getByRole("note")).toHaveTextContent(
      "fixture evidence",
    );
  });
  it("opens global search and navigates a station result with the keyboard", async () => {
    const user = userEvent.setup();
    open("/app");
    await user.click(
      screen.getByRole("button", { name: "Open global search" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Search pages and stations" }),
      "Guindy",
    );
    await user.keyboard("{Enter}");
    expect(
      await screen.findByRole("heading", {
        name: "Every journey is personal.",
      }),
    ).toBeInTheDocument();
    expect(window.location.search).toContain("station=guindy");
  });
  it("navigates from overview to the planner", async () => {
    const user = userEvent.setup();
    open("/app");
    await user.click(screen.getByRole("link", { name: "Journey Planner" }));
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "A better way through Chennai.",
      }),
    ).toBeInTheDocument();
  });
  it("selects routes, filters searches, shows empty state, and resets", async () => {
    const user = userEvent.setup();
    open("/app/planner");
    await screen.findByRole("heading", { name: "3 journey examples" });
    const cards = document.querySelectorAll(".journey-card");
    await user.click(
      within(cards[1] as HTMLElement).getByRole("button", { name: /56/ }),
    );
    expect(screen.getByTestId("map")).toHaveAttribute(
      "data-route",
      "airport-trust",
    );
    const origin = screen.getByRole("combobox", { name: "Origin" });
    await user.clear(origin);
    fireEvent.change(origin, { target: { value: "Tambaram" } });
    await user.keyboard("{Enter}");
    const destination = screen.getByRole("combobox", { name: "Destination" });
    await user.clear(destination);
    fireEvent.change(destination, { target: { value: "Guindy" } });
    await user.keyboard("{Enter}");
    await user.click(
      screen.getByRole("button", { name: "Find sample journeys" }),
    );
    expect(
      await screen.findByRole("heading", { name: "2 journey examples" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Suburban" }));
    await user.click(screen.getByRole("button", { name: "Bus" }));
    await user.click(
      screen.getByRole("button", { name: "Find sample journeys" }),
    );
    expect(
      await screen.findByText("No fixture matches this journey"),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Try Airport → Central" }),
    );
    expect(
      screen.getByRole("heading", { name: "3 journey examples" }),
    ).toBeInTheDocument();
  });
  it("persists saved trips across remounts and supports removal", async () => {
    const user = userEvent.setup();
    open("/app/planner");
    await screen.findByRole("heading", { name: "3 journey examples" });
    await user.click(
      screen.getAllByRole("button", { name: "Save journey" })[0],
    );
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem("tt-saved")!)).toContain(
        "airport-fast",
      ),
    );
    cleanup();
    open("/app/saved");
    expect(
      await screen.findByText("1 saved sample journeys"),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Remove Chennai Airport journey" }),
    );
    await user.click(screen.getByRole("button", { name: "Remove journey" }));
    expect(
      await screen.findByText("No saved journeys yet"),
    ).toBeInTheDocument();
  });
  it("selects an accessibility profile and filters sample lift evidence", async () => {
    const user = userEvent.setup();
    open("/app/access");
    const profile = await screen.findByRole("button", { name: /Low vision/ });
    await user.click(profile);
    expect(profile).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByText("Wayfinding information is incomplete."),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("checkbox", { name: "Sample verified lift" }),
    );
    expect(document.querySelectorAll(".station-card")).toHaveLength(4);
  });
  it("validates and adds a local report, then changes its demo status", async () => {
    const user = userEvent.setup();
    open("/app/community");
    await user.click(
      await screen.findByRole("button", { name: "New demo report" }),
    );
    await user.click(screen.getByRole("button", { name: "Add demo report" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "at least 15 characters",
    );
    await user.type(
      screen.getByLabelText("Description"),
      "A sample lift door is blocked near the entrance.",
    );
    await user.click(screen.getByRole("button", { name: "Add demo report" }));
    expect(document.querySelectorAll(".report-row")).toHaveLength(6);
    const report = screen.getByText(
      "A sample lift door is blocked near the entrance.",
    );
    await user.click(report);
    await user.selectOptions(
      screen.getByLabelText("Demo verification status"),
      "Verified",
    );
    expect(screen.getByText("Current status: Verified")).toBeInTheDocument();
  });
  it("changes a resilience closure and resets the baseline", async () => {
    const user = userEvent.setup();
    open("/app/resilience");
    const toggle = await screen.findByRole("switch", {
      name: "Activate sample closure",
    });
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByText("Closure active: Alandur interchange"),
    ).toBeInTheDocument();
    expect(screen.getByText("+18")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reset scenario" }));
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });
  it("generates an actual download with a demo marker", async () => {
    const user = userEvent.setup();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    open("/app/open-data");
    await user.click(
      await screen.findByRole("button", { name: "Download JSON" }),
    );
    expect(click).toHaveBeenCalledOnce();
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(screen.getByText(/"demonstration": true/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Format"), "CSV");
    expect(
      screen.getByRole("button", { name: "Download CSV" }),
    ).toBeInTheDocument();
  });
  it("accepts an assistant message and opens a relevant sample action", async () => {
    const user = userEvent.setup();
    open("/app/assistant");
    await user.type(
      await screen.findByRole("textbox", { name: "Ask a question" }),
      "Is the lift at Guindy verified?",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));
    expect(
      await screen.findByText(/The Guindy lift has uncertain sample evidence/),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("link", { name: "Explore station evidence" }),
    );
    expect(
      await screen.findByRole("heading", {
        name: "Every journey is personal.",
      }),
    ).toBeInTheDocument();
  });
  it("persists reduced motion and supports the mobile navigation drawer", async () => {
    const user = userEvent.setup();
    open("/app/settings");
    await user.click(
      await screen.findByRole("switch", { name: "Reduced motion" }),
    );
    expect(
      JSON.parse(localStorage.getItem("tt-preferences")!).reducedMotion,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(document.querySelector(".sidebar")).toHaveClass("open");
  });
});
