<script lang="ts">
  import Choix from "./Choix.svelte";
  import { t } from "./i18n.svelte";
  // Un relevé prêt à importer : banque reconnue, compte choisi tout seul, poches réparties en sous-comptes,
  // doublons écartés. L'assistant de colonnes ne s'ouvre que si l'appli n'a pas su lire le fichier.
  import { attribuerPoches } from "./categories";
  import ControleSolde from "./ControleSolde.svelte";
  import { classerEtLier, DEVISES, donnees, ecrire, nouvelId, soldes, type Changement, type Compte, type Devise, type Import, type Operation } from "./donnees.svelte";
  import { argent, dateCourte } from "./format";
  import { coherenceSoldes, lire, manques, type FormatDate, type Role } from "./import/analyse";
  import { cleOp, rapprocherSaisies, separerDoublons } from "./import/doublons";
  import { choisirCompte, deviner, type Preparation } from "./import/fichier";

  let { prep, retirer }: { prep: Preparation; retirer: () => void } = $props();

  // L'état de départ vient du fichier lu ; l'utilisateur peut ensuite tout ajuster
  /* svelte-ignore state_referenced_locally */
  let profil = $state(structuredClone(prep.profil));
  /* svelte-ignore state_referenced_locally */
  let idx = $state(prep.idx);
  /* svelte-ignore state_referenced_locally */
  let compteId = $state(choisirCompte(prep, donnees.comptes.filter((c) => !c.parentId), donnees.imports));
  // Tableaux importés : selon les options du compte (Paramètres → Banques et imports)
  /* svelte-ignore state_referenced_locally */
  const options = donnees.comptes.find((c) => c.id === compteId);
  /* svelte-ignore state_referenced_locally */
  let choisies = $state(
    prep.choisies.filter((s) => !(options?.importAttente === false && prep.enAttente.includes(s)) && !(options?.importPoches === false && prep.poches.includes(s))),
  );
  /* svelte-ignore state_referenced_locally */
  let nouveauNom = $state(prep.banque ?? prep.nom.replace(/\.[a-z0-9]+$/i, ""));
  /* svelte-ignore state_referenced_locally */
  let nouvelleDevise = $state<Devise>((DEVISES as readonly string[]).includes(prep.devise ?? "") ? (prep.devise as Devise) : "EUR");
  /* svelte-ignore state_referenced_locally */
  let assistant = $state(manques(prep.profil).length > 0);
  let profilModifie = false;
  let etat = $state<"pret" | "encours" | "fait">("pret");
  let resultat = $state<{ nb: number; reconnues: number; poches: number; nouvellesPoches: string[]; soldeBanque?: number; date?: string; compte?: Compte } | null>(null);
  let erreur = $state("");

  const compte = $derived(donnees.comptes.find((c) => c.id === compteId));
  const devise = $derived(compte?.devise ?? nouvelleDevise);
  const iSection = $derived(prep.lignes[0]?.indexOf(t("Section")) ?? -1);
  const filtrer = (garder: (s: string) => boolean) =>
    prep.sections.length < 1 ? prep.lignes : [prep.lignes[0], ...prep.lignes.slice(1).filter((l) => garder(l[iSection]))];
  const principal = $derived(filtrer((s) => choisies.includes(s) && !prep.poches.includes(s)));
  const tablePoches = $derived(prep.poches.length ? filtrer((s) => choisies.includes(s) && prep.poches.includes(s)) : []);
  const ok = $derived(manques(profil).length === 0);
  const lecture = $derived(ok ? lire(principal, idx, profil, devise) : null);
  const lecturePoches = $derived(ok && tablePoches.length > 1 ? lire(tablePoches, idx, profil, devise) : null);

  // Doublons : opérations du compte (et celles importées ici puis déplacées ailleurs)
  const tri = $derived.by(() => {
    if (!lecture) return null;
    const imports = new Set(donnees.imports.filter((i) => i.compteId === compteId).map((i) => i.id));
    return separerDoublons(lecture.ops, compteId ? donnees.operations.filter((o) => o.compteId === compteId || (o.importId && imports.has(o.importId))) : []);
  });
  const sousComptes = $derived(compteId ? donnees.comptes.filter((c) => c.parentId === compteId) : []);
  // Poches : nouvelles lignes, réparties d'après tout l'historique des poches (pour la poche « prêt »)
  const poches = $derived.by(() => {
    if (!lecturePoches) return null;
    const ids = new Set(sousComptes.map((c) => c.id));
    const existantes = donnees.operations.filter((o) => ids.has(o.compteId));
    const { nouvelles, doublons } = separerDoublons(lecturePoches.ops, existantes);
    const neuves = nouvelles.map((o) => ({ ...o, id: nouvelId(), compteId: "" }));
    const repartition = attribuerPoches([...existantes, ...neuves], true);
    const parPoche = new Map<string, typeof neuves>();
    for (const o of neuves) {
      const p = repartition.get(o.id) ?? t("Poche");
      parPoche.set(p, [...(parPoche.get(p) ?? []), o]);
    }
    return { parPoche, doublons: doublons.length };
  });
  const nbPoches = $derived(poches ? [...poches.parPoche.values()].reduce((a, l) => a + l.length, 0) : 0);
  const suspects = $derived(tri ? tri.nouvelles.filter((o) => Math.abs(o.montant) >= (devise === "XOF" ? 1e8 : 1e7)) : []);
  // Format jamais vu : l'utilisateur vérifie l'aperçu une fois, ensuite il est reconnu tout seul
  /* svelte-ignore state_referenced_locally */
  let valide = $state(!prep.profilNouveau);
  const cleProfil = (p: { cle?: string; entete: string[] }) => p.cle ?? p.entete.join("|");
  const aValider = $derived(!valide && !donnees.profils.some((p) => cleProfil(p) === cleProfil(profil)));
  async function valider() {
    await ecrire([{ collection: "profils", id: profil.id, valeur: $state.snapshot(profil) }]);
    valide = true;
    assistant = false;
    profilModifie = false;
  }
  // Le solde donné par le relevé ne suit pas les montants lus : colonnes sans doute mal comprises
  const soldesFaux = $derived.by(() => {
    const a = lecture?.ops.filter((o) => o.solde !== undefined) ?? [];
    const c = coherenceSoldes(a.map((o) => o.montant), a.map((o) => o.solde!));
    return c.n >= 5 && c.ok < 0.8;
  });
  // Rien de lisible : l'assistant s'ouvre de lui-même
  const assistantOuvert = $derived(assistant || (!!lecture && !lecture.ops.length && lecture.erreurs.length > 0));
  // Opérations déjà notées sur ce compte (saisies à la main, en attente ou marquées effectuées), retrouvées
  // dans le relevé (même montant, à quelques jours près) : la ligne de la banque les remplace, sans doublon
  const saisies = $derived(compteId ? donnees.operations.filter((o) => o.compteId === compteId && (o.manuelle || o.enAttente || o.etaitEnAttente)) : []);
  const reconnues = $derived(tri ? rapprocherSaisies(tri.nouvelles.filter((o) => !o.enAttente), saisies) : new Map());
  const nbAttente = $derived(tri ? tri.nouvelles.filter((o) => o.enAttente || prep.enAttente.includes(principal[o.ligne - 1]?.[iSection] ?? "")).length : 0);
  const pret = $derived(ok && !aValider && !!tri && (tri.nouvelles.length > 0 || nbPoches > 0));

  export async function importer() {
    if (!pret || etat !== "pret" || !tri || !lecture) return;
    etat = "encours";
    erreur = "";
    const nbPrincipal = tri.nouvelles.length;
    const nbDansPoches = nbPoches;
    try {
      const ch: Changement[] = [];
      // Compte principal : créé au besoin, et retenu pour les prochains relevés de ce type
      let cid = compteId;
      if (!cid) {
        cid = nouvelId();
        ch.push({ collection: "comptes", id: cid, valeur: { id: cid, nom: nouveauNom.trim() || t("Compte"), banque: prep.banque ?? "", devise: nouvelleDevise, soldeInitial: 0, type: "courant", empreinte: prep.empreinte } });
      } else if (!compte?.empreinte && prep.empreinte) ch.push({ collection: "comptes", id: cid, valeur: { ...compte!, empreinte: prep.empreinte } });

      const importId = nouvelId();
      const ops: Operation[] = tri.nouvelles.map((o) => {
        const { ligne, solde: _s, enAttente: attenteLue, ...op } = o;
        const attente = attenteLue || prep.enAttente.includes(principal[ligne - 1]?.[iSection] ?? "");
        // Saisie à la main retrouvée : on garde sa catégorie et sa note, la banque donne la date et le libellé exacts
        const s = reconnues.get(o);
        const garde = s ? { ...(s.categorieId ? { categorieId: s.categorieId, categorieManuelle: true } : {}), ...(s.note ? { note: s.note } : {}) } : {};
        return { ...op, ...garde, id: nouvelId(), compteId: cid, importId, ...(attente ? { enAttente: true } : {}) };
      });
      for (const s of reconnues.values()) ch.push({ collection: "operations", id: s.id, valeur: null });
      const nbReconnues = reconnues.size;
      // Poches : un sous-compte d'épargne par poche, créé au premier import ; reconnu ensuite par son nom
      // dans le relevé (même si vous l'avez renommé dans l'appli) ; une poche archivée qui bouge à nouveau réapparaît
      const nouvellesPoches: string[] = [];
      for (const [nom, liste] of poches?.parPoche ?? []) {
        let p = sousComptes.find((c) => (c.nomBanque ?? c.nom) === nom || c.alias?.includes(nom));
        if (!p) {
          p = { id: nouvelId(), nom, nomBanque: nom, banque: prep.banque ?? "", devise, soldeInitial: 0, type: "epargne", parentId: cid };
          ch.push({ collection: "comptes", id: p.id, valeur: p });
          nouvellesPoches.push(nom);
        } else if (p.archive) ch.push({ collection: "comptes", id: p.id, valeur: { ...p, archive: false } });
        for (const o of liste) {
          const { ligne: _l, solde: _s, ...op } = o;
          ops.push({ ...op, cle: cleOp(op), compteId: p.id, importId });
        }
      }
      const dates = ops.map((o) => o.date).sort();
      const imp: Import = { id: importId, compteId: cid, quand: Date.now(), fichier: prep.nom, banque: prep.banque ?? profil.nom, nb: ops.length, doublons: tri.doublons.length + (poches?.doublons ?? 0), de: dates[0], a: dates[dates.length - 1] };
      ch.push(...ops.map((o) => ({ collection: "operations", id: o.id, valeur: o }) as Changement), { collection: "imports", id: importId, valeur: imp });
      if (prep.profilNouveau || profilModifie) ch.push({ collection: "profils", id: profil.id, valeur: $state.snapshot(profil) });
      await ecrire(ch);
      await classerEtLier();

      // Dernier solde donné par le relevé, pour le contrôle
      const avecSolde = lecture.ops.filter((o) => o.solde !== undefined);
      const decroissant = lecture.ops.length > 1 && lecture.ops[0].date > lecture.ops[lecture.ops.length - 1].date;
      const max = avecSolde.reduce((m, o) => (o.date > m ? o.date : m), "");
      const ceJour = avecSolde.filter((o) => o.date === max);
      const ref = decroissant ? ceJour[0] : ceJour[ceJour.length - 1];
      compteId = cid;
      resultat = { nb: nbPrincipal, reconnues: nbReconnues, poches: nbDansPoches, nouvellesPoches, soldeBanque: ref?.solde, date: ref?.date, compte: donnees.comptes.find((c) => c.id === cid) };
      etat = "fait";
    } catch (e) {
      erreur = String(e);
      etat = "pret";
    }
  }
  export const estPret = () => pret && etat === "pret";
  export const attendValidation = () => aValider && etat === "pret";
  // Import terminé et soldes d'accord avec la banque (ou pas de solde à comparer) : la carte peut se retirer
  const ecartFinal = $derived(resultat?.compte && resultat.soldeBanque !== undefined && resultat.date ? resultat.soldeBanque - (soldes(resultat.date).get(resultat.compte.id) ?? 0) : 0);
  export const fini = () => etat === "fait" && ecartFinal === 0;

  // Assistant de colonnes
  const ROLES: [Role, string][] = [
    ["date", t("Date de l'opération *")],
    ["libelle", t("Libellé *")],
    ["detail", t("Détail (facultatif)")],
  ];
  const entete = $derived(profil.entete);
  const nomColonne = (k: number) => (idx >= 0 && prep.lignes[idx]?.[k]) || `Colonne ${k + 1}`;
  let deuxColonnes = $derived(!profil.colonnes.montant && !!(profil.colonnes.debit || profil.colonnes.credit));
  function choisirMode(deux: boolean) {
    deuxColonnes = deux;
    if (deux) delete profil.colonnes.montant;
    else delete profil.colonnes.debit, delete profil.colonnes.credit;
    profilModifie = true;
  }
  const FORMATS: FormatDate[] = ["JJ/MM/AAAA", "MM/JJ/AAAA", "AAAA-MM-JJ"];
