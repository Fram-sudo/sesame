<script lang="ts">
  import { t } from "./i18n.svelte";
  // Répartition en anneau (maquette validée v6) : une part par catégorie, 2 px d'écart entre les parts,
  // total au centre ; survol d'une part ou d'une ligne de légende = son montant au centre.
  import { argent } from "./format";
  import IconeCategorie from "./IconeCategorie.svelte";

  let {
    parts,
    devise = "EUR",
    taille = 132,
    choisir,
  }: { parts: { id: string; nom: string; couleur: string; v: number }[]; devise?: string; taille?: number; choisir?: (id: string) => void } = $props();
  const choisissable = (id: string) => !!choisir && !["aucune", "autres"].includes(id);

  const R = 38;
  const C = 2 * Math.PI * R;
  const total = $derived(parts.reduce((a, p) => a + p.v, 0));
  const segments = $derived.by(() => {
    let decalage = 0;
    return parts.map((p) => {
      const l = total ? (p.v / total) * C : 0;
      const s = { ...p, l, decalage };
      decalage += l;
      return s;
    });
  });
  let survol = $state(-1);
  const montantCentre = $derived(argent(Math.round((survol >= 0 ? segments[survol].v : total) / 100) * 100, devise).replace(/[.,]00(?!\d)/, ""));
</script>

<div class="anneau">
  <svg viewBox="0 0 100 100" width={taille} height={taille} role="img" aria-label={t("Répartition des dépenses par catégorie")}>
    {#each segments as s, i (s.id)}
      <circle
        r={R}
        cx="50"
        cy="50"
        fill="none"
        stroke={s.couleur}
        stroke-width={survol === i ? 15 : 13}
        stroke-dasharray="{Math.max(0, s.l - 2)} {C - Math.max(0, s.l - 2)}"
        stroke-dashoffset={-s.decalage}
        transform="rotate(-90 50 50)"
        onpointerenter={() => (survol = i)}
        onpointerleave={() => (survol = -1)}
        role="presentation"
      />
    {/each}
    <!-- Deux lignes bien séparées ; un long montant s'écrit plus petit pour rester dans l'anneau -->
    <text x="50" y="44" text-anchor="middle" class="petit">{survol >= 0 ? segments[survol].nom.slice(0, 14) : t("total")}</text>
    <text x="50" y="60" text-anchor="middle" class="fort montant" class:long={montantCentre.length > 8}>{montantCentre}</text>
  </svg>
  <div class="legende">
    {#each segments as s, i (s.id)}
      <button
        class="ligne"
        disabled={!choisissable(s.id)}
        title={choisissable(s.id) ? t("Fixer ou modifier le budget de cette catégorie") : undefined}
        onpointerenter={() => (survol = i)}
        onpointerleave={() => (survol = -1)}
        onclick={() => choisir?.(s.id)}
        class:active={survol === i}
      >
        <IconeCategorie id={s.id} taille={26} />
        <span class="nom">{s.nom}</span>
        <span class="montant">{argent(s.v, devise)}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .anneau {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  svg {
    flex: none;
  }
  circle {
    transition: stroke-width 0.15s;
  }
  .petit {
    font-size: 8px;
    fill: var(--doux);
  }
  .fort {
    font-size: 11px;
    font-weight: 600;
    fill: var(--texte);
  }
  .legende {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .ligne {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    border-radius: 10px;
    border: none;
    background: none;
    padding: 2px 4px;
    color: inherit;
    text-align: left;
    width: 100%;
  }
  .ligne:disabled {
    opacity: 1;
    cursor: default;
  }
  .ligne:not(:disabled):hover {
    background: var(--surface-2);
  }
  .ligne.active .nom {
    font-weight: 600;
  }
  .nom {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .montant {
    color: var(--doux);
    font-variant-numeric: tabular-nums;
  }
  @media (max-width: 480px) {
    .anneau {
      flex-direction: column;
      align-items: stretch;
    }
    svg {
      align-self: center;
    }
  }
  .fort.long {
    font-size: 9px;
  }
</style>
