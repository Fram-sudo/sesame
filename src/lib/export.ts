// Export des opérations affichées : tableur (CSV lisible par Excel en français) ou document imprimable (PDF).
// Le fichier est créé sur l'appareil, rien n'est envoyé.

export interface LigneExport {
  date: string;
  libelle: string;
  categorie: string;
  compte: string;
  devise: string;
  montant: number;
  note?: string;
}

const montantFr = (cts: number) => (cts / 100).toFixed(2).replace(".", ",");
const dateFr = (iso: string) => iso.split("-").reverse().join("/");

/** CSV « à la française » : point-virgule, virgule décimale, BOM pour qu'Excel lise les accents. */
export function versCsv(lignes: LigneExport[]): string {
  const cellule = (v: string) => (/[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const entete = ["Date", "Libellé", "Catégorie", "Compte", "Montant", "Devise", "Note"];
  const corps = lignes.map((l) => [dateFr(l.date), l.libelle, l.categorie, l.compte, montantFr(l.montant), l.devise, l.note ?? ""].map(cellule).join(";"));
  return "﻿" + [entete.join(";"), ...corps].join("\r\n") + "\r\n";
}

const echapper = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Document imprimable (Imprimer → Enregistrer en PDF) : titre, tableau, total par devise. */
export function versHtml(titre: string, sousTitre: string, lignes: LigneExport[]): string {
  const totaux = new Map<string, number>();
  for (const l of lignes) totaux.set(l.devise, (totaux.get(l.devise) ?? 0) + l.montant);
  const total = [...totaux].map(([d, v]) => `${montantFr(v)} ${echapper(d)}`).join(" · ");
  const rangs = lignes
    .map((l) => `<tr><td>${dateFr(l.date)}</td><td>${echapper(l.libelle)}${l.note ? `<br><small>${echapper(l.note)}</small>` : ""}</td><td>${echapper(l.categorie)}</td><td>${echapper(l.compte)}</td><td class="m">${montantFr(l.montant)} ${echapper(l.devise)}</td></tr>`)
    .join("");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${echapper(titre)}</title><style>
body{font-family:system-ui,"Segoe UI",sans-serif;color:#16171b;margin:24px;font-size:12px}
h1{font-size:18px;margin:0}p{color:#55575f;margin:4px 0 16px}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #ddd;vertical-align:top}
th{font-size:11px;text-transform:uppercase;color:#55575f}.m{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
tfoot td{font-weight:700;border-top:2px solid #16171b}small{color:#55575f}
@page{margin:14mm}
</style></head><body><h1>${echapper(titre)}</h1><p>${echapper(sousTitre)}</p>
<table><thead><tr><th>Date</th><th>Libellé</th><th>Catégorie</th><th>Compte</th><th class="m">Montant</th></tr></thead>
<tbody>${rangs}</tbody><tfoot><tr><td colspan="4">Total · ${lignes.length} opération${lignes.length > 1 ? "s" : ""}</td><td class="m">${total}</td></tr></tfoot></table></body></html>`;
}
