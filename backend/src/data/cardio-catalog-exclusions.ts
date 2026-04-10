/**
 * Session-style cardio templates (AMRAP, EMOM, named HIIT blocks, etc.) stay in the JSON
 * for deep links and saved items, but are omitted from browse/search so the catalog reads
 * as machines and familiar modalities first.
 */
const CARDIO_SESSION_TEMPLATE_IDS: readonly string[] = [
  'zone_2_training_session',
  'circuit_training_cardio',
  'hiit_amrap_conditioning',
  'hiit_emom_cardio',
  'hiit_high_intensity_interval_session',
  'hiit_tabata_protocol',
  'hiit_norwegian_4x4_protocol',
  'hiit_sprint_interval_training',
  'hybrid_hyrox_style_training',
];

const EXCLUDED = new Set(CARDIO_SESSION_TEMPLATE_IDS);

export function isExcludedFromExerciseCatalog(id: string): boolean {
  return EXCLUDED.has(id);
}
