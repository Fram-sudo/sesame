// Appels au moteur Rust. Les messages d'erreur renvoyés sont déjà en français.
import { invoke as invoquer } from "@tauri-apps/api/core";
import { t } from "./i18n.svelte";

// Les erreurs du moteur arrivent en français : on les traduit si l'appli est en anglais
const invoke = <T>(cmd: string, args?: Record<string, unknown>) => invoquer<T>(cmd, args).catch((e) => Promise.reject(t(String(e))));
import type { Taux } from "./taux";

export interface Parametres {
  verrouMinutes: number;
  theme: "auto" | "clair" | "sombre";
  discret: boolean;
  /** Télécharger les taux de change de la BCE une fois par jour (désactivé par défaut) */
  tauxActifs: boolean;
  /** Derniers taux chargés, gardés pour fonctionner hors connexion */
  taux?: Taux;
  /** Devise d'affichage des totaux (EUR, XOF, USD, CAD) */
  devise?: string;
  /** Synchronisation (propre à chaque appareil) : identifiant, changements à envoyer, dates */
  appareil?: string;
  aEnvoyer?: boolean;
  dernierEnvoi?: string;
  dernierRecu?: string;
  /** Guide du premier lancement déjà vu */
  guideVu?: boolean;
}

export interface Recus {
  fichiers: number;
  changements: number;
  erreurs: string[];
}

export const PARAMETRES_DEFAUT: Parametres = { verrouMinutes: 5, theme: "auto", discret: false, tauxActifs: false };

export const api = {
  etat: () => invoke<{ existe: boolean; ouvert: boolean; empreinte: boolean }>("etat_coffre"),
  // Empreinte (Android) : titre et bouton d'annulation de la fenêtre du système, dans la langue de l'appli
  empreinteDisponible: () => invoke<boolean>("empreinte_disponible"),
  activerEmpreinte: (titre: string, annuler: string) => invoke<void>("activer_empreinte", { titre, annuler }),
  desactiverEmpreinte: () => invoke<void>("desactiver_empreinte"),
  deverrouillerEmpreinte: (titre: string, annuler: string) => invoke<void>("deverrouiller_empreinte", { titre, annuler }),
  creer: (mdp: string) => invoke<string>("creer_coffre", { mdp }),
  deverrouiller: (mdp: string) => invoke<void>("deverrouiller", { mdp }),
  recuperer: (cle: string, nouveauMdp: string) => invoke<void>("recuperer", { cle, nouveauMdp }),
  verrouiller: () => invoke<void>("verrouiller"),
  changerMdp: (ancien: string, nouveau: string) => invoke<void>("changer_mot_de_passe", { ancien, nouveau }),
  nouvelleCle: (mdp: string) => invoke<string>("nouvelle_cle_recuperation", { mdp }),
  lireParametres: async (): Promise<Parametres> => ({
    ...PARAMETRES_DEFAUT,
    ...((await invoke<Partial<Parametres> | null>("lire_parametres")) ?? {}),
  }),
  ecrireParametres: (valeur: Parametres) => invoke<void>("ecrire_parametres", { valeur }),
  exporter: () => invoke<boolean>("exporter_sauvegarde"),
  enregistrerCle: (cle: string) => invoke<boolean>("enregistrer_cle_recuperation", { cle }),
  importer: (mdp: string) => invoke<boolean>("importer_sauvegarde", { mdp }),
  toutEffacer: () => invoke<void>("tout_effacer"),
  lireTout: () => invoke<{ id: string; collection: string; valeur: unknown }[]>("lire_tout"),
  /** valeur null = suppression */
  ecrireLot: (changements: { id: string; collection: string; valeur: unknown }[]) => invoke<void>("ecrire_lot", { changements }),
  lireReleves: () => invoke<Releve[]>("lire_releves"),
  lireRelevesChemins: (chemins: string[]) => invoke<Releve[]>("lire_releves_chemins", { chemins }),
  envoyerChangements: (appareil: string) => invoke<boolean>("envoyer_changements", { appareil }),
  recevoirChangements: () => invoke<number | null>("recevoir_changements"),
  chercherChangements: (appareil: string) => invoke<Recus>("chercher_changements", { appareil }),
};

/** Fichier de relevé lu par le moteur : tableur en lignes, PDF en base64, sinon texte. */
export interface Releve {
  nom: string;
  lignes: string[][] | null;
  texte: string | null;
  pdf: string | null;
  erreur: string | null;
}

export const estAndroid = /Android/i.test(navigator.userAgent);
