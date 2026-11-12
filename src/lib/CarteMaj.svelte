<script lang="ts">
  // Carte « Nouvelle version » en haut de l'écran : ce qui change, et un bouton qui ouvre le bon téléchargement.
  import { api } from "./api";
  import { annoncer } from "./etat.svelte";
  import { t } from "./i18n.svelte";
  import { lienPourCetAppareil, notesDansLaLangue, plusTard, type Fiche } from "./maj.svelte";

  let { fiche }: { fiche: Fiche } = $props();

  async function telecharger() {
    try {
      await api.ouvrirLien(lienPourCetAppareil(fiche));
      annoncer(t("Téléchargement ouvert dans le navigateur. Installez le fichier : vos données sont gardées."));
    } catch (e) {
      annoncer(String(e));
    }
  }
</script>

<section class="carte-maj" aria-live="polite">
  <div>
    <strong>{t("Nouvelle version {0}", fiche.version)}</strong>
    <ul>
      {#each notesDansLaLangue(fiche.notes) as n}<li>{n}</li>{/each}
    </ul>
  </div>
  <div class="actions">
    <button class="principal" onclick={telecharger}>{t("Mettre à jour")}</button>
    <button onclick={plusTard}>{t("Plus tard")}</button>
  </div>
</section>

<style>
  .carte-maj {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px 20px;
    justify-content: space-between;
    background: var(--surface);
    border: 1.5px solid var(--accent);
    border-radius: 18px;
    padding: 14px 18px;
    margin-bottom: 16px;
  }
  ul {
    margin: 6px 0 0;
    padding-left: 18px;
    color: var(--doux);
    font-size: 0.92rem;
  }
  .actions {
    display: flex;
    gap: 8px;
  }
</style>
