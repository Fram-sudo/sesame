// Lecture CSV tolérante : séparateur deviné (; , tabulation |), guillemets, retours à la ligne dans les champs.

export function lireCsv(texte: string, sep = detecterSeparateur(texte)): string[][] {
  const lignes: string[][] = [];
  let ligne: string[] = [];
  let champ = "";
  let guillemets = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (guillemets) {
      if (c !== '"') champ += c;
      else if (texte[i + 1] === '"') (champ += '"'), i++;
      else guillemets = false;
    } else if (c === '"' && champ.trim() === "") {
      guillemets = true;
      champ = "";
    } else if (c === sep) {
      ligne.push(champ);
      champ = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texte[i + 1] === "\n") i++;
      ligne.push(champ);
      lignes.push(ligne);
      ligne = [];
      champ = "";
    } else champ += c;
  }
  if (champ !== "" || ligne.length) ligne.push(champ), lignes.push(ligne);
  // ="0123" : astuce de certaines banques pour qu'Excel garde le texte tel quel
  return lignes.map((l) => l.map((c) => c.trim().replace(/^="(.*)"$/, "$1"))).filter((l) => l.some((c) => c !== ""));
}

/** Le séparateur qui donne le plus de lignes avec le même nombre de colonnes (au moins 2). */
export function detecterSeparateur(texte: string): string {
  const extrait = texte.slice(0, 8000);
  let meilleur = ";";
  let score = -1;
  for (const sep of [";", ",", "\t", "|"]) {
    const freq = new Map<number, number>();
    for (const l of lireCsv(extrait, sep).slice(0, 40)) if (l.length > 1) freq.set(l.length, (freq.get(l.length) ?? 0) + 1);
    for (const [n, f] of freq) {
      const s = f * 100 + n;
      if (s > score) (score = s), (meilleur = sep);
    }
  }
  return meilleur;
}
