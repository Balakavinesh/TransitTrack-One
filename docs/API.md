# TransitTrack One — REST API Documentation

The TransitTrack One backend exposes a RESTful API under the `/api/v1` namespace. Interactive OpenAPI documentation is accessible at `/api/v1/docs` when the server is running.

## Base URL
- Local development: `http://localhost:3000/api/v1`
- Docker production: `http://localhost:3000/api/v1` (or proxied via Vite/Nginx at `/api/v1`)

---

## 1. System Health & Metadata

### `GET /health`
Returns system status, active database dialect, and uptime.

**Response `200 OK`:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2026-10-23T00:00:00.000Z",
  "database": "connected",
  "dialect": "pglite"
}
```

---

## 2. Authentication (`/auth`)

### `POST /auth/register`
Register a new passenger or contributor account.
- **Request Body:**
  ```json
  {
    "email": "user@chennai.in",
    "password": "SecurePassword123!",
    "name": "Karthik Subramanian",
    "role": "contributor"
  }
  ```
- **Response `201 Created`:**
  ```json
  {
    "token": "eyJhbGciOi...",
    "user": {
      "id": "usr-uuid-1",
      "email": "user@chennai.in",
      "name": "Karthik Subramanian",
      "role": "contributor",
      "reputationScore": 10
    }
  }
  ```

### `POST /auth/login`
Authenticate user with email and password.
- **Request Body:**
  ```json
  {
    "email": "user@chennai.in",
    "password": "SecurePassword123!"
  }
  ```
- **Response `200 OK`:** Token and user profile.

### `GET /auth/me`
Retrieve profile of currently authenticated user.
- **Headers:** `Authorization: Bearer <token>`
- **Response `200 OK`:** User object.

---

## 3. Evidence-Aware Journey Planning (`/journeys`)

### `POST /journeys/plan`
Compute ranked multimodal itineraries using multi-criteria timetable routing.
- **Request Body:**
  ```json
  {
    "origin": "Chennai Airport",
    "destination": "Chennai Central",
    "modes": ["Metro", "Bus", "Suburban", "MRTS"],
    "transfers": 2,
    "walking": 15,
    "profile": "Step-free only",
    "time": "10:30",
    "timing": "Depart after",
    "date": "2026-10-23"
  }
  ```
- **Response `200 OK`:**
  ```json
  {
    "origin": "Chennai Airport",
    "destination": "Chennai Central",
    "profile": "Step-free only",
    "journeys": [
      {
        "id": "airport-fast",
        "origin": "Chennai Airport",
        "destination": "Chennai Central",
        "minutes": 38,
        "transfers": 0,
        "evidence": "Verified",
        "legs": [
          {
            "mode": "Metro",
            "from": "Chennai Airport",
            "to": "Puratchi Thalaivar Dr. M.G. Ramachandran Central Metro",
            "line": "Blue Line (Direct)",
            "minutes": 38,
            "evidence": "Verified",
            "pathway": "Step-free via central concourse lift L2"
          }
        ]
      }
    ]
  }
  ```

### `GET /locations/search?q=:query`
Autocomplete station and stop names.
- **Query Params:** `q=Tamb`
- **Response `200 OK`:**
  ```json
  {
    "locations": [
      { "id": "tambaram", "name": "Tambaram", "mode": "Suburban", "area": "South Chennai" }
    ]
  }
  ```

---

## 4. Station Explorer & Accessibility (`/stations`)

### `GET /stations`
List transit stations with evidence status and accessibility attributes.
- **Query Params:**
  - `mode`: Metro | Bus | Suburban | MRTS
  - `verifiedLift`: boolean
  - `search`: string
- **Response `200 OK`:** List of `Station` objects.

### `GET /stations/:id`
Get detailed station record including entrances, pathways, and facility operational evidence.
- **Response `200 OK`:**
  ```json
  {
    "station": {
      "id": "alandur",
      "name": "Alandur",
      "mode": "Metro",
      "area": "Guindy / Alandur",
      "evidence": "Verified",
      "facilities": [
        { "type": "Elevator", "location": "Concourse to Blue Line Platform", "status": "Operational", "evidence": "Verified" }
      ],
      "pathways": [
        { "from": "Street Entrance A", "to": "Concourse", "stepFree": true, "duration": 2 }
      ]
    }
  }
  ```

---

## 5. Data Trust & Provenance (`/data-sources`, `/feeds`, `/evidence`)

### `GET /data-sources`
List registered transit feeds, completeness scores, licenses, and issue counts.

### `GET /feeds`
List imported feed versions, active version, checksums, and validation status.

### `GET /evidence/summary`
Get evidence band distribution (`Verified`, `Likely`, `Uncertain`, `Unknown`) and quality metrics for dashboard rendering.

---

## 6. Community Reports & Verification (`/reports`)

### `GET /reports`
List community observation reports.
- **Query Params:** `status`, `station`, `category`

### `POST /reports`
Submit a new community observation.
- **Headers:** `Authorization: Bearer <token>` (optional; creates demo report if unauthenticated)
- **Request Body:**
  ```json
  {
    "category": "Broken lift",
    "station": "Guindy",
    "description": "Lift at Entrance C is out of order due to maintenance.",
    "date": "2026-10-23"
  }
  ```

### `POST /reports/:id/confirm`
Corroborate an observation. Prevents duplicate votes per user.

### `POST /reports/:id/verify`
Verify an observation and update the mobility evidence graph.
- **Request Body:** `{ "rationale": "Verified on-site by station supervisor" }`

### `POST /reports/:id/reject`
Reject an invalid or contradictory observation report.

---

## 7. Trip Companion & Disruption Recovery (`/trips`)

### `POST /trips`
Save an itinerary to the user's journey shelf.

### `GET /trips`
List all saved journeys.

### `DELETE /trips/:id`
Delete a saved journey from shelf.

### `POST /trips/recover`
Calculate alternate itineraries when a journey leg is blocked or disrupted.
- **Request Body:**
  ```json
  {
    "journey": { ... },
    "blockedLegIndex": 0,
    "blockedStation": "Alandur"
  }
  ```
- **Response `200 OK`:** List of recalculated alternative `Journey` objects avoiding the blocked station.

---

## 8. Network Resilience Lab (`/resilience`)

### `GET /resilience/scenarios`
List predefined network disruption scenarios (e.g., Alandur interchange closure, MRTS upgrade, Beach corridor closure).

### `POST /resilience/scenarios/:id/run`
Simulate network reachability and journey delays under closure.
- **Request Body:** `{ "isClosed": true }`
- **Response `200 OK`:**
  ```json
  {
    "scenarioId": "alandur",
    "isClosed": true,
    "baselineReachable": 10,
    "disruptedReachable": 6,
    "additionalDelayMinutes": 18
  }
  ```

---

## 9. Coverage & Feeder Gaps (`/coverage`)

### `GET /coverage/feeder-gaps`
Get ranked list of transit stations with feeder gap scores, walk times, and access completeness.
- **Query Params:** `threshold`, `maxGap`, `accessibleOnly`

---

## 10. Open Data Bridge (`/exports`)

### `GET /exports/eligible-corrections`
List verified and corroborated community reports ready for export.

### `POST /exports/generate`
Generate structured export payloads.
- **Request Body:**
  ```json
  {
    "reportId": "TT-1041",
    "format": "JSON",
    "preview": "Structured change"
  }
  ```
- **Response `200 OK`:** Export payload with SHA-256 integrity hash and audit record.

---

## 11. Grounded Bilingual Mobility Assistant (`/assistant`)

### `POST /assistant/chat`
Ask grounded mobility questions in Tamil or English.
- **Request Body:**
  ```json
  {
    "message": "Which route has fewer stairs between Tambaram and Guindy?",
    "language": "en"
  }
  ```
- **Response `200 OK`:**
  ```json
  {
    "text": "For fewer stairs, take the Southern Railway Suburban line from Tambaram to Guindy. Guindy Platform 1 has ramp access to the western exit.",
    "to": "/app/planner?origin=Tambaram&destination=Guindy",
    "label": "Open in planner"
  }
  ```
