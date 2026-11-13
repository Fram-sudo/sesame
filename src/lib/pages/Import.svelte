<script lang="ts">
  import { t, locale } from "../i18n.svelte";
  // Import de relevés, quelle que soit la banque : un ou plusieurs fichiers (sélecteur ou glisser-déposer sur PC),
  // banque et compte reconnus automatiquement, vérification fichier par fichier, puis un seul bouton.
  import { onMount } from "svelte";
  import { api, estAndroid, type Releve } from "../api";
  import { classerEtLier, comptesImport, donnees, ecrire, nouvelId, supprimer, type Changement, type Import } from "../donnees.svelte";
  import { separerDoublons } from "../import/doublons";
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
  // Un relevé d'un format jamais vu attend qu'on vérifie son aperçu
  const aVerifier = $derived(cartes.some((c) => c?.attendValidation()));
  const plusieurs = $derived(fichiers.length > 1);
  const toutValider = () => cartes.forEach((c) => c?.peutValider() && c.valider());

  // Plusieurs relevés : récapitulatif par compte, les opérations présentes dans deux relevés comptées une fois
  const recap = $derived.by(() => {
    const parCompte = new Map<string, { nom: string; releves: number; nouvelles: number; poches: number; vues: { cle: string }[] }>();
    for (const c of cartes) {
      const r = c?.resume();
      if (!r) continue;
      const g = parCompte.get(r.cle) ?? { nom: r.nom, releves: 0, nouvelles: 0, poches: 0, vues: [] };
      const { nouvelles } = separerDoublons(r.nouvelles, g.vues);
      g.releves++;
      g.nouvelles += nouvelles.length;
      g.poches += r.poches;
      g.vues.push(...nouvelles);
      parCompte.set(r.cle, g);
    }
    return [...parCompte.values()];
  });
</script>

<div class="pile">
  <section class="carte depot pile" class:survol>
    <Icone nom="importer" taille={28} />
    <p><strong>{estAndroid ? t("Choisissez vos relevés") : t("Déposez vos relevés ici")}</strong></p>
    <p class="sous">{t("PDF, CSV, Excel, OFX, QIF ou CAMT, de n'importe quelle banque, un ou plusieurs à la fois. La banque et le compte sont reconnus automatiquement.")}</p>
    <button class="principal" data-visite="import" onclick={choisir} disabled={enCours}>{enCours ? t("Lecture…") : t("Choisir des fichiers")}</button>
  </section>

  {#each erreurs as e, i (i)}<p class="erreur">{e}</p>{/each}

  {#each fichiers as f, i (f.cle)}
    <FichierImport bind:this={cartes[i]} prep={f.prep} dansUnLot={plusieurs} retirer={() => (fichiers = fichiers.filter((x) => x.cle !== f.cle))} />
  {/each}

  {#if nbPrets}
    {#if plusieurs && recap.length}
      <section class="carte pile recap">
        <h2>{t("Votre import : {0} relevés", fichiers.length)}</h2>
        {#each recap as r (r.nom)}
          <p><strong>{r.nom}</strong> · {t("{0} relevé(s)", r.releves)} · {t("{0} nouvelle(s) opération(s)", r.nouvelles)}{r.poches ? ` · ${t("dont {0} dans les poches", r.poches)}` : ""}</p>
        {/each}
        <p class="sous">{t("Les opérations présentes dans deux relevés ne sont comptées qu'une fois. Tout sera importé en une fois, et pourra être annulé en une fois.")}</p>
      </section>
    {/if}
    {#if aVerifier}
      {#if plusieurs}
        <div class="valider-tout">
          <p class="sous">{t("Vérifiez les aperçus ci-dessus : si les dates, libellés et montants sont justes, validez tout d'un coup.")}</p>
          <button class="principal" data-visite="valider" onclick={toutValider}>{t("C'est bon pour tous")}</button>
        </div>
      {:else}
        <p class="sous">{t("Vérifiez d'abord l'aperçu du relevé ci-dessus, puis touchez « C'est bon ».")}</p>
      {/if}
    {/if}
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
    <section class="carte pile">
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
  .recap p {
    margin: 0;
  }
  .valider-tout {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    background: var(--accent-fond);
    border-radius: 16px;
    padding: 12px 14px;
  }
  .valider-tout .sous {
    flex: 1 1 240px;
    margin: 0;
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
