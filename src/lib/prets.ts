// Prêts amortissables (échéances constantes) : mensualité, échéancier, capital restant dû,
// remboursements anticipés (durée ou mensualité réduite). Montants en centimes. Testé dans prets.test.ts.

export interface Anticipe {
  date: string;
  montant: number;
  /** Après le remboursement : garder la mensualité (le prêt finit plus tôt) ou la baisser (même date de fin) */
  mode: "duree" | "mensualite";
}

export interface Pret {
  id: string;
  nom: string;
  organisme?: string;
  /** Capital emprunté (centimes) */
  capital: number;
  /** Taux annuel nominal en % (ex. 3,5) */
  taux: number;
  /** Durée initiale en mois */
  duree: number;
  /** Date de la première échéance (AAAA-MM-JJ) */
  premiere: string;
  /** Assurance par mois (centimes), payée avec l'échéance */
  assurance?: number;
  /** Poche où vous mettez de côté la mensualité (ex. Revolut « Repayment of the loan ») */
  pocheId?: string;
  anticipes?: Anticipe[];
}

export interface Echeance {
  n: number;
  date: string;
  /** Échéance hors assurance = intérêts + capital */
  montant: number;
  interets: number;
  capital: number;
  assurance: number;
  /** Capital restant dû après cette échéance */
  restant: number;
  /** Remboursement anticipé versé juste avant cette échéance */
  anticipe: number;
}

/** Mensualité constante (centimes) pour un capital, un taux annuel en % et un nombre de mois. */
export function mensualite(capital: number, taux: number, mois: number): number {
  if (mois <= 0) return capital;
  const r = taux / 1200;
  return Math.round(r === 0 ? capital / mois : (capital * r) / (1 - Math.pow(1 + r, -mois)));
}

/** Même jour, n mois plus tard (le 31 devient le dernier jour des mois plus courts). */
export function ajouterMois(date: string, n: number): string {
  const [a, m, j] = date.split("-").map(Number);
  const t = a * 12 + (m - 1) + n;
  const an = Math.floor(t / 12);
  const mo = t % 12;
  const dernier = new Date(Date.UTC(an, mo + 1, 0)).getUTCDate();
  return `${an}-${String(mo + 1).padStart(2, "0")}-${String(Math.min(j, dernier)).padStart(2, "0")}`;
}

/** Échéancier complet, remboursements anticipés compris. */
export function echeancier(p: Pret): Echeance[] {
  const r = p.taux / 1200;
  const anticipes = [...(p.anticipes ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  let restant = p.capital;
  let m = mensualite(p.capital, p.taux, p.duree);
  const res: Echeance[] = [];
  let precedente = "";
  for (let n = 1; restant > 0 && n <= 1200; n++) {
    const date = ajouterMois(p.premiere, n - 1);
    // Remboursements anticipés versés depuis l'échéance précédente
    let anticipe = 0;
    for (const a of anticipes) {
      if (a.date > precedente && a.date <= date) {
        const verse = Math.min(a.montant, restant);
        restant -= verse;
        anticipe += verse;
        if (a.mode === "mensualite" && restant > 0) m = mensualite(restant, p.taux, Math.max(1, p.duree - (n - 1)));
      }
    }
    precedente = date;
    if (restant <= 0) {
      if (anticipe) res.push({ n, date, montant: 0, interets: 0, capital: 0, assurance: 0, restant: 0, anticipe });
      break;
    }
    const interets = Math.round(restant * r);
    let capital = m - interets;
    // Dernière échéance (ajustée au centime), ou mensualité trop faible pour couvrir les intérêts : on solde
    if (capital >= restant || capital <= 0) capital = restant;
    restant -= capital;
    res.push({ n, date, montant: interets + capital, interets, capital, assurance: p.assurance ?? 0, restant, anticipe });
  }
  return res;
}

export interface Resume {
  mensualite: number;
  /** Mensualité avec assurance */
  aPayer: number;
  restantDu: number;
  interetsPayes: number;
  interetsRestants: number;
  coutTotal: number;
  prochaine?: Echeance;
  fin: string;
  nbRestantes: number;
  /** Part du capital déjà remboursée (0 à 1) */
  avancement: number;
}

/** Où en est le prêt à une date donnée (échéances jusqu'à cette date considérées payées). */
export function resume(p: Pret, auj: string): Resume {
  const e = echeancier(p);
  const payees = e.filter((x) => x.date <= auj);
  const avenir = e.filter((x) => x.date > auj);
  const anticipesPasses = (p.anticipes ?? []).filter((a) => a.date <= auj && a.date > (payees.at(-1)?.date ?? "")).reduce((s, a) => s + a.montant, 0);
  const restantDu = Math.max(0, (payees.at(-1)?.restant ?? p.capital) - anticipesPasses);
  const prochaine = avenir.find((x) => x.montant > 0);
  const mens = prochaine?.montant ?? e.find((x) => x.montant > 0)?.montant ?? 0;
  const sum = (l: Echeance[], f: (x: Echeance) => number) => l.reduce((s, x) => s + f(x), 0);
  return {
    mensualite: mens,
    aPayer: mens + (p.assurance ?? 0),
    restantDu,
    interetsPayes: sum(payees, (x) => x.interets),
    interetsRestants: sum(avenir, (x) => x.interets),
    coutTotal: sum(e, (x) => x.interets + x.assurance),
    prochaine,
    fin: e.filter((x) => x.montant > 0).at(-1)?.date ?? p.premiere,
    nbRestantes: avenir.filter((x) => x.montant > 0).length,
    avancement: p.capital ? 1 - restantDu / p.capital : 1,
  };
}

/** Effet d'un remboursement anticipé, sans l'enregistrer. */
export function simulerAnticipe(p: Pret, a: Anticipe) {
  const avant = echeancier(p);
  const apres = echeancier({ ...p, anticipes: [...(p.anticipes ?? []), a] });
  const interets = (l: Echeance[]) => l.reduce((s, x) => s + x.interets, 0);
  const finDe = (l: Echeance[]) => l.filter((x) => x.montant > 0).at(-1)?.date ?? p.premiere;
  const premiereApres = apres.find((x) => x.date > a.date && x.montant > 0);
  return {
    economie: interets(avant) - interets(apres),
    finAvant: finDe(avant),
    finApres: finDe(apres),
    moisGagnes: avant.filter((x) => x.montant > 0).length - apres.filter((x) => x.montant > 0).length,
    mensualiteApres: premiereApres?.montant ?? 0,
  };
}
