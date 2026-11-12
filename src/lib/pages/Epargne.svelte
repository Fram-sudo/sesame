<script lang="ts">
  import Choix from "../Choix.svelte";
  import { t } from "../i18n.svelte";
  import { app, deviseAffichee } from "../etat.svelte";
  import { tauxConnus } from "../taux";
  // Épargne : tout l'argent mis de côté (poches de banque, livrets, tirelire et espèces, autres projets).
  // Les poches suivent les imports ; les autres se tiennent à la main (ajouter, retirer, ajuster le montant).
  import Aide from "../Aide.svelte";
  import CompteFormulaire from "../CompteFormulaire.svelte";
  import { DEVISES, donnees, ecrire, nouvelId, soldes, type Compte, type Devise } from "../donnees.svelte";
  import { annoncer } from "../etat.svelte";
  import Feuille from "../Feuille.svelte";
  import { argent } from "../format";
  import IconeCategorie from "../IconeCategorie.svelte";
  import { lireMontant } from "../import/analyse";
  import { cleOp } from "../import/doublons";
  import { cleMois, flux, moisCourant, objectifPoche, type Contexte } from "../stats";

  const parCompte = $derived(soldes());
  const epargnes = $derived(donnees.comptes.filter((c) => c.parentId || c.type === "epargne"));
  const visibles = $derived(epargnes.filter((c) => !c.archive));
  const archivees = $derived(epargnes.filter((c) => c.archive));
  let voirArchivees = $state(false);
  const total = $derived(visibles.filter((c) => c.devise === "EUR").reduce((a, c) => a + (parCompte.get(c.id) ?? 0), 0));
  const ctx: Contexte = $derived({ ops: donnees.operations, comptes: donnees.comptes, categories: donnees.categories, taux: tauxConnus(app.params.taux), devise: deviseAffichee() });
  const ceMois = $derived(flux(ctx, "", [cleMois(moisCourant())]));

  const GROUPES = [
    { cle: "poches", titre: t("Poches de vos banques"), aide: t("Créées et mises à jour automatiquement à chaque import de relevé."), garde: (c: Compte) => !!c.parentId },
    { cle: "livrets", titre: t("Livrets et comptes d'épargne"), aide: "", garde: (c: Compte) => !c.parentId && (c.forme ?? "livret") === "livret" },
    { cle: "especes", titre: t("Espèces et tirelires"), aide: "", garde: (c: Compte) => !c.parentId && c.forme === "especes" },
    { cle: "projets", titre: t("Autres"), aide: "", garde: (c: Compte) => !c.parentId && c.forme === "projet" },
  ];
  const parent = (c: Compte) => donnees.comptes.find((x) => x.id === c.parentId)?.nom;
  const icone = (c: Compte) => (c.parentId ? "pig-money" : c.forme === "especes" ? "cash" : c.forme === "projet" ? "target" : "building-bank");

  let fiche = $state<Compte | null>(null);
  let mouvement = $state<{ c: Compte; sens: "ajouter" | "retirer" | "ajuster" } | null>(null);
  let saisie = $state("");
  let date = $state(new Date().toISOString().slice(0, 10));

  function ouvrir(c: Compte, sens: "ajouter" | "retirer" | "ajuster") {
    mouvement = { c, sens };
    saisie = sens === "ajuster" ? String((parCompte.get(c.id) ?? 0) / 100).replace(".", ",") : "";
    date = new Date().toISOString().slice(0, 10);
  }

  async function valider(e: SubmitEvent) {
    e.preventDefault();
    if (!mouvement) return;
    const v = lireMontant(saisie);
    if (v === null) return annoncer(t("Montant illisible."));
    const { c, sens } = mouvement;
    if (sens === "ajuster") {
      // Le solde de départ absorbe la différence : pas d'opération inventée
      const ecart = v - (parCompte.get(c.id) ?? 0);
      await ecrire([{ collection: "comptes", id: c.id, valeur: { ...c, soldeInitial: c.soldeInitial + ecart } }]);
      annoncer(`« ${c.nom} » : ${argent(v, c.devise)}.`);
    } else {
      const montant = sens === "ajouter" ? Math.abs(v) : -Math.abs(v);
      const libelle = sens === "ajouter" ? t("Mis de côté · {0}", c.nom) : t("Repris · {0}", c.nom);
      const id = nouvelId();
      await ecrire([{ collection: "operations", id, valeur: { id, compteId: c.id, date, montant, libelle, cle: cleOp({ date, montant, libelle }), manuelle: true } }]);
      annoncer(sens === "ajouter" ? t("{0} mis de côté.", argent(Math.abs(montant), c.devise)) : t("{0} repris.", argent(Math.abs(montant), c.devise)));
    }
    mouvement = null;
  }

  // Nouvelle épargne
  let creation = $state(false);
  let forme = $state<"livret" | "especes" | "projet">("especes");
  let nom = $state("");
  let banque = $state("");
  let devise = $state<Devise>("EUR");
  let actuel = $state("");
  let objectif = $state("");
  const FORMES = [
    { f: "especes", titre: t("Tirelire ou espèces"), icone: "cash", exemple: t("Tirelire") },
    { f: "livret", titre: t("Livret ou compte d'épargne"), icone: "building-bank", exemple: t("Livret A") },
    { f: "projet", titre: t("Autre"), icone: "target", exemple: t("Voyage à Dakar") },
  ] as const;

  async function creer(e: SubmitEvent) {
    e.preventDefault();
    const id = nouvelId();
    const c: Compte = {
      id,
      nom: nom.trim(),
      banque: forme === "livret" ? banque.trim() : "",
      devise,
      soldeInitial: lireMontant(actuel) ?? 0,
      type: "epargne",
      forme,
      ...(lireMontant(objectif) ? { objectif: Math.abs(lireMontant(objectif)!) } : {}),
    };
    await ecrire([{ collection: "comptes", id, valeur: c }]);
    annoncer(t("« {0} » ajouté à votre épargne.", c.nom));
    creation = false;
    nom = banque = actuel = objectif = "";
  }
