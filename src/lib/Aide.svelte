<script lang="ts">
  import { t } from "./i18n.svelte";
  // Petit « ? » qui explique d'où vient un chiffre.
  let { texte }: { texte: string } = $props();
  let ouvert = $state(false);
</script>

<button class="aide" aria-label={t("Comment c'est calculé ?")} aria-expanded={ouvert} onclick={(e) => (e.stopPropagation(), (ouvert = !ouvert))}>?</button>
{#if ouvert}<span class="bulle" role="note">{texte}</span>{/if}

<style>
  .aide {
    width: 20px;
    height: 20px;
    padding: 0;
    border-radius: 50%;
    font-size: 12px;
    font-weight: 600;
    color: var(--doux);
    background: transparent;
    border: 1px solid var(--bord);
    flex: none;
    vertical-align: middle;
    margin-left: 4px;
  }
  .bulle {
    display: block;
    font-size: 13px;
    font-weight: 400;
    color: var(--doux);
    background: var(--surface-2);
    border-radius: 12px;
    padding: 8px 12px;
    margin-top: 6px;
    line-height: 1.45;
  }
</style>
