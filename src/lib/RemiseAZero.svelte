<script lang="ts">
  import { t } from "./i18n.svelte";
  // Remise à zéro : efface toutes les opérations (et l'historique des imports) des comptes choisis,
  // poches comprises, pour réimporter proprement. Les comptes peuvent être gardés ou supprimés.
  import { classerEtLier, donnees, ecrire, supprimer, supprimerCompte, type Changement } from "./donnees.svelte";
  import { annoncer } from "./etat.svelte";
  import Feuille from "./Feuille.svelte";

  let { fermer }: { fermer: () => void } = $props();

  const principaux = $derived(donnees.comptes.filter((c) => !c.parentId));
  let choisis = $state<string[]>([]);
  let aussiComptes = $state(false);
  let confirmer = $state(false);
  let enCours = $state(false);

  // Comptes touchés : ceux cochés et leurs poches
  const touches = $derived(new Set(donnees.comptes.filter((c) => choisis.includes(c.id) || (c.parentId && choisis.includes(c.parentId))).map((c) => c.id)));
  const nbOps = $derived(donnees.operations.filter((o) => touches.has(o.compteId)).length);
  const nbOpsDe = (id: string) => donnees.operations.filter((o) => o.compteId === id || donnees.comptes.find((c) => c.id === o.compteId)?.parentId === id).length;

  async function effacer() {
    enCours = true;
    try {
      if (aussiComptes) {
        for (const c of donnees.comptes.filter((x) => choisis.includes(x.id))) await supprimerCompte(c);
      } else {
        const ch: Changement[] = [
          ...supprimer("operations", donnees.operations.filter((o) => touches.has(o.compteId))),
          ...supprimer("imports", donnees.imports.filter((i) => touches.has(i.compteId))),
          // Solde de départ remis à 0 : le prochain import repart de zéro
          ...donnees.comptes.filter((c) => touches.has(c.id)).map((c) => ({ collection: "comptes", id: c.id, valeur: { ...c, soldeInitial: 0 } }) as Changement),
        ];
        await ecrire(ch);
        await classerEtLier();
      }
      annoncer(t("{0} opération{1} effacée{2}.", nbOps, nbOps > 1 ? "s" : "", nbOps > 1 ? "s" : ""));
      fermer();
    } finally {
      enCours = false;
    }
  }
</script>

<Feuille titre={t("Remettre des comptes à zéro")} {fermer}>
  <p class="sous">{t("Efface toutes les opérations des comptes choisis (poches comprises) et l'historique de leurs imports. Pratique pour tout réimporter proprement.")}</p>
  {#each principaux as c (c.id)}
    <label class="case">
      <input type="checkbox" value={c.id} bind:group={choisis} onchange={() => (confirmer = false)} />
      <span>{c.nom}<span class="sous"> · {c.banque || "—"} · {nbOpsDe(c.id)} {t("opération")}{nbOpsDe(c.id) > 1 ? "s" : ""}</span></span>
    </label>
  {:else}
    <p>{t("Aucun compte.")}</p>
  {/each}
  <label class="case option">
    <input type="checkbox" bind:checked={aussiComptes} />
    <span>{t("Supprimer aussi ces comptes")}<br /><span class="sous">{t("Sinon, les comptes et leurs réglages d'import sont gardés, vides, avec un solde de départ à 0.")}</span></span>
  </label>
  {#if !confirmer}
    <button class="danger" disabled={!choisis.length} onclick={() => (confirmer = true)}>{t("Effacer…")}</button>
  {:else}
    <p class="erreur">{nbOps} {t("opération")}{nbOps > 1 ? "s" : ""} {t("vont être effacée")}{nbOps > 1 ? "s" : ""}{aussiComptes ? t(", avec les comptes") : ""}{t(". C'est définitif, sauf si vous avez une sauvegarde.")}</p>
    <div class="ligne">
      <button onclick={() => (confirmer = false)}>{t("Annuler")}</button>
      <button class="danger" disabled={enCours} onclick={effacer}>{t("Oui, effacer")}</button>
    </div>
  {/if}
</Feuille>

<style>
  .case {
    flex-direction: row;
    align-items: flex-start;
    gap: 10px;
    color: var(--texte);
    font-size: 15px;
  }
  .case input {
    width: 18px;
    height: 18px;
    flex: none;
    margin-top: 3px;
    accent-color: var(--accent);
  }
  .option {
    border-top: 1px solid var(--bord);
    padding-top: 12px;
  }
  .ligne {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
</style>
