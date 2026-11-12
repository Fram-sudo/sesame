// Estimation simple et locale de la robustesse d'un mot de passe (aucun envoi nulle part).
// shortcut: heuristique maison (longueur × variété − motifs connus) ; passer à zxcvbn si on veut plus fin.

const COURANTS = [
  "password", "motdepasse", "azerty", "qwerty", "123456", "000000", "111111", "soleil",
  "bonjour", "doudou", "loulou", "chouchou", "marseille", "paris", "football", "iloveyou",
  "admin", "portefeuille", "banque", "argent",
];

export type Niveau = 0 | 1 | 2 | 3;

export interface Robustesse {
  niveau: Niveau; // 0 faible, 1 moyen, 2 bon, 3 excellent
  bits: number;
  suffisant: boolean;
}

export function evaluer(mdp: string): Robustesse {
  const bas = mdp.toLowerCase();
  let reserve = 0;
  if (/[a-z]/.test(mdp)) reserve += 26;
  if (/[A-Z]/.test(mdp)) reserve += 26;
  if (/[0-9]/.test(mdp)) reserve += 10;
  if (/[^a-zA-Z0-9]/.test(mdp)) reserve += 33;
  // Les caractères répétés ou en suite (aaaa, 1234, abcd) comptent peu
  let utiles = 0;
  for (let i = 0; i < mdp.length; i++) {
    const prec = mdp.charCodeAt(i - 1);
    const c = mdp.charCodeAt(i);
    utiles += i > 0 && (c === prec || c === prec + 1 || c === prec - 1) ? 0.3 : 1;
  }
  let bits = reserve > 0 ? utiles * Math.log2(reserve) : 0;
  for (const m of COURANTS) if (bas.includes(m)) bits -= m.length * 4;
  bits = Math.max(0, Math.round(bits));
  const niveau: Niveau = bits < 40 ? 0 : bits < 60 ? 1 : bits < 80 ? 2 : 3;
  return { niveau, bits, suffisant: mdp.length >= 10 && niveau >= 2 };
}
