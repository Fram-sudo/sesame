<script lang="ts">
  import { t, locale } from "../i18n.svelte";
  // Import de relevés, quelle que soit la banque : un ou plusieurs fichiers (sélecteur ou glisser-déposer sur PC),
  // banque et compte reconnus automatiquement, vérification fichier par fichier, puis un seul bouton.
  import { onMount } from "svelte";
  import { api, estAndroid, type Releve } from "../api";
  import { classerEtLier, comptesImport, donnees, ecrire, nouvelId, soldes, supprimer, type Changement, type Import } from "../donnees.svelte";
  import { separerDoublons } from "../import/doublons";
  import { SvelteSet } from "svelte/reactivity";
  import Choix from "../Choix.svelte";
  import ControleSolde from "../ControleSolde.svelte";
  import { optionsDevises } from "../devises";
  import { argent } from "../format";
  import { libelleLisible } from "../categories";
  import type { Compte, Operation } from "../donnees.svelte";
  import { annoncer } from "../etat.svelte";
  import FichierImport from "../FichierImport.svelte";
  import { dateCourte } from "../format";
  import Icone from "../Icone.svelte";
  import { preparer, type Preparation } from "../import/fichier";

  let fichiers = $state.raw<{ cle: number; prep: Preparation }[]>([]);
  let cartes = $state<FichierImport[]>([]);
  let erreurs = $state<string[]>([]);
  let enCours = $state(false);
  let survol = $state(false);
  let aAnnuler = $state("");
  let n = 0;
  const historique = $derived([...donnees.imports].sort((a, b) => b.quand - a.quand));
  // Où en est chaque compte : date de sa dernière opération, pour savoir quel relevé importer
  const aJour = $derived.by(() => {
    const der = new Map<string, string>();
    for (const o of donnees.operations) if (!o.enAttente && o.date > (der.get(o.compteId) ?? "")) der.set(o.compteId, o.date);
    const auj = Date.now();
    return donnees.comptes
      // Comptes courants, et épargne seulement si elle s'importe (une tirelire se tient à la main)
      .filter((c) => !c.parentId && !c.archive && (c.type !== "epargne" || donnees.imports.some((i) => comptesImport(i).includes(c.id))))
      .map((c) => {
        const d = der.get(c.id);
        return { c, d, jours: d ? Math.floor((auj - Date.parse(d + t("T12:00:00"))) / 86_400_000) : undefined };
      })
      .sort((a, b) => (b.jours ?? 1e9) - (a.jours ?? 1e9));
  });

  async function ajouter(releves: Releve[]) {
    enCours = true;
    for (const r of releves) {
      try {
        fichiers = [...fichiers, { cle: n++, prep: await preparer(r, donnees.profils) }];
      } catch (e) {
        erreurs = [...erreurs, `${r.nom} : ${e}`];
      }
    }
    enCours = false;
  }

  async function choisir() {
    erreurs = [];
    try {
      await ajouter(await api.lireReleves());
    } catch (e) {
      erreurs = [String(e)];
    }
  }

  async function toutImporter() {
    enCours = true;
    // Un seul import pour tous les relevés ; un fichier après l'autre, pour écarter les doublons entre relevés qui se chevauchent
    const lot = { id: nouvelId(), crees: new Map<string, string>() };
    const bilans = [];
    for (const c of cartes) {
      const b = c?.estPret() ? await c.importer(lot) : undefined;
      if (b) bilans.push(b);
    }
    // Compte créé par ce lot : son solde de départ vient du « solde précédent » du plus ancien relevé
    for (const id of new Set(lot.crees.values())) {
      const depart = bilans.filter((b) => b.compteId === id && b.depart).map((b) => b.depart!).sort((a, b) => a.date.localeCompare(b.date))[0];
      const c = donnees.comptes.find((x) => x.id === id);
      const ecart = depart && c ? depart.montant - (soldes(depart.date).get(id) ?? 0) : 0;
      if (ecart) await ecrire([{ collection: "comptes", id, valeur: { ...c!, soldeInitial: c!.soldeInitial + ecart } }]);
    }
    if (bilans.length) {
      const dates = bilans.flatMap((b) => b.dates).sort();
      const comptes = [...new Set(bilans.map((b) => b.compteId))];
      const imp: Import = {
        id: lot.id,
        compteId: comptes[0],
        comptes,
        quand: Date.now(),
        fichier: bilans.map((b) => b.fichier).join(", "),
        fichiers: bilans.map((b) => b.fichier),
        banque: [...new Set(bilans.map((b) => b.banque).filter(Boolean))].join(", "),
        nb: bilans.reduce((s, b) => s + b.nb, 0),
        doublons: bilans.reduce((s, b) => s + b.doublons, 0),
        de: dates[0],
        a: dates[dates.length - 1],
        remplacees: bilans.flatMap((b) => b.remplacees),
      };
      await ecrire([{ collection: "imports", id: imp.id, valeur: imp }]);
    }
    enCours = false;
    annoncer(t("Import terminé."));
    if (plusieurs) {
      // Bilan par compte ; le contrôle du solde se fait sur le relevé le plus récent du compte
      const parGroupe = new Map<string, BilanCompte>();
      for (const c of cartes) {
        const r = c?.resultatFinal();
        if (!r) continue;
        const g = parGroupe.get(r.cle) ?? { cle: r.cle, compte: r.compte, nb: 0, reparees: 0, reconnues: 0, poches: 0, nouvellesPoches: [], ecart: 0 };
        g.nb += r.nb;
        g.reconnues += r.reconnues;
        g.reparees += r.reparees;
        g.poches += r.poches;
        g.nouvellesPoches.push(...r.nouvellesPoches.filter((p) => !g.nouvellesPoches.includes(p)));
        if (r.soldeBanque !== undefined && r.date && (!g.date || r.date >= g.date)) Object.assign(g, { soldeBanque: r.soldeBanque, date: r.date, ecart: r.ecart, compte: r.compte });
        parGroupe.set(r.cle, g);
      }
      bilanLot = [...parGroupe.values()];
      fichiers = fichiers.filter((_, i) => !cartes[i]?.resultatFinal());
      garder.clear();
      // Tout correspond à la banque : le bilan se retire de lui-même ; sinon il reste pour corriger
      if (bilanLot.every((b) => !b.ecart)) setTimeout(() => (bilanLot = []), 6000);
      return;
    }
    // Le fichier n'est jamais gardé : une fois importé (soldes d'accord), sa carte se retire d'elle-même
    setTimeout(() => (fichiers = fichiers.filter((_, i) => !cartes[i]?.fini())), 4000);
  }

  // L'historique est un simple repère : retirer une ligne garde toutes ses opérations
  async function retirerDeLaListe(imp: Import) {
    await ecrire([{ collection: "imports", id: imp.id, valeur: null }]);
    annoncer(t("Ligne retirée : les opérations restent dans l'appli."));
  }

  async function annulerImport(imp: Import) {
    // Tout ce que l'import a apporté part ; les saisies qu'il avait remplacées reviennent
    await ecrire([
      ...supprimer("operations", donnees.operations.filter((o) => o.importId === imp.id)),
      ...(imp.remplacees ?? []).map((o) => ({ collection: "operations", id: o.id, valeur: o }) as Changement),
      { collection: "imports", id: imp.id, valeur: null },
    ]);
    await classerEtLier();
    aAnnuler = "";
    annoncer(t("{0} opérations supprimées.", imp.nb));
  }

  // Glisser-déposer des relevés sur la fenêtre (PC)
  onMount(() => {
    if (estAndroid) return;
    let fin: (() => void) | undefined;
    import("@tauri-apps/api/webview")
      .then(({ getCurrentWebview }) =>
        getCurrentWebview().onDragDropEvent(async (e) => {
          if (e.payload.type === "over" || e.payload.type === "enter") survol = true;
          else survol = false;
          if (e.payload.type === "drop" && e.payload.paths.length) {
            erreurs = [];
            await ajouter(await api.lireRelevesChemins(e.payload.paths));
          }
        }),
      )
      .then((f) => (fin = f))
      .catch(() => {}); // hors de l'appli (navigateur de développement)
    return () => fin?.();
  });

  const nbPrets = $derived(fichiers.length);
  // Relevés déjà tous importés : on compare quand même le solde qu'ils indiquent à celui de l'appli (le plus récent par compte)
  const controles = $derived.by(() => {
    if (enCours || cartes.some((c) => c?.estPret() || c?.attendValidation())) return [];
    const m = new Map<string, NonNullable<ReturnType<FichierImport["depart"]>>>();
    for (const c of cartes) {
      const d = c?.depart();
      if (d && (!m.has(d.compte.id) || d.date > m.get(d.compte.id)!.date)) m.set(d.compte.id, d);
    }
    return [...m.values()];
  });
  // Un relevé d'un format jamais vu attend qu'on vérifie son aperçu
  const aVerifier = $derived(cartes.some((c) => c?.attendValidation()));
  const plusieurs = $derived(fichiers.length > 1);

  // ---------- Plusieurs relevés : tout se règle et se vérifie une seule fois ----------
  type BilanCompte = { cle: string; compte?: Compte; nb: number; reparees: number; reconnues: number; poches: number; nouvellesPoches: string[]; soldeBanque?: number; date?: string; ecart: number };
  let bilanLot = $state<BilanCompte[]>([]);
  // Saisies à la main que l'utilisateur préfère garder (la ligne de la banque correspondante n'est alors pas importée)
  const garder = new SvelteSet<string>();
  let onglet = $state<"nouvelles" | "saisies" | "attente" | "poches">("nouvelles");
  let limite = $state(100);

  // Groupes : les relevés d'un même compte, réglés ensemble (un seul choix de compte pour tout le groupe)
  const groupes = $derived.by(() => {
    const m = new Map<string, { cle: string; compteId: string; nouveauNom: string; nouvelleDevise: string; cartes: FichierImport[] }>();
    for (const c of cartes) {
      const g = c?.groupe();
      if (!g) continue;
      const x = m.get(g.cle) ?? { ...g, cartes: [] };
      x.cartes.push(c);
      m.set(g.cle, x);
    }
    return [...m.values()];
  });
  const reglerGroupe = (g: { cartes: FichierImport[] }, r: { compteId?: string; nouveauNom?: string; nouvelleDevise?: string }) => g.cartes.forEach((c) => c.regler(r));
  const optionsComptes = $derived([{ v: "", l: t("Nouveau compte…") }, ...donnees.comptes.filter((c) => !c.parentId).map((c) => ({ v: c.id, l: `${c.nom}${c.banque ? ` · ${c.banque}` : ""} (${c.devise})` }))]);

  // Formats jamais vus : un seul aperçu par format, pour tous les relevés de ce format.
  // Le relevé le plus fourni sert de modèle (un relevé d'une seule ligne ferait mal deviner les colonnes).
  const formats = $derived.by(() => {
    const m = new Map<string, { carte: FichierImport; apercu: NonNullable<ReturnType<FichierImport["apercu"]>>; n: number }>();
    for (const c of cartes) {
      const a = c?.apercu();
      if (!a) continue;
      const x = m.get(c.formatCle());
      if (x) (x.n++, a.nb > x.apercu.nb && ((x.carte = c), (x.apercu = a)));
      else m.set(c.formatCle(), { carte: c, apercu: a, n: 1 });
    }
    return [...m.values()];
  });
  async function toutValider() {
    for (const f of formats) if (f.apercu.ops.length) await f.carte.valider();
  }

  // Vérification commune : tous les relevés fusionnés, les opérations présentes dans deux relevés comptées une fois
  type Element = { o: { date: string; montant: number; libelle: string; detail?: string }; attente: boolean; saisie?: Operation; compte: string; devise: string };
  const revue = $derived.by(() => {
    const vues = new Map<string, { cle: string }[]>();
    const nouvelles: Element[] = [];
    const saisies = new Map<string, Element>();
    const poches = new Map<string, number>();
    let deja = 0;
    for (const c of cartes) {
      const e = c?.elements();
      if (!e) continue;
      const v = vues.get(e.cle) ?? [];
      const { nouvelles: n, doublons } = separerDoublons(e.nouvelles.map((x, i) => ({ date: x.o.date, montant: x.o.montant, libelle: x.o.libelle, i })), v);
      deja += e.doublons + doublons.length;
      v.push(...n);
      vues.set(e.cle, v);
      for (const k of n) {
        const x: Element = { ...e.nouvelles[k.i], compte: e.nom, devise: e.devise };
        nouvelles.push(x);
        if (x.saisie && !saisies.has(x.saisie.id)) saisies.set(x.saisie.id, x);
      }
      for (const p of e.poches) poches.set(p.nom, (poches.get(p.nom) ?? 0) + p.n);
    }
    nouvelles.sort((a, b) => b.o.date.localeCompare(a.o.date));
    return { nouvelles, saisies: [...saisies.values()], attente: nouvelles.filter((x) => x.attente), poches: [...poches], deja };
  });
  const liste = $derived(onglet === "saisies" ? revue.saisies : onglet === "attente" ? revue.attente : revue.nouvelles);
