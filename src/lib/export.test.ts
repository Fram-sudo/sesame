import { describe, expect, it } from "vitest";
import { versCsv, versHtml } from "./export";

describe("export", () => {
  const lignes = [
    { date: "2025-01-06", libelle: 'Loyer "janvier"; acompte', categorie: "Logement", compte: "SG", devise: "EUR", montant: -48533 },
    { date: "2025-01-14", libelle: "Pharmacie <Lassar>", categorie: "Santé", compte: "SG", devise: "EUR", montant: -595, note: "ordonnance" },
  ];
  it("CSV lisible par Excel : BOM, point-virgule, virgule décimale, guillemets échappés", () => {
    const csv = versCsv(lignes);
    expect(csv.startsWith("﻿Date;Libellé;")).toBe(true);
    expect(csv).toContain('06/01/2025;"Loyer ""janvier""; acompte";Logement;SG;-485,33;EUR;');
    expect(csv).toContain("14/01/2025;Pharmacie <Lassar>;Santé;SG;-5,95;EUR;ordonnance");
  });
  it("document imprimable : texte échappé et total", () => {
    const html = versHtml("Opérations 2025", "SG", lignes);
    expect(html).toContain("Pharmacie &lt;Lassar&gt;");
    expect(html).toContain("Total · 2 opérations");
    expect(html).toContain("-491,28 EUR");
  });
});