</script>

<div class="pile">
  <div class="carte resume">
    <div>
      <p class="sous">{t("Total mis de côté")}<Aide texte={t("Somme de vos poches, livrets, tirelires et autres épargnes (hors poches archivées). Cet argent n'est pas compté dans votre argent disponible sur l'accueil.")} /></p>
      <p class="montant total">{argent(total, "EUR")}</p>
    </div>
    <div>
      <p class="sous">{t("Ce mois-ci")}</p>
      <p class="montant chiffre">{argent(ceMois.misDeCote - ceMois.pioche, "EUR", true)}</p>
      <p class="sous">{t("versé")} <span class="montant">{argent(ceMois.misDeCote, "EUR")}</span> {t("· repris")} <span class="montant">{argent(ceMois.pioche, "EUR")}</span></p>
    </div>
    <button class="principal" onclick={() => (creation = true)}>{t("+ Nouvelle épargne")}</button>
  </div>

  {#each GROUPES as g (g.cle)}
    {@const liste = visibles.filter(g.garde)}
    {#if liste.length}
      <section class="carte pile">
        <div>
          <h2>{g.titre}</h2>
          {#if g.aide}<p class="sous">{g.aide}</p>{/if}
        </div>
        {#each liste as c (c.id)}
          {@const s = parCompte.get(c.id) ?? 0}
          {@const obj = objectifPoche(c)}
          <div class="ligne">
            <button class="tete" onclick={() => (fiche = c)}>
              <IconeCategorie icone={icone(c)} teinte={c.parentId ? "#7F77DD" : c.forme === "especes" ? "#639922" : c.forme === "projet" ? "#D85A30" : "#378ADD"} taille={40} />
              <span class="corps">
                <span class="haut"><span class="nom">{c.nom}</span><span class="montant fort">{argent(s, c.devise)}</span></span>
                <span class="sous">{c.parentId ? `Poche ${parent(c) ?? ""}` : c.banque || (c.forme === "especes" ? t("Espèces") : "")}</span>
                {#if obj}
                  <span class="jauge"><span style:width="{Math.min(100, Math.max(0, (s / obj) * 100))}%"></span></span>
                  <span class="sous">{Math.round((s / obj) * 100)} {t("% de")} <span class="montant">{argent(obj, c.devise)}</span> {t("· reste")} <span class="montant">{argent(Math.max(0, obj - s), c.devise)}</span></span>
                {/if}
              </span>
            </button>
            {#if !c.parentId}
              <div class="actions">
                <button onclick={() => ouvrir(c, "ajouter")}>{t("Mettre de côté")}</button>
                <button onclick={() => ouvrir(c, "retirer")}>{t("Retirer")}</button>
                <button class="lien" onclick={() => ouvrir(c, "ajuster")}>{t("Ajuster le montant")}</button>
              </div>
            {/if}
          </div>
        {/each}
      </section>
    {/if}
  {/each}

  {#if !visibles.length}
    <div class="carte pile vide">
      <h2>{t("Rien de mis de côté pour l'instant")}</h2>
      <p class="sous">{t("Ajoutez une tirelire, un livret ou un projet. Les poches de votre banque (Revolut…) apparaîtront toutes seules à l'import de vos relevés.")}</p>
    </div>
  {/if}

  {#if archivees.length}
    <button class="lien gauche" onclick={() => (voirArchivees = !voirArchivees)}>{voirArchivees ? t("Masquer") : t("Voir")} {t("les épargnes archivées (")}{archivees.length})</button>
    {#if voirArchivees}
      {#each archivees as c (c.id)}
        <button class="carte archivee" onclick={() => (fiche = c)}><span>{c.nom}</span><span class="montant">{argent(parCompte.get(c.id) ?? 0, c.devise)}</span></button>
      {/each}
    {/if}
  {/if}
</div>

{#if mouvement}
  {@const m = mouvement}
  <Feuille titre={m.sens === "ajouter" ? t("Mettre de côté · {0}", m.c.nom) : m.sens === "retirer" ? t("Retirer · {0}", m.c.nom) : t("Ajuster · {0}", m.c.nom)} fermer={() => (mouvement = null)}>
    <form class="pile" onsubmit={valider}>
      <label>{m.sens === "ajuster" ? t("Montant qu'il y a réellement aujourd'hui") : t("Montant")}
        <!-- svelte-ignore a11y_autofocus -->
        <input class="somme" inputmode="decimal" bind:value={saisie} placeholder="0,00" autofocus required />
      </label>
      {#if m.sens !== "ajuster"}
        <label>{t("Date")}<input type="date" bind:value={date} required /></label>
        <p class="sous">{t("Seule cette épargne change : vos comptes bancaires restent tels que vos relevés les montrent.")}</p>
      {:else}
        <p class="sous">{t("Pratique pour une tirelire : comptez ce qu'il y a dedans, l'appli corrige la différence.")}</p>
      {/if}
      <button class="principal" type="submit">{m.sens === "ajuster" ? t("Corriger le montant") : t("Enregistrer")}</button>
    </form>
  </Feuille>
{/if}

{#if creation}
  <Feuille titre={t("Nouvelle épargne")} fermer={() => (creation = false)}>
    <form class="pile" onsubmit={creer}>
      <div class="formes" role="radiogroup" aria-label={t("Type d'épargne")}>
        {#each FORMES as x (x.f)}
          <button type="button" role="radio" aria-checked={forme === x.f} class:actif={forme === x.f} onclick={() => (forme = x.f)}>
            <IconeCategorie icone={x.icone} teinte={x.f === "especes" ? "#639922" : x.f === "projet" ? "#D85A30" : "#378ADD"} taille={36} />
            <span>{x.titre}</span>
          </button>
        {/each}
      </div>
      <label>{t("Nom")}<input bind:value={nom} placeholder={t("ex. {0}", FORMES.find((x) => x.f === forme)?.exemple)} required /></label>
      {#if forme === "livret"}<label>{t("Banque (facultatif)")}<input bind:value={banque} placeholder={t("ex. Société Générale")} /></label>{/if}
      <div class="deux">
        <label>{t("Montant actuel")}<input inputmode="decimal" bind:value={actuel} placeholder="0,00" /></label>
        <label>{t("Devise")}<Choix bind:valeur={devise} titre={t("Devise")} options={DEVISES.map((d) => ({ v: d, l: d }))} /></label>
      </div>
      <label>{t("Objectif (facultatif)")}<input inputmode="decimal" bind:value={objectif} placeholder={t("ex. 1000")} /></label>
      <button class="principal" type="submit" disabled={!nom.trim()}>{t("Ajouter")}</button>
    </form>
  </Feuille>
{/if}

{#if fiche}<CompteFormulaire compte={fiche} fermer={() => (fiche = null)} />{/if}

<style>
  .resume {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px 32px;
  }
  .resume .principal {
    margin-left: auto;
  }
  .total {
    font-size: 30px;
    font-weight: 600;
  }
  .chiffre {
    font-size: 20px;
    font-weight: 600;
  }
  .ligne {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 12px;
    border-top: 1px solid var(--bord);
  }
  .ligne:first-of-type {
    border-top: none;
    padding-top: 0;
  }
  .tete {
    display: flex;
    align-items: center;
    gap: 12px;
    border: none;
    background: none;
    padding: 0;
    border-radius: 0;
    text-align: left;
    color: inherit;
  }
  .corps {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .haut {
    display: flex;
    justify-content: space-between;
    gap: 10px;
  }
  .nom,
  .fort {
    font-weight: 600;
  }
  .jauge {
    display: block;
    height: 8px;
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
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding-left: 52px;
  }
  .actions button {
    padding: 7px 14px;
    font-size: 13px;
  }
  .vide {
    text-align: center;
    padding: 32px 20px;
  }
  .gauche {
    align-self: flex-start;
  }
  .archivee {
    display: flex;
    justify-content: space-between;
    color: var(--doux);
  }
  .somme {
    font-size: 24px;
    font-weight: 600;
  }
  .formes {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  .formes button {
    flex-direction: column;
    border-radius: 16px;
    padding: 12px 8px;
    font-size: 13px;
    text-align: center;
  }
  .formes .actif {
    border-color: var(--accent);
    background: var(--accent-fond);
  }
  .deux {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 10px;
  }
  @media (max-width: 599px) {
    .actions {
      padding-left: 0;
    }
  }
</style>
