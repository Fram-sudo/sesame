import { describe, expect, it } from "vitest";
import { completerParContenu, lireDate, lireMontant } from "./analyse";
import { banqueDansTexte, choisirCompte, deviseDansTexte, preparer, type Preparation } from "./fichier";

const releve = (texte: string, nom = "r.csv") => ({ nom, lignes: null, texte, pdf: null, erreur: null });

describe("reconnaissance de la banque et du compte", () => {
  it("la mention la plus haute l'emporte", () => {
    expect(banqueDansTexte("SOCIETE GENERALE - Relevé\n02/01 VIR VERS REVOLUT")).toBe("Société Générale");
    expect(banqueDansTexte("EUR Statement\nRevolut Bank UAB")).toBe("Revolut");
    expect(banqueDansTexte("Mon relevé")).toBeUndefined();
    // Relevés Société Générale qui n'écrivent le nom que dans l'adresse du site ou de l'appli
    expect(banqueDansTexte("RELEVÉ DE COMPTE\nsur internet : particuliers.sg.fr")).toBe("Société Générale");
    expect(banqueDansTexte("RELEVÉ DE COMPTE\nInternet : particuliers.societegenerale.fr")).toBe("Société Générale");
    expect(banqueDansTexte("Paiement chez SGS France")).toBeUndefined();
    expect(deviseDansTexte("EUR Statement\nGenerated on")).toBe("EUR");
  });

  it("CSV : banque par les titres de colonnes, pas par les libellés", async () => {
    const p = await preparer(releve("Date,Description,Amount\n2026-01-02,Paiement Revolut,-3.00\n2026-01-03,Autre,-1.00"), []);
    expect(p.banque).toBeUndefined();
    const b = await preparer(releve("dateOp;dateVal;label;category;categoryParent;supplierFound;amount\n2026-01-02;2026-01-02;X;;;;-1,00"), []);
    expect(b.banque).toBe("Boursobank");
  });

  it("compte choisi : empreinte, puis banque et devise, puis le dernier utilisé", () => {
    const p = { estPdf: false, empreinte: "date|libelle|montant", banque: "Revolut", devise: "EUR" } as Preparation;
    const comptes = [
      { id: "sg", banque: "Société Générale", devise: "EUR" },
      { id: "rev", banque: "Revolut", devise: "EUR" },
      { id: "rev2", banque: "revolut", devise: "EUR" },
      { id: "usd", banque: "Revolut", devise: "USD" },
    ];
    expect(choisirCompte(p, comptes, [{ compteId: "rev2", quand: 2 }, { compteId: "rev", quand: 1 }])).toBe("rev2");
    expect(choisirCompte(p, [...comptes, { id: "x", banque: "Autre", devise: "EUR", empreinte: "date|libelle|montant" }], [])).toBe("x");
    expect(choisirCompte({ ...p, banque: "BNP Paribas" }, comptes, [])).toBe("");
  });
});

describe("colonnes devinées sur un petit relevé", () => {
  it("une colonne Débit vide (aucune dépense ce mois-là) reste la colonne Débit", () => {
    const entete = ["date", "libelle", "debit", "credit"];
    const lignes = [entete, ["02/07/2019", "VIR RECU EXEMPLE", "", "50,00"], ["17/07/2019", "VIR RECU AUTRE", "", "20,00"]];
    const c = completerParContenu(lignes, 0, entete, { date: "date", libelle: "libelle", debit: "debit", credit: "credit" });
    expect(c.debit).toBe("debit");
    expect(c.credit).toBe("credit");
  });
  it("un montant suivi d'un renvoi « * » reste un montant", () => {
    expect(lireMontant("9,60 *")).toBe(960);
    expect(lireMontant("1.000,00")).toBe(100000);
    // Référence du virement qui déborde dans la case du montant
    expect(lireMontant("1.443,43 N° de référence : ABC_01")).toBe(144343);
    expect(lireMontant("Virement 12")).toBeNull();
  });
  it("une case qui commence par une date chiffrée garde cette date", () => {
    expect(lireDate("08/11/2021 08/11/2021 CARTE X1234 06/11 BOUTIQUE 12 DEC 1927", "JJ/MM/AAAA")).toBe("2021-11-08");
    expect(lireDate("12 décembre 2025", "JJ/MM/AAAA")).toBe("2025-12-12");
  });
});
