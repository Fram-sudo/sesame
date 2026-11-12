<script lang="ts">
  import Choix from "./Choix.svelte";
  import { t } from "./i18n.svelte";
  // Création ou modification d'un prêt ; la mensualité et le coût se calculent en direct.
  import { donnees, ecrire, nouvelId } from "./donnees.svelte";
  import { annoncer } from "./etat.svelte";
  import Feuille from "./Feuille.svelte";
  import { argent, dateCourte } from "./format";
  import { lireMontant } from "./import/analyse";
  import { ajouterMois, mensualite, resume, type Pret } from "./prets";

  let { pret, fermer }: { pret?: Pret; fermer: () => void } = $props();

  const enEuros = (c?: number) => (c ? String(c / 100).replace(".", ",") : "");
  /* svelte-ignore state_referenced_locally */
  let nom = $state(pret?.nom ?? "");
  /* svelte-ignore state_referenced_locally */
  let organisme = $state(pret?.organisme ?? "");
  /* svelte-ignore state_referenced_locally */
  let capital = $state(enEuros(pret?.capital));
  /* svelte-ignore state_referenced_locally */
  let taux = $state(pret ? String(pret.taux).replace(".", ",") : "");
  /* svelte-ignore state_referenced_locally */
  let duree = $state(pret ? String(pret.duree) : "");
  /* svelte-ignore state_referenced_locally */
  let premiere = $state(pret?.premiere ?? ajouterMois(new Date().toISOString().slice(0, 10), 1));
  /* svelte-ignore state_referenced_locally */
  let assurance = $state(enEuros(pret?.assurance));
  /* svelte-ignore state_referenced_locally */
  let pocheId = $state(pret?.pocheId ?? "");

  const epargnes = $derived(donnees.comptes.filter((c) => c.parentId || c.type === "epargne"));
  const valeurs = $derived({
    capital: Math.abs(lireMontant(capital) ?? 0),
    taux: Math.max(0, parseFloat(taux.replace(",", ".")) || 0),
    duree: Math.max(0, Math.round(parseFloat(duree.replace(",", ".")) || 0)),
    assurance: Math.abs(lireMontant(assurance) ?? 0),
  });
  const valide = $derived(!!nom.trim() && valeurs.capital > 0 && valeurs.duree > 0 && !!premiere);
  const apercu = $derived(valide ? resume({ id: "", nom, ...valeurs, premiere }, "0000-01-01") : undefined);

  async function enregistrer(e: SubmitEvent) {
    e.preventDefault();
    if (!valide) return;
    const id = pret?.id ?? nouvelId();
    const p: Pret = {
      ...pret,
      id,
      nom: nom.trim(),
      organisme: organisme.trim() || undefined,
      ...valeurs,
      assurance: valeurs.assurance || undefined,
      premiere,
      pocheId: pocheId || undefined,
    };
    await ecrire([{ collection: "prets", id, valeur: p }]);
    annoncer(pret ? t("Prêt modifié.") : t("Prêt ajouté."));
    fermer();
  }
</script>

<Feuille titre={pret ? t("Modifier · {0}", pret.nom) : t("Nouveau prêt")} {fermer}>
  <form class="pile" onsubmit={enregistrer}>
    <div class="deux">
      <label>{t("Nom")}<input bind:value={nom} placeholder={t("ex. Prêt étudiant")} required /></label>
      <label>{t("Organisme")}<input bind:value={organisme} placeholder={t("ex. Société Générale")} /></label>
    </div>
    <div class="deux">
      <label>{t("Montant emprunté (€)")}<input inputmode="decimal" bind:value={capital} placeholder={t("ex. 5000")} required /></label>
      <label>{t("Taux annuel (%)")}<input inputmode="decimal" bind:value={taux} placeholder={t("ex. 1,5")} /></label>
    </div>
    <div class="deux">
      <label>{t("Durée (en mois)")}<input inputmode="numeric" bind:value={duree} placeholder={t("ex. 60 (5 ans)")} required /></label>
      <label>{t("1re échéance")}<input type="date" bind:value={premiere} required /></label>
    </div>
    <label>{t("Assurance par mois (€, facultatif)")}<input inputmode="decimal" bind:value={assurance} placeholder="0" /></label>
    {#if epargnes.length}
      <label>{t("Poche où vous mettez la mensualité de côté (facultatif)")}
        <Choix bind:valeur={pocheId} titre={t("Poche")} options={[{ v: "", l: t("Aucune") }, ...epargnes.map((c) => ({ v: c.id, l: c.nom }))]} />
      </label>
    {/if}

    {#if apercu}
      <div class="apercu">
        <p>{t("Mensualité :")} <strong class="montant">{argent(apercu.aPayer, "EUR")}</strong>{#if valeurs.assurance} <span class="sous">{t("(dont assurance")} <span class="montant">{argent(valeurs.assurance, "EUR")}</span>)</span>{/if}</p>
        <p class="sous">{t("Coût total du crédit :")} <span class="montant">{argent(apercu.coutTotal, "EUR")}</span> {t("· dernière échéance le")} {dateCourte(apercu.fin)}</p>
        <p class="sous">{t("Vérifiez avec votre tableau d'amortissement : s'il diffère de quelques centimes, c'est l'arrondi de la banque.")}</p>
      </div>
    {/if}
    <button class="principal" type="submit" disabled={!valide}>{pret ? t("Enregistrer") : t("Ajouter le prêt")}</button>
  </form>
</Feuille>

<style>
  .deux {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .apercu {
    background: var(--surface-2);
    border-radius: 14px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  @media (max-width: 480px) {
    .deux {
      grid-template-columns: 1fr;
    }
  }
</style>
