<script lang="ts">
  import { t } from "./i18n.svelte";
  // Fenêtre par-dessus la page (panneau du bas sur téléphone, boîte centrée sur PC).
  import type { Snippet } from "svelte";
  import Icone from "./Icone.svelte";

  // centre : boîte centrée aussi sur téléphone (petite fenêtre d'information plutôt que panneau du bas)
  let { titre, fermer, children, centre = false }: { titre: string; fermer: () => void; children: Snippet; centre?: boolean } = $props();

  // Bouton ou geste « retour » (Android, navigateur) : ferme la fenêtre du dessus au lieu de changer de page
  onMount(() => {
    const moi = { fermee: false, fermer: () => fermer() };
    pile.push(moi);
    history.pushState({ ...history.state, feuille: pile.length }, "");
    return () => {
      pile.splice(pile.indexOf(moi), 1);
      // Fermée autrement (croix, bouton) : on retire son entrée d'historique, sauf si une autre page a pris sa place
      if (!moi.fermee && history.state?.feuille) history.back();
    };
  });
</script>

<script lang="ts" module>
  import { onMount } from "svelte";
  const pile: { fermee: boolean; fermer: () => void }[] = [];
  if (typeof window !== "undefined")
    addEventListener("popstate", () => {
      const dessus = pile.at(-1);
      if (dessus && (history.state?.feuille ?? 0) < pile.length) {
        dessus.fermee = true;
        dessus.fermer();
      }
    });
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && fermer()} />

<div class="fond" class:centre role="presentation" onclick={(e) => e.target === e.currentTarget && fermer()}>
  <div class="feuille pile" role="dialog" aria-modal="true" aria-label={titre}>
    <div class="tete">
      <h2>{titre}</h2>
      <button class="x" aria-label={t("Fermer")} onclick={fermer}><Icone nom="fermer" taille={18} /></button>
    </div>
    {@render children()}
  </div>
</div>

<style>
  .fond {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 30;
    display: grid;
    place-items: center;
    padding: 16px;
  }
  .feuille {
    background: var(--fond);
    border-radius: 24px;
    padding: 18px 20px 22px;
    animation: monte 0.26s cubic-bezier(0.2, 0.9, 0.2, 1);
    width: min(480px, 100%);
    max-height: calc(100vh - 32px);
    overflow: auto;
  }
  .tete {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .x {
    width: 36px;
    height: 36px;
    padding: 0;
    border-radius: 50%;
    background: var(--surface);
  }
  @keyframes monte {
    from {
      transform: translateY(24px);
      opacity: 0.4;
    }
  }
  @media (max-width: 899px) {
    .fond:not(.centre) {
      place-items: end stretch;
      padding: 0;
    }
    .fond:not(.centre) .feuille {
      width: 100%;
      border-radius: 24px 24px 0 0;
      padding-bottom: calc(18px + env(safe-area-inset-bottom));
    }
  }
</style>
