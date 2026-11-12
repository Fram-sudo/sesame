<script lang="ts">
  import Choix from "../Choix.svelte";
  import { t } from "../i18n.svelte";
  // Banques et imports : ce que l'appli a retenu pour chaque compte (reconnaissance des relevés, colonnes, options).
  import { donnees, ecrire, type Compte } from "../donnees.svelte";
  import { annoncer, app } from "../etat.svelte";
  import Icone from "../Icone.svelte";
  import RemiseAZero from "../RemiseAZero.svelte";
  import type { FormatDate, Role } from "../import/analyse";

  const principaux = $derived(donnees.comptes.filter((c) => !c.parentId));
  const profilDe = (c: Compte) => (c.empreinte ? donnees.profils.find((p) => p.entete.join("|") === c.empreinte) : undefined);
  const estCsv = (c: Compte) => !!c.empreinte?.includes("|");
  const nomCompte = (id: string) => donnees.comptes.find((c) => c.id === id)?.nom ?? "?";
  const ROLES: [Role, string][] = [
    ["date", t("Date")],
    ["libelle", t("Libellé")],
    ["detail", t("Détail")],
    ["montant", t("Montant")],
    ["debit", t("Débit")],
    ["credit", t("Crédit")],
    ["solde", t("Solde")],
    ["devise", t("Devise")],
  ];
  const FORMATS: FormatDate[] = ["JJ/MM/AAAA", "MM/JJ/AAAA", "AAAA-MM-JJ"];
  let aOublier = $state("");
  let remise = $state(false);

  const maj = (c: Compte, champs: Partial<Compte>) => ecrire([{ collection: "comptes", id: c.id, valeur: { ...c, ...champs } }]);

  async function oublier(c: Compte) {
    const p = profilDe(c);
    await ecrire([
      { collection: "comptes", id: c.id, valeur: { ...c, empreinte: undefined } },
      ...(p ? [{ collection: "profils" as const, id: p.id, valeur: null }] : []),
    ]);
    aOublier = "";
    annoncer(t("Configuration oubliée : le prochain relevé de ce compte sera analysé comme un nouveau."));
  }
</script>

