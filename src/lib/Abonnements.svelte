<script lang="ts">
  // Prélèvements réguliers : coût par mois et par an, prix en hausse, doublons et nouveaux prélèvements.
  import Aide from "./Aide.svelte";
  import { abonnements, libelleLisible } from "./categories";
  import { donnees } from "./donnees.svelte";
  import { argent, dateCourte } from "./format";
  import { t } from "./i18n.svelte";

  const auj = new Date().toISOString().slice(0, 10);
  const liste = $derived(abonnements(donnees.operations, auj));
  const devise = (id: string) => donnees.comptes.find((c) => c.id === id)?.devise ?? "EUR";
  // Total en euros (les comptes dans une autre devise sont listés mais pas additionnés)
  const totalMois = $derived(liste.filter((a) => devise(a.compteId) === "EUR").reduce((s, a) => s + a.parMois, 0));
  const alertes = $derived(liste.filter((a) => a.hausse || a.double || a.nouveau));
  let tout = $state(false);
</script>

{#if liste.length}
  <section class="carte pile">
    <h2>
      {t("Mes prélèvements réguliers")} · <span class="montant">{argent(totalMois, "EUR")}</span>{t(" par mois")} · <span class="montant">{argent(totalMois * 12, "EUR")}</span>{t(" par an")}
      <Aide texte={t("Abonnements, loyer, assurances… : les dépenses qui reviennent à date fixe, repérées dans vos relevés. Sésame signale un prix en hausse, un prélèvement en double ou un nouveau prélèvement.")} />
    </h2>
    {#if alertes.length}
      <div class="alertes">
        {#each alertes as a (a.motif + a.compteId)}
          {#if a.hausse}<p>• {t("{0} est passé de {1} à {2} (depuis le {3}).", libelleLisible(a.libelle), argent(a.hausse.avant, devise(a.compteId)), argent(a.hausse.apres, devise(a.compteId)), dateCourte(a.hausse.depuis))}</p>{/if}
          {#if a.double}<p>• {t("{0} est prélevé deux fois chaque mois : vérifiez s'il s'agit de deux abonnements.", libelleLisible(a.libelle))}</p>{/if}
          {#if a.nouveau}<p>• {t("Nouveau prélèvement : {0}, {1}.", libelleLisible(a.libelle), argent(a.dernier, devise(a.compteId)))}</p>{/if}
        {/each}
      </div>
    {/if}
    {#each tout ? liste : liste.slice(0, 8) as a (a.motif + a.compteId)}
      <div class="ligne">
        <span class="corps">
          <strong>{libelleLisible(a.libelle)}</strong>
          <span class="sous">{t(a.frequence)}{a.frequence === "chaque mois" ? t(", vers le {0}", a.jour) : ""}{a.double ? t(" · deux prélèvements") : ""}</span>
        </span>
        {#if a.hausse}<span class="pastille hausse">+{Math.round(((a.hausse.apres - a.hausse.avant) / a.hausse.avant) * 100)} %</span>{/if}
        {#if a.double}<span class="pastille double">{t("en double ?")}</span>{/if}
        {#if a.nouveau}<span class="pastille nouveau">{t("nouveau")}</span>{/if}
        <span class="montant">{argent(a.parMois, devise(a.compteId))}{t("/mois")}</span>
      </div>
    {/each}
    {#if liste.length > 8}<button class="lien gauche" onclick={() => (tout = !tout)}>{tout ? t("Réduire") : t("Tout voir ({0})", liste.length)}</button>{/if}
  </section>
{/if}

<style>
  .alertes {
    background: var(--alerte-fond);
    color: var(--alerte);
    border-radius: 12px;
    padding: 10px 14px;
    font-size: 14px;
  }
  .alertes p {
    margin: 2px 0;
  }
  .ligne {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
    border-bottom: 1px solid var(--bord);
  }
  .ligne:last-of-type {
    border-bottom: 0;
  }
  .corps {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .corps strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pastille {
    font-size: 12px;
    font-weight: 700;
    border-radius: 999px;
    padding: 2px 8px;
    white-space: nowrap;
  }
  .hausse {
    background: color-mix(in srgb, var(--danger) 14%, transparent);
    color: var(--danger);
  }
  .double {
    background: var(--alerte-fond);
    color: var(--alerte);
  }
  .nouveau {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    color: var(--accent);
  }
  .gauche {
    align-self: flex-start;
  }
</style>
