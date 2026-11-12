import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detecterEntete, detecterFormatDate, devinerColonnes, enteteDe, lire, lireDate, lireMontant, reconnaitreBanque, type Profil } from "./analyse";
import { lireCsv } from "./csv";
import { separerDoublons } from "./doublons";

const fixture = (nom: string, enc = "utf-8") => new TextDecoder(enc).decode(readFileSync(`tests/fixtures/${nom}`));

/** Le parcours complet de l'appli, sans profil enregistré. */
function importer(texte: string, devise = "EUR") {
  const lignes = lireCsv(texte);
  const idx = detecterEntete(lignes);
  const entete = enteteDe(lignes, idx);
  const colonnes = devinerColonnes(entete);
  const dates = lignes.slice(idx + 1).map((l) => l[entete.indexOf(colonnes.date ?? "")] ?? "");
  const profil: Profil = { id: "t", nom: "t", entete, colonnes, formatDate: detecterFormatDate(dates) };
  return { banque: reconnaitreBanque(entete), ...lire(lignes, idx, profil, devise) };
}

describe("montants", () => {
  it.each([
    ["-4,20", -420],
    ["1 850,00", 185000],
    ["1 234,5", 123450],
    ["-1,234.56", -123456],
    ["12.5", 1250],
    ["(12,00)", -1200],
    ["12,00-", -1200],
    ["15.000", 1500000],
    ["15 000 F CFA", 1500000],
    ["+3 €", 300],
    ["abc", null],
    ["", null],
  ])("%s", (s, attendu) => expect(lireMontant(s)).toBe(attendu));
});

describe("dates", () => {
  it("formats variés", () => {
    expect(lireDate("31/01/2026", "JJ/MM/AAAA")).toBe("2026-01-31");
    expect(lireDate("02.01.26", "JJ/MM/AAAA")).toBe("2026-01-02");
    expect(lireDate("2026-01-30 10:12:01", "AAAA-MM-JJ")).toBe("2026-01-30");
    expect(lireDate("01/31/2026", "MM/JJ/AAAA")).toBe("2026-01-31");
    expect(lireDate("31/02/2026", "JJ/MM/AAAA")).toBeNull();
    expect(lireDate("2 janv. 2026", "AAAA-MM-JJ")).toBe("2026-01-02");
    expect(lireDate("15 août 2026", "JJ/MM/AAAA")).toBe("2026-08-15");
    expect(lireDate("Jan 2, 2026", "JJ/MM/AAAA")).toBe("2026-01-02");
    expect(lireDate("3 December 2026", "JJ/MM/AAAA")).toBe("2026-12-03");
    expect(lireDate("Mardi", "JJ/MM/AAAA")).toBeNull();
  });
  it("format deviné", () => {
    expect(detecterFormatDate(["01/02/2026", "13/02/2026"])).toBe("JJ/MM/AAAA");
    expect(detecterFormatDate(["01/13/2026"])).toBe("MM/JJ/AAAA");
    expect(detecterFormatDate(["2026-01-02"])).toBe("AAAA-MM-JJ");
  });
});

describe("relevés d'exemple", () => {
  it("Société Générale (Windows-1252, lignes d'introduction)", () => {
    const r = importer(fixture("societe-generale.csv", "windows-1252"));
    expect(r.banque).toBe("Société Générale");
    expect(r.erreurs).toEqual([]);
    expect(r.ops).toHaveLength(5);
    expect(r.ops[0]).toMatchObject({ date: "2026-01-31", montant: -420, libelle: "CARTE X1234 BOULANGERIE EXEMPLE" });
    expect(r.ops[1].montant).toBe(185000);
  });

  it("Revolut (en cours, autre devise et frais)", () => {
    const r = importer(fixture("revolut.csv"));
    expect(r.banque).toBe("Revolut");
    expect(r.ops.map((o) => o.montant)).toEqual([-2340, 50000, -1049]);
    expect(r.nonAbouties).toBe(1);
    expect(r.autreDevise).toBe(1);
    expect(r.ops[2]).toMatchObject({ libelle: "Abonnement, Exemple", solde: 46611 });
  });

  it("Boursobank", () => {
    const r = importer(fixture("boursobank.csv"));
    expect(r.banque).toBe("Boursobank");
    expect(r.ops).toEqual([
      expect.objectContaining({ date: "2026-01-31", montant: -1290, categorieBanque: "Santé", solde: 108710 }),
      expect.objectContaining({ montant: 110000, detail: "Note fictive" }),
    ]);
  });

  it("banque inconnue : tabulations, débit/crédit séparés, pied de page ignoré", () => {
    const r = importer(fixture("banque-inconnue.csv"));
    expect(r.banque).toBeUndefined();
    expect(r.erreurs).toEqual([]);
    expect(r.ops.map((o) => [o.date, o.montant, o.libelle])).toEqual([
      ["2026-01-02", -4000, "Retrait DAB exemple"],
      ["2026-01-05", 1550, "Remboursement fictif"],
    ]);
  });
});

describe("doublons", () => {
  it("réimporter le même relevé ne crée rien, deux cafés identiques restent deux", () => {
    const { ops } = importer(fixture("societe-generale.csv", "windows-1252"));
    const premier = separerDoublons(ops, []);
    expect(premier.nouvelles).toHaveLength(5);
    const second = separerDoublons(ops, premier.nouvelles);
    expect(second.nouvelles).toHaveLength(0);
    expect(second.doublons).toHaveLength(5);
    // un relevé qui chevauche : seul un des deux cafés était déjà là
    const partiel = separerDoublons(ops, premier.nouvelles.slice(0, 4));
    expect(partiel.nouvelles.map((o) => o.libelle)).toEqual(["CARTE X1234 CAFE EXEMPLE"]);
  });
});
