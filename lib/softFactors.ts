// Starter list of weighted (soft) preferences shown on the form. Shared by client and server.
export const STARTER_FACTORS = [
  "Furnished",
  "Balcony",
  "Natural light / ventilation",
  "Society amenities (power backup, security)",
  "Quiet locality",
  "Proximity to public transport",
  "Vastu-compliant",
  "Water supply reliability",
] as const;

export const MAX_CUSTOM_FACTORS = 5;
export const MAX_LABEL_LENGTH = 60;

export function normalizeLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ");
}
