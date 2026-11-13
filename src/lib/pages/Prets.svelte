<script lang="ts">
  import { t, locale } from "../i18n.svelte";
  // Prêts : capital restant dû, prochaine échéance, échéancier, poche de remboursement, remboursement anticipé.
  import Aide from "../Aide.svelte";
  import { donnees, ecrire, soldes } from "../donnees.svelte";
  import { annoncer } from "../etat.svelte";
  import Feuille from "../Feuille.svelte";
  import { argent, dateCourte } from "../format";
  import Icone from "../Icone.svelte";
  import { lireMontant } from "../import/analyse";
  import PretFormulaire from "../PretFormulaire.svelte";
  import { echeancier, resume, simulerAnticipe, type Anticipe, type Pret } from "../prets";

  const auj = new Date().toISOString().slice(0, 10);
  const parCompte = $derived(soldes());
  const lignes = $derived(donnees.prets.map((p) => ({ p, r: resume(p, auj) })));
  const totalDu = $derived(lignes.reduce((s, l) => s + l.r.restantDu, 0));
  const totalMensuel = $derived(lignes.filter((l) => l.r.nbRestantes).reduce((s, l) => s + l.r.aPayer, 0));

  let formulaire = $state<Pret | "nouveau" | null>(null);
  let echeancierOuvert = $state("");
  let aSupprimer = $state("");

  // Remboursement anticipé : simulation puis enregistrement
  let anticipe = $state<Pret | null>(null);
  let montant = $state("");
  let date = $state(auj);
  let mode = $state<Anticipe["mode"]>("duree");
  const simulation = $derived(anticipe && lireMontant(montant) ? simulerAnticipe(anticipe, { date, montant: Math.abs(lireMontant(montant)!), mode }) : undefined);

  async function enregistrerAnticipe() {
    if (!anticipe || !lireMontant(montant)) return;
    const a: Anticipe = { date, montant: Math.abs(lireMontant(montant)!), mode };
    await ecrire([{ collection: "prets", id: anticipe.id, valeur: { ...anticipe, anticipes: [...(anticipe.anticipes ?? []), a] } }]);
    annoncer(t("Remboursement anticipé enregistré : l'échéancier est recalculé."));
    anticipe = null;
  }

  async function retirerAnticipe(p: Pret, i: number) {
    await ecrire([{ collection: "prets", id: p.id, valeur: { ...p, anticipes: (p.anticipes ?? []).filter((_, k) => k !== i) } }]);
  }

  async function supprimer(p: Pret) {
    await ecrire([{ collection: "prets", id: p.id, valeur: null }]);
    aSupprimer = "";
    annoncer(t("Prêt supprimé."));
  }
</script>

