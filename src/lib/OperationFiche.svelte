<script lang="ts">
  import Choix from "./Choix.svelte";
  import { t } from "./i18n.svelte";
  // Détail d'une opération : catégorie (avec apprentissage), note, virement, modification si saisie à la main.
  import { libelleLisible, motif } from "./categories";
  import BudgetEditeur from "./BudgetEditeur.svelte";
  import ChoixCategorie from "./ChoixCategorie.svelte";
  import { classerEtLier, donnees, ecrire, nouvelId, type Changement, type Operation } from "./donnees.svelte";
  import { annoncer } from "./etat.svelte";
  import Feuille from "./Feuille.svelte";
  import { argent, dateLongue } from "./format";
  import { lireMontant, normaliser } from "./import/analyse";
  import { cleOp } from "./import/doublons";

  let { op, fermer }: { op: Operation; fermer: () => void } = $props();

  const compte = $derived(donnees.comptes.find((c) => c.id === op.compteId));
  const initiale = op.categorieId ?? "";
  let categorieId = $state(initiale);
  let note = $state(op.note ?? "");
  let libelle = $state(op.libelle);
  let montant = $state(String(Math.abs(op.montant) / 100).replace(".", ","));
  let date = $state(op.date);
  let retenir = $state(true);
  let appliquer = $state(true);
  let motifSaisi = $state(motif(op.libelle));
  let confirmer = $state(false);
  let budgetOuvert = $state(false);
  const budget = $derived(categorieId ? donnees.budgets.find((x) => x.id === categorieId) : undefined);
  const categorieDepense = $derived(donnees.categories.find((c) => c.id === categorieId)?.type === "depense");
  let compteChoisi = $state(op.compteId);
  // Comptes possibles : même devise, sauf celui de l'autre moitié d'un virement
  const memeDevise = $derived(donnees.comptes.filter((c) => c.devise === compte?.devise && c.id !== partenaire?.compteId));

  const change = $derived(categorieId !== initiale);
  const m = $derived(normaliser(motifSaisi));
  const similaires = $derived(
    m ? donnees.operations.filter((o) => o.id !== op.id && !o.categorieManuelle && !o.virementId && ` ${normaliser(o.libelle)} `.includes(` ${m} `) && o.categorieId !== categorieId) : [],
  );
  const partenaire = $derived(op.virementId ? donnees.operations.find((o) => o.virementId === op.virementId && o.id !== op.id) : undefined);

  async function enregistrer() {
    const ch: Changement[] = [];
    const nb = change && categorieId && appliquer ? similaires.length : 0;
    const v: Operation = { ...op, note: note.trim() || undefined, compteId: compteChoisi };
    if (change) Object.assign(v, { categorieId: categorieId || undefined, categorieManuelle: true });
    if (op.manuelle) {
      const cts = lireMontant(montant);
      if (cts === null) return annoncer(t("Montant illisible."));
      Object.assign(v, { libelle: libelle.trim() || op.libelle, montant: Math.sign(op.montant || -1) * Math.abs(cts), date });
      v.cle = cleOp(v);
    }
    ch.push({ collection: "operations", id: op.id, valeur: v });
    if (change && categorieId && m) {
      if (retenir) {
        const existante = donnees.regles.find((r) => r.motif === m);
        const id = existante?.id ?? nouvelId();
        ch.push({ collection: "regles", id, valeur: { id, motif: m, categorieId, appris: true } });
      }
      if (appliquer) for (const o of similaires) ch.push({ collection: "operations", id: o.id, valeur: { ...o, categorieId } });
    }
    await ecrire(ch);
    annoncer(nb ? t("Classé, ainsi que {0} opération{1} semblable{2}.", nb, nb > 1 ? "s" : "", nb > 1 ? "s" : "") : t("Enregistré."));
    fermer();
  }

  async function pasUnVirement() {
    const paire = [op, partenaire].filter((o): o is Operation => !!o);
    await ecrire(
      paire.map((o) => {
        const { virementId: _, ...reste } = o;
        return { collection: "operations", id: o.id, valeur: { ...reste, pasVirement: true, categorieId: o.categorieManuelle ? o.categorieId : undefined } };
      }),
    );
    await classerEtLier();
    annoncer(t("Association retirée."));
    fermer();
  }

  // Plus « en attente » ; on garde la trace pour que la ligne définitive du prochain relevé la remplace
  async function marquerEffectuee() {
    const { enAttente: _, ...reste } = op;
    await ecrire([{ collection: "operations", id: op.id, valeur: { ...reste, etaitEnAttente: true } }]);
    annoncer(t("Opération marquée comme effectuée."));
    fermer();
  }

  async function supprimerOp() {
    const paire = [op, partenaire].filter((o): o is Operation => !!(o?.manuelle || o?.enAttente));
    await ecrire(paire.map((o) => ({ collection: "operations", id: o.id, valeur: null })));
    annoncer(paire.length > 1 ? t("Virement supprimé (sur les deux comptes).") : t("Opération supprimée."));
    fermer();
  }
</script>

