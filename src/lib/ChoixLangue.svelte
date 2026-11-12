<script lang="ts">
  // Français / English, sur les écrans d'avant l'ouverture du coffre (verrouillage, création)
  import { changerLangue, langue, type Langue } from "./i18n.svelte";
  const LANGUES: [Langue, string][] = [
    ["fr", "FR"],
    ["en", "EN"],
  ];
</script>

<div class="langues" role="radiogroup" aria-label="Langue / Language">
  {#each LANGUES as [code, nom] (code)}
    <button role="radio" aria-checked={langue.code === code} class:on={langue.code === code} onclick={() => changerLangue(code)}>{nom}</button>
  {/each}
</div>

<style>
  .langues {
    position: fixed;
    top: max(14px, env(safe-area-inset-top));
    right: 14px;
    display: flex;
    gap: 2px;
    padding: 3px;
    border-radius: 999px;
    background: var(--surface);
  }
  button {
    padding: 5px 11px;
    font-size: 12px;
    background: none;
    color: var(--doux);
  }
  .on {
    background: var(--fond);
    color: var(--texte);
  }
</style>
