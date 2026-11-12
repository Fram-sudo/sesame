<script lang="ts">
  import { t } from "./i18n.svelte";
  // Pastilles de catégories (dépenses ou revenus selon le sens de l'opération), avec leur icône,
  // les plus utilisées en premier.
  import { donnees, ecrire, nouvelId } from "./donnees.svelte";
  import IconeCategorie from "./IconeCategorie.svelte";

  let {
    valeur = $bindable(""),
    sens,
    avecVirement = true,
  }: { valeur?: string; sens: "depense" | "revenu"; avecVirement?: boolean } = $props();

  const usages = $derived.by(() => {
    const n = new Map<string, number>();
    for (const o of donnees.operations) if (o.categorieId) n.set(o.categorieId, (n.get(o.categorieId) ?? 0) + 1);
    return n;
  });
  // Créer une catégorie sans quitter l'opération : elle est aussitôt choisie
  let creation = $state(false);
  let nom = $state("");
  const COULEURS = ["#F59E0B", "#6366F1", "#EC4899", "#0EA5E9", "#84CC16", "#14B8A6", "#F97316", "#C026D3", "#06B6D4", "#F43F5E"];
  async function creer(e: Event) {
    e.preventDefault();
    const n = nom.trim();
    if (!n) return;
    const id = nouvelId();
    await ecrire([{ collection: "categories", id, valeur: { id, nom: n, type: sens, couleur: COULEURS[donnees.categories.length % COULEURS.length] } }]);
    valeur = id;
    nom = "";
    creation = false;
  }
  const liste = $derived(
    donnees.categories
      .filter((c) => c.type === sens || (avecVirement && c.type === "virement"))
      .sort((a, b) => (a.type === "virement" ? 1 : 0) - (b.type === "virement" ? 1 : 0) || (usages.get(b.id) ?? 0) - (usages.get(a.id) ?? 0)),
  );
</script>

<div class="pastilles" role="radiogroup" aria-label={t("Catégorie")}>
  {#each liste as c (c.id)}
    <button type="button" role="radio" aria-checked={valeur === c.id} class:actif={valeur === c.id} onclick={() => (valeur = valeur === c.id ? "" : c.id)}>
      <IconeCategorie id={c.id} taille={24} />{c.nom}
    </button>
  {/each}
  <button type="button" role="radio" aria-checked={!valeur} class:actif={!valeur} onclick={() => (valeur = "")}>{t("Sans catégorie")}</button>
  {#if creation}
    <span class="nouvelle">
      <!-- svelte-ignore a11y_autofocus -->
      <input bind:value={nom} placeholder={t("Nom de la catégorie")} aria-label={t("Nom de la nouvelle catégorie")} autofocus onkeydown={(e) => e.key === "Enter" && creer(e)} />
      <button type="button" class="ok" onclick={creer} disabled={!nom.trim()}>{t("Créer")}</button>
    </span>
  {:else}
    <button type="button" class="ajout" onclick={() => (creation = true)}>{t("+ Nouvelle catégorie")}</button>
  {/if}
</div>

<style>
  .pastilles {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  button {
    padding: 4px 12px 4px 4px;
    font-size: 13px;
    gap: 7px;
  }
  button[aria-checked]:not(:has(:global(.icone))) {
    padding-left: 12px;
  }
  .ajout {
    padding-left: 12px;
    background: none;
    border: 1.5px dashed var(--bord);
    color: var(--accent);
  }
  .nouvelle {
    display: flex;
    gap: 6px;
    width: 100%;
  }
  .nouvelle input {
    flex: 1;
    padding: 8px 12px;
    border-radius: 999px;
    font-size: 14px;
  }
  .ok {
    padding-left: 14px !important;
    background: var(--accent);
    color: var(--sur-accent);
  }
  .actif {
    background: var(--accent-fond);
    color: var(--accent-texte);
    border-color: var(--accent);
  }
</style>
