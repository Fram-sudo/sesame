import { describe, expect, it } from "vitest";
import { libelleLisible, attentesRemplacees, attribuerPoches, mouvementPoche, router, CATEGORIES_DEFAUT, REGLES_DEFAUT, categoriser, detecterRecurrences, detecterVirements, moitieDejaLa, motif, trierRegles, VIREMENT, type Op } from "./categories";

let n = 0;
const op = (date: string, montant: number, libelle: string, extra: Partial<Op> = {}): Op => ({ id: `o${n++}`, compteId: "a", date, montant, libelle, ...extra });
const regles = trierRegles(REGLES_DEFAUT);

describe("motif", () => {
  it("garde la partie stable du libellé", () => {
    expect(motif("CARTE X1234 30/01 BOULANGERIE DUPONT")).toBe("boulangerie dupont");
    expect(motif("PRLV SEPA LOYER BAILLEUR FICTIF")).toBe("loyer bailleur fictif");
    expect(motif("VIR RECU 123456 DE: EMPLOYEUR SA")).toBe("employeur sa");
  });
});

describe("catégorisation", () => {
  it("par mots-clés fournis", () => {
    expect(categoriser(op("2026-01-01", -420, "CARTE X1234 CARREFOUR CITY"), regles, CATEGORIES_DEFAUT)).toBe("cat-alimentation");
    expect(categoriser(op("2026-01-01", -1349, "NETFLIX.COM"), regles, CATEGORIES_DEFAUT)).toBe("cat-abonnements");
    expect(categoriser(op("2026-01-01", 165000, "VIR SALAIRE JANVIER"), regles, CATEGORIES_DEFAUT)).toBe("cat-salaire");
    expect(categoriser(op("2026-01-01", 90000, "Open banking deposit"), regles, CATEGORIES_DEFAUT)).toBe(VIREMENT);
    expect(categoriser(op("2026-01-01", -48749, "Vinted"), regles, CATEGORIES_DEFAUT)).toBe("cat-shopping");
    expect(categoriser(op("2026-01-01", 2500, "Vinted"), regles, CATEGORIES_DEFAUT)).toBe("cat-autres-revenus");
  });
  it("mot entier seulement (« eau » ne prend pas « bureau »)", () => {
    expect(categoriser(op("2026-01-01", -900, "FOURNITURES BUREAU"), regles, CATEGORIES_DEFAUT)).toBeUndefined();
  });
  it("une règle apprise passe devant les règles fournies", () => {
    const r = trierRegles([...REGLES_DEFAUT, { id: "x", motif: "carrefour city", categorieId: "cat-divers", appris: true }]);
    expect(categoriser(op("2026-01-01", -420, "CARTE CARREFOUR CITY"), r, CATEGORIES_DEFAUT)).toBe("cat-divers");
  });
  it("un remboursement n'est pas classé en dépense", () => {
    expect(categoriser(op("2026-01-01", 2000, "AVOIR AMAZON"), regles, CATEGORIES_DEFAUT)).toBe("cat-remboursements");
  });
  it("catégorie donnée par la banque en secours", () => {
    expect(categoriser(op("2026-01-01", -1290, "XYZ 123", { categorieBanque: "Santé" }), regles, CATEGORIES_DEFAUT)).toBe("cat-sante");
  });
});

describe("virements entre comptes", () => {
  it("associe sortie et entrée du même montant à quelques jours d'écart", () => {
    const s = op("2026-01-03", -20000, "VIR VERS REVOLUT", { compteId: "a" });
    const e = op("2026-01-04", 20000, "Rechargement", { compteId: "b" });
    const autre = op("2026-01-20", 20000, "Rechargement", { compteId: "b" });
    const xof = op("2026-01-03", 20000, "Transfert", { compteId: "c" });
    const paires = detecterVirements([s, e, autre, xof], (id) => (id === "c" ? "XOF" : "EUR"));
    expect(paires.map(([a, b]) => [a.id, b.id])).toEqual([[s.id, e.id]]);
  });
  it("ignore ce qui est déjà associé ou sur le même compte", () => {
    const s = op("2026-01-03", -500, "x", { compteId: "a" });
    expect(detecterVirements([s, op("2026-01-03", 500, "y", { compteId: "a" })], () => "EUR")).toEqual([]);
    expect(detecterVirements([s, op("2026-01-03", 500, "y", { compteId: "b", virementId: "v" })], () => "EUR")).toEqual([]);
  });
  it("la catégorie virement existe", () => expect(CATEGORIES_DEFAUT.some((c) => c.id === VIREMENT)).toBe(true));
});

