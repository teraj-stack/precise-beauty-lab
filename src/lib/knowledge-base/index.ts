/**
 * Typed accessors for the device + protocol KB.
 * JSON files are imported at build time so they're version-pinned with the bundle.
 */

import deviceCatalog from "./device_catalog.json";
import protocolRules from "./protocol_rules.json";

export interface ProtocolParams {
  power_w: number;
  pulse_width_ms: number;
  energy_mj: number;
  distance_mm: number;
}

export interface Protocol {
  id: string;
  indication: string;
  wavelength_nm: number | number[];
  mode: string | string[];
  applicator?: string;
  params_skin_iii: ProtocolParams;
  params_dark_sensitive_vascular: ProtocolParams;
  post_treatment: string;
  interval_days?: number;
  interval_days_range?: [number, number];
  sessions: string;
  severity_rule?: string;
  alternative?: string;
  adjuvant?: string;
  operator_role_required?: string;
}

export const DEVICE_CATALOG = deviceCatalog as typeof deviceCatalog;
export const PROTOCOL_RULES = protocolRules as typeof protocolRules & {
  protocols: Protocol[];
};

export function getDevice(id: string) {
  return DEVICE_CATALOG.devices.find((d) => d.id === id);
}

export function getProtocol(id: string): Protocol | undefined {
  return PROTOCOL_RULES.protocols.find((p) => p.id === id);
}

export function getProtocolsByIndication(key: string): Protocol[] {
  const idx = PROTOCOL_RULES.indication_to_protocol_index as Record<string, string[]>;
  const ids = idx[key] ?? [];
  return ids.map((id) => getProtocol(id)).filter((p): p is Protocol => Boolean(p));
}

export function formatWavelength(w: number | number[]): string {
  return Array.isArray(w) ? w.map((x) => `${x} nm`).join(" + ") : `${w} nm`;
}

export function formatInterval(p: Protocol): string {
  if (p.interval_days != null) return `co ${p.interval_days} dni`;
  if (p.interval_days_range) return `co ${p.interval_days_range[0]}–${p.interval_days_range[1]} dni`;
  return "—";
}