<Feuille titre={op.manuelle ? t("Opération saisie") : t("Opération")} {fermer}>
  {#if op.manuelle}
    <label>{t("Libellé")}<input bind:value={libelle} /></label>
    <div class="deux">
      <label>{t("Montant (")}{op.montant < 0 ? "sortie" : t("entrée")})<input inputmode="decimal" bind:value={montant} /></label>
      <label>{t("Date")}<input type="date" bind:value={date} /></label>
    </div>
  {:else}
    <div>
      <p class="fort">{libelleLisible(op.libelle)}</p>
      {#if libelleLisible(op.libelle) !== op.libelle}<p class="sous">{op.libelle}</p>{/if}
      {#if op.detail}<p class="sous">{op.detail}</p>{/if}
      <p class="sous">{dateLongue(op.date)} · {compte?.nom}</p>
    </div>
    <p class="montant grand" class:positif={op.montant > 0}>{argent(op.montant, compte?.devise ?? "EUR", true)}</p>
  {/if}

  {#if partenaire}
    {@const autre = donnees.comptes.find((c) => c.id === partenaire.compteId)}
    <div class="virement">
      <p>{t("Virement")} {op.montant < 0 ? "vers" : "depuis"} <strong>{autre?.nom}</strong> {t(": il n'est compté ni en dépense ni en revenu.")}</p>
      {#if !op.manuelle}<button class="lien" onclick={pasUnVirement}>{t("Ce n'est pas un virement entre mes comptes")}</button>{/if}
    </div>
  {:else}
    <h3>{t("Catégorie")}</h3>
    <ChoixCategorie bind:valeur={categorieId} sens={op.montant > 0 ? "revenu" : "depense"} />
    {#if change && categorieId && !op.manuelle}
      <div class="apprendre pile">
        <label>{t("Mots qui reconnaissent cette opération")}<input bind:value={motifSaisi} /></label>
        <label class="case"><input type="checkbox" bind:checked={retenir} />{t("Classer ainsi les prochaines opérations qui contiennent ces mots")}</label>
        {#if similaires.length}
          <label class="case"><input type="checkbox" bind:checked={appliquer} />{similaires.length > 1 ? t("Classer aussi les {0} opérations semblables déjà là", similaires.length) : t("Classer aussi l'opération semblable déjà là")}</label>
        {/if}
      </div>
    {/if}
  {/if}

  {#if categorieDepense}
    <button class="lien gauche" onclick={() => (budgetOuvert = true)}>
      {budget ? t("Budget de cette catégorie : {0} par {1} · Modifier", argent(budget.montant, "EUR"), budget.frequence === "annee" ? "an" : "mois") : t("Fixer un budget pour cette catégorie")}
    </button>
  {/if}
  <label>{t("Note")}<input bind:value={note} placeholder={t("facultatif")} /></label>
  {#if memeDevise.length > 1}
    <label>{t("Compte")}
      <Choix bind:valeur={compteChoisi} titre={t("Compte")} options={memeDevise.map((c) => ({ v: c.id, l: c.nom }))} />
    </label>
  {/if}
  <button class="principal" onclick={enregistrer}>{t("Enregistrer")}</button>

  {#if op.enAttente}
    <p class="info">{t("En attente : déjà déduite de votre argent disponible, comme chez votre banque. Elle sera remplacée par l'opération définitive au prochain import. Si elle a été annulée par la banque, supprimez-la.")}</p>
    <button onclick={marquerEffectuee}>{t("Marquer comme effectuée")}</button>
  {/if}
  {#if op.manuelle || op.enAttente}
    {#if confirmer}
      <div class="ligne">
        <button onclick={() => (confirmer = false)}>{t("Garder")}</button>
        <button class="danger" onclick={supprimerOp}>{t("Supprimer")}</button>
      </div>
    {:else}
      <button class="lien rouge" onclick={() => (confirmer = true)}>{t("Supprimer cette opération")}</button>
    {/if}
  {:else}
    <p class="sous">{t("Opération importée : pour la retirer, annulez son import (page Importer).")}</p>
  {/if}
</Feuille>

{#if budgetOuvert && categorieId}<BudgetEditeur id={categorieId} fermer={() => (budgetOuvert = false)} />{/if}

<style>
  h3 {
    font-size: 15px;
  }
  .fort {
    font-weight: 600;
  }
  .grand {
    font-size: 26px;
    font-weight: 600;
  }
  .positif {
    color: var(--ok);
  }
  .deux {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .virement,
  .apprendre {
    background: var(--surface-2);
    border-radius: 14px;
    padding: 12px 14px;
    font-size: 14px;
  }
  .virement .lien {
    padding: 6px 0 0;
  }
  .case {
    flex-direction: row;
    align-items: flex-start;
    gap: 10px;
    color: var(--texte);
  }
  .case input {
    width: 18px;
    height: 18px;
    flex: none;
    margin-top: 2px;
    accent-color: var(--accent);
  }
  .ligne {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
  .gauche {
    align-self: flex-start;
    font-size: 14px;
  }
  .rouge {
    color: var(--danger);
    align-self: flex-start;
  }
</style>
