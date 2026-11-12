<script lang="ts">
  import Choix from "./Choix.svelte";
  import { t } from "./i18n.svelte";
  // Déplace des opérations vers un autre compte (ex. poches Revolut), et peut en faire une règle pour les prochains imports.
  import { router } from "./categories";
  import { classerEtLier, donnees, ecrire, nouvelId, type Changement, type Operation } from "./donnees.svelte";
  import { annoncer } from "./etat.svelte";
  import Feuille from "./Feuille.svelte";
  import { normaliser } from "./import/analyse";

  let { ops, recherche = "", fermer }: { ops: Operation[]; recherche?: string; fermer: () => void } = $props();

  const sources = $derived([...new Set(ops.map((o) => o.compteId))]);
  const devise = $derived(donnees.comptes.find((c) => c.id === sources[0])?.devise);
  const cibles = $derived(donnees.comptes.filter((c) => c.devise === devise && !(sources.length === 1 && c.id === sources[0])));
  let cible = $state("");
  let regle = $state(true);
  let memeMontant = $state(false);
  const motif = $derived(normaliser(recherche));
  const peutRegle = $derived(!!motif && sources.length === 1);
  // Avec la condition « même montant », seules les opérations qui la remplissent sont déplacées (comme aux imports)
  const aDeplacer = $derived.by(() => {
    if (!(peutRegle && regle && memeMontant && cible)) return ops;
    const copies = ops.map((o) => ({ ...o }));
    const autres = donnees.operations.filter((o) => !ops.some((x) => x.id === o.id));
    router(copies, [{ id: "", motif, source: sources[0], cible, memeMontant: true }], autres);
    return ops.filter((_, i) => copies[i].compteId === cible);
  });
  const devisesMelangees = $derived(new Set(ops.map((o) => donnees.comptes.find((c) => c.id === o.compteId)?.devise)).size > 1);

  async function deplacer() {
    const ch: Changement[] = aDeplacer.map((o) => ({ collection: "operations", id: o.id, valeur: { ...o, compteId: cible } }));
    if (peutRegle && regle) {
      const id = nouvelId();
      ch.push({ collection: "routages", id, valeur: { id, motif, source: sources[0], cible, ...(memeMontant ? { memeMontant: true } : {}) } });
    }
    await ecrire(ch);
    await classerEtLier();
    const nom = donnees.comptes.find((c) => c.id === cible)?.nom;
    const n = aDeplacer.length;
    annoncer(t("{0} opération{1} déplacée{2} vers « {3} ».", n, n > 1 ? "s" : "", n > 1 ? "s" : "", nom));
    fermer();
  }
</script>

<Feuille titre={t("Déplacer vers un autre compte")} {fermer}>
  {#if devisesMelangees}
    <p class="info">{t("Ces opérations sont dans des devises différentes : filtrez d'abord sur un seul compte.")}</p>
  {:else if cibles.length === 0}
    <p class="info">{t("Aucun autre compte en")} {devise}{t(". Créez d'abord le compte de destination (accueil, « + Ajouter »).")}</p>
  {:else}
    <p>{ops.length} {t("opération")}{ops.length > 1 ? "s" : ""} {t("à déplacer.")}</p>
    <label>{t("Vers le compte")}
      <Choix bind:valeur={cible} titre={t("Vers le compte")} vide={t("Choisir…")} options={cibles.map((c) => ({ v: c.id, l: c.nom }))} />
    </label>
    {#if peutRegle}
      <div class="regle pile">
        <label class="case"><input type="checkbox" bind:checked={regle} />{t("Faire de même automatiquement aux prochains imports (libellé contenant «")} {motif} »)</label>
        {#if regle}
          <label class="case"><input type="checkbox" bind:checked={memeMontant} />{t("Seulement si le montant est égal à un versement reçu par ce compte dans les 60 jours (utile pour les retraits d'une poche)")}</label>
        {/if}
      </div>
    {/if}
    <button class="principal" disabled={!cible || !aDeplacer.length} onclick={deplacer}>
      {t("Déplacer")} {aDeplacer.length} {t("opération")}{aDeplacer.length > 1 ? "s" : ""}
    </button>
  {/if}
</Feuille>

<style>
  .regle {
    background: var(--surface-2);
    border-radius: 14px;
    padding: 12px 14px;
  }
  .case {
    flex-direction: row;
    align-items: flex-start;
    gap: 10px;
    color: var(--texte);
    font-size: 14px;
  }
  .case input {
    width: 18px;
    height: 18px;
    flex: none;
    margin-top: 2px;
    accent-color: var(--accent);
  }
</style>
