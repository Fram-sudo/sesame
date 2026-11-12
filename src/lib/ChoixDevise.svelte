<script lang="ts">
  import { t } from "./i18n.svelte";
  // « en euros ▾ » : choisir la devise dans laquelle tous les montants s'affichent, là où on les lit.
  // Dollars seulement quand leurs taux sont connus (Paramètres → Devises).
  import { DEVISES } from "./donnees.svelte";
  import { app, deviseAffichee, sauverParametres } from "./etat.svelte";
  import { tauxConnus } from "./taux";

  const NOMS: Record<string, [string, string]> = {
    EUR: ["euros", t("Euro (€)")],
    XOF: [t("francs CFA"), t("Franc CFA (F CFA)")],
    USD: [t("dollars US"), t("Dollar américain ($ US)")],
    CAD: [t("dollars canadiens"), t("Dollar canadien ($ CA)")],
  };
  let ouvert = $state(false);
  const connus = $derived(tauxConnus(app.params.taux));
  const actuelle = $derived(deviseAffichee());

  function choisir(d: string) {
    app.params.devise = d;
    ouvert = false;
    void sauverParametres();
  }
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && (ouvert = false)} />

<span class="choix">
  <button class="declencheur" aria-haspopup="menu" aria-expanded={ouvert} onclick={() => (ouvert = !ouvert)}>
    {t("en")} {NOMS[actuelle][0]}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
  </button>
  {#if ouvert}
    <button class="voile" aria-label={t("Fermer")} onclick={() => (ouvert = false)}></button>
    <span class="menu" role="menu">
      <span class="titre">{t("Afficher tous les montants en")}</span>
      {#each DEVISES as d (d)}
        <button role="menuitemradio" aria-checked={actuelle === d} class:on={actuelle === d} disabled={!connus[d]} onclick={() => choisir(d)}>
          {NOMS[d][1]}
          {#if !connus[d]}<small>{t("taux de change à activer")}</small>{/if}
        </button>
      {/each}
      {#if !connus.USD}
        <button class="lien" onclick={() => ((ouvert = false), (app.page = "parametres"))}>{t("Activer les taux de change")}</button>
      {/if}
    </span>
  {/if}
</span>

<style>
  .choix {
    position: relative;
    display: inline-block;
  }
  .declencheur {
    padding: 2px 8px 2px 10px;
    font-size: inherit;
    font-weight: 700;
    color: var(--accent);
    background: var(--accent-fond);
    gap: 2px;
  }
  .declencheur svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.4;
  }
  .voile {
    position: fixed;
    inset: 0;
    z-index: 20;
    background: transparent;
    border-radius: 0;
    cursor: default;
  }
  .menu {
    position: absolute;
    top: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 21;
    min-width: 250px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px;
    border-radius: 18px;
    background: var(--fond);
    border: 1px solid var(--bord);
    box-shadow: 0 12px 32px rgba(10, 12, 20, 0.18);
    text-align: left;
  }
  .titre {
    font-size: 12px;
    font-weight: 700;
    color: var(--doux);
    padding: 6px 10px 4px;
  }
  .menu button {
    flex-direction: column;
    align-items: flex-start;
    gap: 0;
    text-align: left;
    background: none;
    border-radius: 12px;
    padding: 10px 12px;
    font-size: 15px;
    font-weight: 600;
    color: var(--texte);
  }
  .menu button.on {
    background: var(--accent-fond);
    color: var(--accent-texte);
    font-weight: 800;
  }
  .menu small {
    font-size: 12px;
    color: var(--doux);
    font-weight: 600;
  }
  .menu .lien {
    color: var(--accent);
    justify-content: flex-start;
  }
  @media (min-width: 900px) {
    .menu {
      left: 0;
      transform: none;
    }
  }
</style>
