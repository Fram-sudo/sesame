<script lang="ts" generics="V">
  // Liste de choix maison : remplace <select>, dont Android affiche une fenêtre système carrée.
  // Un bouton montre le choix actuel ; un appui ouvre un panneau avec une ligne par option.
  import Feuille from "./Feuille.svelte";
  import { t } from "./i18n.svelte";
  import Icone from "./Icone.svelte";
  import IconeCategorie from "./IconeCategorie.svelte";

  /** cat : identifiant de catégorie, pour afficher sa pastille colorée */
  type Option = { v: V; l: string; groupe?: string; desactive?: boolean; cat?: string };
  let {
    valeur = $bindable(),
    options,
    titre,
    vide = "—",
    classe = "",
    actif = false,
    desactive = false,
    change,
  }: {
    valeur?: V;
    options: Option[];
    titre: string;
    vide?: string;
    classe?: string;
    actif?: boolean;
    desactive?: boolean;
    change?: (v: V) => void;
  } = $props();

  let ouvert = $state(false);
  // Longues listes (toutes les devises) : un champ de recherche
  let recherche = $state("");
  const sansAccents = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const filtrees = $derived(recherche ? options.filter((o) => sansAccents(o.l).includes(sansAccents(recherche))) : options);
  const choisie = $derived(options.find((o) => o.v === valeur));
  // Options rangées par groupe, dans l'ordre d'apparition
  const groupes = $derived.by(() => {
    const g: [string, Option[]][] = [];
    for (const o of filtrees) {
      const nom = o.groupe ?? "";
      const dernier = g.at(-1);
      if (dernier && dernier[0] === nom) dernier[1].push(o);
      else g.push([nom, [o]]);
    }
    return g;
  });

  function choisir(o: Option) {
    if (o.desactive) return;
    valeur = o.v;
    ouvert = false;
    recherche = "";
    change?.(o.v);
  }
</script>

<button type="button" class="declencheur {classe}" class:actif aria-haspopup="dialog" aria-label={titre} disabled={desactive} onclick={() => (ouvert = true)}>
  <span class="valeur">{choisie?.l ?? vide}</span>
  <span class="chevron"><Icone nom="retour" taille={16} /></span>
</button>

{#if ouvert}
  <Feuille {titre} fermer={() => (ouvert = false)}>
    {#if options.length > 15}<input type="search" class="recherche" bind:value={recherche} placeholder={t("Rechercher")} aria-label={t("Rechercher")} />{/if}
    <div class="liste" role="listbox" aria-label={titre}>
      {#each groupes as [nom, liste], k (k)}
        {#if nom}<p class="groupe">{nom}</p>{/if}
        {#each liste as o, i (i)}
          <button type="button" role="option" aria-selected={o.v === valeur} class:on={o.v === valeur} disabled={o.desactive} onclick={() => choisir(o)}>
            <span class="libelle">{#if o.cat}<IconeCategorie id={o.cat} taille={28} />{/if}{o.l}</span>
            {#if o.v === valeur}<Icone nom="coche" taille={20} />{/if}
          </button>
        {/each}
      {/each}
    </div>
  </Feuille>
{/if}

<style>
  .recherche {
    margin-bottom: 4px;
  }
  .declencheur {
    width: 100%;
    justify-content: space-between;
    gap: 8px;
    padding: 12px 14px;
    border-radius: 14px;
    background: var(--surface);
    font-weight: 600;
    text-align: left;
    color: var(--texte);
  }
  :global(.carte) .declencheur,
  :global(.feuille) .declencheur {
    background: var(--fond);
  }
  .valeur {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chevron {
    display: flex;
    color: var(--pale);
    transform: rotate(-90deg);
    flex: none;
  }
  /* Variante pastille (filtres de la page Opérations) */
  .declencheur.pastille {
    width: auto;
    flex: none;
    padding: 7px 10px 7px 14px;
    border-radius: 999px;
    font-size: 14px;
    max-width: 70vw;
  }
  .declencheur.pastille.actif {
    background: var(--accent);
    color: var(--sur-accent);
  }
  .declencheur.pastille.actif .chevron {
    color: inherit;
  }
  .liste {
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border-radius: 18px;
    overflow: hidden;
    max-height: 60vh;
    overflow-y: auto;
  }
  .liste button {
    justify-content: space-between;
    gap: 12px;
    background: none;
    border-radius: 0;
    padding: 13px 16px;
    text-align: left;
    font-weight: 600;
    border-bottom: 1px solid var(--bord);
  }
  .liste button:last-child {
    border-bottom: none;
  }
  .liste button.on {
    background: var(--accent-fond);
    color: var(--accent-texte);
  }
  .libelle {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .groupe {
    padding: 12px 16px 4px;
    font-size: 12px;
    font-weight: 800;
    color: var(--doux);
  }
</style>
