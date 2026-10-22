# TransitTrack One — Transit Data Limitations & Truthfulness Policy

## 1. Principles of Truthfulness in Public Transit

TransitTrack One strictly follows a policy of **uncompromising truthfulness**:
1. **Never fabricate live tracking:** The platform does not display moving vehicle dots, simulated GPS feeds, or artificial countdown timers that are not backed by certified real-time hardware feeds (GTFS-RT VehiclePositions).
2. **Never assume accessibility:** If a station's GTFS record leaves `wheelchair_boarding` blank or lacks pathway records, it is classified as **`Unknown`**, never "accessible" or "inaccessible".
3. **Weakest-link evidence propagation:** An entire journey's confidence rating is strictly bounded by the least-reliable connection in its chain.

---

## 2. Modal Data Realities in Chennai

### 1. Chennai Metro Rail Limited (CMRL)
- **Data Availability:** Static timetables and station lists are published periodically. Station infrastructure (elevators, escalators, fare gates) is generally consistent.
- **Data Gaps:** Real-time train telemetry (GTFS-RT TripUpdates) is not publicly distributed via an open API. Elevator maintenance outages and temporary entrance gate closures are rarely reflected in official GTFS feeds.
- **Evidence Rating:** Station locations and nominal timetables are rated `Verified` or `Likely`. Elevator operational status requires community verification to be rated `Verified`; otherwise defaults to `Uncertain`.

### 2. Metropolitan Transport Corporation (MTC Buses)
- **Data Availability:** Route catalogues and approximate terminus departure lists exist.
- **Data Gaps:** En-route bus stop arrival times depend heavily on city traffic (Mount Road, GST Road, Anna Salai, OMR). Official static feeds have historically featured placeholder seconds (`00:00:15`) instead of true schedules. Open real-time GPS feeds for the full bus fleet are not universally available.
- **Evidence Rating:** Bus routes are rated `Likely` or `Uncertain`. Exact scheduled departure times are presented as indicative.

### 3. Southern Railway (Chennai Suburban)
- **Data Availability:** Established master timetables (South line to Tambaram/Chengalpattu, West line to Arakkonam, North line to Gummidipoondi).
- **Data Gaps:** Platform assignment feeds and real-time delay feeds are not exposed via open REST/GTFS-RT endpoints. Station entrance pathway geometry and wheelchair ramp slopes are absent from national rail feeds.
- **Evidence Rating:** Schedules are rated `Verified` for nominal operations. Accessibility is classified as `Unknown` or `Uncertain` until confirmed by physical survey.

### 4. Mass Rapid Transit System (MRTS)
- **Data Availability:** Elevated corridor from Chennai Beach to Velachery.
- **Data Gaps:** Stations are undergoing infrastructure upgrades and operational integration with CMRL. Several stations have lifts that are non-operational or restricted.
- **Evidence Rating:** Stations without recent physical survey evidence are tagged `Uncertain` or `Unknown` for step-free travel.

---

## 3. The 4-Band Mobility Evidence Model

Every piece of information presented to the passenger carries one of four evidence bands:

| Evidence Band | Visual Indicator | Criteria | Passenger Meaning |
|:---|:---|:---|:---|
| **`Verified`** | Green badge / ShieldCheck | Direct physical audit, official operator confirmation, or corroborated community report ($\ge 2$ unique verifications) within freshness TTL. | High confidence. You can rely on this facility or connection. |
| **`Likely`** | Teal badge / Check | Official static timetable from active feed version without recent contrary community reports. | Moderate confidence. Regular operation expected, but minor deviations are possible. |
| **`Uncertain`** | Amber badge / AlertTriangle | Stale feed version, unconfirmed single community report, conflicting stop coordinates, or known route disruption. | Caution advised. Have a backup plan or check with station personnel. |
| **`Unknown`** | Gray badge / CircleHelp | Attribute is missing from official data; no physical survey or community observation recorded. | Unverified. Do not assume step-free access or functional amenities exist. |

---

## 4. Freshness and Time-To-Live (TTL)

Different transit attributes degrade at different rates:
- **Station Coordinates:** 1 year TTL.
- **Route Topology:** 6 months TTL.
- **Timetable Schedules:** 30 days TTL (must match calendar validity).
- **Elevator / Lift Operational State:** 48 hours TTL. After 48 hours without re-confirmation, verified status lapses to `Likely` or `Uncertain`.
