import { describe, expect, it } from "vitest";
import { nomDevise, optionsDevises, symboleDevise, toutesDevises } from "./devises";

describe("toutes les devises", () => {
  it("liste complète, noms et symboles fournis par le navigateur", () => {
    expect(toutesDevises().length).toBeGreaterThan(100);
    expect(toutesDevises()).toEqual(expect.arrayContaining(["EUR", "XOF", "XAF", "GBP", "MAD", "JPY"]));
    expect(nomDevise("GBP")).toMatch(/livre|pound/i);
    expect(symboleDevise("XAF")).toBe("F CFA");
    expect(symboleDevise("EUR")).toBe("€");
  });
  it("vos devises d'abord (l'euro et celles de vos comptes), puis toutes les autres", () => {
    const o = optionsDevises(["XOF", "EUR", "MAD"]);
    expect(o.slice(0, 3).map((x) => x.v)).toEqual(["EUR", "XOF", "MAD"]);
    expect(o.filter((x) => x.v === "EUR").length).toBe(1);
    expect(o.length).toBe(toutesDevises().length);
  });
});
