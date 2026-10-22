export type EvidenceBand = "Verified" | "Likely" | "Uncertain" | "Unknown";
export type Mode = "Metro" | "Bus" | "Suburban" | "MRTS" | "Walk";

export interface StationDto {
  id: string;
  name: string;
  mode: Mode;
  position: [number, number];
  area: string;
  evidence: EvidenceBand;
  lift: EvidenceBand;
  ramp: EvidenceBand;
  stairs: boolean;
  code?: string;
  zoneId?: string;
}

export interface LegDto {
  mode: Mode;
  from: string;
  to: string;
  minutes: number;
  line: string;
  evidence: EvidenceBand;
}

export interface JourneyDto {
  id: string;
  origin: string;
  destination: string;
  minutes: number;
  transfers: number;
  walk: number;
  fare: number;
  evidence: EvidenceBand;
  tag: string;
  legs: LegDto[];
  points: [number, number][];
}

export interface ReportDto {
  id: string;
  category: string;
  station: string;
  description: string;
  status: "Pending" | "Corroborated" | "Verified" | "Rejected" | "Stale";
  date: string;
  location?: [number, number];
  imageUrl?: string;
}

export interface DataSourceDto {
  name: string;
  mode: Mode;
  version: string;
  completeness: number;
  freshness: string;
  issues: number;
  license: string;
}

export interface ResilienceScenarioDto {
  id: string;
  name: string;
  kind: "Station" | "Transfer" | "Network edge";
  baseline: number;
  reachable: number;
  delay: number;
  description: string;
  active?: boolean;
}

export interface CoverageRecordDto {
  station: string;
  gap: number;
  walk: number;
  access: number;
}