</script>

{#snippet choixColonne(role: Role, libelle: string)}
  <label>{libelle}
    <Choix bind:valeur={profil.colonnes[role]} titre={libelle} change={() => (profilModifie = true)} options={[{ v: undefined, l: "—" }, ...entete.map((x, k) => ({ v: x, l: nomColonne(k) }))]} />
  </label>
{/snippet}

<section class="carte pile" data-visite="fichier">
  <div class="tete">
    <div class="titre">
      <strong>{prep.nom}</strong>
      <span class="badge" class:inconnue={!prep.banque}>{prep.banque ?? t("Banque non reconnue")}</span>
    </div>
    {#if etat === "pret"}<button class="lien" onclick={retirer}>{t("Retirer")}</button>{:else if etat === "fait"}<button class="lien" onclick={retirer}>{t("Fermer")}</button>{/if}
  </div>

  {#if etat === "fait" && resultat}
    <p class="ok" data-visite="importe">✓ {resultat.nb} {t("opération")}{resultat.nb > 1 ? "s" : ""} {t("dans «")} {resultat.compte?.nom} »{resultat.poches ? t(", {0} dans les poches", resultat.poches) : ""}.</p>
    {#if resultat.reconnues}<p class="sous">{t("{0} opération(s) déjà notée(s) retrouvée(s) dans le relevé : remplacée(s) par la ligne de la banque, catégorie gardée.", resultat.reconnues)}</p>{/if}
    {#each resultat.nouvellesPoches as n (n)}<p class="info">{t("Nouvelle poche détectée : «")} {n} {t("». Renommez-la ou fixez-lui un objectif depuis sa fiche.")}</p>{/each}
    {#if resultat.compte && resultat.soldeBanque !== undefined}
      <ControleSolde compte={resultat.compte} soldeBanque={resultat.soldeBanque} date={resultat.date} />
    {/if}
  {:else}
    <label>{t("Compte")}
      <Choix bind:valeur={compteId} titre={t("Compte")} options={[{ v: "", l: t("Nouveau compte…") }, ...donnees.comptes.filter((c) => !c.parentId).map((c) => ({ v: c.id, l: `${c.nom}${c.banque ? ` · ${c.banque}` : ""} (${c.devise})` }))]} />
    </label>
    {#if !compteId}
      <div class="deux">
        <label>{t("Nom du nouveau compte")}<input bind:value={nouveauNom} /></label>
        <label>{t("Devise")}
          <Choix bind:valeur={nouvelleDevise} titre={t("Devise")} options={DEVISES.map((d) => ({ v: d, l: d }))} />
        </label>
      </div>
    {/if}

    {#if prep.sections.length > 1}
      <details class="sections">
        <summary>{t("Tableaux du relevé (")}{choisies.length}/{prep.sections.length} {t("importés)")}</summary>
        {#each prep.sections as x (x.nom)}
          <label class="case">
            <input type="checkbox" value={x.nom} bind:group={choisies} />
            <span>
              {x.nom} ({x.nb})
              {#if prep.enAttente.includes(x.nom)}<br /><span class="sous">{t("En attente : comptées, puis remplacées quand elles deviennent définitives.")}</span>{/if}
              {#if prep.poches.includes(x.nom)}<br /><span class="sous">{t("Poches : chacune devient un sous-compte d'épargne, créé automatiquement.")}</span>{/if}
            </span>
          </label>
        {/each}
      </details>
    {/if}

    {#if assistantOuvert}
      <div class="assistant pile">
        <h3>{t("Quelle colonne contient quoi ?")}</h3>
        <p class="sous">{t("Une seule fois : l'appli s'en souviendra.")} {#if !ok}{t("Il manque")} {manques(profil).join(", ")}.{/if}</p>
        {#if !prep.estPdf}
          <label>{t("Ligne des titres")}
            <Choix bind:valeur={idx} titre={t("Ligne des titres")} change={() => ((profil = deviner(prep.lignes, idx, profil)), (profilModifie = true))} options={[{ v: -1, l: t("Pas de ligne de titres") }, ...prep.lignes.slice(0, 15).map((l, k) => ({ v: k, l: `${t("Ligne")} ${k + 1} : ${l.filter((c) => c).slice(0, 3).join(" · ")}` }))]} />
          </label>
        {/if}
        <div class="tableau">
          <table>
            <thead><tr>{#each entete as _, k (k)}<th>{nomColonne(k)}</th>{/each}</tr></thead>
            <tbody>
              {#each prep.lignes.slice(idx + 1, idx + 6) as l, k (k)}<tr>{#each entete as _, j (j)}<td>{l[j] ?? ""}</td>{/each}</tr>{/each}
            </tbody>
          </table>
        </div>
        {#each ROLES as [r, l] (r)}{@render choixColonne(r, l)}{/each}
        <div class="mode" role="radiogroup" aria-label={t("Montants")}>
          <button class:actif={!deuxColonnes} role="radio" aria-checked={!deuxColonnes} onclick={() => choisirMode(false)}>{t("Une colonne montant")}</button>
          <button class:actif={deuxColonnes} role="radio" aria-checked={deuxColonnes} onclick={() => choisirMode(true)}>{t("Débit et crédit séparés")}</button>
        </div>
        {#if deuxColonnes}
          {@render choixColonne("debit", t("Débit (sorties) *"))}
          {@render choixColonne("credit", t("Crédit (entrées) *"))}
        {:else}
          {@render choixColonne("montant", t("Montant * (négatif = dépense)"))}
        {/if}
        {@render choixColonne("solde", t("Solde après opération (facultatif)"))}
        <label class="case">
          <input type="checkbox" bind:checked={profil.inverser} onchange={() => (profilModifie = true)} />
          <span>{t("Les dépenses sont écrites sans signe moins (inverser les montants)")}</span>
        </label>
        <label>{t("Format des dates")}
          <Choix bind:valeur={profil.formatDate} titre={t("Format des dates")} change={() => (profilModifie = true)} options={FORMATS.map((f) => ({ v: f, l: f }))} />
        </label>
      </div>
    {/if}

    {#if lecture && aValider}
      <div class="verifier pile" data-visite="verifier">
        <h3>{t("Vérifiez votre relevé")}</h3>
        <p class="sous">{t("C'est la première fois que Sésame voit ce format. Voici les premières opérations telles qu'elles seront importées :")}</p>
        {#if lecture.ops.length}
          <ul class="apercu">
            {#each lecture.ops.slice(0, 5) as o (o.ligne)}
              <li><span class="texte"><span class="libelle">{o.libelle}</span><span class="sous">{dateCourte(o.date)}</span></span><span class="montant" class:plus={o.montant > 0}>{argent(o.montant, devise, true)}</span></li>
            {/each}
          </ul>
        {:else}
          <p class="erreur">{t("Aucune opération lue : indiquez ci-dessus quelle colonne contient quoi.")}</p>
        {/if}
        {#if profil.inverser}<p class="info">{t("Dans ce relevé, les dépenses sont écrites sans signe moins : Sésame les a remises dans le bon sens.")}</p>{/if}
        {#if soldesFaux}<p class="erreur">{t("Les soldes du relevé ne suivent pas ces montants : vérifiez les colonnes.")}</p>{/if}
        <p class="sous">{t("Dates, libellés et montants (dépenses en rouge, entrées en vert) sont-ils justes ?")}</p>
        <div class="actions">
          {#if !assistantOuvert}<button onclick={() => (assistant = true)}>{t("Corriger les colonnes")}</button>{/if}
          <button class="principal" data-visite="valider" onclick={valider} disabled={!lecture.ops.length}>{t("C'est bon")}</button>
        </div>
        <p class="sous">{t("Une seule fois : les prochains relevés de ce format seront reconnus tout seuls.")}</p>
      </div>
    {/if}

    {#if lecture && tri}
      {#if soldesFaux && !aValider}<p class="erreur">{t("Les soldes du relevé ne suivent pas les montants lus : vérifiez les colonnes avant d'importer.")}</p>{/if}
      <ul class="bilan">
        <li><strong>{tri.nouvelles.length}</strong> {t("nouvelle")}{tri.nouvelles.length > 1 ? "s" : ""} {t("opération")}{tri.nouvelles.length > 1 ? "s" : ""}{#if tri.nouvelles.length}<span class="sous"> {t("du")} {dateCourte(tri.nouvelles.map((o) => o.date).sort()[0])} {t("au")} {dateCourte(tri.nouvelles.map((o) => o.date).sort().at(-1)!)}</span>{/if}</li>
        {#if poches}
          {#each [...poches.parPoche] as [nom, l] (nom)}<li><strong>{l.length}</strong> {t("dans la poche «")} {nom} »</li>{/each}
        {/if}
        {#if tri.doublons.length + (poches?.doublons ?? 0)}<li><strong>{tri.doublons.length + (poches?.doublons ?? 0)}</strong> {t("déjà importées (ignorées)")}</li>{/if}
        {#if nbAttente}<li><strong>{nbAttente}</strong> {t("en attente : déduites tout de suite comme chez votre banque, remplacées ensuite par la version définitive")}</li>{/if}
        {#if reconnues.size}<li><strong>{reconnues.size}</strong> {t("opération(s) déjà notée(s) (à la main ou en attente) retrouvée(s) : la ligne de la banque la (les) remplacera, catégorie gardée")}</li>{/if}
        {#if lecture.nonAbouties}<li><strong>{lecture.nonAbouties}</strong> {t("annulées ou refusées dans le fichier (ignorées)")}</li>{/if}
        {#if lecture.autreDevise}<li><strong>{lecture.autreDevise}</strong> {t("dans une autre devise que")} {devise} {t("(ignorées)")}</li>{/if}
      </ul>
      {#if suspects.length}
        <div class="erreur">
          <strong>{suspects.length} {t("montant")}{suspects.length > 1 ? "s" : ""} {t("inhabituel")}{suspects.length > 1 ? "s" : ""} {t(": vérifiez avant d'importer.")}</strong>
          {#each suspects.slice(0, 3) as o (o.ligne)}<p>{dateCourte(o.date)} · {o.libelle} : {argent(o.montant, devise, true)}</p>{/each}
        </div>
      {/if}
      {#if lecture.erreurs.length}
        <details class="info">
          <summary>{lecture.erreurs.length} {t("ligne")}{lecture.erreurs.length > 1 ? "s" : ""} {t("illisible")}{lecture.erreurs.length > 1 ? "s" : ""}</summary>
          {#each lecture.erreurs.slice(0, 8) as e (e.ligne)}<p>{t("Ligne")} {e.ligne} : {e.raison}</p>{/each}
        </details>
      {/if}
      {#if !tri.nouvelles.length && !nbPoches}<p class="sous">{t("Rien de nouveau dans ce relevé.")}</p>{/if}
    {/if}
    {#if !assistantOuvert && !aValider}<button class="lien gauche" onclick={() => (assistant = true)}>{t("Ajuster les colonnes")}</button>{/if}
    {#if erreur}<p class="erreur">{erreur}</p>{/if}
  {/if}
</section>

<style>
  .tete {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 10px;
  }
  .titre {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .titre strong {
    word-break: break-all;
  }
  .badge {
    font-size: 12px;
    background: var(--accent-fond);
    color: var(--accent-texte);
    border-radius: 999px;
    padding: 2px 10px;
  }
  .badge.inconnue {
    background: var(--alerte-fond);
    color: var(--alerte);
  }
  .deux {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 10px;
  }
  .verifier {
    background: var(--accent-fond);
    border-radius: 16px;
    padding: 14px;
  }
  .verifier h3 {
    margin: 0;
  }
  .apercu {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .apercu li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    background: var(--fond);
    border-radius: 10px;
    padding: 8px 10px;
  }
  .apercu .texte {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .apercu .libelle {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .apercu .montant {
    font-weight: 700;
    color: var(--danger);
    font-variant-numeric: tabular-nums;
  }
  .apercu .montant.plus {
    color: var(--ok);
  }
  .verifier .actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    flex-wrap: wrap;
  }
  .ok {
    background: var(--ok-fond);
    color: var(--ok);
    border-radius: 14px;
    padding: 10px 14px;
  }
  .gauche {
    align-self: flex-start;
  }
  h3 {
    font-size: 15px;
  }
  .sections summary,
  details summary {
    cursor: pointer;
    font-size: 14px;
  }
  .sections {
    font-size: 14px;
  }
  .case {
    flex-direction: row;
    align-items: flex-start;
    gap: 10px;
    color: var(--texte);
    margin-top: 8px;
  }
  .case input {
    width: 18px;
    height: 18px;
    flex: none;
    margin-top: 2px;
    accent-color: var(--accent);
  }
  .assistant {
    background: var(--surface-2);
    border-radius: 14px;
    padding: 12px 14px;
  }
  .tableau {
    overflow-x: auto;
    border: 1px solid var(--bord);
    border-radius: 14px;
  }
  table {
    border-collapse: collapse;
    font-size: 12px;
    white-space: nowrap;
  }
  th,
  td {
    padding: 6px 10px;
    text-align: left;
    border-bottom: 1px solid var(--bord);
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  th {
    background: var(--surface-2);
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
    padding: 8px 10px;
    font-size: 14px;
  }
  .mode button.actif {
    background: var(--surface);
  }
  .bilan {
    margin: 0;
    padding-left: 18px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 14px;
  }
</style>
