import { describe, expect, it } from "vitest";
import { CATEGORIES_DEFAUT } from "./categories";
import { bornes, cleMois, decaler, deplacer, etatBudgets, filtreBanque, flux, joursRestants, moyenne, moyennePeriode, objectifPoche, solde, type Contexte } from "./stats";

let n = 0;
const op = (compteId: string, date: string, montant: number, categorieId?: string, virementId?: string) => ({ id: `o${n++}`, compteId, date, montant, categorieId, virementId });
const ctx: Contexte = {
  categories: CATEGORIES_DEFAUT,
  comptes: [
    { id: "cc", devise: "EUR", soldeInitial: 10000 },
    { id: "rev", devise: "EUR", soldeInitial: 0 },
    { id: "poche", devise: "EUR", soldeInitial: 0, type: "epargne", parentId: "rev" },
    { id: "xof", devise: "XOF", soldeInitial: 0 },
  ],
  ops: [
    op("cc", "2026-11-02", 150000, "cat-salaire"),
    op("cc", "2026-11-03", -6000, "cat-alimentation"),
    op("cc", "2026-11-04", 1000, "cat-alimentation"), // avoir : réduit les dépenses d'alimentation
    op("cc", "2026-11-05", -2000), // sans catégorie
    op("cc", "2026-11-06", -20000, "cat-virement", "v1"),
    op("rev", "2026-11-06", 20000, "cat-virement", "v1"),
    op("rev", "2026-11-07", -5000, "cat-virement", "v2"), // vers la poche
    op("poche", "2026-11-07", 5000, "cat-virement", "v2"),
    op("poche", "2026-11-20", -1500), // pioché
    op("xof", "2026-11-08", -99999900, "cat-alimentation"),
    op("cc", "2026-10-03", -9000, "cat-alimentation"),
    op("cc", "2026-09-03", -3000, "cat-alimentation"),
  ],
};

describe("tableau de bord", () => {
  it("mois : dépenses nettes, revenus, virements exclus, épargne à part, autres devises ignorées", () => {
    const f = flux(ctx, "", ["2026-11"]);
    expect(f.depenses).toBe(7000);
    expect(f.revenus).toBe(150000);
    expect(f.misDeCote).toBe(5000);
    expect(f.pioche).toBe(1500);
    expect(f.parCategorie.get("cat-alimentation")).toBe(5000);
    expect(f.parCategorie.get("")).toBe(2000);
  });
  it("un seul compte : lui et ses poches", () => {
    const f = flux(ctx, "rev", ["2026-11"]);
    expect([f.depenses, f.revenus, f.misDeCote, f.pioche]).toEqual([0, 0, 5000, 1500]);
  });
  it("moyenne des 3 mois précédents et solde", () => {
    expect(moyenne(ctx, "", { a: 2026, m: 10 }).depenses).toBe(4000);
    expect(solde(ctx, "", "2026-11-30")).toBe(10000 + 150000 - 6000 + 1000 - 2000 - 20000 + 20000 - 5000 + 5000 - 1500 - 9000 - 3000);
  });
  it("mois et objectifs", () => {
    expect(cleMois(decaler({ a: 2026, m: 0 }, -1))).toBe("2025-12");
    expect(objectifPoche({ nom: "Objectif : 5000€" })).toBe(500000);
    expect(objectifPoche({ nom: "Voyage 1 200,50 €" })).toBe(120050);
    expect(objectifPoche({ nom: "Repayment of the loan" })).toBeUndefined();
  });
});