<div class="pile">
  <div class="carte resume" data-visite="prets">
    <div>
      <p class="sous">{t("Capital restant dû")}<Aide texte={t("Somme de vos prêts, d'après leur échéancier : chaque échéance dont la date est passée est considérée comme payée. Les remboursements anticipés enregistrés sont déduits.")} /></p>
      <p class="montant enorme">{argent(totalDu, "EUR")}</p>
      {#if totalMensuel}<p class="sous"><span class="montant">{argent(totalMensuel, "EUR")}</span> {t("de mensualités par mois")}</p>{/if}
    </div>
    <button class="principal" onclick={() => (formulaire = "nouveau")}><Icone nom="plus" taille={18} />{t("Nouveau prêt")}</button>
  </div>

  {#each lignes as { p, r } (p.id)}
    {@const poche = p.pocheId ? donnees.comptes.find((c) => c.id === p.pocheId) : undefined}
    {@const dansPoche = poche ? (parCompte.get(poche.id) ?? 0) : 0}
    <section class="carte pile">
      <div class="tete">
        <div>
          <h2>{p.nom}</h2>
          <p class="sous">{p.organisme ? `${p.organisme} · ` : ""}{argent(p.capital, "EUR")} {t("à")} {p.taux.toLocaleString(locale())} {t("% sur")} {p.duree} {t("mois")}</p>
        </div>
        <div class="droite">
          <p class="montant fort">{argent(r.restantDu, "EUR")}</p>
          <p class="sous">{t("restant dû")}</p>
        </div>
      </div>

      <div class="jauge"><span style:width="{Math.min(100, r.avancement * 100)}%"></span></div>
      <p class="sous">{Math.round(r.avancement * 100)} {t("% du capital remboursé")}</p>

      {#if r.prochaine}
        <div class="infos">
          <div><p class="sous">{t("Prochaine échéance")}</p><p><strong class="montant">{argent(r.aPayer, "EUR")}</strong> {t("le")} {dateCourte(r.prochaine.date)}</p></div>
          <div><p class="sous">{t("Fin prévue")}</p><p>{dateCourte(r.fin)} · {r.nbRestantes} {t("échéance")}{r.nbRestantes > 1 ? "s" : ""}</p></div>
          <div><p class="sous">{t("Intérêts")}</p><p>{t("payés")} <span class="montant">{argent(r.interetsPayes, "EUR")}</span> {t("· restants")} <span class="montant">{argent(r.interetsRestants, "EUR")}</span></p></div>
        </div>
        {#if poche}
          <p class={dansPoche >= r.aPayer ? "ok" : "info"}>
            {t("Mis de côté dans «")} {poche.nom} » : <strong class="montant">{argent(dansPoche, poche.devise)}</strong> ·
            {dansPoche >= r.aPayer ? t("la prochaine échéance est couverte ✓") : t("il manque {0} pour la prochaine échéance", argent(r.aPayer - dansPoche, poche.devise))}
          </p>
        {/if}
      {:else}
        <p class="ok">{t("✓ Prêt entièrement remboursé.")}</p>
      {/if}

      {#if p.anticipes?.length}
        <div class="anticipes">
          <p class="sous">{t("Remboursements anticipés")}</p>
          {#each p.anticipes as a, i (i)}
            <div class="ligne"><span>{dateCourte(a.date)} · <span class="montant">{argent(a.montant, "EUR")}</span> · {a.mode === "duree" ? t("durée réduite") : t("mensualité réduite")}</span><button class="lien" onclick={() => retirerAnticipe(p, i)}>{t("Retirer")}</button></div>
          {/each}
        </div>
      {/if}

      <div class="actions">
        <button onclick={() => (echeancierOuvert = echeancierOuvert === p.id ? "" : p.id)}>{echeancierOuvert === p.id ? t("Masquer l'échéancier") : t("Échéancier")}</button>
        {#if r.prochaine}<button onclick={() => ((anticipe = p), (montant = ""), (date = auj), (mode = "duree"))}>{t("Remboursement anticipé")}</button>{/if}
        <button onclick={() => (formulaire = p)}>{t("Modifier")}</button>
        {#if aSupprimer === p.id}
          <button class="danger" onclick={() => supprimer(p)}>{t("Confirmer la suppression")}</button>
          <button class="lien" onclick={() => (aSupprimer = "")}>{t("Garder")}</button>
        {:else}
          <button class="lien rouge" onclick={() => (aSupprimer = p.id)}>{t("Supprimer")}</button>
        {/if}
      </div>

      {#if echeancierOuvert === p.id}
        <div class="tableau">
          <table>
            <thead><tr><th>{t("N°")}</th><th>{t("Date")}</th><th>{t("Échéance")}</th><th>{t("Intérêts")}</th><th>{t("Capital")}</th><th>{t("Restant dû")}</th></tr></thead>
            <tbody>
              {#each echeancier(p) as e (e.n)}
                <tr class:passee={e.date <= auj}>
                  <td>{e.n}</td>
                  <td>{dateCourte(e.date)}</td>
                  <td class="montant">{argent(e.montant + e.assurance, "EUR")}{#if e.anticipe}<span class="badge">+ {argent(e.anticipe, "EUR")} {t("anticipé")}</span>{/if}</td>
                  <td class="montant">{argent(e.interets, "EUR")}</td>
                  <td class="montant">{argent(e.capital, "EUR")}</td>
                  <td class="montant">{argent(e.restant, "EUR")}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>
  {:else}
    <div class="carte pile vide">
      <h2>{t("Aucun prêt pour l'instant")}</h2>
      <p class="sous">{t("Ajoutez un prêt avec son montant, son taux et sa durée : l'appli calcule les échéances, le capital restant dû et l'effet d'un remboursement anticipé.")}</p>
    </div>
  {/each}
</div>

{#if formulaire}<PretFormulaire pret={formulaire === "nouveau" ? undefined : formulaire} fermer={() => (formulaire = null)} />{/if}

{#if anticipe}
  <Feuille titre={t("Remboursement anticipé · {0}", anticipe.nom)} fermer={() => (anticipe = null)}>
    <div class="deux">
      <!-- svelte-ignore a11y_autofocus -->
      <label>{t("Montant (€)")}<input inputmode="decimal" bind:value={montant} placeholder={t("ex. 1000")} autofocus /></label>
      <label>{t("Date")}<input type="date" bind:value={date} /></label>
    </div>
    <div class="mode" role="radiogroup" aria-label={t("Effet du remboursement")}>
      <button role="radio" aria-checked={mode === "duree"} class:actif={mode === "duree"} onclick={() => (mode = "duree")}>{t("Finir plus tôt")}</button>
      <button role="radio" aria-checked={mode === "mensualite"} class:actif={mode === "mensualite"} onclick={() => (mode = "mensualite")}>{t("Baisser la mensualité")}</button>
    </div>
    {#if simulation}
      <div class="apercu">
        <p>{t("Intérêts économisés :")} <strong class="montant">{argent(simulation.economie, "EUR")}</strong></p>
        {#if mode === "duree"}
          <p class="sous">{t("Fin du prêt :")} {dateCourte(simulation.finApres)} {t("au lieu du")} {dateCourte(simulation.finAvant)} ({simulation.moisGagnes} {t("mois de moins)")}</p>
        {:else}
          <p class="sous">{t("Nouvelle mensualité :")} <span class="montant">{argent(simulation.mensualiteApres, "EUR")}</span> {t("(hors assurance), même date de fin")}</p>
        {/if}
        <p class="sous">{t("Votre banque peut appliquer des frais de remboursement anticipé (souvent plafonnés) : ils ne sont pas comptés ici.")}</p>
      </div>
    {/if}
    <button class="principal" disabled={!simulation} onclick={enregistrerAnticipe}>{t("Enregistrer ce remboursement")}</button>
    <p class="sous">{t("Ou fermez simplement : rien n'est enregistré tant que vous ne validez pas.")}</p>
  </Feuille>
{/if}

<style>
  .resume {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
  }
  .enorme {
    font-size: 30px;
    font-weight: 600;
  }
  .tete {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
  .droite {
    text-align: right;
  }
  .fort {
    font-size: 22px;
    font-weight: 600;
  }
  .jauge {
    height: 10px;
    border-radius: 999px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .jauge > span {
    display: block;
    height: 100%;
    border-radius: 999px;
    background: var(--serie-revenus);
  }
  .infos {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 12px;
    font-size: 14px;
  }
  .ok {
    background: var(--ok-fond);
    color: var(--ok);
    border-radius: 14px;
    padding: 10px 14px;
    font-size: 14px;
  }
  .anticipes .ligne {
    display: flex;
    justify-content: space-between;
    font-size: 14px;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .actions button {
    padding: 8px 14px;
    font-size: 14px;
  }
  .rouge {
    color: var(--danger);
  }
  .tableau {
    overflow: auto;
    max-height: 360px;
    border: 1px solid var(--bord);
    border-radius: 14px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  th,
  td {
    padding: 6px 10px;
    text-align: right;
    border-bottom: 1px solid var(--bord);
    white-space: nowrap;
  }
  th:first-child,
  td:first-child,
  th:nth-child(2),
  td:nth-child(2) {
    text-align: left;
  }
  thead th {
    position: sticky;
    top: 0;
    background: var(--surface-2);
  }
  .passee {
    color: var(--pale);
  }
  .badge {
    font-size: 11px;
    background: var(--accent-fond);
    color: var(--accent-texte);
    border-radius: 999px;
    padding: 1px 6px;
    margin-left: 6px;
  }
  .vide {
    text-align: center;
    padding: 32px 20px;
  }
  .deux {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .mode {
    display: flex;
    gap: 4px;
    background: var(--surface-2);
    padding: 4px;
    border-radius: 999px;
  }
  .mode button {
    flex: 1;
    border: none;
    background: transparent;
    padding: 8px;
  }
  .mode .actif {
    background: var(--surface);
    font-weight: 600;
  }
  .apercu {
    background: var(--surface-2);
    border-radius: 14px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
</style>
