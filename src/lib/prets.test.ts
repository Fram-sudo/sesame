import { describe, expect, it } from "vitest";
import { ajouterMois, echeancier, mensualite, resume, simulerAnticipe, type Pret } from "./prets";

const pret: Pret = { id: "p", nom: "Prêt", capital: 1_000_000, taux: 3, duree: 12, premiere: "2026-01-31" };

describe("prêts", () => {
  it("mensualité constante (10 000 € à 3 % sur 12 mois = 846,94 €) et taux nul", () => {
    expect(mensualite(1_000_000, 3, 12)).toBe(84694);
    expect(mensualite(120_000, 0, 12)).toBe(10_000);
  });

  it("échéancier : tout le capital remboursé, dernier mois ajusté, dates de fin de mois", () => {
    const e = echeancier(pret);
    expect(e).toHaveLength(12);
    expect(e.reduce((s, x) => s + x.capital, 0)).toBe(1_000_000);
    expect(e.at(-1)!.restant).toBe(0);
    expect(e[0].interets).toBe(2500);
    expect(e[1].date).toBe("2026-02-28");
    expect(ajouterMois("2024-01-31", 1)).toBe("2024-02-29");
  });

  it("résumé à une date : restant dû, intérêts payés et restants", () => {
    const r = resume({ ...pret, assurance: 500 }, "2026-06-30");
    const e = echeancier(pret);
    expect(r.restantDu).toBe(e[5].restant);
    expect(r.nbRestantes).toBe(6);
    expect(r.aPayer).toBe(r.mensualite + 500);
    expect(r.prochaine!.date).toBe("2026-07-31");
  });

  it("remboursement anticipé : durée réduite ou mensualité réduite, intérêts économisés", () => {
    const a = { date: "2026-03-15", montant: 300_000 };
    const duree = simulerAnticipe(pret, { ...a, mode: "duree" });
    expect(duree.economie).toBeGreaterThan(0);
    expect(duree.moisGagnes).toBeGreaterThan(0);
    const mens = simulerAnticipe(pret, { ...a, mode: "mensualite" });
    expect(mens.moisGagnes).toBe(0);
    expect(mens.mensualiteApres).toBeLessThan(84694);
    expect(echeancier({ ...pret, anticipes: [{ ...a, mode: "duree" }] }).reduce((s, x) => s + x.capital + x.anticipe, 0)).toBe(1_000_000);
  });
});
