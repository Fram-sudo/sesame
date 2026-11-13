<script lang="ts">
  // À classer : les opérations sans catégorie, regroupées par commerçant, les plus gros montants d'abord.
  // « Classer » range tout le groupe et retient la règle (les prochaines opérations seront classées toutes seules).
  import Aide from "../Aide.svelte";
  import { groupesAClasser, libelleLisible, VIREMENT } from "../categories";
  import ChoixCategorie from "../ChoixCategorie.svelte";
  import { donnees, ecrire, nouvelId, type Changement, type Operation } from "../donnees.svelte";
  import { annoncer, app, deviseAffichee } from "../etat.svelte";
  import { tauxConnus } from "../taux";
  import Feuille from "../Feuille.svelte";
  import { argent, dateCourte } from "../format";
  import { t } from "../i18n.svelte";
  import IconeCategorie from "../IconeCategorie.svelte";

  let ignores = $state<string[]>([]);
  let limite = $state(30);
  let autre = $state<{ motif: string; sens: "depense" | "revenu"; valeur: string } | null>(null);
  const taux = $derived(tauxConnus(app.params.taux, app.params.tauxManuels));
  const devise = $derived(deviseAffichee());
  const deviseDe = (id: string) => donnees.comptes.find((c) => c.id === id)?.devise ?? "EUR";
  // Montants convertis dans la devise d'affichage pour comparer les commerçants ; sans taux connu, ils comptent peu
  const convertir = (m: number, d: string) => (taux[d] && taux[devise] ? Math.round((m * taux[devise]) / taux[d]) : 0);
  const groupes = $derived(groupesAClasser(donnees.operations, deviseDe, convertir).filter((g) => !ignores.includes(g.motif + g.devise)));
  const categorie = (id?: string) => (id ? donnees.categories.find((c) => c.id === id) : undefined);
  // Part des dépenses déjà classées (en montant), toutes dates
  const progression = $derived.by(() => {
    let tout = 0, classe = 0;
    for (const o of donnees.operations) {
      if (o.montant >= 0 || o.virementId || o.categorieId === VIREMENT) continue;
      tout -= o.montant;
      if (o.categorieId) classe -= o.montant;
    }
    return tout ? classe / tout : 1;
  });
  const reste = $derived(groupes.reduce((s, g) => s + g.poids, 0));
  const dix = $derived(reste ? groupes.slice(0, 10).reduce((s, g) => s + g.poids, 0) / reste : 0);

  async function classer(cle: string, categorieId: string) {
    const g = groupes.find((x) => x.motif + x.devise === cle);
    const motif = g?.motif ?? "";
    if (!g || !categorieId) return;
    const ch: Changement[] = g.ops.map((o) => ({ collection: "operations", id: o.id, valeur: { ...(o as Operation), categorieId, categorieManuelle: true } }));
    const existante = donnees.regles.find((r) => r.motif === motif);
    const id = existante?.id ?? nouvelId();
    ch.push({ collection: "regles", id, valeur: { id, motif, categorieId, appris: true } });
    await ecrire(ch);
    annoncer(t("{0} opération(s) classée(s) dans « {1} ». Les prochaines le seront toutes seules.", g.ops.length, categorie(categorieId)?.nom ?? ""));
  }
</script>

<div class="pile">
  <div class="duo">
    <section class="carte pile">
      <h2>{t("À classer")} · {t("{0} opération(s)", groupes.reduce((s, g) => s + g.ops.length, 0))} · <span class="montant">{argent(reste, devise)}</span>
        <Aide texte={t("Les opérations sans catégorie, regroupées par commerçant, les plus gros montants d'abord. « Classer » range tout le groupe et crée une règle : les prochaines opérations de ce commerçant seront classées toutes seules.")} /></h2>
      {#each groupes.slice(0, limite) as g (g.motif + g.devise)}
        {@const p = categorie(g.propose)}
        <div class="groupe">
          <span class="corps">
            <strong>{libelleLisible(g.libelle)}</strong>
            <span class="sous">{t("{0} opération(s)", g.ops.length)} · <span class="montant">{argent(g.total, g.devise, true)}</span> · {t("dernière le {0}", dateCourte(g.derniere))}</span>
          </span>
          <span class="choix">
            {#if p}
              <button class="principal" onclick={() => classer(g.motif + g.devise, p.id)}><IconeCategorie id={p.id} taille={22} />{p.nom}</button>
            {/if}
            <button onclick={() => (autre = { motif: g.motif + g.devise, sens: g.total > 0 ? "revenu" : "depense", valeur: "" })}>{p ? t("Autre…") : t("Choisir…")}</button>
            <button class="lien" onclick={() => (ignores = [...ignores, g.motif + g.devise])}>{t("Ignorer")}</button>
          </span>
        </div>
      {:else}
        <p class="sous">{t("Tout est classé. Bravo !")}</p>
      {/each}
      {#if groupes.length > limite}<button onclick={() => (limite += 30)}>{t("Afficher plus ({0} restants)", groupes.length - limite)}</button>{/if}
    </section>

    <section class="carte pile progression">
      <h2>{t("Votre progression")}</h2>
      <p class="montant chiffre">{Math.round(progression * 100)} %</p>
      <div class="jauge"><span style:width="{Math.round(progression * 100)}%"></span></div>
      <p class="sous">{t("des dépenses déjà classées (en montant)")}</p>
      {#if groupes.length > 10}<p class="sous">{t("Les 10 premiers commerçants représentent {0} % de ce qui reste à classer : quelques appuis suffisent pour y voir clair.", Math.round(dix * 100))}</p>{/if}
      <button class="lien gauche" onclick={() => ((app.filtreCategorie = "aucune"), (app.page = "operations"))}>{t("Voir ces opérations une par une")}</button>
    </section>
  </div>
</div>

{#if autre}
  <Feuille titre={t("Classer « {0} »", libelleLisible(groupes.find((g) => g.motif + g.devise === autre!.motif)?.libelle ?? ""))} fermer={() => (autre = null)}>
    <ChoixCategorie bind:valeur={autre.valeur} sens={autre.sens} />
    <button class="principal" disabled={!autre.valeur} onclick={async () => (await classer(autre!.motif, autre!.valeur), (autre = null))}>{t("Classer tout le groupe")}</button>
  </Feuille>
{/if}

<style>
  .duo {
    display: grid;
    gap: 14px;
    align-items: start;
  }
  @media (min-width: 1100px) {
    .duo {
      grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    }
  }
  .groupe {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    padding: 10px 0;
    border-bottom: 1px solid var(--bord);
  }
  .groupe:last-of-type {
    border-bottom: 0;
  }
  .corps {
    flex: 1 1 220px;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .corps strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .choix {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }
  .choix .principal {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .chiffre {
    font-size: 30px;
    font-weight: 800;
  }
  .jauge {
    height: 8px;
    border-radius: 4px;
    background: var(--fond);
    overflow: hidden;
  }
  .jauge span {
    display: block;
    height: 100%;
    background: var(--ok);
    border-radius: 4px;
  }
  .gauche {
    align-self: flex-start;
  }
</style>
