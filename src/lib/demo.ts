// Données de démonstration entièrement fictives (marquées demo: true pour pouvoir les retirer d'un coup).
import { classerEtLier, donnees, ecrire, nouvelId, supprimer, type Changement, type Compte, type Operation } from "./donnees.svelte";
import { cleOp } from "./import/doublons";

function hasard(graine: number) {
  return () => {
    graine = (graine + 0x6d2b79f5) | 0;
    let t = Math.imul(graine ^ (graine >>> 15), 1 | graine);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function chargerDemo() {
  const h = hasard(42);
  const entre = (a: number, b: number) => Math.round((a + h() * (b - a)) * 100);
  const comptes: Compte[] = [
    { id: nouvelId(), nom: "Compte courant (démo)", banque: "Société Générale", devise: "EUR", soldeInitial: 120000, demo: true },
    { id: nouvelId(), nom: "Revolut (démo)", banque: "Revolut", devise: "EUR", soldeInitial: 25000, demo: true },
    { id: nouvelId(), nom: "Compte Dakar (démo)", banque: "Banque fictive", devise: "XOF", soldeInitial: 5000000, demo: true },
    { id: nouvelId(), nom: "Tirelire (démo)", banque: "", devise: "EUR", soldeInitial: 23000, type: "epargne", forme: "especes", objectif: 50000, demo: true },
    { id: nouvelId(), nom: "Livret A (démo)", banque: "Banque fictive", devise: "EUR", soldeInitial: 120000, type: "epargne", forme: "livret", demo: true },
  ];
  const [cc, rev, xof] = comptes.map((c) => c.id);
  const ops: Operation[] = [];
  const ajouter = (compteId: string, date: string, montant: number, libelle: string, categorieBanque?: string) =>
    ops.push({ id: nouvelId(), compteId, date, montant, libelle, cle: cleOp({ date, montant, libelle }), demo: true, ...(categorieBanque ? { categorieBanque } : {}) });

  const aujourdhui = new Date();
  for (let j = 120; j >= 0; j--) {
    const d = new Date(Date.UTC(aujourdhui.getFullYear(), aujourdhui.getMonth(), aujourdhui.getDate() - j));
    const date = d.toISOString().slice(0, 10);
    const jour = d.getUTCDate();
    const sem = d.getUTCDay();
    if (jour === 28) ajouter(cc, date, 165000, "VIR RECU SALAIRE EMPLOYEUR FICTIF", "Salaire");
    if (jour === 5) ajouter(cc, date, -62000, "PRLV SEPA LOYER BAILLEUR FICTIF", "Logement");
    if (jour === 10) ajouter(cc, date, -entre(38, 62), "PRLV SEPA ELECTRICITE EXEMPLE", "Énergie");
    if (jour === 12) ajouter(cc, date, -1999, "PRLV SEPA OPERATEUR MOBILE EXEMPLE", "Téléphone");
    if (jour === 2) ajouter(cc, date, -8640, "CARTE TRANSPORTS EXEMPLE ABONNEMENT", "Transports");
    if (jour === 3) ajouter(cc, date, -20000, "VIR VERS REVOLUT (DEMO)", "Virement");
    if (jour === 3) ajouter(rev, date, 20000, "Rechargement depuis compte courant", "Virement");
    if (sem === 2 || sem === 6) ajouter(cc, date, -entre(22, 95), "CARTE SUPERMARCHE EXEMPLE", "Courses");
    if (h() < 0.35) ajouter(cc, date, -entre(1.2, 6.5), "CARTE BOULANGERIE EXEMPLE", "Alimentation");
    if (sem === 5 && h() < 0.6) ajouter(rev, date, -entre(14, 48), "Restaurant Exemple", "Restaurants");
    if (jour === 15) ajouter(rev, date, -1349, "Abonnement streaming exemple", "Loisirs");
    if (h() < 0.12) ajouter(rev, date, -entre(8, 70), "Boutique en ligne exemple", "Shopping");
    if (jour === 1) ajouter(xof, date, 15000000, "TRANSFERT RECU FAMILLE (DEMO)", "Revenus");
    if (h() < 0.15) ajouter(xof, date, -Math.round(entre(20, 180)) * 100, "MARCHE EXEMPLE", "Courses");
  }
  await ecrire([
    ...comptes.map((c) => ({ collection: "comptes", id: c.id, valeur: c }) as Changement),
    ...ops.map((o) => ({ collection: "operations", id: o.id, valeur: o }) as Changement),
  ]);
  await classerEtLier();
}

export const aDesDonneesDemo = () => donnees.comptes.some((c) => c.demo);

export const retirerDemo = () =>
  ecrire([...supprimer("operations", donnees.operations.filter((o) => o.demo)), ...supprimer("comptes", donnees.comptes.filter((c) => c.demo))]);
