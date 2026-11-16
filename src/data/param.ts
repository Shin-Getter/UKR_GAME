/** Shared parameter conventions for everything under src/data/. */

export type Confidence = "high" | "medium" | "guess";

export interface Param {
  value: number;
  unit: string;
  confidence: Confidence;
  source?: string;
  note?: string;
}

export const guess = (value: number, unit: string, note?: string): Param => ({
  value,
  unit,
  confidence: "guess",
  ...(note ? { note } : {}),
});
