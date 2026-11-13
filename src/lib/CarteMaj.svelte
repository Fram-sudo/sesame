<script lang="ts">
  // Nouvelle version : un bandeau discret en haut de l'écran ; les nouveautés s'ouvrent dans une petite fenêtre au centre.
  import { api } from "./api";
  import { annoncer } from "./etat.svelte";
  import Feuille from "./Feuille.svelte";
  import { locale, t } from "./i18n.svelte";
  import { lienPourCetAppareil, notesDansLaLangue, plusTard, type Fiche } from "./maj.svelte";

  let { fiche }: { fiche: Fiche } = $props();
  let details = $state(false);

  async function telecharger() {
    try {
      await api.ouvrirLien(lienPourCetAppareil(fiche));
      annoncer(t("Téléchargement ouvert dans le navigateur. Installez le fichier : vos données sont gardées."));
    } catch (e) {
      annoncer(String(e));
    }
  }
</script>

<div class="bandeau" role="status">
  <button class="nom" onclick={() => (details = true)} aria-haspopup="dialog">
    <span class="point" aria-hidden="true"></span>
    <span>{t("Nouvelle version {0}", fiche.version)}</span>
    <span class="voir">{t("Voir les nouveautés")}</span>
  </button>
  <span class="actions">
    <button class="lien" onclick={plusTard}>{t("Plus tard")}</button>
    <button class="principal" onclick={telecharger}>{t("Mettre à jour")}</button>
  </span>
</div>

{#if details}
  <Feuille centre titre={t("Nouvelle version {0}", fiche.version)} fermer={() => (details = false)}>
    <p class="sous">{t("Publiée le {0}", new Date(fiche.date + "T12:00:00").toLocaleDateString(locale(), { day: "numeric", month: "long", year: "numeric" }))}</p>
    <ul class="notes">
      {#each notesDansLaLangue(fiche.notes) as n}<li>{n}</li>{/each}
    </ul>
    <p class="sous">{t("La mise à jour s'installe par-dessus : vos données sont gardées.")}</p>
    <div class="boutons">
      <button onclick={() => ((details = false), plusTard())}>{t("Plus tard")}</button>
      <button class="principal" onclick={telecharger}>{t("Mettre à jour")}</button>
    </div>
  </Feuille>
{/if}

<style>
  .bandeau {
    display: flex;
    align-items: center;
    gap: 6px 12px;
    flex-wrap: wrap;
    background: var(--surface);
    border-radius: 14px;
    padding: 6px 6px 6px 12px;
    margin-bottom: 12px;
    font-size: 14px;
  }
  .nom {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: none;
    border: 0;
    padding: 4px 0;
    font: inherit;
    font-weight: 700;
    color: var(--texte);
    cursor: pointer;
    min-width: 0;
  }
  .point {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
    flex: none;
  }
  .voir {
    font-weight: 600;
    color: var(--accent-texte);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
  }
  .actions button {
    padding: 7px 14px;
    font-size: 14px;
  }
  /* Téléphone : une seule ligne ; le nom de la version, souligné, ouvre les nouveautés */
  @media (max-width: 600px) {
    .bandeau {
      flex-wrap: nowrap;
      padding-left: 10px;
    }
    .voir {
      display: none;
    }
    .nom {
      flex: 1;
    }
    .nom span:not(.point) {
      text-decoration: underline dotted;
      text-underline-offset: 3px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .actions button {
      padding: 6px 10px;
      font-size: 13px;
    }
  }
  .notes {
    margin: 0;
    padding-left: 20px;
    display: grid;
    gap: 6px;
    line-height: 1.45;
  }
  .boutons {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
</style>
