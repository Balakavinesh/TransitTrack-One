import { Fragment, useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Polyline,
  Popup,
  useMap,
  Circle,
} from "react-leaflet";
import { LocateFixed, Layers, X } from "lucide-react";
import {
  stations,
  journeys,
  coverage as gapRecords,
  type Journey,
  type Station,
} from "../data/demo";
import "leaflet/dist/leaflet.css";
function View({ route, reset }: { route?: Journey; reset: number }) {
  const map = useMap();
  useEffect(() => {
    const update = () => {
      map.invalidateSize();
      if (route && map.getContainer().clientHeight > 0)
        map.fitBounds(route.points, { padding: [48, 48], animate: false });
      else if (!route) map.setView([13.027, 80.215], 11);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map, route, reset]);
  return null;
}
export default function TransitMap({
  route,
  onStation,
  selected,
  closed,
  coverage = false,
  pois = false,
  accessible = false,
  threshold = 10,
  gaps = false,
  visibleStations,
}: {
  route?: Journey;
  onStation?: (s: Station) => void;
  selected?: string;
  closed?: string;
  coverage?: boolean;
  pois?: boolean;
  accessible?: boolean;
  threshold?: number;
  gaps?: boolean;
  visibleStations?: string[];
}) {
  const [reset, setReset] = useState(0);
  const [failed, setFailed] = useState(false);
  const [base, setBase] = useState(true);
  const [hideRoute, setHideRoute] = useState(false);
  useEffect(() => setHideRoute(false), [route]);
  return (
    <div
      className="transit-map"
      aria-label="Interactive Chennai demonstration transit map"
    >
      <MapContainer
        center={[13.027, 80.215]}
        zoom={11}
        scrollWheelZoom={false}
        zoomControl={true}
        attributionControl={true}
      >
        {base && (
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            eventHandlers={{ tileerror: () => setFailed(true) }}
          />
        )}
        <View route={!hideRoute ? route : undefined} reset={reset} />
        {!route &&
          journeys.slice(0, 2).map((j, i) => (
            <Polyline
              key={j.id}
              positions={j.points}
              pathOptions={{
                color: i ? "#7b99b7" : "#20a69a",
                weight: 4,
                opacity: closed ? 0.25 : 0.6,
                dashArray: i ? "5 7" : undefined,
              }}
            />
          ))}
        {closed && (
          <Polyline
            positions={
              closed === "guindy"
                ? [
                    [13.0097, 80.212],
                    [13.0213, 80.228],
                  ]
                : closed === "central"
                  ? [
                      [13.0827, 80.2707],
                      [13.079, 80.279],
                    ]
                  : [
                      [13.004, 80.2014],
                      [13.0097, 80.212],
                    ]
            }
            pathOptions={{ color: "#d95656", weight: 7, dashArray: "6 7" }}
          >
            <Popup>
              Closed sample{" "}
              {closed === "guindy"
                ? "network edge"
                : closed === "central"
                  ? "transfer"
                  : "station approach"}
              . Illustrative disruption only.
            </Popup>
          </Polyline>
        )}
        {route && !hideRoute && (
          <>
            <Polyline
              positions={route.points}
              pathOptions={{ color: "#fff", weight: 10 }}
            />
            {route.points.slice(0, -1).map((point, index) => {
              const legs = route.legs.filter((l) => l.mode !== "Walk");
              const segment =
                legs[
                  Math.min(
                    legs.length - 1,
                    Math.floor(
                      (index / (route.points.length - 1)) * legs.length,
                    ),
                  )
                ];
              const color =
                segment?.mode === "Bus"
                  ? "#c69a48"
                  : segment?.mode === "Metro"
                    ? "#159d93"
                    : "#758ca6";
              return (
                <Polyline
                  key={`${route.id}-${index}`}
                  positions={[point, route.points[index + 1]]}
                  pathOptions={{
                    color: closed ? "#d99a35" : color,
                    weight: 5,
                    dashArray: closed ? "10 8" : undefined,
                    className: "route-line",
                  }}
                >
                  <Popup>{segment?.mode} · illustrative route geometry</Popup>
                </Polyline>
              );
            })}
            {[route.points[0], route.points[route.points.length - 1]].map(
              (p, i) => (
                <CircleMarker
                  key={i}
                  center={p}
                  radius={9}
                  pathOptions={{
                    color: i ? "#101c2c" : "#20a69a",
                    fillColor: "#fff",
                    fillOpacity: 1,
                    weight: 4,
                  }}
                >
                  <Popup>
                    {i ? route.destination : route.origin} · demo journey
                  </Popup>
                </CircleMarker>
              ),
            )}
          </>
        )}
        {stations
          .filter(
            (s) =>
              (!accessible || s.lift === "Verified") &&
              (!visibleStations || visibleStations.includes(s.name)),
          )
          .map((s) => (
            <Fragment key={s.id}>
              {coverage && (
                <Circle
                  center={s.position}
                  radius={threshold * 65}
                  pathOptions={{
                    color: "#20a69a",
                    fillOpacity: 0.09,
                    weight: 1,
                  }}
                />
              )}
              {gaps && gapRecords.some((g) => g.station === s.name) && (
                <Circle
                  center={s.position}
                  radius={
                    (gapRecords.find((g) => g.station === s.name)?.gap || 5) *
                    65
                  }
                  pathOptions={{
                    color: "#c69a48",
                    fillOpacity: 0.13,
                    weight: 1,
                    dashArray: "4 5",
                  }}
                >
                  <Popup>
                    Illustrative feeder-gap score:{" "}
                    {gapRecords.find((g) => g.station === s.name)?.gap}
                  </Popup>
                </Circle>
              )}
              <CircleMarker
                center={s.position}
                radius={selected === s.id ? 10 : closed === s.id ? 9 : 5}
                pathOptions={{
                  className: `station-marker station-${s.id}`,
                  color:
                    closed === s.id
                      ? "#d95656"
                      : selected === s.id
                        ? "#101c2c"
                        : "#fff",
                  fillColor:
                    closed === s.id
                      ? "#d95656"
                      : s.mode === "Metro"
                        ? "#20a69a"
                        : "#758ca6",
                  fillOpacity: 1,
                  weight: 2,
                }}
                eventHandlers={{
                  click: () => onStation?.(s),
                  add: (event) => {
                    const layer = event.target;
                    const element = layer.getElement();
                    if (element) {
                      element.setAttribute("tabindex", "0");
                      element.setAttribute("role", "button");
                      element.setAttribute(
                        "aria-label",
                        `${s.name} station marker`,
                      );
                      element.onkeydown = (key: KeyboardEvent) => {
                        if (key.key === "Enter" || key.key === " ") {
                          key.preventDefault();
                          layer.fire("click");
                          layer.openPopup();
                        }
                      };
                    }
                  },
                }}
              >
                <Popup>
                  <strong>{s.name}</strong>
                  <br />
                  {s.mode} · {s.evidence} sample evidence
                  <br />
                  <small>Facility information is demonstration only.</small>
                </Popup>
              </CircleMarker>
            </Fragment>
          ))}
        {pois &&
          [
            [13.035, 80.24],
            [13.065, 80.255],
            [13.008, 80.239],
          ].map((p, i) => (
            <CircleMarker
              key={i}
              center={p as [number, number]}
              radius={7}
              pathOptions={{ color: "#d99a35", fillOpacity: 1 }}
            >
              <Popup>
                {
                  [
                    "Sample hospital POI",
                    "Sample college POI",
                    "Sample hospital POI",
                  ][i]
                }{" "}
                · illustrative location
              </Popup>
            </CircleMarker>
          ))}
      </MapContainer>
      <div className="map-title">
        <span className="dot" />
        CHENNAI <span className="muted">/ illustrative network</span>
      </div>
      <div className="map-actions">
        <button
          className="icon-button"
          title="Reset map view"
          aria-label="Reset map view"
          onClick={() => {
            setHideRoute(false);
            setReset((x) => x + 1);
          }}
        >
          <LocateFixed size={18} />
        </button>
        <button
          className="icon-button"
          title="Toggle base map"
          aria-label="Toggle base map"
          aria-pressed={base}
          onClick={() => setBase(!base)}
        >
          <Layers size={18} />
        </button>
        {route && (
          <button
            className="icon-button"
            aria-label="Clear highlighted route"
            onClick={() => setHideRoute(true)}
          >
            <X size={18} />
          </button>
        )}
      </div>
      <div className="map-legend">
        <span>
          <i style={{ background: "#20a69a" }} />
          Metro
        </span>
        <span>
          <i style={{ background: "#758ca6" }} />
          Rail
        </span>
        <span>
          <i style={{ background: "#c69a48" }} />
          Bus
        </span>
        {closed && (
          <span>
            <i style={{ background: "#d95656" }} />
            Closed · demo
          </span>
        )}
        <small>Demonstration routes</small>
      </div>
      {failed && (
        <div className="map-fallback" role="status">
          Some map tiles are unavailable. Demo routes and station markers remain
          interactive.
        </div>
      )}
    </div>
  );
}
