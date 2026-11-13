<script lang="ts">
  // Toutes les opérations en attente, tous comptes confondus : les marquer effectuées une à une ou d'un coup.
  import { donnees, ecrire, type Changement, type Operation } from "./donnees.svelte";
  import { annoncer } from "./etat.svelte";
  import Feuille from "./Feuille.svelte";
  import { argent, dateCourte } from "./format";
  import { t } from "./i18n.svelte";
  import IconeCategorie from "./IconeCategorie.svelte";
  import { libelleLisible } from "./categories";
  import OperationFiche from "./OperationFiche.svelte";

  let { fermer }: { fermer: () => void } = $props();
  const liste = $derived(donnees.operations.filter((o) => o.enAttente).sort((a, b) => b.date.localeCompare(a.date)));
  const comptes = $derived(new Map(donnees.comptes.map((c) => [c.id, c])));
  let fiche = $state<Operation | null>(null);

  // Plus « en attente » ; la trace reste pour que la ligne définitive du prochain relevé la remplace
  const effectuee = (o: Operation): Changement => {
    const { enAttente: _, ...reste } = o;
    return { collection: "operations", id: o.id, valeur: { ...reste, etaitEnAttente: true } };
  };
  async function marquer(ops: Operation[]) {
    await ecrire(ops.map(effectuee));
    annoncer(ops.length > 1 ? t("{0} opérations marquées comme effectuées.", ops.length) : t("Opération marquée comme effectuée."));
    if (!liste.length) fermer();
  }
</script>

<Feuille titre={t("Opérations en attente")} {fermer}>
  <p class="sous">{t("Déjà déduites de votre argent disponible, comme chez votre banque. Marquez-les effectuées quand elles passent pour de bon ; le prochain relevé importé les remplacera sans doublon.")}</p>
  <ul class="liste">
    {#each liste as o (o.id)}
      {@const c = comptes.get(o.compteId)}
      <li>
        <button class="op" onclick={() => (fiche = o)}>
          <IconeCategorie id={o.categorieId} taille={36} />
          <span class="texte">
            <span class="libelle">{libelleLisible(o.libelle)}</span>
            <span class="sous">{dateCourte(o.date)}{c ? ` · ${c.nom}` : ""}</span>
          </span>
          <span class="montant" class:plus={o.montant > 0}>{argent(o.montant, c?.devise ?? "EUR", true)}</span>
        </button>
        <button class="effectuee" onclick={() => marquer([o])}>{t("Effectuée")}</button>
      </li>
    {/each}
  </ul>
  {#if liste.length > 1}
    <button class="principal" onclick={() => marquer(liste)}>{t("Tout marquer comme effectué")}</button>
  {/if}
</Feuille>

{#if fiche}<OperationFiche op={fiche} fermer={() => (fiche = null)} />{/if}

<style>
  .liste {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  li {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--surface);
    border-radius: 14px;
    padding: 4px 6px 4px 4px;
  }
  .op {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    background: none;
    border: 0;
    padding: 6px;
    font: inherit;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }
  .texte {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .libelle {
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .montant {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .montant.plus {
    color: var(--ok);
  }
  .effectuee {
    padding: 7px 12px;
    font-size: 13px;
    flex: none;
  }
</style>
