<script lang="ts">
  import ChoixLangue from "./ChoixLangue.svelte";
  import { t } from "./i18n.svelte";
  // Premier lancement : explication, mot de passe maître, remise de la clé de récupération.
  import { api } from "./api";
  import ChampMotDePasse from "./ChampMotDePasse.svelte";
  import CleRecuperation from "./CleRecuperation.svelte";
  import { apresOuverture } from "./etat.svelte";
  import Icone from "./Icone.svelte";

  let etape = $state<"accueil" | "mdp" | "cle" | "restaurer">("accueil");
  let mdp = $state("");
  let valide = $state(false);
  let enCours = $state(false);
  let erreur = $state("");
  let cle = $state("");

  async function creer() {
    enCours = true;
    erreur = "";
    try {
      cle = await api.creer(mdp);
      mdp = "";
      etape = "cle";
    } catch (e) {
      erreur = String(e);
    } finally {
      enCours = false;
    }
  }

  /** Appareil neuf : reprend directement le coffre d'une sauvegarde (même mot de passe, mêmes données). */
  async function restaurer() {
    enCours = true;
    erreur = "";
    try {
      if (await api.importer(mdp)) {
        mdp = "";
        await apresOuverture();
      }
    } catch (e) {
      erreur = String(e);
    } finally {
      enCours = false;
    }
  }
</script>

<ChoixLangue />

<main class="centre">
  <div class="tete">
    <span class="logo"><Icone nom="serrure" taille={26} /></span>
    <h1>{t("Sésame")}</h1>
  </div>

  {#if etape === "accueil"}
    <div class="carte pile">
      <h2>{t("Bienvenue")}</h2>
      <p>{t("Vos données financières restent sur vos appareils, chiffrées. Aucun compte, aucun serveur.")}</p>
      <p>{t("Vous allez choisir un")} <strong>{t("mot de passe maître")}</strong>{t(". Il chiffre tout : il n'est stocké nulle part et personne ne peut le retrouver à votre place.")}</p>
      <p>{t("Vous recevrez ensuite une")} <strong>{t("clé de récupération")}</strong>{t(", à garder précieusement : c'est votre seule solution si vous oubliez le mot de passe.")}</p>
      <button class="principal" onclick={() => (etape = "mdp")}>{t("Commencer")}</button>
      <button onclick={() => (etape = "restaurer")}><Icone nom="envoyer" taille={18} />{t("J'ai déjà une sauvegarde")}</button>
    </div>
  {:else if etape === "restaurer"}
    <form class="carte pile" onsubmit={(e) => (e.preventDefault(), restaurer())}>
      <h2>{t("Reprendre une sauvegarde")}</h2>
      <p class="sous">
        {t("Copiez d'abord le fichier .portefeuille sur cet appareil (Quick Share, câble, clé USB…). Sur téléphone, il se trouve en général dans « Téléchargements ».")}
      </p>
      <label>{t("Mot de passe de la sauvegarde")}<input type="password" bind:value={mdp} autocomplete="current-password" required /></label>
      {#if erreur}<p class="erreur">{erreur}</p>{/if}
      <button class="principal" type="submit" disabled={!mdp || enCours}>{enCours ? t("Ouverture…") : t("Choisir le fichier")}</button>
      <button type="button" class="lien" onclick={() => ((etape = "accueil"), (mdp = ""), (erreur = ""))}>{t("Retour")}</button>
    </form>
  {:else if etape === "mdp"}
    <form class="carte pile" onsubmit={(e) => (e.preventDefault(), creer())}>
      <h2>{t("Votre mot de passe maître")}</h2>
      <ChampMotDePasse bind:valeur={mdp} bind:valide />
      {#if erreur}<p class="erreur">{erreur}</p>{/if}
      <button class="principal" type="submit" disabled={!valide || enCours}>
        {enCours ? t("Création du coffre chiffré…") : t("Créer mon coffre")}
      </button>
    </form>
  {:else}
    <div class="carte pile">
      <h2>{t("Votre clé de récupération")}</h2>
      <CleRecuperation {cle} termine={() => ((cle = ""), apresOuverture())} />
    </div>
  {/if}
</main>

<style>
  .centre {
    max-width: 520px;
    margin: 0 auto;
    padding: max(28px, env(safe-area-inset-top)) 16px 32px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .tete {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .logo {
    width: 44px;
    height: 44px;
    border-radius: 15px;
    background: var(--accent);
    color: var(--sur-accent);
    display: grid;
    place-items: center;
  }
</style>
