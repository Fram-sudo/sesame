import { describe, expect, it, vi } from "vitest";
vi.mock("@tauri-apps/api/app", () => ({ getVersion: async () => "0.1.0" }));
vi.mock("./etat.svelte", () => ({ app: { params: {} }, sauverParametres: async () => {} }));
import { HISTORIQUE, plusRecente } from "./maj.svelte";

describe("mises à jour", () => {
  it("compare les numéros de version comme des nombres", () => {
    expect(plusRecente("0.1.12", "0.1.9")).toBe(true);
    expect(plusRecente("0.1.9", "0.1.12")).toBe(false);
    expect(plusRecente("0.2.0", "0.1.99")).toBe(true);
    expect(plusRecente("0.1.3", "0.1.3")).toBe(false);
  });
  it("l'historique embarqué a des notes en français et en anglais", () => {
    expect(HISTORIQUE.length).toBeGreaterThan(0);
    for (const h of HISTORIQUE) expect(h.notes.fr.length && h.notes.en.length).toBeTruthy();
  });
});
