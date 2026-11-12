import { describe, expect, it } from "vitest";
import { banqueDansTexte, choisirCompte, deviseDansTexte, preparer, type Preparation } from "./fichier";

const releve = (texte: string, nom = "r.csv") => ({ nom, lignes: null, texte, pdf: null, erreur: null });

describe("reconnaissance de la banque et du compte", () => {
  it("la mention la plus haute l'emporte", () => {
    expect(banqueDansTexte("SOCIETE GENERALE - Relevé\n02/01 VIR VERS REVOLUT")).toBe("Société Générale");
    expect(banqueDansTexte("EUR Statement\nRevolut Bank UAB")).toBe("Revolut");
    expect(banqueDansTexte("Mon relevé")).toBeUndefined();
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
