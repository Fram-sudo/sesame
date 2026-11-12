import { describe, expect, it } from "vitest";
import { CATEGORIES_DEFAUT, type Op } from "./categories";
import { prevoir } from "./prevision";

let n = 0;
const op = (date: string, montant: number, libelle: string): Op => ({ id: `o${n++}`, compteId: "cc", date, montant, libelle });
const mois = ["2026-08", "2026-09", "2026-10", "2026-11"];
const ops: Op[] = [
  ...mois.map((m) => op(`${m}-01`, 200000, "SALAIRE ACME")),
  ...mois.map((m) => op(`${m}-05`, -80000, "LOYER AGENCE")),
  // 900 € de courses sur les 90 derniers jours → 10 €/jour
  ...[20, 40, 60].map((j) => op(new Date(Date.parse("2026-11-10") - j * 86_400_000).toISOString().slice(0, 10), -30000, `COURSES MAGASIN ${j}`)),
];
const ctx = { ops, categories: CATEGORIES_DEFAUT, comptes: [{ id: "cc", devise: "EUR", soldeInitial: 0 }] };

describe("prévision du solde", () => {
  it("salaire et loyer à leur date, le reste réparti par jour", () => {
    const pr = prevoir(ctx, "", "2026-11-10", 28);
    const depart = 4 * 200000 - 4 * 80000 - 90000;
    expect(pr.points[0].solde).toBe(depart);
    // 28 jours : 280 € de dépenses courantes, salaire du 1er décembre, loyer du 5 décembre
    expect(pr.points.at(-1)!.solde).toBe(depart - 28000 + 200000 - 80000);
    expect(pr.sousSeuil).toBeUndefined();
  });
  it("prévient quand le compte passerait sous le seuil", () => {
    const pr = prevoir(ctx, "", "2026-11-10", 28, 380000);
    expect(pr.sousSeuil).toBe("2026-11-21");
    expect(pr.plusBas.date).toBe("2026-11-30");
  });
});
