<script lang="ts">
  import ChoixLangue from "./ChoixLangue.svelte";
  import { t } from "./i18n.svelte";
  // Écran verrouillé : mot de passe, ou clé de récupération si oublié.
  import { api, estAndroid } from "./api";
  import { onMount } from "svelte";
  import ChampMotDePasse from "./ChampMotDePasse.svelte";
  import { apresOuverture } from "./etat.svelte";
  import Icone from "./Icone.svelte";

  let mode = $state<"mdp" | "recup">("mdp");
  let mdp = $state("");
  let cle = $state("");
  let nouveau = $state("");
  let valide = $state(false);
  let enCours = $state(false);
  let erreur = $state("");

  // Empreinte activée sur ce téléphone : la fenêtre d'empreinte s'ouvre d'elle-même
  let empreinte = $state(false);
  const parEmpreinte = () => agir(() => api.deverrouillerEmpreinte(t("Ouvrir Sésame"), t("Utiliser le mot de passe")));
  onMount(async () => {
    if (!estAndroid) return;
    empreinte = (await api.etat()).empreinte;
    if (empreinte) parEmpreinte();
  });

  async function agir(f: () => Promise<void>) {
    enCours = true;
    erreur = "";
    try {
      await f();
      mdp = cle = nouveau = "";
      await apresOuverture();
    } catch (e) {
      erreur = String(e);
    } finally {
      enCours = false;
    }
  }
</script>

<ChoixLangue />

<main class="centre">
  <span class="logo"><Icone nom="cadenas" taille={28} /></span>
  {#if mode === "mdp"}
    <form class="carte pile" onsubmit={(e) => (e.preventDefault(), agir(() => api.deverrouiller(mdp)))}>
      <h2>{t("Sésame est verrouillé")}</h2>
      <p class="sous">{t("Vos données sont chiffrées sur cet appareil.")}</p>
      <!-- svelte-ignore a11y_autofocus -->
      <input type="password" bind:value={mdp} placeholder={t("Mot de passe maître")} autocomplete="current-password" autofocus required />
      {#if erreur}<p class="erreur">{erreur}</p>{/if}
      <button class="principal" type="submit" disabled={!mdp || enCours}>{enCours ? t("Ouverture…") : t("Déverrouiller")}</button>
      {#if empreinte}<button type="button" onclick={parEmpreinte} disabled={enCours}><Icone nom="empreinte" taille={20} />{t("Ouvrir avec l'empreinte")}</button>{/if}
      <button type="button" class="lien" onclick={() => ((mode = "recup"), (erreur = ""))}>{t("Mot de passe oublié ?")}</button>
    </form>
  {:else}
    <form class="carte pile" onsubmit={(e) => (e.preventDefault(), agir(() => api.recuperer(cle, nouveau)))}>
      <h2>{t("Utiliser la clé de récupération")}</h2>
      <label>{t("Clé de récupération (13 groupes de 4 caractères)")}
        <input bind:value={cle} autocomplete="off" autocapitalize="characters" spellcheck="false" required />
      </label>
      <ChampMotDePasse bind:valeur={nouveau} bind:valide libelle={t("Nouveau mot de passe maître")} />
      {#if erreur}<p class="erreur">{erreur}</p>{/if}
      <button class="principal" type="submit" disabled={!cle || !valide || enCours}>
        {enCours ? t("Ouverture…") : t("Rouvrir et changer le mot de passe")}
      </button>
      <button type="button" class="lien" onclick={() => ((mode = "mdp"), (erreur = ""))}>{t("Retour")}</button>
    </form>
  {/if}
</main>

<style>
  .centre {
    max-width: 440px;
    margin: 0 auto;
    padding: max(48px, env(safe-area-inset-top)) 16px 32px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }
  .centre form {
    width: 100%;
  }
  .logo {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: var(--accent-fond);
    color: var(--accent-texte);
    display: grid;
    place-items: center;
  }
</style>
