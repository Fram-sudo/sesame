// Les relevés arrivent en français ou en anglais selon la langue du compte bancaire : chaque
// reconnaissance de l'import doit marcher dans les deux langues.
import { describe, expect, it } from "vitest";
import { CATEGORIES_DEFAUT, categoriser, mouvementPoche, REGLES_DEFAUT, trierRegles } from "../categories";
import { dateEnLettres, devinerColonnes, lire, normaliser, type Profil } from "./analyse";
import { deviseDansTexte } from "./fichier";
import { sectionEnAttente, sectionExclue, sectionPoches } from "./pdf";

const colonnes = (titres: string[]) => devinerColonnes(titres.map(normaliser));

describe("import bilingue", () => {
  it("titres de colonnes", () => {
    for (const [fr, en] of [
      [["Date", "Libellé", "Argent sortant", "Argent entrant", "Solde"], ["Date", "Description", "Money out", "Money in", "Balance"]],
      [["Date de l'opération", "Libellé", "Débit", "Crédit"], ["Transaction date", "Description", "Paid out", "Paid in"]],
      [["Date de fin", "Description", "Montant", "Frais", "Devise", "État"], ["Completed Date", "Description", "Amount", "Fee", "Currency", "State"]],
    ]) {
      expect(Object.keys(colonnes(fr)).sort(), fr.join(" | ")).toEqual(Object.keys(colonnes(en)).sort());
      expect(colonnes(fr).date, fr.join(" | ")).toBeTruthy();
    }
  });

  it("dates en lettres", () => {
    for (const [s, attendu] of [
      ["18 sept. 2024", "18/9/2024"], ["Sep 18, 2024", "18/9/2024"], ["1er janvier 2026", "1/1/2026"], ["1st January 2026", "1/1/2026"],
      ["2 août 2026", "2/8/2026"], ["Aug 2, 2026", "2/8/2026"], ["5 décembre 2025", "5/12/2025"], ["December 5th, 2025", "5/12/2025"],
    ]) expect(dateEnLettres(s), s).toBe(attendu);
  });

  it("annulées ignorées, en attente gardées (marquées)", () => {
    const profil: Profil = { id: "p", nom: "p", entete: [], colonnes: { date: "date", libelle: "libelle", montant: "montant", etat: "etat" }, formatDate: "JJ/MM/AAAA" };
    const etats = ["ANNULÉ", "CANCELLED", "REJETÉ", "DECLINED", "RESTAURÉ", "REVERTED", "ÉCHOUÉ", "FAILED"];
    const lignes = [["date", "libelle", "montant", "etat"], ...etats.map((e) => ["01/02/2026", "X", "-1,00", e]), ["01/02/2026", "X", "-1,00", "TERMINÉ"], ["01/02/2026", "X", "-1,00", "COMPLETED"], ["01/02/2026", "X", "-1,00", "EN ATTENTE"], ["01/02/2026", "X", "-1,00", "PENDING"]];
    const r = lire(lignes, 0, profil, "EUR");
    expect(r.nonAbouties).toBe(etats.length);
    expect(r.ops.map((o) => !!o.enAttente)).toEqual([false, false, true, true]);
  });

  it("devise et tableaux du relevé", () => {
    expect(deviseDansTexte("EUR Statement")).toBe("EUR");
    expect(deviseDansTexte("Relevé EUR")).toBe("EUR");
    expect(deviseDansTexte("Relevé en USD")).toBe("USD");
    for (const s of ["Pending from Sep 1, 2026", "Transactions en attente du 1 septembre 2026"]) expect(sectionEnAttente(s), s).toBe(true);
    for (const s of ["Reverted from Sep 1, 2026", "Transactions annulées", "Declined transactions", "Opérations refusées"]) expect(sectionExclue(s), s).toBe(true);
    for (const s of ["Personal and Group Pockets transactions", "Transactions sur des Pockets personnelles et de groupe"]) expect(sectionPoches(s), s).toBe(true);
    for (const s of ["Account transactions from Sep 1, 2026", "Transactions du compte : du 1 septembre 2026"]) expect(sectionExclue(s) || sectionPoches(s), s).toBe(false);
  });

  it("mouvements de poches", () => {
    expect(mouvementPoche("To pocket EUR Vacances from EUR")).toBe("Vacances");
    expect(mouvementPoche("Sur la Pocket EUR Vacances depuis EUR")).toBe("Vacances");
    expect(mouvementPoche("Vers la poche Vacances")).toBe("Vacances");
    expect(mouvementPoche("Pocket Withdrawal")).toBe("?");
    expect(mouvementPoche("Retrait depuis une Pocket")).toBe("?");
  });

  it("catégories devinées", () => {
    const regles = trierRegles(REGLES_DEFAUT);
    const cat = (libelle: string, montant = -1000) => categoriser({ id: "o", compteId: "c", date: "2026-01-01", montant, libelle }, regles, CATEGORIES_DEFAUT);
    for (const [fr, en, attendu, montant] of [
      ["Boulangerie du coin", "Corner bakery", "cat-alimentation", -500],
      ["Pharmacie centrale", "Central pharmacy", "cat-sante", -500],
      ["Salaire novembre", "November salary", "cat-salaire", 150000],
      ["Remboursement achat", "Purchase refund", "cat-remboursements", 2000],
      ["Loyer novembre", "November rent", "cat-logement", -60000],
      ["Frais de tenue de compte", "Account fee", "cat-frais", -300],
    ] as const) {
      expect(cat(fr, montant), fr).toBe(attendu);
      expect(cat(en, montant), en).toBe(attendu);
    }
  });
});
