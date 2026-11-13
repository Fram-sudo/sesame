import { describe, expect, it } from "vitest";
import { rapprocherSaisies } from "./doublons";

describe("saisies à la main retrouvées dans le relevé", () => {
  it("même montant à quelques jours près, libellé différent : reconnue", () => {
    const releve = [
      { date: "2026-11-05", montant: -4512, libelle: "CARTE CARREFOUR 1234" },
      { date: "2026-11-06", montant: -350, libelle: "CARTE CAFE DU COIN" },
      { date: "2026-11-06", montant: -350, libelle: "CARTE CAFE DU COIN" },
      { date: "2026-11-07", montant: -1999, libelle: "PRLV FREE" },
    ];
    const saisies = [
      { id: "a", date: "2026-11-03", montant: -4512, libelle: "Courses" },
      { id: "b", date: "2026-11-06", montant: -350, libelle: "Café" },
      { id: "c", date: "2026-10-01", montant: -1999, libelle: "Trop ancienne" },
      { id: "d", date: "2026-11-06", montant: -900, libelle: "Montant différent" },
    ];
    const r = rapprocherSaisies(releve, saisies);
    expect([...r].map(([n, s]) => [n.libelle, s.id])).toEqual([
      ["CARTE CAFE DU COIN", "b"],
      ["CARTE CARREFOUR 1234", "a"],
    ]);
  });

  it("deux saisies identiques pour deux lignes identiques : chacune la sienne", () => {
    const releve = [{ date: "2026-11-06", montant: -350 }, { date: "2026-11-07", montant: -350 }];
    const saisies = [{ id: "x", date: "2026-11-06", montant: -350 }, { id: "y", date: "2026-11-07", montant: -350 }];
    const r = rapprocherSaisies(releve, saisies);
    expect(r.get(releve[0])?.id).toBe("x");
    expect(r.get(releve[1])?.id).toBe("y");
  });
});

import { solde } from "../stats";
describe("opérations en attente", () => {
  it("déjà déduites de l'argent disponible : 480 € moins 300 € en attente = 180 €", () => {
    const comptes = [{ id: "rev", nom: "Revolut", banque: "Revolut", devise: "EUR", soldeInitial: 48000, type: "courant" as const }];
    const ops = [{ id: "p", compteId: "rev", date: "2026-11-12", montant: -30000, libelle: "Achat", cle: "k", enAttente: true }];
    expect(solde({ ops, comptes, categories: [] } as never, "", "2026-11-13", false)).toBe(18000);
  });
});