describe("périodes et banques", () => {
  const P = (mode: "mois" | "trimestre" | "annee" | "tout" | "perso", a = 2026, m = 10, de = "", fin = "") => ({ mode, a, m, de, fin });
  it("bornes et libellés", () => {
    expect(bornes(P("mois"))).toMatchObject({ de: "2026-11-01", fin: "2026-11-30", libelle: "novembre 2026" });
    expect(bornes(P("trimestre"))).toMatchObject({ de: "2026-10-01", fin: "2026-12-31", libelle: "4e trimestre 2026" });
    expect(bornes(P("trimestre", 2026, 1)).libelle).toBe("1er trimestre 2026");
    expect(bornes(P("annee")).mois).toHaveLength(12);
    expect(bornes(P("perso", 2026, 0, "2026-03-15", "2026-01-10"))).toMatchObject({ de: "2026-01-10", fin: "2026-03-15" });
    expect(bornes(P("perso", 2026, 0, "2026-01-10", "2026-03-15")).mois.map(cleMois)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });
  it("navigation", () => {
    expect(bornes(deplacer(P("trimestre"), -1)).libelle).toBe("3e trimestre 2026");
    expect(bornes(deplacer(P("annee"), 1)).libelle).toBe("Année 2027");
    expect(deplacer(P("tout"), -1)).toEqual(P("tout"));
  });
  it("intervalle de dates, moyenne des trimestres précédents, filtre par banque", () => {
    expect(flux(ctx, "", { de: "2026-11-03", fin: "2026-11-05" }).depenses).toBe(7000);
    expect(moyennePeriode(ctx, "", P("trimestre", 2026, 10 - 12))!.depenses).toBe(0); // trimestre passé : comparable
    expect(moyennePeriode(ctx, "", P("mois"), "2026-09-03")!.depenses).toBe(6000); // relevés depuis septembre : moyenne de septembre (30 €) et octobre (90 €)
    expect(moyennePeriode(ctx, "", P("trimestre", 2099, 0))).toBeUndefined(); // en cours (futur) : pas de comparaison
    expect(moyennePeriode(ctx, "", P("tout"))).toBeUndefined();
    const avecBanques = { ...ctx, comptes: ctx.comptes.map((c) => ({ ...c, banque: c.id === "cc" ? "SG" : "Revolut" })) };
    expect(flux(avecBanques, filtreBanque("revolut"), ["2026-11"]).misDeCote).toBe(5000);
    expect(flux(avecBanques, filtreBanque("SG"), ["2026-11"]).depenses).toBe(7000);
  });
});

describe("budgets", () => {
  const nov = bornes({ mode: "mois", a: 2026, m: 10, de: "", fin: "" });
  it("dépensé, projection au rythme actuel, global et annuel", () => {
    const e = etatBudgets(ctx, "", nov, [
      { id: "cat-alimentation", montant: 4000 },
      { id: "global", montant: 10000 },
      { id: "cat-alimentation", montant: 30000, frequence: "annee" },
    ], "2026-11-10");
    // 50 € déjà dépensés ; les mois précédents, rien après le 10 (dépenses le 3) : rien à ajouter
    expect(e[0]).toMatchObject({ budget: 4000, depense: 5000, avancement: 10 / 30, projection: 5000 });
    expect(e[1]).toMatchObject({ budget: 10000, depense: 7000 });
    expect(e[2]).toMatchObject({ budget: 30000, depense: 17000, de: "2026-01-01" }); // sept + oct + nov
    expect(joursRestants("2026-11-30", "2026-11-10")).toBe(21);
  });
  it("prévision : un loyer payé en début de mois n'est pas compté deux fois", () => {
    // Chaque mois : loyer le 5, charges de 30 € le 20 ; en novembre, on est le 10 (seul le loyer est passé)
    const ops = ["2026-08", "2026-09", "2026-10"].flatMap((m) => [op("cc", `${m}-05`, -62000, "cat-logement"), op("cc", `${m}-20`, -3000, "cat-logement")]);
    const loyer = { ...ctx, ops: [...ops, op("cc", "2026-11-05", -62000, "cat-logement")] };
    const [e] = etatBudgets(loyer, "", nov, [{ id: "cat-logement", montant: 70000 }], "2026-11-10");
    expect(e.depense).toBe(62000);
    expect(e.projection).toBe(65000); // + les 30 € habituels du 20, pas un second loyer
  });
});

describe("devises", () => {
  it("avec les taux : le compte en F CFA est converti en euros ; sans taux, il est ignoré", () => {
    const avec = { ...ctx, taux: { EUR: 1, XOF: 655.957 } };
    const sans = flux(ctx, "", ["2026-11"]).depenses;
    const conv = flux(avec, "", ["2026-11"]).depenses;
    expect(conv - sans).toBe(Math.round(99999900 / 655.957)); // 999 999 F CFA ≈ 1 524,49 €
    expect(solde(avec, "", "2026-11-30") - solde(ctx, "", "2026-11-30")).toBe(Math.round(-99999900 / 655.957));
    expect(flux(avec, "xof", ["2026-11"]).depenses).toBe(99999900); // vu seul : dans sa propre devise
  });
});

describe("devise d'affichage choisie", () => {
  it("tous les comptes en F CFA, budgets (enregistrés en euros) convertis", () => {
    const xof = { ...ctx, taux: { EUR: 1, XOF: 655.957 }, devise: "XOF" };
    expect(flux(xof, "", ["2026-11"]).depenses).toBe(99999900 + Math.round(7000 * 655.957));
    const [e] = etatBudgets(xof, "", bornes({ mode: "mois", a: 2026, m: 10 }, "2026-01-01"), [{ id: "global", montant: 10000 }], "2026-11-15");
    expect(e.budget).toBe(Math.round(10000 * 655.957));
  });
});

import { suiviObjectif } from "./stats";
describe("objectif d'épargne daté", () => {
  it("effort mensuel, attendu en ligne droite, retard", () => {
    // 1 200 € pour le 1er juillet 2027, fixé le 1er novembre 2026 avec 300 € ; 420 € le 14 novembre 2026
    const s = suiviObjectif(120000, "2027-07-01", "2026-11-01", 30000, 42000, "2026-11-14");
    expect(s.moisRestants).toBe(8);
    expect(s.parMois).toBe(9750);
    expect(s.attendu).toBe(30000 + Math.round(90000 * (13 / 242)));
    expect(s.ecart).toBeGreaterThan(0);
    expect(s.atteint).toBe(false);
  });
  it("objectif atteint, plus rien à mettre de côté", () => {
    const s = suiviObjectif(50000, "2027-01-01", "2026-01-01", 0, 60000, "2026-11-14");
    expect(s.atteint).toBe(true);
    expect(s.parMois).toBe(0);
  });
});
