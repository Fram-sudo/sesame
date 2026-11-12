<script lang="ts">
  import Choix from "../Choix.svelte";
  import { t } from "../i18n.svelte";
  // Règles de classement : quelles opérations vont dans quelle catégorie. Les vôtres passent avant celles fournies.
  import { categoriser, motsDe, regleTouche, REGLES_DEFAUT, VIREMENT, type Regle } from "../categories";
  import { donnees, ecrire, nouvelId, reglesActives, type Changement, type Operation } from "../donnees.svelte";
  import { annoncer, app } from "../etat.svelte";
  import Feuille from "../Feuille.svelte";
  import { argent, dateCourte } from "../format";
  import Icone from "../Icone.svelte";
  import { normaliser } from "../import/analyse";

  let recherche = $state("");
  let seulementMiennes = $state(false);
  let edition = $state<Regle | null>(null);
  let apercu = $state<{ op: Operation; vers: string; garder: boolean }[] | null>(null);

  const categories = $derived(new Map(donnees.categories.map((c) => [c.id, c])));
  const fournies = new Set(REGLES_DEFAUT.map((r) => r.id));
  // Toutes les règles visibles : les vôtres puis les fournies non modifiées
  const toutes = $derived(reglesActives());
  const filtrees = $derived.by(() => {
    const q = normaliser(recherche);
    return toutes.filter(
      (r) => (!seulementMiennes || r.appris) && (!q || normaliser(r.motif).includes(q) || normaliser(categories.get(r.categorieId)?.nom ?? "").includes(q)),
    );
  });
  // Regroupées par catégorie, dans l'ordre des catégories
  const groupes = $derived(
    donnees.categories.map((c) => ({ c, regles: filtrees.filter((r) => r.categorieId === c.id) })).filter((g) => g.regles.length),
  );
  const SENS = { tous: t("dépenses et revenus"), depense: t("dépenses"), revenu: "revenus" } as const;

  // Opérations que le classement automatique peut toucher (pas celles classées à la main, ni les virements)
  const automatiques = $derived(donnees.operations.filter((o) => !o.categorieManuelle && !o.virementId && o.categorieId !== VIREMENT));

  function nouvelle() {
    edition = { id: nouvelId(), motif: recherche.trim(), categorieId: donnees.categories.find((c) => c.type === "depense")?.id ?? "", appris: true, sens: "tous" };
  }

  // Formulaire
  const touchees = $derived(edition && motsDe(edition).length ? automatiques.filter((o) => regleTouche(edition!, o, donnees.categories)) : []);
  const aReclasser = $derived(edition ? touchees.filter((o) => o.categorieId !== edition!.categorieId) : []);
  let reclasser = $state(true);

  async function enregistrer() {
    if (!edition) return;
    const r: Regle = { ...$state.snapshot(edition), motif: motsDe(edition).join(", "), appris: true };
    const ch: Changement[] = [{ collection: "regles", id: r.id, valeur: r }];
    if (reclasser) ch.push(...aReclasser.map((o) => ({ collection: "operations", id: o.id, valeur: { ...o, categorieId: r.categorieId } }) as Changement));
    const n = reclasser ? aReclasser.length : 0;
    await ecrire(ch);
    edition = null;
    annoncer(n ? t("Règle enregistrée, {0} opération{1} reclassée{2}.", n, n > 1 ? "s" : "", n > 1 ? "s" : "") : t("Règle enregistrée."));
  }

  async function effacer() {
    if (!edition) return;
    // Une règle fournie n'est pas effacée mais masquée (sinon elle reviendrait)
    await ecrire([{ collection: "regles", id: edition.id, valeur: fournies.has(edition.id) ? { ...$state.snapshot(edition), appris: true, masquee: true } : null }]);
    edition = null;
    annoncer(t("Règle supprimée."));
  }

  // « Appliquer maintenant » : les opérations dont la catégorie changerait avec les règles actuelles
  function preparerApercu() {
    const regles = reglesActives();
    apercu = automatiques
      .map((op) => ({ op, vers: categoriser(op, regles, donnees.categories) ?? "", garder: true }))
      .filter((x) => x.vers && x.vers !== x.op.categorieId)
      .sort((a, b) => b.op.date.localeCompare(a.op.date));
  }

  async function appliquer() {
    const choisis = apercu!.filter((x) => x.garder);
    await ecrire(choisis.map((x) => ({ collection: "operations", id: x.op.id, valeur: { ...x.op, categorieId: x.vers } })));
    apercu = null;
    annoncer(t("{0} opération{1} reclassée{2}.", choisis.length, choisis.length > 1 ? "s" : "", choisis.length > 1 ? "s" : ""));
  }
