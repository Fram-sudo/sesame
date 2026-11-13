<script lang="ts">
  import { t, locale } from "../i18n.svelte";
  import { tauxConnus } from "../taux";
  // Tableau de bord (maquette validée v6) : solde et indicateurs en haut, conseil du moment,
  // puis dépenses vs moyenne, répartition en anneau, budgets, à venir, poches et opérations.
  // Le compte et le mois choisis en haut s'appliquent à tout.
  import Aide from "../Aide.svelte";
  import Anneau from "../Anneau.svelte";
  import BudgetEditeur from "../BudgetEditeur.svelte";
  import { detecterRecurrences, libelleLisible } from "../categories";
  import ChoixDevise from "../ChoixDevise.svelte";
  import CompteFormulaire from "../CompteFormulaire.svelte";
  import BarresMois from "../BarresMois.svelte";
  import { couleurCompte } from "../couleurs";
  import { chargerDemo } from "../demo";
  import { donnees, soldes, type Compte } from "../donnees.svelte";
  import { symboleDevise } from "../devises";
  import { annoncer, app, deviseAffichee } from "../etat.svelte";
  import { argent, dateCourte } from "../format";
  import Icone from "../Icone.svelte";
  import IconeCategorie from "../IconeCategorie.svelte";
  import RappelSauvegarde from "../RappelSauvegarde.svelte";
  import EnAttente from "../EnAttente.svelte";
  import Periode from "../Periode.svelte";
  import { resume } from "../prets";
  import { prevoir } from "../prevision";
  import { bornes, cleMois, derniersMois, estEnCours, etatBudgets, flux, moisPasses, moyennePeriode, objectifPoche, perimetre, solde, variation, type Contexte } from "../stats";
  import { premiereDate } from "../donnees.svelte";

  let fiche = $state<Compte | "nouveau" | null>(null);
  let enCours = $state(false);

  const ctx: Contexte = $derived({ ops: donnees.operations, comptes: donnees.comptes, categories: donnees.categories, taux: tauxConnus(app.params.taux, app.params.tauxManuels), devise: deviseAffichee() });
  const filtre = $derived(app.filtreCompte);
  const p = $derived(perimetre(ctx, filtre));
  const devise = $derived(p.devise);
  const b = $derived(bornes(app.periode, premiereDate()));
  const estActuel = $derived(estEnCours(b));
  const jusquAu = $derived(estActuel ? "9999-12-31" : b.fin);
  // « novembre 2026 », « 4e trimestre 2026 », « Année 2026 »… et la phrase qui va avec
  const periodeTexte = $derived(app.periode.mode === "mois" ? t("en {0}", b.libelle) : t("sur la période ({0})", b.libelle.charAt(0).toLowerCase() + b.libelle.slice(1)));

  // Soldes
  const parCompte = $derived(soldes(estActuel ? undefined : jusquAu));
  // Argent disponible : comptes courants seulement ; l'épargne et les poches ont un but, elles sont à part
  const total = $derived(solde(ctx, filtre, jusquAu, false));
  // Les réserves (argent bloqué pour une dépense prévue) ne sont ni disponibles ni de l'épargne
  const totalReserve = $derived([...p.reserves].reduce((s, id) => s + Math.round((parCompte.get(id) ?? 0) * (p.facteur.get(id) ?? 1)), 0));
  const totalEpargne = $derived(solde(ctx, filtre, jusquAu) - total - totalReserve);
  // « 2 859,56 € » : les centimes en petit, comme dans les applis de banque
  const soldeAffiche = $derived.by(() => {
    const s = argent(total, devise);
    // séparateur des centimes selon la langue (virgule en français, point en anglais)
    const i = s.lastIndexOf(locale() === "fr-FR" ? "," : ".");
    return i < 0 ? { ent: s, dec: "" } : { ent: s.slice(0, i), dec: s.slice(i) };
  });
  // Un très long montant rapetisse au lieu de déborder (largeur utile ≈ 0,6 em par caractère)
  const tailleSolde = $derived(`min(var(--solde-max, 44px), ${Math.floor(560 / (soldeAffiche.ent.length + soldeAffiche.dec.length * 0.5))}px)`);
  const tailleCarte = (t: string) => `${Math.min(19, Math.floor(230 / t.length))}px`;
  const principaux = $derived(donnees.comptes.filter((c) => !c.parentId && c.type !== "epargne" && !c.archive));
  const nbComptes = $derived(donnees.comptes.filter((c) => p.courants.has(c.id)).length);
  const autresDevises = $derived.by(() => {
    if (filtre) return [];
    const parDevise = new Map<string, number>();
    // Seulement les comptes qui n'ont pas pu être convertis (devise sans taux connu)
    for (const c of donnees.comptes) if (c.devise !== devise && !p.facteur.has(c.id)) parDevise.set(c.devise, (parDevise.get(c.devise) ?? 0) + (parCompte.get(c.id) ?? 0));
    return [...parDevise];
  });
  const devisesConverties = $derived([...new Set(donnees.comptes.filter((c) => c.devise !== devise && p.facteur.has(c.id)).map((c) => c.devise))]);

  // La période choisie, comparée à la moyenne des périodes équivalentes précédentes (si elle a un sens)
  const f = $derived(flux(ctx, filtre, { de: b.de, fin: b.fin }));
  const moy = $derived(moyennePeriode(ctx, filtre, app.periode, premiereDate()));
  const bilan = $derived(f.revenus - f.depenses);
  const ecartDepenses = $derived(moy ? variation(f.depenses, moy.depenses) : undefined);
  // Courbe des dépenses par mois : les mois de la période, ou les 6 derniers pour un seul mois
  const moisCourbe = $derived(b.mois.length > 1 ? moisPasses(b.mois) : derniersMois(b.mois[0], 6));
  const barresMois = $derived(
    moisCourbe.map((m) => {
      const fm = flux(ctx, filtre, [cleMois(m)]);
      return {
        libelle: new Date(m.a, m.m, 1).toLocaleDateString(locale(), moisCourbe.length > 12 ? { month: "short", year: "2-digit" } : { month: "short" }).replace(".", ""),
        revenus: Math.max(0, fm.revenus),
        depenses: Math.max(0, fm.depenses),
      };
    }),
  );

  // Répartition des dépenses du mois : 5 plus grosses catégories, le reste regroupé
  const categories = $derived(new Map(donnees.categories.map((c) => [c.id, c])));
  const parts = $derived.by(() => {
    const l = [...f.parCategorie].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const tete = l.slice(0, 5).map(([id, v]) => ({ id: id || "aucune", nom: categories.get(id)?.nom ?? t("Sans catégorie"), couleur: categories.get(id)?.couleur ?? "#888780", v }));
    const reste = l.slice(5).reduce((a, [, v]) => a + v, 0);
    return reste ? [...tete, { id: "autres", nom: t("Autres"), couleur: "#B4B2A9", v: reste }] : tete;
  });

  // Poches et épargne du périmètre, avec leur objectif
  const poches = $derived(donnees.comptes.filter((c) => p.epargne.has(c.id) && !c.archive));

  // Budgets (mensuels × nombre de mois, annuels sur l'année), avec le rythme : les plus entamés d'abord
  const budgets = $derived(
    etatBudgets(ctx, filtre, b, donnees.budgets)
      .filter((e) => e.id === "global" || categories.has(e.id))
      .map((e) => ({ ...e, c: categories.get(e.id), depassera: e.projection !== undefined && e.projection > e.budget && e.depense <= e.budget }))
      .sort((x, y) => y.depense / y.budget - x.depense / x.budget),
  );
  const nomBudget = (x: { id: string; c?: { nom: string } }) => (x.id === "global" ? t("Plafond global") : x.c!.nom);
  let budgetOuvert = $state<string | null>(null);

  // Conseil du moment : le point le plus utile à signaler ce mois-ci
  // Prévision sur 3 mois (période en cours seulement) : le plus important à signaler
  const prevision = $derived(estActuel && donnees.operations.length ? prevoir({ ...ctx, ops: donnees.operations }, filtre, new Date().toISOString().slice(0, 10)) : undefined);
  const conseil = $derived.by(() => {
    if (prevision?.sousSeuil)
      return { texte: t("À ce rythme, votre argent disponible passerait sous 0 € vers le {0} (au plus bas : {1}).", dateCourte(prevision.sousSeuil), argent(prevision.plusBas.solde, devise)), action: t("Voir la prévision"), page: "analyse" as const };
    const depasse = budgets.find((x) => x.depense > x.budget);
    if (depasse) return { texte: t("{0} : budget dépassé de {1} {2}.", nomBudget(depasse), argent(depasse.depense - depasse.budget, devise), depasse.frequence === "annee" ? t("sur {0}", depasse.de.slice(0, 4)) : periodeTexte), action: t("Voir les budgets"), page: "budgets" as const };
    const bientot = budgets.find((x) => x.depassera);
    if (bientot)
      return { texte: t("À ce rythme, {0} dépassera son budget de {1} d'ici le {2}.", nomBudget(bientot), argent(bientot.projection! - bientot.budget, devise), dateCourte(bientot.fin)), action: t("Voir les budgets"), page: "budgets" as const };
    const sansCat = f.parCategorie.get("") ?? 0;
    if (f.depenses > 0 && sansCat / f.depenses > 0.25)
      return { texte: t("{0} de dépenses sans catégorie : classez-les pour des chiffres justes (l'appli retiendra vos choix).", argent(sansCat, devise)), action: t("Les classer"), page: "operations" as const, categorie: "aucune" };
    if (ecartDepenses !== undefined && ecartDepenses >= 20 && moy?.depenses)
      return { texte: t("Vos dépenses {0} sont {1} % au-dessus de d'habitude.", periodeTexte, ecartDepenses), action: t("Comprendre"), page: "analyse" as const };
    if (!donnees.budgets.length && f.depenses) return { texte: t("Fixez des budgets en un clic, d'après vos 3 derniers mois."), action: t("Créer mes budgets"), page: "budgets" as const };
    return undefined;
  });

  const attente = $derived.by(() => {
    const m = new Map<string, number>();
    for (const o of donnees.operations) if (o.enAttente) m.set(o.compteId, (m.get(o.compteId) ?? 0) + o.montant);
    return m;
  });
  let voirAttente = $state(false);
  // Opérations en attente comprises dans l'argent disponible (comptes courants affichés, convertis)
  const enAttenteTotal = $derived([...attente].reduce((s, [id, v]) => s + (p.courants.has(id) ? Math.round(v * (p.facteur.get(id) ?? 1)) : 0), 0));
  const recentes = $derived(
    donnees.operations
      .filter((o) => p.courants.has(o.compteId) && o.date >= b.de && o.date <= b.fin)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 6),
  );
  // Prêts en cours : restant dû et prochaine échéance (aujourd'hui)
  const pretsEnCours = $derived(
    donnees.prets.map((x) => ({ p: x, r: resume(x, new Date().toISOString().slice(0, 10)) })).filter((x) => x.r.restantDu > 0),
  );
  const aVenir = $derived.by(() => {
    if (!estActuel) return [];
    const auj = new Date().toISOString().slice(0, 10);
    const dans30 = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    return detecterRecurrences(donnees.operations.filter((o) => p.courants.has(o.compteId)))
      .filter((r) => r.prochaine >= auj && r.prochaine <= dans30)
      .slice(0, 5);
  });

  function suivreConseil() {
    if (!conseil) return;
    if (conseil.categorie) app.filtreCategorie = conseil.categorie;
    app.page = conseil.page;
  }

  async function demo() {
    enCours = true;
    try {
      await chargerDemo();
      annoncer(t("Données de démo ajoutées. Retirez-les quand vous voulez (Paramètres)."));
    } finally {
      enCours = false;
    }
  }
