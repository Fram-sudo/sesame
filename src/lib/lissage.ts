// Courbe arrondie (cubique monotone) : douce, sans bosse au-delà des vraies valeurs. Partagée par tous les graphiques.
export function lisse(pts: [number, number][]) {
  const n = pts.length;
  if (n < 3) return pts.map(([px, py], i) => `${i ? "L" : "M"}${px},${py}`).join(" ");
  const m = pts.slice(0, -1).map(([x0, y0], i) => (pts[i + 1][1] - y0) / (pts[i + 1][0] - x0));
  const t = pts.map((_, i) => (i === 0 ? m[0] : i === n - 1 ? m[n - 2] : m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) (t[i] = (3 / Math.sqrt(s)) * a * m[i]), (t[i + 1] = (3 / Math.sqrt(s)) * b * m[i]);
  }
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const h = (x1 - x0) / 3;
    d += ` C${x0 + h},${y0 + t[i] * h} ${x1 - h},${y1 - t[i + 1] * h} ${x1},${y1}`;
  }
  return d;
}

/** Hauteur d'une courbe dessinée à l'abscisse donnée (elle avance toujours vers la droite : recherche par dichotomie) */
export function hauteurSurChemin(p: SVGPathElement | undefined | null, px: number, defaut: number): number {
  if (!p) return defaut;
  let a = 0, b = p.getTotalLength();
  for (let k = 0; k < 22; k++) {
    const m = (a + b) / 2;
    if (p.getPointAtLength(m).x < px) a = m;
    else b = m;
  }
  return p.getPointAtLength((a + b) / 2).y;
}

/**
 * Étiquettes d'un axe sans chevauchement : de gauche à droite, une étiquette n'est gardée que si elle ne touche pas
 * la précédente ; la première et la dernière sont collées aux bords (jamais coupées), la dernière toujours affichée.
 * `candidats` : indices autorisés (par exemple seulement les débuts d'année). Largeur estimée : 6,6 px par caractère.
 */
export function etiquettesAxe(xs: number[], textes: string[], largeur: number, candidats?: number[]): Map<number, "start" | "middle" | "end"> {
  const res = new Map<number, "start" | "middle" | "end">();
  const idx = (candidats ?? xs.map((_, i) => i)).filter((i) => i >= 0 && i < xs.length);
  if (!idx.length) return res;
  const boite = (i: number) => {
    const w = textes[i].length * 6.6;
    const ancre: "start" | "middle" | "end" = xs[i] - w / 2 < 0 ? "start" : xs[i] + w / 2 > largeur ? "end" : "middle";
    const g = ancre === "start" ? xs[i] : ancre === "end" ? xs[i] - w : xs[i] - w / 2;
    return { ancre, g, d: g + w };
  };
  const ESPACE = 10;
  let droite = -Infinity;
  const gardes: number[] = [];
  for (const i of idx) {
    const b = boite(i);
    if (b.g >= droite + ESPACE) (gardes.push(i), (droite = b.d));
  }
  // La dernière étiquette compte le plus (la période en cours) : on retire celles qui la gênent
  const der = idx[idx.length - 1];
  if (!gardes.includes(der)) {
    const g = boite(der).g;
    while (gardes.length && boite(gardes[gardes.length - 1]).d + ESPACE > g) gardes.pop();
    gardes.push(der);
  }
  for (const i of gardes) res.set(i, boite(i).ancre);
  return res;
}
