<script lang="ts">
  import { t } from "./i18n.svelte";
  // Barre d'onglets du téléphone : quatre entrées, l'onglet actif en bleu. « Plus » ouvre le reste de l'appli.
  import { app, type Page } from "./etat.svelte";
  import Icone from "./Icone.svelte";

  const ONGLETS: [Page, "accueil" | "operations" | "budgets" | "menu", string][] = [
    ["accueil", "accueil", t("Accueil")],
    ["operations", "operations", t("Opérations")],
    ["budgets", "budgets", t("Budgets")],
    ["plus", "menu", t("Plus")],
  ];
  // Les pages rangées derrière « Plus » allument son onglet
  const actif = (p: Page) => app.page === p || (p === "plus" && !["accueil", "operations", "budgets"].includes(app.page));
</script>

<nav class="onglets" aria-label={t("Navigation principale")}>
  {#each ONGLETS as [p, i, l] (p)}
    <button class="onglet" class:on={actif(p)} aria-current={app.page === p ? "page" : undefined} onclick={() => (app.page = p)}>
      <Icone nom={i} taille={22} />{l}
    </button>
  {/each}
</nav>

<style>
  .onglets {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 10;
    display: flex;
    justify-content: space-around;
    padding: 8px 6px calc(8px + env(safe-area-inset-bottom));
    background: color-mix(in srgb, var(--fond) 94%, transparent);
    backdrop-filter: blur(12px);
    border-top: 1px solid var(--bord);
  }
  .onglet {
    flex: 1;
    flex-direction: column;
    gap: 3px;
    padding: 4px 0;
    border-radius: 12px;
    background: none;
    font-size: 11px;
    font-weight: 700;
    color: var(--pale);
  }
  .onglet.on {
    color: var(--accent);
  }
</style>