</script>

{#if voirAttente}<EnAttente fermer={() => (voirAttente = false)} />{/if}

{#if donnees.comptes.length === 0}
  <div class="carte pile accueil">
    <h2>{t("Bienvenue")}</h2>
    <p class="sous">{t("Importez un relevé de votre banque : comptes, catégories et poches se créent tout seuls. Vous pouvez aussi essayer l'appli avec des données fictives.")}</p>
    <button class="principal" onclick={() => (app.page = "import")}><Icone nom="importer" taille={18} />{t("Importer des relevés")}</button>
    <button onclick={demo} disabled={enCours}>{t("Essayer avec des données de démo")}</button>
  </div>
{:else}
  <div class="pile">
    <Periode />

    <!-- Grand écran : ce que j'ai à gauche, comment se passe le mois à droite -->
    <div class="haut">
      <div class="haut-gauche">
      <section class="tete-solde" data-visite="solde">
        <p class="sous">
          {estActuel ? t("Argent disponible") : t("Disponible au {0}", dateCourte(jusquAu))} <ChoixDevise />
          <Aide texte={t("Ce qu'il y a sur vos comptes courants, opérations en attente incluses (comme dans l'appli de votre banque). L'argent de vos poches, livrets et tirelires n'est pas compté : il a un but, il est affiché à part.")} />
        </p>
        <p class="solde montant" style:font-size={tailleSolde}>{soldeAffiche.ent}<span class="cts">{soldeAffiche.dec}</span></p>
        {#each autresDevises as [d, v] (d)}<p class="sous"><span class="montant">+ {argent(v, d)}</span> · <button class="lien" onclick={() => (app.page = "parametres")}>{t("non compté : taux inconnu")}</button></p>{/each}
        {#if enAttenteTotal}<button class="lien attente" onclick={() => (voirAttente = true)}>{t("{0} en attente déjà déduits", argent(Math.abs(enAttenteTotal), devise))} ›</button>{/if}
        {#if devisesConverties.length}<p class="sous">{t("comptes en")} {devisesConverties.map(symboleDevise).join(", ")} {t("convertis en")} {devise === "EUR" ? "euros" : symboleDevise(devise)}{app.params.taux && [...devisesConverties, devise].some((d) => app.params.taux!.valeurs[d] !== undefined) ? t(" (taux du {0})", dateCourte(app.params.taux.date)) : ""}</p>{/if}
        <button class="puce" onclick={() => (app.page = "epargne")}>
          {#if totalEpargne}+ <strong class="montant">{argent(totalEpargne, devise)}</strong> {t("de côté · poches et épargne")}{:else}{t("Mettre de l'argent de côté")}{/if}
        </button>
      </section>

      <div class="actions" data-visite="actions">
        <button class="act prim" onclick={() => (app.saisie = "depense")}><span><Icone nom="plus" taille={22} /></span>{t("Ajouter")}</button>
        <button class="act" onclick={() => (app.page = "import")}><span><Icone nom="importer" taille={22} /></span>{t("Importer")}</button>
        <button class="act" onclick={() => (app.page = "budgets")}><span><Icone nom="budgets" taille={22} /></span>{t("Budgets")}</button>
        <button class="act" onclick={() => (app.page = "epargne")}><span><Icone nom="epargne" taille={22} /></span>{t("Épargne")}</button>
      </div>

      <div class="cartes-comptes" data-visite="comptes">
        {#each principaux as c (c.id)}
          <button class="carte-compte" class:choisie={filtre === c.id} style:background={couleurCompte(c)} onclick={() => (app.filtreCompte = filtre === c.id ? "" : c.id)}>
            <small><i></i>{c.banque || t("Mon compte")}</small>
            <span><small>{c.nom}</small><strong class="montant" style:font-size={tailleCarte(argent(parCompte.get(c.id) ?? 0, c.devise))}>{argent(parCompte.get(c.id) ?? 0, c.devise)}</strong></span>
          </button>
        {/each}
        <button class="carte-compte ajout" aria-label={t("Ajouter un compte")} title={t("Ajouter un compte")} onclick={() => (fiche = "nouveau")}><Icone nom="plus" taille={22} /></button>
      </div>

      </div>
      <section class="carte pile mois" data-visite="mois">
        <div class="titre">
          <h2>{b.libelle.charAt(0).toUpperCase() + b.libelle.slice(1)}</h2>
          <button class="lien" onclick={() => (app.page = "operations")}>{t("Détails")}</button>
        </div>
        <div class="trois">
          <div>
            <p class="sous"><i class="carre" style:background="var(--serie-revenus)"></i>{t("Revenus")}</p>
            <p class="montant chiffre">{argent(f.revenus, devise, true)}</p>
            {#if moy?.revenus}<p class="sous">{t("d'habitude")} <span class="montant">{argent(moy.revenus, devise)}</span></p>{/if}
          </div>
          <div>
            <p class="sous"><i class="carre" style:background="var(--serie-depenses)"></i>{t("Dépenses")}<Aide texte={t("Sorties d'argent de la période, classées par catégorie de dépense. Un remboursement rangé dans la même catégorie les diminue. Les virements entre vos comptes et l'argent mis de côté ne sont pas des dépenses. « D'habitude » : moyenne des 3 périodes précédentes (l'année précédente pour une année).")} /></p>
            <p class="montant chiffre">{argent(f.depenses, devise)}</p>
            {#if ecartDepenses !== undefined}<p class="sous">{ecartDepenses > 0 ? "+" : "−"}{Math.abs(ecartDepenses)} {t("% vs d'habitude")}</p>{/if}
          </div>
          <div>
            <p class="sous">{t("Reste")}<Aide texte={t("Revenus moins dépenses de la période. En rouge : vous avez dépensé plus que ce qui est rentré.")} /></p>
            <p class="montant chiffre" class:positif={bilan >= 0} class:negatif={bilan < 0}>{argent(bilan, devise, true)}</p>
            {#if f.misDeCote - f.pioche}<p class="sous">{t("Épargne")} <span class="montant">{argent(f.misDeCote - f.pioche, devise, true)}</span></p>{/if}
          </div>
        </div>
        <BarresMois donnees={barresMois} {devise} hauteur={150} reste />
      </section>
    </div>

    <RappelSauvegarde />

    {#if conseil}
      <div class="conseil">
        <IconeCategorie icone="bulb" teinte="#BA7517" taille={32} />
        <span class="texte">{conseil.texte}</span>
        <button class="lien" onclick={suivreConseil}>{conseil.action}</button>
      </div>
    {/if}

    <div class="grille">
      <div class="colonne">


      <section class="carte pile">
        <div class="titre">
          <h2>{t("Budgets")}</h2>
          <button class="lien" onclick={() => (app.page = "budgets")}>{budgets.length ? t("Tout voir") : t("Créer")}</button>
        </div>
        {#each budgets.slice(0, 4) as x (x.id + x.frequence)}
          {@const taux = x.depense / x.budget}
          <button class="budget" onclick={() => (budgetOuvert = x.id)}>
            <IconeCategorie id={x.id === "global" ? undefined : x.id} icone={x.id === "global" ? "target" : undefined} teinte={x.id === "global" ? "#378ADD" : undefined} />
            <span class="corps">
              <span class="ligne-haut"><span class="nom">{nomBudget(x)}{x.frequence === "annee" ? ` (${x.de.slice(0, 4)})` : ""}</span><span><span class="montant">{argent(x.depense, devise)}</span> <span class="sous">/ <span class="montant">{argent(x.budget, devise)}</span></span></span></span>
              <span class="jauge"><span class={taux > 1 ? "trop" : x.depassera || taux > 0.85 ? "presque" : ""} style:width="{Math.min(100, taux * 100)}%" style:background={taux > 0.85 || x.depassera ? undefined : (x.c?.couleur ?? "var(--serie-revenus)")}></span></span>
              <span class="ligne-bas">
                {#if taux > 1}<span class="alerte-pastille">{t("dépassé de")} <span class="montant">{argent(x.depense - x.budget, devise)}</span></span>
                {:else if x.depassera}<span class="rythme-pastille">{t("à ce rythme : +")}<span class="montant">{argent(x.projection! - x.budget, devise)}</span></span>
                {:else}<span class="sous">{t("reste")} <span class="montant">{argent(x.budget - x.depense, devise)}</span></span>{/if}
              </span>
            </span>
          </button>
        {:else}
          <p class="sous">{t("Fixez un plafond par catégorie pour suivre vos dépenses du mois.")}</p>
        {/each}
      </section>
      <section class="carte pile">
        <div class="titre">
          <h2>{t("Opérations")}</h2>
          <button class="lien" onclick={() => (app.page = "operations")}>{t("Tout voir")}</button>
        </div>
        {#each recentes as o (o.id)}
          <div class="op">
            <IconeCategorie id={o.categorieId} />
            <div class="corps"><span class="libelle">{libelleLisible(o.libelle)}</span><span class="sous">{dateCourte(o.date)} · {categories.get(o.categorieId ?? "")?.nom ?? t("Sans catégorie")}</span></div>
            <span class="montant fort" class:positif={o.montant > 0}>{argent(o.montant, devise, true)}</span>
          </div>
        {:else}
          <p class="sous">{t("Aucune opération ce mois-ci.")}</p>
        {/each}
      </section>
      </div>
      <div class="colonne">
      <section class="carte pile">
        <div class="titre">
          <h2>{t("Où part mon argent")}<Aide texte={t("Dépenses du mois choisi, par catégorie. Changez une catégorie depuis la fiche d'une opération ou dans Paramètres → Règles de classement.")} /></h2>
          <button class="lien" onclick={() => (app.page = "analyse")}>{t("Analyse")}</button>
        </div>
        {#if parts.length}
          <Anneau {parts} {devise} choisir={(id) => (budgetOuvert = id)} />
        {:else}
          <p class="sous">{t("Aucune dépense ce mois-ci.")}</p>
        {/if}
      </section>
      {#if poches.length}
        <section class="carte pile">
          <div class="titre">
            <h2>{t("Épargne et poches")}<Aide texte={t("Solde de chaque poche ou compte d'épargne. L'objectif est lu dans le nom de la poche (« Objectif : 5000€ ») ou saisi dans sa fiche.")} /></h2>
            <button class="lien" onclick={() => (app.page = "epargne")}>{t("Gérer")}</button>
          </div>
          {#each poches as c (c.id)}
            {@const s = parCompte.get(c.id) ?? 0}
            {@const obj = objectifPoche(c)}
            <button class="poche" onclick={() => (fiche = c)}>
              <IconeCategorie icone={c.parentId ? "pig-money" : c.forme === "especes" ? "cash" : c.forme === "projet" ? "target" : "building-bank"} teinte={c.parentId ? "#7F77DD" : c.forme === "especes" ? "#639922" : c.forme === "projet" ? "#D85A30" : "#378ADD"} taille={34} />
              <span class="corps">
                <span class="ligne-haut"><span class="nom">{c.nom}</span><span class="montant fort">{argent(s, c.devise)}</span></span>
                {#if obj}
                  <span class="jauge"><span style:width="{Math.min(100, Math.max(0, (s / obj) * 100))}%" style:background="var(--serie-revenus)"></span></span>
                  <span class="sous">{Math.round((s / obj) * 100)} {t("% de")} <span class="montant">{argent(obj, c.devise)}</span> {t("· reste")} <span class="montant">{argent(Math.max(0, obj - s), c.devise)}</span></span>
                {/if}
              </span>
            </button>
          {/each}
        </section>
      {/if}
      {#if pretsEnCours.length}
        <section class="carte pile">
          <div class="titre">
            <h2>{t("Prêts")}<Aide texte={t("Capital restant dû d'après l'échéancier de chaque prêt, et prochaine échéance à payer.")} /></h2>
            <button class="lien" onclick={() => (app.page = "prets")}>{t("Gérer")}</button>
          </div>
          {#each pretsEnCours as { p: x, r } (x.id)}
            <button class="poche" onclick={() => (app.page = "prets")}>
              <IconeCategorie icone="building-bank" teinte="#534AB7" taille={34} />
              <span class="corps">
                <span class="ligne-haut"><span class="nom">{x.nom}</span><span class="montant fort">{argent(r.restantDu, "EUR")}</span></span>
                <span class="jauge"><span style:width="{Math.min(100, r.avancement * 100)}%" style:background="var(--serie-revenus)"></span></span>
                {#if r.prochaine}<span class="sous">{t("prochaine échéance")} <span class="montant">{argent(r.aPayer, "EUR")}</span> {t("le")} {dateCourte(r.prochaine.date)} {t("· fin")} {dateCourte(r.fin)}</span>{/if}
              </span>
            </button>
          {/each}
        </section>
      {/if}
      <section class="carte pile">
        <h2>{t("À venir")}<Aide texte={t("Opérations qui reviennent régulièrement (abonnements, loyer, salaire…), attendues dans les 30 prochains jours.")} /></h2>
        {#each aVenir as r (r.compteId + r.motif)}
          <div class="op">
            <IconeCategorie id={r.categorieId} />
            <div class="corps"><span class="libelle">{libelleLisible(r.libelle)}</span><span class="sous">{dateCourte(r.prochaine)}</span></div>
            <span class="montant fort" class:positif={r.montant > 0}>{r.variable ? "≈ " : ""}{argent(r.montant, devise, true)}</span>
          </div>
        {:else}
          <p class="sous">{estActuel ? t("Rien d'attendu dans les 30 prochains jours.") : t("Visible sur le mois en cours.")}</p>
        {/each}
      </section>
      </div>
    </div>

    {#if filtre}
      {@const c = donnees.comptes.find((x) => x.id === filtre)}
      {#if c}<button class="lien gauche" onclick={() => (fiche = c)}>{t("Fiche du compte «")} {c.nom} {t("» (contrôle du solde)")}</button>{/if}
    {/if}
  </div>
{/if}

{#if budgetOuvert}<BudgetEditeur id={budgetOuvert} fermer={() => (budgetOuvert = null)} />{/if}

{#if fiche}
  <CompteFormulaire compte={fiche === "nouveau" ? undefined : fiche} fermer={() => (fiche = null)} />
{/if}

<style>
  .attente {
    font-size: 14px;
    color: var(--accent-texte);
  }
  .accueil {
    max-width: 560px;
  }
  .tete-solde {
    text-align: center;
    padding: 14px 0 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  .solde {
    font-size: 44px;
    font-weight: 800;
    letter-spacing: -0.035em;
    line-height: 1.1;
  }
  .cts {
    font-size: 0.5em;
    letter-spacing: 0;
    vertical-align: 0.72em;
    margin-left: 1px;
  }
  .puce {
    margin-top: 10px;
    background: var(--surface);
    font-size: 13px;
    font-weight: 600;
    color: var(--doux);
    padding: 6px 14px;
  }
  .puce strong {
    color: var(--texte);
  }
  .actions {
    display: flex;
    justify-content: center;
    gap: 22px;
    padding: 6px 0 4px;
  }
  .act {
    flex-direction: column;
    gap: 7px;
    padding: 0;
    background: none;
    font-size: 12px;
    color: var(--doux);
  }
  .act span {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: var(--surface);
    color: var(--texte);
    display: grid;
    place-items: center;
  }
  .act.prim span {
    background: var(--accent);
    color: var(--sur-accent);
  }
  .cartes-comptes {
    display: flex;
    gap: 10px;
    overflow-x: auto;
    scrollbar-width: none;
    scroll-snap-type: x mandatory;
    margin: 0 -14px;
    padding: 0 14px;
    scroll-padding: 0 14px;
  }
  .carte-compte {
    flex: none;
    width: 164px;
    height: 104px;
    border-radius: 18px;
    padding: 13px 14px;
    color: #fff;
    flex-direction: column;
    align-items: flex-start;
    justify-content: space-between;
    text-align: left;
    scroll-snap-align: start;
    gap: 0;
  }
  .carte-compte small {
    font-size: 12px;
    font-weight: 600;
    opacity: 0.85;
    display: flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .carte-compte small i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex: none;
    background: rgb(255 255 255 / 0.85);
  }
  .carte-compte > span {
    display: flex;
    flex-direction: column;
    max-width: 100%;
  }
  .carte-compte strong {
    font-size: 19px;
    font-weight: 800;
    letter-spacing: -0.02em;
  }
  .carte-compte.choisie {
    box-shadow: 0 0 0 3px var(--fond), 0 0 0 5px var(--accent);
  }
  .carte-compte.ajout {
    width: 56px;
    background: var(--surface);
    color: var(--doux);
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 13px;
  }
  /* Grand écran : solde et actions alignés à gauche, comme le reste de la page */
  @media (min-width: 900px) {
    .tete-solde {
      align-items: flex-start;
      text-align: left;
    }
    .solde {
      --solde-max: 52px;
    }
    .actions {
      justify-content: flex-start;
    }
    /* Grand écran : les cartes passent à la ligne plutôt que d'être coupées */
    .cartes-comptes {
      margin: 0;
      padding: 0;
      flex-wrap: wrap;
      overflow: visible;
    }
  }
  .haut {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
  }
  .haut-gauche {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }
  @media (min-width: 1100px) {
    .haut {
      /* La colonne de gauche prend la largeur de son contenu (600 px au plus), la carte du mois le reste :
         pas de vide au milieu */
      grid-template-columns: fit-content(600px) minmax(0, 1fr);
      gap: 16px 32px;
      align-items: start;
    }
  }
  .chiffre {
    font-size: 26px;
    font-weight: 800;
    letter-spacing: -0.02em;
  }
  .conseil {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--alerte-fond);
    color: var(--alerte);
    border-radius: 16px;
    padding: 12px 16px;
    font-size: 14px;
  }
  .conseil .texte {
    flex: 1;
  }
  .conseil .lien {
    color: inherit;
    text-decoration: underline;
    flex: none;
  }
  .grille {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
    gap: 12px;
    align-items: start;
  }
  .colonne {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }
  .titre {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .budget,
  .op,
  .poche {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .corps {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .ligne-haut {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: 14px;
  }
  .nom {
    font-weight: 600;
  }
  .jauge {
    display: block;
    width: 100%;
    height: 6px;
    border-radius: 999px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .jauge > span {
    display: block;
    height: 100%;
    border-radius: 999px;
  }
  .jauge .presque {
    background: var(--alerte);
  }
  .jauge .trop {
    background: var(--danger);
  }
  .ligne-bas {
    display: flex;
    justify-content: flex-end;
  }
  .budget {
    border: none;
    border-radius: 0;
    background: none;
    padding: 0;
    text-align: left;
    color: inherit;
    width: 100%;
  }
  .rythme-pastille {
    font-size: 12px;
    background: var(--alerte-fond);
    color: var(--alerte);
    border-radius: 999px;
    padding: 1px 8px;
  }
  .alerte-pastille {
    font-size: 12px;
    background: var(--danger-fond);
    color: var(--danger);
    border-radius: 999px;
    padding: 1px 8px;
  }
  .op {
    font-size: 14px;
  }
  .libelle {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .op .sous {
    font-size: 12px;
  }
  .poche {
    border: none;
    border-radius: 0;
    background: none;
    padding: 0;
    text-align: left;
    color: inherit;
  }
  .poche + .poche {
    border-top: 1px solid var(--bord);
    padding-top: 12px;
  }
  .gauche {
    align-self: flex-start;
  }
  .fort {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    flex: none;
  }
  .positif {
    color: var(--ok);
  }
  @media (max-width: 1099px) {
    .grille {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .trois {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }
  .trois p {
    margin: 0;
  }
  .trois .chiffre {
    font-size: clamp(17px, 4.6vw, 26px);
  }
  .chiffre.positif {
    color: var(--ok);
  }
  .chiffre.negatif {
    color: var(--danger);
  }
  .carre {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 3px;
    margin-right: 6px;
    vertical-align: -1px;
  }
</style>
