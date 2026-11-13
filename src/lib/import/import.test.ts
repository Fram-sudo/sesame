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
    // La ligne PENDING (sans date de fin) est gardée, marquée en attente, à sa date de début
    expect(r.ops.map((o) => o.montant)).toEqual([-2340, 50000, -1500, -1049]);
    expect(r.ops[2]).toMatchObject({ date: "2026-01-31", enAttente: true });
    expect(r.nonAbouties).toBe(0);
    expect(r.autreDevise).toBe(1);
    expect(r.ops[3]).toMatchObject({ libelle: "Abonnement, Exemple", solde: 46611 });
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

describe("libellé collé aux dates (PDF Société Générale)", () => {
  const profil: Profil = { id: "p", nom: "", entete: ["date", "libelle", "detail", "debit", "credit"], colonnes: { date: "date", libelle: "libelle", debit: "debit", credit: "credit" }, formatDate: "JJ/MM/AAAA" };
  const lignes = [
    ["date", "libelle", "detail", "debit", "credit"],
    ["10/11/2026 10/11/2026 CARTE X1234 RETRAIT DAB 10/11 15H59", "CASH SERVICES EXEMPLE", "", "50,00", ""],
    ["05/11/2026", "VIR RECU EMPLOYEUR", "", "", "100,00"],
    ["12 déc. 2025", "BOULANGERIE", "", "3,00", ""],
  ];
  it("la 1re ligne collée aux dates rejoint le libellé ; une date seule ou en lettres ne change rien", () => {
    const r = lire(lignes, 0, profil, "EUR");
    expect(r.ops.map((o) => o.libelle)).toEqual(["CARTE X1234 RETRAIT DAB 10/11 15H59 CASH SERVICES EXEMPLE", "VIR RECU EMPLOYEUR", "BOULANGERIE"]);
  });
  it("au réimport, une opération déjà là sous l'ancien libellé (plus court) est complétée, pas dupliquée", () => {
    const r = lire(lignes, 0, profil, "EUR");
    const ancienne = { id: "a", date: "2026-11-10", montant: -5000, libelle: "CASH SERVICES EXEMPLE", cle: "2026-11-10|-5000|cash services exemple" };
    const { nouvelles, reparees } = separerDoublons(r.ops, [ancienne]);
    expect(reparees.map((x) => x.existante.id)).toEqual(["a"]);
    expect(nouvelles.map((o) => o.libelle)).toEqual(["VIR RECU EMPLOYEUR", "BOULANGERIE"]);
  });
  it("une opération lue autrefois « (sans libellé) » est complétée elle aussi", () => {
    const r = lire(lignes, 0, profil, "EUR");
    const ancienne = { id: "b", date: "2026-11-10", montant: -5000, libelle: "(sans libellé)", cle: "2026-11-10|-5000|sans libelle" };
    expect(separerDoublons(r.ops, [ancienne]).reparees.map((x) => x.existante.id)).toEqual(["b"]);
  });
});

describe("réparation : deux opérations du même montant le même jour", () => {
  it("chaque ancienne ligne retrouve la bonne, quel que soit l'ordre", () => {
    const lues = [
      { date: "2026-02-12", montant: -699, libelle: "CARTE X1579 11/02 GOOGLE PLAY APPS", detail: "6,99 EUR IRLANDE COMMERCE ELECTRONIQUE" },
      { date: "2026-02-12", montant: -699, libelle: "CARTE X1579 11/02 GOOGLE PLAY APPS" },
    ];
    const anciennes = [
      { id: "vide", date: "2026-02-12", montant: -699, libelle: "(sans libellé)", cle: "2026-02-12|-699|sans libelle" },
      { id: "texte", date: "2026-02-12", montant: -699, libelle: "6,99 EUR IRLANDE COMMERCE ELECTRONIQUE", cle: "2026-02-12|-699|6 99 eur irlande commerce electronique" },
    ];
    for (const ordre of [anciennes, [...anciennes].reverse()]) {
      const r = separerDoublons(lues, ordre);
      expect(r.nouvelles).toEqual([]);
      expect(r.reparees.map((x) => x.existante.id).sort()).toEqual(["texte", "vide"]);
    }
  });
});

describe("réimport d'un relevé déjà à moitié complété", () => {
  it("même jour et même montant : autant d'opérations dans l'appli que dans le relevé, donc rien de nouveau", () => {
    const lues = [
      { date: "2026-02-12", montant: -699, libelle: "CARTE X1579 11/02 GOOGLE PLAY APPS", detail: "6,99 EUR IRLANDE COMMERCE ELECTRONIQUE" },
      { date: "2026-02-12", montant: -699, libelle: "CARTE X1579 11/02 GOOGLE PLAY APPS" },
    ];
    const anciennes = [
      // déjà complétée au premier réimport (même empreinte que les deux lignes lues)
      { id: "faite", date: "2026-02-12", montant: -699, libelle: "CARTE X1579 11/02 GOOGLE PLAY APPS", cle: "2026-02-12|-699|carte x1579 11 02 google play apps" },
      // restée avec l'ancien bout de texte
      { id: "ancienne", date: "2026-02-12", montant: -699, libelle: "6,99 EUR IRLANDE COMMERCE ELECTRONIQUE", cle: "2026-02-12|-699|6 99 eur irlande commerce electronique" },
    ];
    const r = separerDoublons(lues, anciennes);
    expect(r.nouvelles).toEqual([]);
    expect(r.reparees.map((x) => x.existante.id)).toEqual(["ancienne"]);
  });
  it("un vrai deuxième achat identique, absent de l'appli, reste nouveau ; une saisie à la main n'est pas avalée", () => {
    const lues = [
      { date: "2026-03-01", montant: -300, libelle: "CARTE CAFE" },
      { date: "2026-03-01", montant: -300, libelle: "CARTE CAFE" },
    ];
    const r = separerDoublons(lues, [
      { id: "a", date: "2026-03-01", montant: -300, libelle: "CARTE CAFE", cle: "2026-03-01|-300|carte cafe" },
      { id: "m", date: "2026-03-01", montant: -300, libelle: "Café", cle: "2026-03-01|-300|cafe", manuelle: true },
    ]);
    expect(r.nouvelles.length).toBe(1);
    expect(r.reparees).toEqual([]);
  });
});