<div class="pile">
  <button class="lien retour" onclick={() => (app.page = "parametres")}><Icone nom="retour" taille={18} />{t("Paramètres")}</button>
  <p class="sous">
    {t("À chaque import, l'appli retient comment reconnaître les relevés d'un compte et comment les lire. Tout se règle ici ; en cas de doute, « Oublier » repart de zéro au prochain import.")}
  </p>

  {#if principaux.length}<button class="danger gauche" onclick={() => (remise = true)}><Icone nom="poubelle" taille={18} />{t("Remettre des comptes à zéro")}</button>{/if}

  {#each principaux as c (c.id)}
    {@const p = profilDe(c)}
    {@const poches = donnees.comptes.filter((x) => x.parentId === c.id)}
    {@const routages = donnees.routages.filter((r) => r.source === c.id || r.cible === c.id)}
    {@const nbImports = donnees.imports.filter((i) => i.compteId === c.id).length}
    <section class="carte pile">
      <div>
        <h2>{c.nom}</h2>
        <p class="sous">{c.banque || t("Banque non précisée")} · {c.devise} · {nbImports} {t("import")}{nbImports > 1 ? "s" : ""}</p>
      </div>

      <div class="bloc pile">
        <h3>{t("Reconnaître ses relevés")}</h3>
        {#if !c.empreinte}
          <p class="sous">{t("Pas encore de relevé importé : le premier relevé de «")} {c.banque || c.nom} {t("» sera rangé ici automatiquement.")}</p>
        {:else if estCsv(c)}
          <p class="sous">{t("Fichiers CSV ou Excel ayant ces colonnes :")}</p>
          <div class="puces">{#each c.empreinte.split("|") as t, i (i)}<span class="puce">{t}</span>{/each}</div>
        {:else}
          <label>{t("Texte présent sur ses relevés PDF")}
            <input value={c.empreinte} onchange={(e) => maj(c, { empreinte: e.currentTarget.value.trim() || undefined })} />
          </label>
          <p class="sous">{t("Si un relevé n'est pas reconnu, mettez un texte court qui apparaît en haut de chacun de ses relevés.")}</p>
        {/if}
      </div>

      {#if p}
        <div class="bloc pile">
          <h3>{t("Lecture des colonnes")}</h3>
          <div class="colonnes">
            {#each ROLES.filter(([r]) => p.colonnes[r]) as [r, nom] (r)}
              <span class="sous">{nom}</span><span>{p.colonnes[r]}</span>
            {/each}
          </div>
          <label>{t("Format des dates")}
            <Choix valeur={p.formatDate} titre={t("Format des dates")} change={(f) => ecrire([{ collection: "profils", id: p.id, valeur: { ...p, formatDate: f as FormatDate } }])} options={FORMATS.map((f) => ({ v: f, l: f }))} />
          </label>
          <p class="sous">{t("Pour changer les colonnes : réimportez un relevé et touchez « Ajuster les colonnes ».")}</p>
        </div>
      {/if}

      <div class="bloc pile">
        <h3>{t("Options d'import")}</h3>
        <label class="case">
          <input type="checkbox" checked={c.importAttente !== false} onchange={(e) => maj(c, { importAttente: e.currentTarget.checked })} />
          <span>{t("Importer les opérations en attente")}<br /><span class="sous">{t("Comptées comme dans l'appli de la banque, remplacées quand elles deviennent définitives.")}</span></span>
        </label>
        <label class="case">
          <input type="checkbox" checked={c.importPoches !== false} onchange={(e) => maj(c, { importPoches: e.currentTarget.checked })} />
          <span>{t("Ranger les poches dans des sous-comptes")}<br /><span class="sous">{poches.length ? t("Poches : {0}.", poches.map((x) => x.nom).join(", ")) : t("Pour les banques qui en ont (Revolut…).")}</span></span>
        </label>
      </div>

      {#if routages.length}
        <div class="bloc pile">
          <h3>{t("Règles de compte")}</h3>
          {#each routages as r (r.id)}
            <div class="ligne">
              <span>« {r.motif} » : {nomCompte(r.source)} → {nomCompte(r.cible)}{r.memeMontant ? t(" (si même montant qu'un versement)") : ""}</span>
              <button class="icone" aria-label={t("Supprimer la règle {0}", r.motif)} onclick={() => ecrire([{ collection: "routages", id: r.id, valeur: null }])}><Icone nom="poubelle" taille={17} /></button>
            </div>
          {/each}
        </div>
      {/if}

      {#if c.empreinte}
        {#if aOublier === c.id}
          <div class="ligne">
            <span class="sous">{t("Les opérations déjà importées restent.")}</span>
            <button onclick={() => (aOublier = "")}>{t("Garder")}</button>
            <button class="danger" onclick={() => oublier(c)}>{t("Oublier")}</button>
          </div>
        {:else}
          <button class="lien gauche" onclick={() => (aOublier = c.id)}>{t("Oublier la configuration de ce compte")}</button>
        {/if}
      {/if}
    </section>
  {:else}
    <p class="sous">{t("Aucun compte pour l'instant : importez un relevé, la configuration se fera toute seule.")}</p>
  {/each}
</div>

{#if remise}<RemiseAZero fermer={() => (remise = false)} />{/if}

<style>
  .retour,
  .gauche {
    align-self: flex-start;
  }
  h3 {
    font-size: 14px;
  }
  .bloc {
    gap: 8px;
    border-top: 1px solid var(--bord);
    padding-top: 12px;
  }
  .puces {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .puce {
    font-size: 12px;
    background: var(--surface-2);
    border-radius: 999px;
    padding: 3px 10px;
  }
  .colonnes {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 14px;
    font-size: 14px;
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
  .ligne {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
  }
  .ligne span {
    flex: 1;
  }
  .icone {
    width: 36px;
    height: 36px;
    padding: 0;
    flex: none;
  }
</style>
