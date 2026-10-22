-- TransitTrack One Initial PostgreSQL Schema
-- Migration: 001_initial_schema.sql

-- 1. Users and Authentication
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(100) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'user', -- 'admin', 'moderator', 'contributor', 'user'
    reputation_score INTEGER NOT NULL DEFAULT 10,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 2. Transit Agencies
CREATE TABLE IF NOT EXISTS transit_agencies (
    id VARCHAR(100) PRIMARY KEY,
    agency_id VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    url VARCHAR(500),
    timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
    lang VARCHAR(10) DEFAULT 'en',
    phone VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Data Sources & Feed Versions (M3 Data Trust)
CREATE TABLE IF NOT EXISTS data_sources (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    mode VARCHAR(50) NOT NULL, -- 'Metro', 'Bus', 'Suburban', 'MRTS', 'Walk'
    provider VARCHAR(255) NOT NULL,
    version VARCHAR(100) NOT NULL,
    completeness_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    freshness VARCHAR(100) NOT NULL DEFAULT 'Recent',
    issues_count INTEGER NOT NULL DEFAULT 0,
    license VARCHAR(255) NOT NULL,
    url VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS feed_versions (
    id VARCHAR(100) PRIMARY KEY,
    source_id VARCHAR(100) REFERENCES data_sources(id) ON DELETE CASCADE,
    version VARCHAR(100) NOT NULL,
    checksum VARCHAR(64),
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'running', 'successful', 'failed'
    validation_summary JSONB DEFAULT '{}'::jsonb,
    change_summary JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    error_message TEXT,
    imported_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_feed_versions_source ON feed_versions(source_id);

-- 4. Stops and Stations (M1, M2)
CREATE TABLE IF NOT EXISTS stations (
    id VARCHAR(100) PRIMARY KEY,
    source_id VARCHAR(100) REFERENCES data_sources(id) ON DELETE SET NULL,
    stop_id VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50),
    mode VARCHAR(50) NOT NULL, -- 'Metro', 'Bus', 'Suburban', 'MRTS'
    lat DOUBLE PRECISION NOT NULL,
    lon DOUBLE PRECISION NOT NULL,
    area VARCHAR(255) NOT NULL,
    zone_id VARCHAR(50),
    wheelchair_boarding INTEGER DEFAULT 0, -- 0 = unknown, 1 = accessible, 2 = not accessible
    stairs BOOLEAN DEFAULT true,
    lift_status VARCHAR(20) DEFAULT 'Unknown', -- 'Verified', 'Likely', 'Uncertain', 'Unknown'
    ramp_status VARCHAR(20) DEFAULT 'Unknown', -- 'Verified', 'Likely', 'Uncertain', 'Unknown'
    evidence_band VARCHAR(20) DEFAULT 'Unknown', -- 'Verified', 'Likely', 'Uncertain', 'Unknown'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stations_name ON stations(name);
CREATE INDEX IF NOT EXISTS idx_stations_mode ON stations(mode);
CREATE INDEX IF NOT EXISTS idx_stations_coords ON stations(lat, lon);

-- 5. Station Facilities (M2 Detailed Accessibility)
CREATE TABLE IF NOT EXISTS station_facilities (
    id VARCHAR(100) PRIMARY KEY,
    station_id VARCHAR(100) REFERENCES stations(id) ON DELETE CASCADE,
    facility_type VARCHAR(50) NOT NULL, -- 'lift', 'ramp', 'stairs', 'tactile_paving', 'restroom'
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'operational', -- 'operational', 'broken', 'under_maintenance', 'unknown'
    evidence_band VARCHAR(20) NOT NULL DEFAULT 'Unknown',
    location_details TEXT,
    last_verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_facilities_station ON station_facilities(station_id);

-- 6. Routes and Service Calendars (M1)
CREATE TABLE IF NOT EXISTS routes (
    id VARCHAR(100) PRIMARY KEY,
    source_id VARCHAR(100) REFERENCES data_sources(id) ON DELETE SET NULL,
    route_id VARCHAR(100) NOT NULL,
    short_name VARCHAR(100) NOT NULL,
    long_name VARCHAR(255) NOT NULL,
    mode VARCHAR(50) NOT NULL,
    color VARCHAR(10) DEFAULT '#20a69a',
    text_color VARCHAR(10) DEFAULT '#ffffff',
    description TEXT,
    wheelchair_accessible INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS service_calendars (
    id VARCHAR(100) PRIMARY KEY,
    source_id VARCHAR(100) REFERENCES data_sources(id) ON DELETE CASCADE,
    service_id VARCHAR(100) NOT NULL,
    monday BOOLEAN NOT NULL DEFAULT true,
    tuesday BOOLEAN NOT NULL DEFAULT true,
    wednesday BOOLEAN NOT NULL DEFAULT true,
    thursday BOOLEAN NOT NULL DEFAULT true,
    friday BOOLEAN NOT NULL DEFAULT true,
    saturday BOOLEAN NOT NULL DEFAULT true,
    sunday BOOLEAN NOT NULL DEFAULT true,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS calendar_dates (
    id VARCHAR(100) PRIMARY KEY,
    source_id VARCHAR(100) REFERENCES data_sources(id) ON DELETE CASCADE,
    service_id VARCHAR(100) NOT NULL,
    exception_date DATE NOT NULL,
    exception_type INTEGER NOT NULL -- 1 = added, 2 = removed
);

-- 7. Trips and Stop Times (M1 Timetable-aware Routing)
CREATE TABLE IF NOT EXISTS trips (
    id VARCHAR(100) PRIMARY KEY,
    source_id VARCHAR(100) REFERENCES data_sources(id) ON DELETE CASCADE,
    trip_id VARCHAR(100) NOT NULL,
    route_id VARCHAR(100) REFERENCES routes(id) ON DELETE CASCADE,
    service_id VARCHAR(100) NOT NULL,
    trip_headsign VARCHAR(255),
    direction_id INTEGER DEFAULT 0,
    wheelchair_accessible INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_trips_route ON trips(route_id);
CREATE INDEX IF NOT EXISTS idx_trips_service ON trips(service_id);

CREATE TABLE IF NOT EXISTS stop_times (
    id VARCHAR(100) PRIMARY KEY,
    trip_id VARCHAR(100) REFERENCES trips(id) ON DELETE CASCADE,
    station_id VARCHAR(100) REFERENCES stations(id) ON DELETE CASCADE,
    stop_sequence INTEGER NOT NULL,
    arrival_time VARCHAR(10) NOT NULL,
    departure_time VARCHAR(10) NOT NULL,
    arrival_seconds INTEGER NOT NULL,
    departure_seconds INTEGER NOT NULL,
    pickup_type INTEGER DEFAULT 0,
    drop_off_type INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_stop_times_trip ON stop_times(trip_id);
CREATE INDEX IF NOT EXISTS idx_stop_times_station ON stop_times(station_id);
CREATE INDEX IF NOT EXISTS idx_stop_times_arrival ON stop_times(station_id, arrival_seconds);

-- 8. Pathways and Walking Connections (M1, M2)
CREATE TABLE IF NOT EXISTS pathways (
    id VARCHAR(100) PRIMARY KEY,
    source_id VARCHAR(100) REFERENCES data_sources(id) ON DELETE CASCADE,
    from_station_id VARCHAR(100) REFERENCES stations(id) ON DELETE CASCADE,
    to_station_id VARCHAR(100) REFERENCES stations(id) ON DELETE CASCADE,
    pathway_mode INTEGER NOT NULL, -- 1 = walkway, 2 = stairs, 3 = moving sidewalk, 4 = escalator, 5 = elevator/lift
    is_bidirectional BOOLEAN NOT NULL DEFAULT true,
    traversal_time INTEGER DEFAULT 60, -- seconds
    stair_count INTEGER DEFAULT 0,
    wheelchair_accessible BOOLEAN DEFAULT true,
    signposted_as VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS walking_connections (
    id VARCHAR(100) PRIMARY KEY,
    from_station_id VARCHAR(100) REFERENCES stations(id) ON DELETE CASCADE,
    to_station_id VARCHAR(100) REFERENCES stations(id) ON DELETE CASCADE,
    distance_meters DOUBLE PRECISION NOT NULL,
    walking_minutes INTEGER NOT NULL,
    evidence_band VARCHAR(20) NOT NULL DEFAULT 'Likely',
    is_step_free BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_walking_from ON walking_connections(from_station_id);
CREATE INDEX IF NOT EXISTS idx_walking_to ON walking_connections(to_station_id);

-- 9. Evidence Records (Mobility Evidence Graph)
CREATE TABLE IF NOT EXISTS evidence_records (
    id VARCHAR(100) PRIMARY KEY,
    entity_type VARCHAR(50) NOT NULL, -- 'station', 'facility', 'timetable', 'transfer', 'pathway'
    entity_id VARCHAR(100) NOT NULL,
    field_name VARCHAR(50) NOT NULL,
    source_id VARCHAR(100),
    source_tier VARCHAR(50) NOT NULL, -- 'Tier 1 Official', 'Tier 2 Community Corroborated', 'Tier 3 Uncorroborated'
    evidence_band VARCHAR(20) NOT NULL, -- 'Verified', 'Likely', 'Uncertain', 'Unknown'
    confidence_score DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    details TEXT NOT NULL,
    provenance JSONB DEFAULT '{}'::jsonb,
    history JSONB DEFAULT '[]'::jsonb,
    observed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_evidence_entity ON evidence_records(entity_type, entity_id);

-- 10. Validation Findings (M3 Data Trust)
CREATE TABLE IF NOT EXISTS validation_findings (
    id VARCHAR(100) PRIMARY KEY,
    feed_version_id VARCHAR(100) REFERENCES feed_versions(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL, -- 'calendar', 'departure_time', 'geometry', 'accessibility', 'orphan_stop'
    severity VARCHAR(20) NOT NULL, -- 'critical', 'warning', 'info'
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    rule_code VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    evidence_band VARCHAR(20) NOT NULL DEFAULT 'Uncertain',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_findings_feed ON validation_findings(feed_version_id);

-- 11. Community Reports & Verification (M4)
CREATE TABLE IF NOT EXISTS community_reports (
    id VARCHAR(100) PRIMARY KEY,
    category VARCHAR(100) NOT NULL, -- 'Broken lift', 'Moved bus stop', 'Blocked footpath', etc.
    station_id VARCHAR(100) REFERENCES stations(id) ON DELETE SET NULL,
    station_name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    location_lat DOUBLE PRECISION,
    location_lon DOUBLE PRECISION,
    status VARCHAR(50) NOT NULL DEFAULT 'Pending', -- 'Pending', 'Corroborated', 'Verified', 'Rejected', 'Stale'
    image_url TEXT,
    image_metadata JSONB,
    created_by VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_reports_station ON community_reports(station_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON community_reports(status);

CREATE TABLE IF NOT EXISTS report_confirmations (
    id VARCHAR(100) PRIMARY KEY,
    report_id VARCHAR(100) REFERENCES community_reports(id) ON DELETE CASCADE,
    user_id VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
    user_ip VARCHAR(50),
    confirmation_type VARCHAR(20) NOT NULL DEFAULT 'confirm', -- 'confirm', 'dispute'
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_report_confirmation UNIQUE(report_id, user_id)
);

CREATE TABLE IF NOT EXISTS report_decisions (
    id VARCHAR(100) PRIMARY KEY,
    report_id VARCHAR(100) REFERENCES community_reports(id) ON DELETE CASCADE,
    decided_by VARCHAR(255),
    decision VARCHAR(50) NOT NULL, -- 'Verified', 'Rejected', 'Stale'
    rationale TEXT NOT NULL,
    previous_status VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 12. Saved Trips & Recoveries (M5)
CREATE TABLE IF NOT EXISTS saved_trips (
    id VARCHAR(100) PRIMARY KEY,
    user_id VARCHAR(100) REFERENCES users(id) ON DELETE CASCADE,
    session_id VARCHAR(100),
    journey_data JSONB NOT NULL,
    label VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_saved_trips_user ON saved_trips(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_trips_session ON saved_trips(session_id);

CREATE TABLE IF NOT EXISTS trip_recoveries (
    id VARCHAR(100) PRIMARY KEY,
    trip_id VARCHAR(100) REFERENCES saved_trips(id) ON DELETE CASCADE,
    leg_index INTEGER NOT NULL,
    blocked_station_id VARCHAR(100) REFERENCES stations(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    recovery_journey JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 13. Resilience Scenarios (M6)
CREATE TABLE IF NOT EXISTS resilience_scenarios (
    id VARCHAR(100) PRIMARY KEY,
    scenario_key VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    kind VARCHAR(50) NOT NULL, -- 'Station', 'Transfer', 'Network edge'
    target_element_id VARCHAR(100) NOT NULL,
    baseline_nodes INTEGER NOT NULL DEFAULT 10,
    disrupted_nodes INTEGER NOT NULL DEFAULT 7,
    delay_minutes INTEGER NOT NULL DEFAULT 18,
    description TEXT NOT NULL,
    metrics JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 14. Coverage & Feeder Gaps (M7)
CREATE TABLE IF NOT EXISTS coverage_results (
    id VARCHAR(100) PRIMARY KEY,
    station_id VARCHAR(100) REFERENCES stations(id) ON DELETE CASCADE,
    station_name VARCHAR(255) NOT NULL,
    walking_threshold INTEGER NOT NULL DEFAULT 10,
    gap_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    walking_minutes INTEGER NOT NULL DEFAULT 10,
    accessibility_score DOUBLE PRECISION NOT NULL DEFAULT 50.0,
    poi_data JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 15. Open Data Bridge Export Jobs (M8)
CREATE TABLE IF NOT EXISTS export_jobs (
    id VARCHAR(100) PRIMARY KEY,
    export_type VARCHAR(50) NOT NULL, -- 'gtfs_correction', 'json_summary', 'csv_summary', 'osm_draft', 'issue_draft'
    status VARCHAR(50) NOT NULL DEFAULT 'generated', -- 'generated', 'downloaded', 'submitted', 'accepted'
    format VARCHAR(20) NOT NULL DEFAULT 'json',
    eligible_reports_count INTEGER NOT NULL DEFAULT 0,
    payload JSONB NOT NULL,
    file_content TEXT NOT NULL,
    created_by VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 16. Assistant Interaction Audit (M9)
CREATE TABLE IF NOT EXISTS assistant_interactions (
    id VARCHAR(100) PRIMARY KEY,
    session_id VARCHAR(100),
    language VARCHAR(10) NOT NULL DEFAULT 'en',
    prompt TEXT NOT NULL,
    response_text TEXT NOT NULL,
    action_to VARCHAR(500),
    action_label VARCHAR(255),
    tools_called JSONB DEFAULT '[]'::jsonb,
    is_fallback BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
