import { readFileSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { detecterEntete, detecterFormatDate, devinerColonnes, enteteDe, lire, type Profil } from "./analyse";
import { estMontant, sectionExclue, tableauDepuisPdf, type Morceau } from "./pdf";

async function morceaux(chemin: string) {
  const doc = await getDocument({ data: new Uint8Array(readFileSync(chemin)), verbosity: 0 }).promise;
  const res: Morceau[] = [];
  for (let p = 1; p <= doc.numPages; p++)
    for (const it of (await (await doc.getPage(p)).getTextContent()).items)
      if ("str" in it) res.push({ s: it.str, x: it.transform[4], y: it.transform[5], l: it.width, h: it.height, page: p });
  return res;
}

/** Même enchaînement que l'écran d'import. */
function importer(lignes: string[][], sections?: (s: string) => boolean) {
  const iSection = lignes[0].indexOf("Section");
  const utiles = sections ? [lignes[0], ...lignes.slice(1).filter((l) => sections(l[iSection]))] : lignes;
  const idx = detecterEntete(utiles);
  const entete = enteteDe(utiles, idx);
  const colonnes = devinerColonnes(entete);
  const dates = utiles.slice(idx + 1).map((l) => l[entete.indexOf(colonnes.date!)]);
  const profil: Profil = { id: "p", nom: "p", entete, colonnes, formatDate: detecterFormatDate(dates) };
  return lire(utiles, idx, profil, "EUR");
}

describe("relevé PDF", () => {
  it("colonnes débit/crédit, suite des libellés en détail, 2 pages, soldes et totaux ignorés, référence numérique", async () => {
    const r = importer(tableauDepuisPdf(await morceaux("tests/fixtures/releve-exemple.pdf")));
    expect(r.erreurs).toEqual([]);
    expect(r.ops.map((o) => [o.date, o.montant, o.libelle, o.detail])).toEqual([
      ["2026-01-02", -420, "CARTE X1234 BOULANGERIE EXEMPLE", "CARTE X1234 01/01 BOULANGERIE"],
      ["2026-01-05", -62000, "PRLV SEPA LOYER BAILLEUR FICTIF", undefined],
      ["2026-01-15", 185000, "VIR RECU SALAIRE EXEMPLE", "DE: EMPLOYEUR FICTIF REF 123"],
      ["2026-01-18", -1999, "PRLV SEPA OPERATEUR EXEMPLE 9000090344", undefined],
      ["2026-01-20", -1290, "CARTE X1234 PHARMACIE EXEMPLE", undefined],
      ["2026-01-28", 3500, "AVOIR BOUTIQUE EXEMPLE", undefined],
    ]);
  });

  it("plusieurs tableaux aux colonnes différentes (type Revolut) : le solde ne se colle plus au montant", () => {
    const m: Morceau[] = [];
    const t = (y: number, x: number, s: string, l = s.length * 4, h = 8) => m.push({ s, x, y, l, h, page: 1 });
    const droite = (y: number, x1: number, s: string) => t(y, x1 - s.length * 4, s);
    t(400, 40, "Pending from Sep 1, 2026 to Nov 9, 2026", 200, 12);
    t(370, 43, "Start date"), t(370, 125, "Description"), t(370, 335, "Money out", 39), t(370, 417, "Money in", 33);
    t(351, 43, "Nov 9, 2026"), t(351, 125, "Achat en attente"), droite(351, 365, "€487.49");
    t(290, 40, "Account transactions from Sep 1, 2026 to Nov 9, 2026", 250, 12);
    t(261, 43, "Date"), t(261, 125, "Description"), t(261, 335, "Money out", 39), t(261, 417, "Money in", 33), t(261, 526, "Balance", 29);
    t(242, 43, "Sep 18, 2026"), t(242, 125, "Open banking deposit"), droite(242, 442, "€90.00"), droite(242, 555, "€903.44");
    t(234, 125, "Reference: ABC123", 70, 5);
    t(212, 43, "Sep 21, 2026"), t(212, 125, "Premium plan fee"), droite(212, 356, "€1,009.99"), droite(212, 555, "€0.01");
    const tableau = tableauDepuisPdf(m);
    const r = importer(tableau, (s) => !sectionExclue(s));
    expect(r.ops.map((o) => [o.date, o.montant, o.libelle, o.solde, o.detail])).toEqual([
      ["2026-09-18", 9000, "Open banking deposit", 90344, "Reference: ABC123"],
      ["2026-09-21", -100999, "Premium plan fee", 1, undefined],
    ]);
    expect([...new Set(tableau.slice(1).map((l) => l.at(-1)))]).toEqual([
      "Pending from Sep 1, 2026 to Nov 9, 2026",
      "Account transactions from Sep 1, 2026 to Nov 9, 2026",
    ]);
  });

  it("formes de montants", () => {
    for (const s of ["€10.00", "€1,234.56", "1 234,56", "-12,90 €", "620,00", "15 000"]) expect(estMontant(s), s).toBe(true);
    for (const s of ["9000090344", "Sep 18, 2024", "REF 123", "416598******2504"]) expect(estMontant(s), s).toBe(false);
  });
});