describe("récurrences", () => {
  it("loyer mensuel détecté avec la prochaine échéance", () => {
    const ops = ["2026-01-05", "2026-02-05", "2026-03-05", "2026-04-06"].map((d) => op(d, -62000, "PRLV SEPA LOYER BAILLEUR"));
    const [r] = detecterRecurrences(ops);
    expect(r).toMatchObject({ frequence: "chaque mois", montant: -62000, prochaine: "2026-05-06", variable: false, nb: 4 });
  });
  it("facture variable reconnue, achats irréguliers ignorés", () => {
    const elec = [["2026-01-10", -4100], ["2026-02-10", -5800], ["2026-03-10", -4900]].map(([d, m]) => op(d as string, m as number, "PRLV EDF"));
    const hasard = ["2026-01-02", "2026-01-03", "2026-02-20", "2026-02-21"].map((d) => op(d, -300, "BOULANGERIE"));
    const r = detecterRecurrences([...elec, ...hasard]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ motif: "edf", variable: true });
  });
});

describe("opérations en attente", () => {
  it("retirées quand l'opération définitive arrive, gardées sinon", () => {
    const attente = { ...op("2026-11-09", -48749, "Vinted"), enAttente: true };
    const autre = { ...op("2026-11-09", -1500, "Restaurant"), enAttente: true };
    const definitive = op("2026-11-11", -48749, "Vinted");
    const tropTard = op("2026-12-01", -1500, "Restaurant");
    expect(attentesRemplacees([attente, autre, definitive, tropTard]).map((o) => o.id)).toEqual([attente.id]);
  });
});

describe("règles de compte", () => {
  it("versements nommés vers la poche, retraits du même montant aussi, le reste ne bouge pas", () => {
    const R = [
      { id: "1", motif: "repayment of the loan", source: "poches", cible: "pret" },
      { id: "2", motif: "pocket withdrawal", source: "poches", cible: "pret", memeMontant: true },
    ];
    const ops = [
      op("2026-03-03", 7452, "To pocket EUR Repayment of the loan from EUR", { compteId: "poches" }),
      op("2026-03-10", -2116, "Pocket Withdrawal", { compteId: "poches" }),
      op("2026-03-15", -7452, "Pocket Withdrawal", { compteId: "poches" }),
      op("2026-03-16", 500, "To pocket EUR Objectif : 5000€ from EUR", { compteId: "poches" }),
    ];
    router(ops, R, []);
    expect(ops.map((o) => o.compteId)).toEqual(["pret", "poches", "pret", "poches"]);
  });
  it("un versement ne couvre qu'un seul retrait, même sur deux imports", () => {
    const R = [
      { id: "1", motif: "repayment of the loan", source: "poches", cible: "pret" },
      { id: "2", motif: "pocket withdrawal", source: "poches", cible: "pret", memeMontant: true },
    ];
    const premier = [
      op("2026-10-13", 11857, "To pocket EUR Repayment of the loan from EUR", { compteId: "poches" }),
      op("2026-10-25", -11857, "Pocket Withdrawal", { compteId: "poches" }),
    ];
    router(premier, R, []);
    const second = [op("2026-11-02", -11857, "Pocket Withdrawal", { compteId: "poches" })];
    router(second, R, premier);
    expect([...premier, ...second].map((o) => o.compteId)).toEqual(["pret", "pret", "poches"]);
  });
});

describe("poches", () => {
  it("reconnaît versements et retraits", () => {
    expect(mouvementPoche("To pocket EUR Objectif : 5000€ from EUR")).toBe("Objectif : 5000€");
    expect(mouvementPoche("To pocket EUR Repayment of the loan from EUR")).toBe("Repayment of the loan");
    expect(mouvementPoche("Pocket Withdrawal")).toBe("?");
    // Relevé Revolut en français
    expect(mouvementPoche("Sur la Pocket EUR Objectif : 5000€ depuis EUR")).toBe("Objectif : 5000€");
    expect(mouvementPoche("Retrait depuis une Pocket")).toBe("?");
    expect(mouvementPoche("Vinted")).toBeUndefined();
  });
  it("retraits : poche du prêt si même montant, sinon la poche la mieux garnie ; le prêt retombe à 0", () => {
    const ops = [
      op("2026-10-01", -2000, "To pocket EUR Objectif : 5000€ from EUR"),
      op("2026-10-02", -150, "To pocket EUR Objectif : 5000€ from EUR"),
      op("2026-10-03", -150, "To pocket EUR Objectif : 5000€ from EUR"),
      op("2026-10-13", -11857, "To pocket EUR Repayment of the loan from EUR"),
      op("2026-10-20", 500, "Pocket Withdrawal"),
      op("2026-10-25", 11857, "Pocket Withdrawal"),
      op("2026-11-09", -11857, "To pocket EUR Repayment of the loan from EUR"),
    ];
    const p = attribuerPoches(ops);
    expect(ops.map((o) => p.get(o.id))).toEqual(["Objectif : 5000€", "Objectif : 5000€", "Objectif : 5000€", "Repayment of the loan", "Objectif : 5000€", "Repayment of the loan", "Repayment of the loan"]);
  });
});

