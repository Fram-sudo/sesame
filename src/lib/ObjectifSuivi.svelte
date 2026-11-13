<script lang="ts">
  // Avancement d'un objectif d'épargne : jauge, trait « où vous devriez en être », effort par mois et avance ou retard.
  import type { Compte } from "./donnees.svelte";
  import { argent, dateCourte } from "./format";
  import { t } from "./i18n.svelte";
  import { suiviObjectif } from "./stats";

  let { compte, solde, objectif, couleur = "var(--serie-epargne)" }: { compte: Compte; solde: number; objectif: number; couleur?: string } = $props();
  const auj = new Date().toISOString().slice(0, 10);
  const suivi = $derived(compte.objectifDate ? suiviObjectif(objectif, compte.objectifDate, compte.objectifDepuis ?? auj, compte.objectifDepart ?? solde, solde, auj) : undefined);
  const pct = (v: number) => Math.min(100, Math.max(0, (v / objectif) * 100));
</script>

<span class="jauge">
  <span style:width="{pct(solde)}%" style:background={couleur}></span>
  {#if suivi && !suivi.atteint && !suivi.depasse}<i style:left="{pct(suivi.attendu)}%" title={t("Où vous devriez en être aujourd'hui")}></i>{/if}
</span>
<span class="sous">
  {Math.round((solde / objectif) * 100)} {t("% de")} <span class="montant">{argent(objectif, compte.devise)}</span>
  {#if suivi}
    {t("pour le {0}", dateCourte(compte.objectifDate!))}
    {#if suivi.atteint}· <strong class="ok">{t("objectif atteint")}</strong>
    {:else if suivi.depasse}· <strong class="retard">{t("date dépassée, reste {0}", argent(objectif - solde, compte.devise))}</strong>
    {:else}
      · <span class="montant">{argent(suivi.parMois, compte.devise)}</span>{t("/mois pendant {0} mois", suivi.moisRestants)}
      {#if Math.abs(suivi.ecart) < 100}· {t("dans les temps")}{:else if suivi.ecart > 0}· <strong class="ok">{t("en avance de {0}", argent(suivi.ecart, compte.devise))}</strong>{:else}· <strong class="retard">{t("{0} de retard", argent(-suivi.ecart, compte.devise))}</strong>{/if}
    {/if}
  {:else}
    {t("· reste")} <span class="montant">{argent(Math.max(0, objectif - solde), compte.devise)}</span>
  {/if}
</span>

<style>
  .jauge {
    position: relative;
    display: block;
    height: 6px;
    border-radius: 3px;
    background: var(--fond);
  }
  .jauge > span {
    display: block;
    height: 100%;
    border-radius: 3px;
  }
  .jauge i {
    position: absolute;
    top: -4px;
    width: 2px;
    height: 14px;
    background: var(--texte);
    border-radius: 1px;
  }
  .ok {
    color: var(--ok);
  }
  .retard {
    color: var(--alerte);
  }
</style>
