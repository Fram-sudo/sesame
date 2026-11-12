// Relevés inventés, de banques et de langues que l'appli ne connaît pas : les colonnes doivent être
// reconnues par leur contenu (dates, montants, solde qui suit les montants), sans dépendre des titres.
import { describe, expect, it } from "vitest";
import { lire } from "./analyse";
import { preparer } from "./fichier";
import { tableauDepuisPdf, type Morceau } from "./pdf";

const releve = (texte: string, nom = "r.csv") => ({ nom, lignes: null, texte, pdf: null, erreur: null });
const ops = async (texte: string) => {
  const p = await preparer(releve(texte), []);
  return lire(p.lignes, p.idx, p.profil, "EUR").ops.map((o) => [o.date, o.montant, o.libelle]);
};
const ATTENDU = [
  ["2026-03-02", -2350, "Supermarché"],
  ["2026-03-05", 180000, "Salaire"],
  ["2026-03-07", -6200, "Loyer"],
];

describe("colonnes reconnues par leur contenu", () => {
  it("mêmes opérations, titres en français, en anglais, dans une autre langue ou sans titres", async () => {
    const corps = "02/03/2026;Supermarché;-23,50;976,50\n05/03/2026;Salaire;1800,00;2776,50\n07/03/2026;Loyer;-62,00;2714,50";
    for (const titres of ["Date;Libellé;Montant;Solde", "Date;Description;Amount;Balance", "Buchungstag;Verwendungszweck;Betrag;Saldo", "Fecha;Concepto;Importe;Saldo"])
      expect(await ops(`${titres}\n${corps}`), titres).toEqual(ATTENDU);
    expect(await ops(corps), "sans titres").toEqual(ATTENDU);
  });

  it("sorties et entrées dans deux colonnes aux titres inconnus : le solde dit laquelle est laquelle", async () => {
    const texte = "Datum;Omschrijving;Af;Bij;Saldo\n02/03/2026;Supermarché;23,50;;976,50\n05/03/2026;Salaire;;1800,00;2776,50\n07/03/2026;Loyer;62,00;;2714,50";
    expect(await ops(texte)).toEqual(ATTENDU);
    // Colonnes dans l'autre ordre (entrées d'abord)
    const inverse = "Datum;Omschrijving;Bij;Af;Saldo\n02/03/2026;Supermarché;;23,50;976,50\n05/03/2026;Salaire;1800,00;;2776,50\n07/03/2026;Loyer;;62,00;2714,50";
    expect(await ops(inverse)).toEqual(ATTENDU);
  });

  it("dépenses écrites en positif : retournées grâce au solde", async () => {
    const p = await preparer(releve("Date;Libellé;Montant;Solde\n02/03/2026;Supermarché;23,50;976,50\n05/03/2026;Salaire;-1800,00;2776,50\n07/03/2026;Loyer;62,00;2714,50\n09/03/2026;Pharmacie;12,90;2701,60"), []);
    expect(p.profil.inverser).toBe(true);
    expect(lire(p.lignes, p.idx, p.profil, "EUR").ops.map((o) => [o.date, o.montant, o.libelle])).toEqual([...ATTENDU, ["2026-03-09", -1290, "Pharmacie"]]);
  });

  it("un titre trompeur est corrigé par le contenu", async () => {
    // « Montant » contient en fait du texte, les nombres sont dans « Valeur »
    expect(await ops("Date;Montant;Valeur\n02/03/2026;Supermarché;-23,50\n05/03/2026;Salaire;1800,00\n07/03/2026;Loyer;-62,00")).toEqual(ATTENDU);
  });

  it("un format déjà validé est reconnu tout seul la fois suivante", async () => {
    const texte = "Buchungstag;Verwendungszweck;Betrag\n02/03/2026;Supermarché;-23,50\n05/03/2026;Salaire;1800,00";
    const premier = await preparer(releve(texte), []);
    expect(premier.profilNouveau).toBe(true);
    const ensuite = await preparer(releve(texte), [premier.profil]);
    expect(ensuite.profilNouveau).toBe(false);
  });

  it("PDF aux titres de colonnes inconnus : tableau reconstruit d'après le contenu", async () => {
    const m: Morceau[] = [];
    const t = (y: number, x: number, s: string) => m.push({ s, x, y, l: s.length * 4, h: 8, page: 1 });
    const droite = (y: number, x1: number, s: string) => t(y, x1 - s.length * 4, s);
    t(700, 40, "Kontoauszug");
    t(680, 40, "Datum"), t(680, 120, "Text"), t(680, 330, "Soll"), t(680, 410, "Haben"), t(680, 500, "Saldo");
    t(660, 40, "02"), t(660, 50, "mars"), t(660, 72, "2026"), t(660, 120, "Supermarché"), droite(660, 350, "23,50"), droite(660, 530, "976,50");
    t(652, 120, "Carte 1234");
    t(640, 40, "05.03.2026"), t(640, 120, "Salaire"), droite(640, 440, "1 800,00"), droite(640, 530, "2 776,50");
    t(620, 40, "07.03.2026"), t(620, 120, "Loyer"), droite(620, 350, "62,00"), droite(620, 530, "2 714,50");
    const tableau = tableauDepuisPdf(m);
    const p = await preparer({ nom: "r.pdf", lignes: tableau, texte: null, pdf: null, erreur: null }, []);
    const r = lire(p.lignes, p.idx, p.profil, "EUR");
    expect(r.ops.map((o) => [o.date, o.montant, o.libelle])).toEqual(ATTENDU);
    expect(r.ops[0].detail).toBe("Carte 1234");
  });
});