describe("règles : sens et plusieurs mots-clés", () => {
  it("VINTED en revenu → ventes, en dépense → shopping ; plusieurs mots ; règle masquée ignorée", () => {
    const r = trierRegles([
      { id: "a", motif: "vinted", categorieId: "cat-autres-revenus", appris: true, sens: "revenu" },
      { id: "b", motif: "vinted", categorieId: "cat-shopping", appris: true, sens: "depense" },
      { id: "c", motif: "lidl, aldi", categorieId: "cat-alimentation", appris: true },
      { id: "d", motif: "netflix", categorieId: "cat-loisirs", appris: true, masquee: true },
      ...REGLES_DEFAUT,
    ]);
    const cat = (montant: number, libelle: string) => categoriser(op("2026-01-01", montant, libelle), r, CATEGORIES_DEFAUT);
    expect(cat(2500, "Vinted")).toBe("cat-autres-revenus");
    expect(cat(-2500, "Vinted")).toBe("cat-shopping");
    expect(cat(-900, "ALDI MARCHE")).toBe("cat-alimentation");
    expect(cat(-1349, "NETFLIX.COM")).toBe("cat-abonnements");
  });
});

describe("libellés lisibles", () => {
  it("retire le jargon bancaire et met en minuscules", () => {
    expect(libelleLisible("PRLV SEPA OPERATEUR MOBILE EXEMPLE")).toBe("Operateur Mobile Exemple");
    expect(libelleLisible("CARTE X1234 12/11 BOULANGERIE DU MARCHE")).toBe("Boulangerie du Marche");
    expect(libelleLisible("VIR SEPA RECU DE SALAIRE EMPLOYEUR REF 123456")).toBe("Salaire Employeur");
    expect(libelleLisible("PRLV SEPA EDF CLIENTS PARTICULIERS")).toBe("EDF Clients Particuliers");
    expect(libelleLisible("RETRAIT DAB 05/11 PARIS")).toBe("Retrait · Paris");
  });
  it("laisse les libellés déjà lisibles et ne renvoie jamais du vide", () => {
    expect(libelleLisible("Boutique en ligne exemple")).toBe("Boutique en ligne exemple");
    expect(libelleLisible("CARTE X1234")).toBe("CARTE X1234");
  });
});

import { estDepotEspeces, estRetraitEspeces } from "./categories";
describe("retraits d'espèces", () => {
  it("reconnus en français et en anglais, pas les retraits de poche", () => {
    for (const l of ["RETRAIT DAB 12/11 PARIS", "Retrait d'espèces", "CARTE X1234 RETRAIT DAB", "Cash withdrawal at Barclays", "ATM London"]) expect(estRetraitEspeces(l), l).toBe(true);
    for (const l of ["Retrait depuis une Pocket", "Pocket Withdrawal", "CARTE CARREFOUR", "Remboursement"]) expect(estRetraitEspeces(l), l).toBe(false);
    // Autres banques et langues
    for (const l of ["RETRAIT GAB ABIDJAN", "RET DAB 03/01 LYON", "RETRAIT AU DISTRIBUTEUR", "RETRAIT ESPECES GUICHET AGENCE", "ATM withdrawal", "Bargeldauszahlung Geldautomat", "Prelievo bancomat", "Retirada de efectivo cajero"]) expect(estRetraitEspeces(l), l).toBe(true);
    for (const l of ["VERST ESP GAB 30/10/26", "VRST GAB 12/03/24 10H05 123456", "Versement d'espèces", "DEPOT ESPECES GUICHET", "Cash deposit"]) {
      expect(estDepotEspeces(l), l).toBe(true);
      expect(estRetraitEspeces(l), l).toBe(false);
    }
    for (const l of ["CARTE CARREFOUR", "VIR RECU EMPLOYEUR", "Dabbawala restaurant"]) expect(estDepotEspeces(l) || estRetraitEspeces(l), l).toBe(false);
  });
});

describe("virement saisi à la main dont un côté est déjà importé", () => {
  it("retrouve le départ déjà sur le compte d'origine, sinon l'arrivée", () => {
    const depart = op("2026-11-10", -50000, "VIR VERS LIVRET", { compteId: "a" });
    const loin = op("2026-11-01", -50000, "VIR ANCIEN", { compteId: "a" });
    const lie = op("2026-11-11", -50000, "VIR DEJA LIE", { compteId: "a", virementId: "v1" });
    expect(moitieDejaLa([loin, lie, depart], "a", "b", 50000, "2026-11-12")).toEqual({ op: depart, cote: "depart" });
    const arrivee = op("2026-11-13", 50000, "VIR RECU", { compteId: "b" });
    expect(moitieDejaLa([arrivee], "a", "b", 50000, "2026-11-12")).toEqual({ op: arrivee, cote: "arrivee" });
    expect(moitieDejaLa([loin, lie], "a", "b", 50000, "2026-11-12")).toBeUndefined();
  });
});
