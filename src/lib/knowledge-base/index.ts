/**
 * Typed accessors for the device + protocol KB.
 * JSON files are imported at build time so they're version-pinned with the bundle.
 */

import deviceCatalog from "./device_catalog.json";
import protocolRules from "./protocol_rules.json";
import protocolRulesCl300 from "./protocol_rules_cl300.json";
import protocolRulesEl950 from "./protocol_rules_el950.json";
import protocolRulesPs30 from "./protocol_rules_ps30.json";
import skinPhenotypes from "./skin_phenotypes.json";

export const PROTOCOL_RULES_CL300 = protocolRulesCl300 as typeof protocolRulesCl300;
export const PROTOCOL_RULES_EL950 = protocolRulesEl950 as typeof protocolRulesEl950;
export const PROTOCOL_RULES_PS30 = protocolRulesPs30 as typeof protocolRulesPs30;

/**
 * MSC-MATRIX skin phenotype knowledge base.
 * Code format: MSC-[FENOTYP]-[GRADE], np. MSC-SEB-G2.
 * Źródła: System kodowania MSC, oś żelazo–skóra, dysbioza mikrobiomu, paradoks retinoidów.
 */
export const SKIN_PHENOTYPES = skinPhenotypes as typeof skinPhenotypes;

export type SkinPhenotypeId = "SEB" | "XER" | "VAS" | "AGE";
export type SkinGrade = "G1" | "G2" | "G3";

export function getSkinPhenotype(id: SkinPhenotypeId) {
  return SKIN_PHENOTYPES.phenotypes.find((p) => p.id === id);
}

export function getSkinGrade(id: SkinPhenotypeId, grade: SkinGrade) {
  const ph = getSkinPhenotype(id);
  return ph?.grades[grade];
}

export function formatMscCode(id: SkinPhenotypeId, grade: SkinGrade): string {
  return `MSC-${id}-${grade}`;
}

export function getCrossCuttingPhenomenaFor(id: SkinPhenotypeId) {
  return SKIN_PHENOTYPES.cross_cutting_phenomena.filter((p) =>
    (p.affects_phenotypes ?? []).includes(id),
  );
}

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
export const PROTOCOL_RULES = protocolRules as unknown as Omit<typeof protocolRules, "protocols"> & {
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