</script>

<div class="pile">
  <section class="carte depot pile" class:survol>
    <Icone nom="importer" taille={28} />
    <p><strong>{estAndroid ? t("Choisissez vos relevés") : t("Déposez vos relevés ici")}</strong></p>
    <p class="sous">{t("PDF, CSV, Excel, OFX, QIF ou CAMT, de n'importe quelle banque, un ou plusieurs à la fois. La banque et le compte sont reconnus automatiquement.")}</p>
    <button class="principal" data-visite="import" onclick={choisir} disabled={enCours}>{enCours ? t("Lecture…") : t("Choisir des fichiers")}</button>
  </section>

  {#each erreurs as e, i (i)}<p class="erreur">{e}</p>{/each}

  {#if plusieurs}<h2 class="titre-lot">{t("Vos relevés ({0})", fichiers.length)}</h2>{/if}
  {#each fichiers as f, i (f.cle)}
    <FichierImport bind:this={cartes[i]} prep={f.prep} dansUnLot={plusieurs} {garder} retirer={() => (fichiers = fichiers.filter((x) => x.cle !== f.cle))} />
  {/each}

  {#if plusieurs}
    <!-- 1. Un compte par groupe de relevés (reconnu tout seul ; à choisir seulement s'il est inconnu) -->
    <section class="carte pile">
      <h2>{t("Dans quels comptes ?")}</h2>
      {#each groupes as g (g.cle)}
        <div class="groupe pile">
          <p class="sous">{t("{0} relevé(s)", g.cartes.length)}{g.compteId ? "" : ` · ${t("compte inconnu : créé à l'import, ou choisissez-en un")}`}</p>
          <Choix valeur={g.compteId} titre={t("Compte")} options={optionsComptes} change={(v) => reglerGroupe(g, { compteId: v as string })} />
          {#if !g.compteId}
            <div class="deux">
              <label>{t("Nom du nouveau compte")}<input value={g.nouveauNom} oninput={(e) => reglerGroupe(g, { nouveauNom: e.currentTarget.value })} /></label>
              <label>{t("Devise")}<Choix valeur={g.nouvelleDevise} titre={t("Devise")} options={optionsDevises(donnees.comptes.map((c) => c.devise))} change={(v) => reglerGroupe(g, { nouvelleDevise: v as string })} /></label>
            </div>
          {/if}
        </div>
      {/each}
    </section>

    {#if formats.length}
      <!-- 2. Formats jamais vus : un aperçu par format, une seule validation -->
      <section class="carte pile verifier-lot" data-visite="verifier">
        <h2>{t("Vérifiez vos relevés")}</h2>
        <p class="sous">{t("Première fois que Sésame voit ces formats : voici ce qu'il a compris. Une seule fois : les prochains relevés de ces formats seront reconnus tout seuls.")}</p>
        {#each formats as f (f.carte.formatCle())}
          <div class="format pile">
            <p><strong>{f.apercu.banque ?? f.apercu.fichier}</strong> <span class="sous">· {t("{0} relevé(s) de ce format", f.n)}</span></p>
            {#if f.apercu.ops.length}
              <ul class="apercu">
                {#each f.apercu.ops as o, k (k)}
                  <li><span class="texte"><span class="libelle">{o.libelle}</span><span class="sous">{dateCourte(o.date)}</span></span><span class="montant" class:plus={o.montant > 0}>{argent(o.montant, f.apercu.devise, true)}</span></li>
                {/each}
              </ul>
            {:else}
              <p class="erreur">{t("Aucune opération lue : indiquez quelle colonne contient quoi.")}</p>
            {/if}
            {#if f.apercu.inverser}<p class="info">{t("Dans ce relevé, les dépenses sont écrites sans signe moins : Sésame les a remises dans le bon sens.")}</p>{/if}
            {#if f.apercu.soldesFaux}<p class="erreur">{t("Les soldes du relevé ne suivent pas ces montants : vérifiez les colonnes.")}</p>{/if}
            <button class="lien gauche" onclick={() => f.carte.corriger()}>{t("Corriger les colonnes de ce format")}</button>
          </div>
        {/each}
        <button class="principal" data-visite="valider" onclick={toutValider}>{t("C'est bon pour tous")}</button>
      </section>
    {:else if revue.nouvelles.length || revue.poches.length}
      <!-- 3. Vérification commune, en onglets -->
      <section class="carte pile">
        <h2>{t("Ce qui va être importé")}</h2>
        <div class="onglets" role="tablist">
          <button role="tab" aria-selected={onglet === "nouvelles"} onclick={() => (onglet = "nouvelles")}>{t("Nouvelles")} ({revue.nouvelles.length})</button>
          {#if revue.saisies.length}<button role="tab" aria-selected={onglet === "saisies"} onclick={() => (onglet = "saisies")}>{t("Vos saisies retrouvées")} ({revue.saisies.length})</button>{/if}
          {#if revue.attente.length}<button role="tab" aria-selected={onglet === "attente"} onclick={() => (onglet = "attente")}>{t("En attente")} ({revue.attente.length})</button>{/if}
          {#if revue.poches.length}<button role="tab" aria-selected={onglet === "poches"} onclick={() => (onglet = "poches")}>{t("Poches")} ({revue.poches.reduce((s, [, n]) => s + n, 0)})</button>{/if}
        </div>
        {#if onglet === "poches"}
          <ul class="ops">{#each revue.poches as [nom, n] (nom)}<li><span class="libelle">{nom}</span><span class="sous">{t("{0} nouvelle(s) opération(s)", n)}</span></li>{/each}</ul>
        {:else}
          {#if onglet === "saisies"}<p class="sous">{t("Cochée : la ligne de la banque remplace votre saisie (votre catégorie et votre note sont gardées). Décochée : votre saisie reste telle quelle.")}</p>{/if}
          <ul class="ops">
            {#each liste.slice(0, limite) as x, k (k)}
              <li>
                {#if onglet === "saisies" && x.saisie}
                  {@const id = x.saisie.id}
                  <label class="case"><input type="checkbox" checked={!garder.has(id)} onchange={(e) => (e.currentTarget.checked ? garder.delete(id) : garder.add(id))} />
                    <span class="texte"><span class="libelle">{libelleLisible(x.o.libelle)}</span><span class="sous">{t("remplace « {0} » du {1}", x.saisie.libelle, dateCourte(x.saisie.date))}</span></span>
                  </label>
                {:else}
                  <span class="texte"><span class="libelle">{libelleLisible(x.o.libelle)}</span><span class="sous">{dateCourte(x.o.date)} · {x.compte}{x.attente ? ` · ${t("en attente")}` : ""}</span></span>
                {/if}
                <span class="montant" class:plus={x.o.montant > 0}>{argent(x.o.montant, x.devise, true)}</span>
              </li>
            {/each}
          </ul>
          {#if liste.length > limite}<button onclick={() => (limite += 300)}>{t("Afficher plus ({0} restantes)", liste.length - limite)}</button>{/if}
        {/if}
        {#if revue.deja}<p class="sous">{t("{0} opération(s) en double (entre vos relevés ou déjà dans l'appli) : ignorées.", revue.deja)}</p>{/if}
      </section>
    {/if}
  {/if}

  {#if controles.length && !bilanLot.length}
    <section class="carte pile">
      <h2>{t("Rien de nouveau : vérifions le solde")}</h2>
      <p class="sous">{t("Ces relevés sont déjà dans l'appli. Voici le solde qu'ils indiquent, comparé à celui de l'appli.")}</p>
      {#each controles as d (d.compte.id)}
        <div class="groupe pile">
          <strong>{d.compte.nom}</strong>
          <ControleSolde compte={d.compte} soldeBanque={d.montant} date={d.date} />
        </div>
      {/each}
    </section>
  {/if}

  {#if bilanLot.length}
    <!-- 4. Bilan par compte -->
    <section class="carte pile">
      <h2>{t("Import terminé")}</h2>
      {#each bilanLot as b (b.cle)}
        <div class="groupe pile">
          <p class="ok" data-visite="importe">✓ {t("{0} opération(s) dans « {1} »", b.nb, b.compte?.nom ?? "")}{b.poches ? t(", {0} dans les poches", b.poches) : ""}.</p>
          {#if b.reparees}<p class="sous">{t("{0} opération(s) déjà présente(s) : libellé complété (catégorie et note gardées).", b.reparees)}</p>{/if}
          {#if b.reconnues}<p class="sous">{t("{0} opération(s) déjà notée(s) retrouvée(s) dans le relevé : remplacée(s) par la ligne de la banque, catégorie gardée.", b.reconnues)}</p>{/if}
          {#each b.nouvellesPoches as n (n)}<p class="info">{t("Nouvelle poche détectée : «")} {n} {t("». Renommez-la ou fixez-lui un objectif depuis sa fiche.")}</p>{/each}
          {#if b.compte && b.soldeBanque !== undefined}<ControleSolde compte={b.compte} soldeBanque={b.soldeBanque} date={b.date} />{/if}
        </div>
      {/each}
      <button class="lien gauche" onclick={() => (bilanLot = [])}>{t("Fermer")}</button>
    </section>
  {/if}

  {#if nbPrets}
    {#if aVerifier && !plusieurs}<p class="sous">{t("Vérifiez d'abord l'aperçu du relevé ci-dessus, puis touchez « C'est bon ».")}</p>{/if}
    {#if plusieurs && !aVerifier && revue.nouvelles.length}<p class="sous">{t("Tout sera importé en une fois, et pourra être retrouvé en une seule ligne dans l'historique.")}</p>{/if}
    <div class="actions">
      <button onclick={() => (fichiers = [])}>{t("Tout effacer")}</button>
      <button class="principal" data-visite="importer" onclick={toutImporter} disabled={enCours || aVerifier}>{enCours ? t("Import en cours…") : plusieurs ? t("Importer tout") : t("Importer")}</button>
    </div>
  {/if}

  {#if aJour.length && !nbPrets}
    <section class="carte pile">
      <h2>{t("Où en sont vos comptes")}</h2>
      {#each aJour as { c, d, jours } (c.id)}
        <div class="histo">
          <div>
            <strong>{c.nom}</strong>
            <p class="sous">{d ? (jours ? t("Dernière opération le {0} (il y a {1} j)", dateCourte(d), jours) : t("Dernière opération le {0} (aujourd'hui)", dateCourte(d))) : t("Aucune opération pour l'instant")}</p>
          </div>
          {#if jours === undefined || jours > 30}<span class="a-faire">{t("Relevé à importer")}</span>{/if}
        </div>
      {/each}
    </section>
  {/if}

  {#if historique.length}
    <section class="carte pile" data-visite="historique">
      <h2>{t("Imports précédents")}</h2>
      {#each historique as imp (imp.id)}
        {@const noms = comptesImport(imp).map((id) => donnees.comptes.find((x) => x.id === id)?.nom).filter(Boolean).join(", ")}
        <div class="histo">
          <div>
            <strong>{(imp.fichiers?.length ?? 1) > 1 ? t("Import de {0} relevés", imp.fichiers!.length) : imp.fichier}</strong>
            {#if (imp.fichiers?.length ?? 1) > 1}<p class="sous fichiers">{imp.fichiers!.join(" · ")}</p>{/if}
            <p class="sous">
              {noms} · {imp.nb} {t("opération")}{imp.nb > 1 ? "s" : ""}{imp.nb ? " " + t("du {0} au {1}", dateCourte(imp.de), dateCourte(imp.a)) : ""}
              {t("· importé le")} {new Date(imp.quand).toLocaleDateString(locale())}
            </p>
          </div>
          <!-- Le geste courant ne touche jamais aux opérations : il retire seulement la ligne de l'historique -->
          <button class="lien" onclick={() => retirerDeLaListe(imp)}>{t("Retirer de la liste")}</button>
        </div>
        {#if aAnnuler === imp.id}
          <div class="pile confirmer">
            <p class="erreur">{t("Ces {0} opérations vont disparaître de l'appli. C'est utile seulement si ce relevé a été importé par erreur (mauvais compte, mauvais fichier).", imp.nb)}</p>
            <div class="ligne">
              <button onclick={() => (aAnnuler = "")}>{t("Garder")}</button>
              <button class="danger" onclick={() => annulerImport(imp)}>{t("Supprimer définitivement")}</button>
            </div>
          </div>
        {:else}
          <button class="lien rouge supprimer" onclick={() => (aAnnuler = imp.id)}>{t("Supprimer les {0} opérations de cet import…", imp.nb)}</button>
        {/if}
      {/each}
    </section>
  {/if}
</div>

<style>
  .a-faire {
    flex: none;
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--orange-fond, rgba(216, 90, 48, 0.15));
    color: var(--orange, #d85a30);
  }
  .depot {
    align-items: center;
    text-align: center;
    border: 2px dashed var(--bord);
    padding: 28px 18px;
    color: var(--doux);
  }
  .depot strong {
    color: var(--texte);
  }
  .survol {
    border-color: var(--accent);
    background: var(--accent-fond);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .histo {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    border-top: 1px solid var(--bord);
    padding-top: 10px;
  }
  .histo strong {
    word-break: break-all;
  }
  .titre-lot {
    font-size: 1.05rem;
    margin: 4px 0 -4px;
  }
  .groupe {
    border-top: 1px solid var(--bord);
    padding-top: 10px;
    gap: 8px;
  }
  .groupe .sous,
  .groupe p {
    margin: 0;
  }
  .deux {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 8px;
  }
  .verifier-lot {
    background: var(--accent-fond);
  }
  .format {
    gap: 8px;
  }
  .format p {
    margin: 0;
  }
  .apercu,
  .ops {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .apercu li,
  .ops li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    background: var(--fond);
    border-radius: 10px;
    padding: 8px 10px;
  }
  .texte {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .libelle {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }
  .montant {
    font-weight: 700;
    color: var(--danger);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .montant.plus {
    color: var(--ok);
  }
  .case {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .onglets {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    padding: 4px;
    border-radius: 999px;
    background: var(--fond);
    width: fit-content;
  }
  .onglets button {
    border-radius: 999px;
    padding: 7px 12px;
    font-size: 13px;
    background: none;
    color: var(--doux);
  }
  .onglets button[aria-selected="true"] {
    background: var(--accent);
    color: var(--sur-accent);
  }
  .gauche {
    align-self: flex-start;
  }
  .fichiers {
    word-break: break-all;
  }
  .rouge {
    color: var(--danger);
  }
  .supprimer {
    align-self: flex-start;
    font-size: 13px;
    margin-top: -4px;
  }
  .confirmer {
    gap: 8px;
  }
  .ligne {
    display: flex;
    gap: 6px;
    flex: none;
  }
</style>
