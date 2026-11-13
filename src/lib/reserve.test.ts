import { describe, expect, it } from "vitest";
import { flux, perimetre, solde, type Contexte } from "./stats";

// Compte courant 1 000 €, poche « Repayment of the loan » réglée en réserve, poche « Vacances » en épargne
const comptes = [
  { id: "cc", banque: "Revolut", devise: "EUR", soldeInitial: 100000 },
  { id: "pret", banque: "Revolut", devise: "EUR", soldeInitial: 0, parentId: "cc", reserve: true },
  { id: "vac", banque: "Revolut", devise: "EUR", soldeInitial: 0, parentId: "cc" },
];
const ops = [
  // 300 € versés dans la réserve, 200 € dans les vacances (virements depuis le compte courant)
  { id: "1", compteId: "cc", date: "2026-11-02", montant: -30000, virementId: "v1" },
  { id: "2", compteId: "pret", date: "2026-11-02", montant: 30000, virementId: "v1" },
  { id: "3", compteId: "cc", date: "2026-11-03", montant: -20000, virementId: "v2" },
  { id: "4", compteId: "vac", date: "2026-11-03", montant: 20000, virementId: "v2" },
  // La mensualité part directement de la réserve
  { id: "5", compteId: "pret", date: "2026-11-05", montant: -25000 },
];
const ctx = { ops, comptes, categories: [] } as unknown as Contexte;

describe("poche en réserve", () => {
  it("ni argent disponible, ni épargne, mais comprise dans le patrimoine", () => {
    const p = perimetre(ctx, "");
    expect([...p.courants]).toEqual(["cc"]);
    expect([...p.epargne]).toEqual(["vac"]);
    expect([...p.reserves]).toEqual(["pret"]);
    expect(solde(ctx, "", "2026-11-30", false)).toBe(50000);
    expect(solde(ctx, "", "2026-11-30", true)).toBe(50000 + 5000 + 20000);
  });

  it("y verser n'est ni un revenu ni de l'épargne ; la mensualité qui en sort est une dépense", () => {
    const f = flux(ctx, "", ["2026-11"]);
    expect(f.misDeCote).toBe(20000);
    expect(f.revenus).toBe(0);
    expect(f.depenses).toBe(25000);
  });
});