</script>

<div class="pile">
  <button class="lien retour" onclick={() => (app.page = "parametres")}><Icone nom="retour" taille={18} />{t("Paramètres")}</button>
  <p class="sous">
    {t("L'appli range chaque opération dans une catégorie d'après les mots de son libellé. Vos règles passent avant celles fournies. Corriger la catégorie d'une opération crée aussi une règle.")}
  </p>

  <div class="barre">
    <label class="recherche">
      <Icone nom="recherche" taille={18} />
      <input type="search" placeholder={t("Chercher un mot ou une catégorie")} aria-label={t("Chercher une règle")} bind:value={recherche} />
    </label>
    <button class="principal" onclick={nouvelle}><Icone nom="plus" taille={18} />{t("Nouvelle règle")}</button>
  </div>
  <div class="barre">
    <label class="case"><input type="checkbox" bind:checked={seulementMiennes} />{t("Seulement mes règles")}</label>
    <button onclick={preparerApercu}>{t("Appliquer aux opérations existantes")}</button>
  </div>

  {#each groupes as g (g.c.id)}
    <section class="carte groupe">
      <h3><span class="point" style:background={g.c.couleur}></span>{g.c.nom} <span class="sous">({g.regles.length})</span></h3>
      <div class="mots">
        {#each g.regles as r (r.id)}
          <button class="mot" class:mienne={r.appris} onclick={() => ((edition = structuredClone($state.snapshot(r))), (reclasser = true))}>
            {r.motif}{#if r.sens && r.sens !== "tous"}<span class="sens">{r.sens === "depense" ? "↓" : "↑"}</span>{/if}
          </button>
        {/each}
      </div>
    </section>
  {:else}
    <p class="sous">{t("Aucune règle ne correspond.")} <button class="lien" onclick={nouvelle}>{t("Créer une règle «")} {recherche} »</button></p>
  {/each}
  <p class="sous legende"><span class="mot mienne exemple">{t("en bleu")}</span> {t("vos règles · ↓ dépenses seulement · ↑ revenus seulement")}</p>
</div>

{#if edition}
  <Feuille titre={fournies.has(edition.id) && !donnees.regles.some((r) => r.id === edition!.id) ? t("Règle fournie") : t("Règle")} fermer={() => (edition = null)}>
    <label>{t("Mots-clés dans le libellé")}
      <!-- svelte-ignore a11y_autofocus -->
      <input bind:value={edition.motif} placeholder={t("ex. carrefour, lidl")} autofocus />
    </label>
    <p class="sous aide">{t("Plusieurs mots possibles, séparés par des virgules. Majuscules et accents ne comptent pas.")}</p>
    <label>{t("Catégorie")}
      <Choix bind:valeur={edition.categorieId} titre={t("Catégorie")} options={([["depense", t("Dépenses")], ["revenu", t("Revenus")], ["virement", t("Autres")]] as const).flatMap(([ty, nom]) => donnees.categories.filter((c) => c.type === ty).map((c) => ({ v: c.id, l: c.nom, groupe: nom, cat: c.id })))} />
    </label>
    <div class="mode" role="radiogroup" aria-label={t("S'applique à")}>
      {#each Object.entries(SENS) as [s, nom] (s)}
        <button role="radio" aria-checked={(edition.sens ?? "tous") === s} class:actif={(edition.sens ?? "tous") === s} onclick={() => (edition!.sens = s as Regle["sens"])}>{nom}</button>
      {/each}
    </div>
    {#if motsDe(edition).length}
      <div class="apercu">
        <p><strong>{touchees.length}</strong> {t("opération")}{touchees.length > 1 ? "s" : ""} {t("concernée")}{touchees.length > 1 ? "s" : ""}{touchees.length ? t(", par exemple :") : "."}</p>
        {#each touchees.slice(0, 3) as o (o.id)}
          <p class="sous">{dateCourte(o.date)} · {o.libelle} · {argent(o.montant, "EUR", true)}</p>
        {/each}
        {#if aReclasser.length}
          <label class="case"><input type="checkbox" bind:checked={reclasser} />{aReclasser.length > 1 ? t("Reclasser aussi les {0} opérations déjà là", aReclasser.length) : t("Reclasser aussi l'opération déjà là")}</label>
        {/if}
      </div>
    {/if}
    <button class="principal" onclick={enregistrer} disabled={!motsDe(edition).length || !edition.categorieId}>{t("Enregistrer")}</button>
    {#if donnees.regles.some((r) => r.id === edition!.id) || fournies.has(edition.id)}
      <button class="lien rouge" onclick={effacer}>{t("Supprimer cette règle")}</button>
    {/if}
  </Feuille>
{/if}

{#if apercu}
  <Feuille titre={t("Appliquer les règles")} fermer={() => (apercu = null)}>
    {#if apercu.length === 0}
      <p>{t("Tout est déjà classé selon vos règles.")}</p>
    {:else}
      <p class="sous">{apercu.length} {t("opération")}{apercu.length > 1 ? "s" : ""} {t("changerai")}{apercu.length > 1 ? "ent" : "t"} {t("de catégorie. Décochez celles à garder telles quelles.")}</p>
      <div class="liste">
        {#each apercu.slice(0, 200) as x (x.op.id)}
          <label class="case changement">
            <input type="checkbox" bind:checked={x.garder} />
            <span>
              {x.op.libelle}<br />
              <span class="sous">{dateCourte(x.op.date)} · {categories.get(x.op.categorieId ?? "")?.nom ?? t("Sans catégorie")} → <strong>{categories.get(x.vers)?.nom}</strong></span>
            </span>
          </label>
        {/each}
      </div>
      <button class="principal" onclick={appliquer}>{t("Reclasser")} {apercu.filter((x) => x.garder).length} {t("opération")}{apercu.filter((x) => x.garder).length > 1 ? "s" : ""}</button>
    {/if}
  </Feuille>
{/if}

<style>
  .retour {
    align-self: flex-start;
  }
  .barre {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
  }
  .recherche {
    flex: 1 1 220px;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    background: var(--surface);
    border: 1px solid var(--bord);
    border-radius: 999px;
    padding: 0 14px;
  }
  .recherche input {
    border: none;
    background: transparent;
    padding: 11px 0;
  }
  .recherche input:focus-visible {
    outline: none;
  }
  .groupe {
    padding: 12px 16px;
  }
  h3 {
    font-size: 15px;
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }
  .point {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }
  .mots {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .mot {
    padding: 5px 12px;
    font-size: 13px;
    background: var(--surface-2);
    border: none;
  }
  .mot.mienne {
    background: var(--accent-fond);
    color: var(--accent-texte);
  }
  .exemple {
    display: inline-block;
    padding: 1px 8px;
    border-radius: 999px;
  }
  .sens {
    margin-left: 4px;
    font-weight: 600;
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
  .aide {
    margin-top: -6px;
  }
  .mode {
    display: flex;
    gap: 6px;
    background: var(--surface-2);
    padding: 4px;
    border-radius: 999px;
  }
  .mode button {
    flex: 1;
    border: none;
    background: transparent;
    padding: 8px 6px;
    font-size: 13px;
  }
  .mode button.actif {
    background: var(--surface);
  }
  .apercu {
    background: var(--surface-2);
    border-radius: 14px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 14px;
  }
  .liste {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: 50vh;
    overflow: auto;
  }
  .changement span {
    word-break: break-word;
  }
  .rouge {
    color: var(--danger);
    align-self: flex-start;
  }
</style>
