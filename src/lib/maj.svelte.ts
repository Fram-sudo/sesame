// Mises à jour : la fiche latest.json de la dernière version publiée sur GitHub, comparée à la version installée.
import { getVersion } from "@tauri-apps/api/app";
import { api, estAndroid } from "./api";
import { app, sauverParametres } from "./etat.svelte";
import { langue } from "./i18n.svelte";
import historique from "./nouveautes.json";

export type Notes = { fr: string[]; en: string[] };
export interface Fiche {
  version: string;
  date: string;
  page: string;
  fichiers: Record<"windows" | "android" | "deb" | "appimage", string>;
  notes: Notes;
}

export const maj = $state({ actuelle: "", dispo: null as Fiche | null });
/** Historique embarqué dans l'appli (lisible hors connexion) */
export const HISTORIQUE = historique as { version: string; date: string; notes: Notes }[];

/** "0.1.12" plus récente que "0.1.9" ? */
export function plusRecente(a: string, b: string) {
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
}

export const notesDansLaLangue = (n: Notes) => (langue.code === "en" && n.en.length ? n.en : n.fr);

/** Fichier à télécharger pour cet appareil (Linux : la page, pour choisir .deb ou AppImage) */
export function lienPourCetAppareil(f: Fiche) {
  if (estAndroid) return f.fichiers.android;
  if (/Windows/i.test(navigator.userAgent)) return f.fichiers.windows;
  return f.page;
}

/** Renvoie la nouvelle version, null si à jour, undefined si pas de connexion. */
export async function verifierMaj(forcer = false): Promise<Fiche | null | undefined> {
  if (!forcer && app.params.majAuto === false) return null;
  try {
    maj.actuelle ||= await getVersion();
    const f = JSON.parse(await api.derniereVersion()) as Fiche;
    maj.dispo = plusRecente(f.version, maj.actuelle) ? f : null;
    if (forcer && maj.dispo && app.params.majIgnoree) (app.params.majIgnoree = undefined), await sauverParametres();
    return maj.dispo;
  } catch {
    return undefined;
  }
}

export async function plusTard() {
  app.params.majIgnoree = maj.dispo?.version;
  await sauverParametres();
}
