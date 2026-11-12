<script lang="ts">
  import { t } from "./i18n.svelte";
  // Saisie d'un nouveau mot de passe, avec confirmation et jauge de robustesse.
  import { evaluer } from "./robustesse";

  let { valeur = $bindable(""), valide = $bindable(false), libelle = t("Mot de passe maître") }: {
    valeur?: string;
    valide?: boolean;
    libelle?: string;
  } = $props();

  let confirmation = $state("");
  const r = $derived(evaluer(valeur));
  const NIVEAUX = [t("Faible"), t("Moyen"), t("Bon"), t("Excellent")];
  const COULEURS = ["var(--danger)", "var(--orange)", "var(--accent)", "var(--ok)"];

  $effect(() => {
    valide = r.suffisant && valeur === confirmation;
  });
</script>

<div class="pile">
  <label>{libelle}<input type="password" bind:value={valeur} autocomplete="new-password" required /></label>
  {#if valeur}
    <div class="jauge" aria-live="polite">
      <div class="barres">
        {#each [0, 1, 2, 3] as i (i)}
          <span style:background={i <= r.niveau ? COULEURS[r.niveau] : "var(--surface-2)"}></span>
        {/each}
      </div>
      <span class="sous">{t("Robustesse :")} {NIVEAUX[r.niveau]}{r.suffisant ? "" : t(" · pas encore suffisant")}</span>
    </div>
  {/if}
  <p class="sous">
    {t("Astuce : une phrase de 4 ou 5 mots sans lien entre eux (« vélo rouge sous la pluie ») est à la fois solide et facile à retenir.")}
  </p>
  <label>{t("Confirmer le mot de passe")}<input type="password" bind:value={confirmation} autocomplete="new-password" required /></label>
  {#if confirmation && confirmation !== valeur}<p class="sous" style:color="var(--danger)">{t("Les deux saisies sont différentes.")}</p>{/if}
</div>

<style>
  .jauge {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .barres {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }
  .barres span {
    height: 6px;
    border-radius: 999px;
  }
</style>
