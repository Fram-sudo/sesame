//! Moteur de l'appli : garde le coffre en mémoire une fois déverrouillé et l'écrit
//! chiffré sur le disque à chaque modification. La clé ne quitte jamais ce processus.

mod coffre;

use coffre::{Coffre, Enregistrement, Erreur, ParamsKdf};
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::{DialogExt, FilePath};
use tauri_plugin_fs::{FsExt, OpenOptions};

const NOM_FICHIER: &str = "coffre.portefeuille";
const ID_PARAMETRES: &str = "parametres";

struct Etat {
    fichier: PathBuf,
    ouvert: Mutex<Option<Coffre>>,
}

type Res<T> = Result<T, String>;

fn txt(e: impl ToString) -> String {
    e.to_string()
}

/// Règle Argon2id pour cet appareil : 64 Mio de mémoire, et autant de passes qu'il
/// faut pour viser environ 1 seconde, sans jamais descendre sous 2 passes.
fn reglage_appareil() -> ParamsKdf {
    static R: OnceLock<ParamsKdf> = OnceLock::new();
    *R.get_or_init(|| {
        let essai = ParamsKdf { m_kib: 64 * 1024, t: 2, p: 4 };
        let debut = Instant::now();
        let _ = coffre::deriver_mdp("calibrage", b"calibrage-sel-16", essai);
        let par_passe = (debut.elapsed().as_millis() as u32 / 2).max(1);
        ParamsKdf { t: (1000 / par_passe).clamp(2, 10), ..essai }
    })
}

fn maintenant_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Écriture atomique : on écrit à côté puis on remplace, pour ne jamais laisser
/// un coffre à moitié écrit en cas de coupure.
fn enregistrer(etat: &Etat, c: &Coffre) -> Res<()> {
    let tmp = etat.fichier.with_extension("tmp");
    std::fs::write(&tmp, coffre::ecrire_fichier(&c.sceller())).map_err(txt)?;
    std::fs::rename(&tmp, &etat.fichier).map_err(txt)
}

fn lire_disque(etat: &Etat) -> Res<coffre::Fichier> {
    let octets = std::fs::read(&etat.fichier).map_err(txt)?;
    coffre::lire_fichier(&octets).map_err(txt)
}

/// Taux de change du jour publiés par la BCE (fichier public, aucune donnée envoyée).
/// Adresse fixe ici : la page ne peut pas faire appeler une autre adresse.
#[tauri::command]
async fn taux_bce() -> Res<String> {
    tauri::async_runtime::spawn_blocking(|| {
        let r = ureq::get("https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml")
            .timeout(std::time::Duration::from_secs(15))
            .call()
            .map_err(txt)?;
        let mut xml = String::new();
        r.into_reader().take(200_000).read_to_string(&mut xml).map_err(txt)?;
        Ok(xml)
    })
    .await
    .map_err(txt)?
}

/// Fiche de la dernière version publiée (numéro, nouveautés, liens) : seule adresse consultée
#[tauri::command]
async fn derniere_version() -> Res<String> {
    tauri::async_runtime::spawn_blocking(|| {
        let r = ureq::get("https://github.com/Fram-sudo/sesame/releases/latest/download/latest.json")
            .timeout(std::time::Duration::from_secs(15))
            .call()
            .map_err(txt)?;
        let mut json = String::new();
        r.into_reader().take(500_000).read_to_string(&mut json).map_err(txt)?;
        Ok(json)
    })
    .await
    .map_err(txt)?
}

/// Ouvre le téléchargement d'une nouvelle version dans le navigateur : uniquement les pages de Sésame sur GitHub
#[tauri::command]
fn ouvrir_lien(app: tauri::AppHandle, url: String) -> Res<()> {
    if !lien_autorise(&url) {
        return Err("Lien refusé".into());
    }
    use tauri_plugin_opener::OpenerExt;
    app.opener().open_url(url, None::<&str>).map_err(txt)
}

fn lien_autorise(url: &str) -> bool {
    url.starts_with("https://github.com/Fram-sudo/sesame/") && !url.contains("..") && !url.contains('@')
}

#[derive(Serialize)]
struct EtatCoffre {
    existe: bool,
    ouvert: bool,
    /// Ouverture par empreinte activée sur cet appareil
    empreinte: bool,
}

/// Clé des données chiffrée par le coffre-fort matériel du téléphone (illisible sans l'empreinte)
fn fichier_empreinte(etat: &Etat) -> PathBuf {
    etat.fichier.with_extension("empreinte")
}

#[tauri::command]
fn etat_coffre(etat: State<Etat>) -> EtatCoffre {
    EtatCoffre {
        existe: etat.fichier.exists(),
        ouvert: etat.ouvert.lock().unwrap().is_some(),
        empreinte: fichier_empreinte(&etat).exists(),
    }
}

#[tauri::command]
async fn creer_coffre(etat: State<'_, Etat>, mdp: String) -> Res<String> {
    if etat.fichier.exists() {
        return Err("Un coffre existe déjà sur cet appareil.".into());
    }
    let (c, recup) = tauri::async_runtime::spawn_blocking(move || Coffre::creer(&mdp, reglage_appareil()))
        .await
        .map_err(txt)?
        .map_err(txt)?;
    enregistrer(&etat, &c)?;
    *etat.ouvert.lock().unwrap() = Some(c);
    Ok(recup)
}

#[tauri::command]
async fn deverrouiller(etat: State<'_, Etat>, mdp: String) -> Res<()> {
    let f = lire_disque(&etat)?;
    let c = tauri::async_runtime::spawn_blocking(move || Coffre::ouvrir(&f, &mdp))
        .await
        .map_err(txt)?
        .map_err(txt)?;
    *etat.ouvert.lock().unwrap() = Some(c);
    Ok(())
}

#[tauri::command]
async fn recuperer(etat: State<'_, Etat>, cle: String, nouveau_mdp: String) -> Res<()> {
    let f = lire_disque(&etat)?;
    let c = tauri::async_runtime::spawn_blocking(move || Coffre::recuperer(&f, &cle, &nouveau_mdp, reglage_appareil()))
        .await
        .map_err(txt)?
        .map_err(txt)?;
    enregistrer(&etat, &c)?;
    *etat.ouvert.lock().unwrap() = Some(c);
    Ok(())
}

#[tauri::command]
fn verrouiller(etat: State<Etat>) {
    // La clé est effacée de la mémoire quand le coffre est libéré (Zeroizing)
    *etat.ouvert.lock().unwrap() = None;
}

fn avec_coffre<T>(etat: &Etat, f: impl FnOnce(&mut Coffre) -> Result<T, Erreur>) -> Res<T> {
    let mut garde = etat.ouvert.lock().unwrap();
    let c = garde.as_mut().ok_or("Le coffre est verrouillé.")?;
    let r = f(c).map_err(txt)?;
    enregistrer(etat, c)?;
    Ok(r)
}

#[tauri::command]
async fn changer_mot_de_passe(etat: State<'_, Etat>, ancien: String, nouveau: String) -> Res<()> {
    let kdf = tauri::async_runtime::spawn_blocking(reglage_appareil).await.map_err(txt)?;
    avec_coffre(&etat, |c| c.changer_mdp(&ancien, &nouveau, kdf))
}

#[tauri::command]
async fn nouvelle_cle_recuperation(etat: State<'_, Etat>, mdp: String) -> Res<String> {
    avec_coffre(&etat, |c| c.nouvelle_recup(&mdp))
}

#[tauri::command]
fn lire_parametres(etat: State<Etat>) -> Res<serde_json::Value> {
    let garde = etat.ouvert.lock().unwrap();
    let c = garde.as_ref().ok_or("Le coffre est verrouillé.")?;
    Ok(c.donnees.enregistrements.get(ID_PARAMETRES).map(|e| e.valeur.clone()).unwrap_or_default())
}

#[tauri::command]
fn ecrire_parametres(etat: State<Etat>, valeur: serde_json::Value) -> Res<()> {
    avec_coffre(&etat, |c| {
        c.donnees.enregistrements.insert(
            ID_PARAMETRES.into(),
            Enregistrement { collection: "parametres".into(), maj: maintenant_ms(), supprime: false, valeur },
        );
        Ok(())
    })
}

/// Une donnée de l'appli (compte, opération, import, profil de banque…).
#[derive(Serialize)]
struct Ligne {
    id: String,
    collection: String,
    valeur: serde_json::Value,
}

#[tauri::command]
fn lire_tout(etat: State<Etat>) -> Res<Vec<Ligne>> {
    let garde = etat.ouvert.lock().unwrap();
    let c = garde.as_ref().ok_or("Le coffre est verrouillé.")?;
    Ok(c.donnees
        .enregistrements
        .iter()
        .filter(|(id, e)| !e.supprime && id.as_str() != ID_PARAMETRES)
        .map(|(id, e)| Ligne { id: id.clone(), collection: e.collection.clone(), valeur: e.valeur.clone() })
        .collect())
}

/// valeur absente = suppression (on garde une marque datée pour la synchronisation).
#[derive(Deserialize)]
struct Changement {
    id: String,
    collection: String,
    valeur: Option<serde_json::Value>,
}

/// Écrit plusieurs changements d'un coup : un seul enregistrement chiffré sur le disque.
#[tauri::command]
fn ecrire_lot(etat: State<Etat>, changements: Vec<Changement>) -> Res<()> {
    if changements.iter().any(|ch| ch.id.is_empty() || ch.id == ID_PARAMETRES || ch.collection.is_empty()) {
        return Err("Identifiant de donnée invalide.".into());
    }
    let maj = maintenant_ms();
    avec_coffre(&etat, |c| {
        for ch in changements {
            let supprime = ch.valeur.is_none();
            let valeur = ch.valeur.unwrap_or(serde_json::Value::Null);
            c.donnees.enregistrements.insert(ch.id, Enregistrement { collection: ch.collection, maj, supprime, valeur });
        }
        Ok(())
    })
}

/// Contenu d'un relevé : un tableur est renvoyé en lignes, le reste en texte.
#[derive(Serialize, Default, Debug)]
struct Releve {
    nom: String,
    lignes: Option<Vec<Vec<String>>>,
    texte: Option<String>,
    /// PDF en base64 : son texte est lu côté interface (pdf.js)
    pdf: Option<String>,
    erreur: Option<String>,
}

const TAILLE_MAX_RELEVE: usize = 20 * 1024 * 1024;

/// UTF-8 (avec ou sans BOM), UTF-16 avec BOM, sinon Windows-1252 (fréquent dans les banques françaises).
fn decoder_texte(o: &[u8]) -> String {
    let (enc, bom) = encoding_rs::Encoding::for_bom(o).unwrap_or((encoding_rs::UTF_8, 0));
    let o = &o[bom..];
    if enc == encoding_rs::UTF_8 && std::str::from_utf8(o).is_err() {
        return encoding_rs::WINDOWS_1252.decode(o).0.into_owned();
    }
    enc.decode_without_bom_handling(o).0.into_owned()
}

fn lire_tableur(o: Vec<u8>) -> Res<Vec<Vec<String>>> {
    use calamine::{Data, DataType, Reader};
    let mut classeur = calamine::open_workbook_auto_from_rs(std::io::Cursor::new(o))
        .map_err(|_| "Ce tableur n'a pas pu être lu.".to_string())?;
    for nom in classeur.sheet_names() {
        let Ok(feuille) = classeur.worksheet_range(&nom) else { continue };
        let lignes: Vec<Vec<String>> = feuille
            .rows()
            .map(|l| {
                l.iter()
                    .map(|c| match c {
                        Data::DateTime(_) | Data::DateTimeIso(_) => {
                            c.as_date().map(|d| d.to_string()).unwrap_or_else(|| c.to_string())
                        }
                        _ => c.to_string(),
                    })
                    .collect()
            })
            .collect();
        if lignes.iter().filter(|l| l.iter().any(|c| !c.trim().is_empty())).count() >= 2 {
            return Ok(lignes);
        }
    }
    Err("Ce tableur ne contient aucune feuille avec des opérations.".into())
}

fn analyser_releve(nom: String, o: Vec<u8>) -> Res<Releve> {
    if o.len() > TAILLE_MAX_RELEVE {
        return Err("Fichier trop gros (plus de 20 Mo) pour un relevé.".into());
    }
    if o.starts_with(b"%PDF") {
        return Ok(Releve { nom, pdf: Some(data_encoding::BASE64.encode(&o)), ..Default::default() });
    }
    // Excel récent / OpenDocument (zip) et ancien Excel (OLE)
    if o.starts_with(b"PK\x03\x04") || o.starts_with(&[0xD0, 0xCF, 0x11, 0xE0]) {
        return Ok(Releve { nom, lignes: Some(lire_tableur(o)?), ..Default::default() });
    }
    Ok(Releve { nom, texte: Some(decoder_texte(&o)), ..Default::default() })
}

/// Lit un relevé choisi ; une erreur n'empêche pas de lire les autres fichiers.
fn lire_un(app: &AppHandle, chemin: FilePath) -> Releve {
    let nom = match &chemin {
        FilePath::Path(p) => p.file_name().map(|n| n.to_string_lossy().into_owned()),
        FilePath::Url(u) => u.path_segments().and_then(|mut s| s.next_back()).map(|n| n.to_string()),
    }
    .unwrap_or_else(|| "relevé".into());
    let mut o = Vec::new();
    let lu = app
        .fs()
        .open(chemin, en_lecture())
        .map_err(txt)
        .and_then(|f| f.take(TAILLE_MAX_RELEVE as u64 + 1).read_to_end(&mut o).map_err(txt));
    match lu.and_then(|_| analyser_releve(nom.clone(), o)) {
        Ok(r) => r,
        Err(e) => Releve { nom, erreur: Some(e), ..Default::default() },
    }
}

/// Ouvre le sélecteur (plusieurs fichiers possibles) et lit les relevés choisis. Les fichiers ne sont
/// ni copiés ni gardés : seules les opérations retenues entrent dans le coffre chiffré.
#[tauri::command]
async fn lire_releves(app: AppHandle) -> Res<Vec<Releve>> {
    tauri::async_runtime::spawn_blocking(move || {
        let chemins = app.dialog().file().blocking_pick_files().unwrap_or_default();
        Ok(chemins.into_iter().map(|c| lire_un(&app, c)).collect())
    })
    .await
    .map_err(txt)?
}

/// Relevés déposés sur la fenêtre (glisser-déposer, PC).
#[tauri::command]
async fn lire_releves_chemins(app: AppHandle, chemins: Vec<String>) -> Res<Vec<Releve>> {
    tauri::async_runtime::spawn_blocking(move || Ok(chemins.into_iter().map(|c| lire_un(&app, FilePath::Path(c.into()))).collect()))
        .await
        .map_err(txt)?
}

/// Ouverture en lecture (Windows exige de le préciser ; Android le tolérait).
fn en_lecture() -> OpenOptions {
    let mut o = OpenOptions::new();
    o.read(true);
    o
}

fn ecrire_vers(app: &AppHandle, chemin: FilePath, contenu: &[u8]) -> Res<()> {
    let mut opts = OpenOptions::new();
    opts.write(true).create(true).truncate(true);
    app.fs().open(chemin, opts).map_err(txt)?.write_all(contenu).map_err(txt)
}

/// Demande où enregistrer puis écrit le fichier. Renvoie false si l'utilisateur annule.
async fn demander_et_ecrire(app: AppHandle, nom: &str, ext: &str, contenu: Vec<u8>) -> Res<bool> {
    let nom = nom.to_string();
    let ext = ext.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        let Some(chemin) = app.dialog().file().set_file_name(&nom).add_filter(&ext, &[&ext]).blocking_save_file() else {
            return Ok(false);
        };
        ecrire_vers(&app, chemin, &contenu).map(|_| true)
    })
    .await
    .map_err(txt)?
}

#[tauri::command]
async fn exporter_sauvegarde(app: AppHandle, etat: State<'_, Etat>) -> Res<bool> {
    let contenu = {
        let garde = etat.ouvert.lock().unwrap();
        coffre::ecrire_fichier(&garde.as_ref().ok_or("Le coffre est verrouillé.")?.sceller())
    };
    let nom = format!("sauvegarde-{}.portefeuille", maintenant_ms() / 1000);
    demander_et_ecrire(app, &nom, "portefeuille", contenu).await
}

#[tauri::command]
async fn enregistrer_cle_recuperation(app: AppHandle, cle: String) -> Res<bool> {
    let texte = format!(
        "SÉSAME - CLÉ DE RÉCUPÉRATION\r\n\r\n{cle}\r\n\r\n\
         Elle permet de rouvrir vos données si vous oubliez votre mot de passe.\r\n\
         Rangez-la hors de vos appareils (papier, clé USB dans un tiroir) et ne la donnez à personne.\r\n"
    );
    demander_et_ecrire(app, "cle-de-recuperation-sesame.txt", "txt", texte.into_bytes()).await
}

/// Export d'opérations choisi par l'utilisateur (tableur CSV ou document imprimable HTML), enregistré là où il le décide.
/// Seulement ces deux formats, et un nom de fichier sans chemin.
#[tauri::command]
async fn enregistrer_export(app: AppHandle, nom: String, contenu: String) -> Res<bool> {
    let ext = match nom.rsplit_once('.').map(|(_, e)| e) {
        Some("csv") => "csv",
        Some("html") => "html",
        _ => return Err("Format d'export inconnu.".into()),
    };
    if nom.contains(['/', '\\', ':']) || nom.len() > 120 {
        return Err("Nom de fichier refusé.".into());
    }
    demander_et_ecrire(app, &nom, ext, contenu.into_bytes()).await
}

/// Restaure une sauvegarde : elle doit s'ouvrir avec SON mot de passe (vérifie aussi
/// qu'elle est intacte), puis elle remplace le coffre de cet appareil.
#[tauri::command]
async fn importer_sauvegarde(app: AppHandle, etat: State<'_, Etat>, mdp: String) -> Res<bool> {
    let app2 = app.clone();
    let octets = tauri::async_runtime::spawn_blocking(move || -> Res<Option<Vec<u8>>> {
        let Some(chemin) = app2.dialog().file().blocking_pick_file() else { return Ok(None) };
        let mut v = Vec::new();
        app2.fs().open(chemin, en_lecture()).map_err(txt)?.read_to_end(&mut v).map_err(txt)?;
        Ok(Some(v))
    })
    .await
    .map_err(txt)??;
    let Some(octets) = octets else { return Ok(false) };
    let f = coffre::lire_fichier(&octets).map_err(txt)?;
    let c = tauri::async_runtime::spawn_blocking(move || Coffre::ouvrir(&f, &mdp))
        .await
        .map_err(txt)?
        .map_err(txt)?;
    let _ = std::fs::remove_file(fichier_empreinte(&etat));
    enregistrer(&etat, &c)?;
    *etat.ouvert.lock().unwrap() = Some(c);
    Ok(true)
}

// ---------- Synchronisation entre appareils (jalon 9) ----------
// Le fichier envoyé est le coffre chiffré complet (comme une sauvegarde) : l'autre appareil,
// qui a la même clé, le fusionne. Aucun réseau : il voyage par Quick Share, Bluetooth, câble, e-mail…

const PREFIXE_SYNC: &str = "portefeuille-changements-";
const EXT_SYNC: &str = "pfsync";

/// Partage Android (menu « Envoyer ») et fichier reçu par « Ouvrir avec Sésame » : voir PartagePlugin.kt
#[cfg(target_os = "android")]
struct Partage(tauri::plugin::PluginHandle<tauri::Wry>);

fn paquet(etat: &Etat) -> Res<Vec<u8>> {
    let garde = etat.ouvert.lock().unwrap();
    Ok(coffre::ecrire_fichier(&garde.as_ref().ok_or("Le coffre est verrouillé.")?.sceller()))
}

/// Ajoute les données d'un fichier de changements ; renvoie le nombre d'éléments changés.
fn fusionner_octets(etat: &Etat, octets: &[u8]) -> Res<usize> {
    let f = coffre::lire_fichier(octets).map_err(txt)?;
    avec_coffre_n(etat, |c| c.fusionner(&f, ID_PARAMETRES))
}

fn avec_coffre_n(etat: &Etat, action: impl FnOnce(&mut Coffre) -> Result<usize, coffre::Erreur>) -> Res<usize> {
    let mut garde = etat.ouvert.lock().unwrap();
    let c = garde.as_mut().ok_or("Le coffre est verrouillé.")?;
    let n = action(c).map_err(txt)?;
    if n > 0 {
        enregistrer(etat, c)?;
    }
    Ok(n)
}

/// `appareil` : identifiant de cet appareil, dans le nom du fichier pour ne jamais relire ses propres envois.
#[tauri::command]
async fn envoyer_changements(app: AppHandle, etat: State<'_, Etat>, appareil: String) -> Res<bool> {
    let contenu = paquet(&etat)?;
    let nom = format!("{PREFIXE_SYNC}{appareil}.{EXT_SYNC}");
    #[cfg(target_os = "android")]
    {
        let chemin = app.path().app_cache_dir().map_err(txt)?.join(&nom);
        std::fs::create_dir_all(chemin.parent().unwrap()).map_err(txt)?;
        std::fs::write(&chemin, contenu).map_err(txt)?;
        let p = app.state::<Partage>();
        let h = p.0.clone();
        let chemin = chemin.to_string_lossy().to_string();
        tauri::async_runtime::spawn_blocking(move || h.run_mobile_plugin::<serde_json::Value>("partager", serde_json::json!({ "chemin": chemin })))
            .await
            .map_err(txt)?
            .map_err(txt)?;
        Ok(true)
    }
    #[cfg(not(target_os = "android"))]
    demander_et_ecrire(app, &nom, EXT_SYNC, contenu).await
}

/// Bouton « Recevoir des changements » : on choisit le fichier soi-même. None si annulé.
#[tauri::command]
async fn recevoir_changements(app: AppHandle, etat: State<'_, Etat>) -> Res<Option<usize>> {
    let octets = tauri::async_runtime::spawn_blocking(move || -> Res<Option<Vec<u8>>> {
        let Some(chemin) = app.dialog().file().blocking_pick_file() else { return Ok(None) };
        let mut v = Vec::new();
        app.fs().open(chemin, en_lecture()).map_err(txt)?.read_to_end(&mut v).map_err(txt)?;
        Ok(Some(v))
    })
    .await
    .map_err(txt)??;
    octets.map(|o| fusionner_octets(&etat, &o)).transpose()
}

#[derive(Serialize, Default)]
struct Recus {
    fichiers: usize,
    changements: usize,
    erreurs: Vec<String>,
}

/// Réception automatique. PC : fichiers de changements arrivés dans Téléchargements (supprimés une fois ajoutés).
/// Android : fichier ouvert avec « Ouvrir avec Sésame ».
#[tauri::command]
async fn chercher_changements(app: AppHandle, etat: State<'_, Etat>, appareil: String) -> Res<Recus> {
    let mut r = Recus::default();
    #[cfg(target_os = "android")]
    {
        let _ = &appareil;
        let h = app.state::<Partage>().0.clone();
        let recu: serde_json::Value = tauri::async_runtime::spawn_blocking(move || h.run_mobile_plugin("fichierRecu", ()))
            .await
            .map_err(txt)?
            .map_err(txt)?;
        if let Some(b64) = recu.get("contenu").and_then(|v| v.as_str()) {
            let octets = data_encoding::BASE64.decode(b64.as_bytes()).map_err(txt)?;
            r.fichiers = 1;
            match fusionner_octets(&etat, &octets) {
                Ok(n) => r.changements = n,
                Err(e) => r.erreurs.push(e),
            }
        }
    }
    #[cfg(not(target_os = "android"))]
    {
        let Ok(dossier) = app.path().download_dir() else { return Ok(r) };
        let Ok(liste) = std::fs::read_dir(&dossier) else { return Ok(r) };
        for f in liste.flatten() {
            let nom = f.file_name().to_string_lossy().to_string();
            // Quick Share peut ajouter « (1) » au nom : on regarde le début et l'extension
            if !nom.starts_with(PREFIXE_SYNC) || !nom.contains(&format!(".{EXT_SYNC}")) || nom.contains(&appareil) {
                continue;
            }
            let Ok(octets) = std::fs::read(f.path()) else { continue };
            r.fichiers += 1;
            match fusionner_octets(&etat, &octets) {
                Ok(n) => {
                    r.changements += n;
                    let _ = std::fs::remove_file(f.path());
                }
                Err(e) => r.erreurs.push(format!("{nom} : {e}")),
            }
        }
    }
    Ok(r)
}

// ---------- Empreinte (Android) ----------
// La clé des données est chiffrée par une clé du coffre-fort matériel du téléphone (Android Keystore),
// utilisable seulement après une empreinte, et invalidée si une nouvelle empreinte est ajoutée.
// La clé ne passe jamais par l'interface : moteur ⇄ partie Android uniquement.

#[cfg(target_os = "android")]
struct Biometrie(tauri::plugin::PluginHandle<tauri::Wry>);

#[cfg_attr(not(target_os = "android"), allow(dead_code))] // utilisé seulement sur Android
#[derive(Serialize, Deserialize)]
struct Scelle {
    chiffre: String,
    iv: String,
}

#[tauri::command]
async fn empreinte_disponible(app: AppHandle) -> Res<bool> {
    #[cfg(target_os = "android")]
    {
        let h = app.state::<Biometrie>().0.clone();
        let r: serde_json::Value = tauri::async_runtime::spawn_blocking(move || h.run_mobile_plugin("disponible", ()))
            .await
            .map_err(txt)?
            .map_err(txt)?;
        Ok(r.get("ok").and_then(|v| v.as_bool()).unwrap_or(false))
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Ok(false)
    }
}

/// `titre` / `annuler` : textes de la fenêtre d'empreinte, dans la langue de l'appli.
#[tauri::command]
async fn activer_empreinte(app: AppHandle, etat: State<'_, Etat>, titre: String, annuler: String) -> Res<()> {
    #[cfg(target_os = "android")]
    {
        let cle = {
            let garde = etat.ouvert.lock().unwrap();
            data_encoding::BASE64.encode(garde.as_ref().ok_or("Le coffre est verrouillé.")?.cle_donnees())
        };
        let h = app.state::<Biometrie>().0.clone();
        let s: Scelle = tauri::async_runtime::spawn_blocking(move || {
            h.run_mobile_plugin("chiffrer", serde_json::json!({ "donnee": cle, "titre": titre, "annuler": annuler }))
        })
        .await
        .map_err(txt)?
        .map_err(txt)?;
        std::fs::write(fichier_empreinte(&etat), serde_json::to_vec(&s).map_err(txt)?).map_err(txt)
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, etat, titre, annuler);
        Err("L'empreinte n'est disponible que sur le téléphone.".into())
    }
}

#[tauri::command]
fn desactiver_empreinte(etat: State<Etat>) -> Res<()> {
    let f = fichier_empreinte(&etat);
    if f.exists() {
        std::fs::remove_file(f).map_err(txt)?;
    }
    Ok(())
}

#[tauri::command]
async fn deverrouiller_empreinte(app: AppHandle, etat: State<'_, Etat>, titre: String, annuler: String) -> Res<()> {
    #[cfg(target_os = "android")]
    {
        let s: Scelle = serde_json::from_slice(&std::fs::read(fichier_empreinte(&etat)).map_err(txt)?).map_err(txt)?;
        let h = app.state::<Biometrie>().0.clone();
        let r = tauri::async_runtime::spawn_blocking(move || {
            h.run_mobile_plugin::<serde_json::Value>("dechiffrer", serde_json::json!({ "chiffre": s.chiffre, "iv": s.iv, "titre": titre, "annuler": annuler }))
        })
        .await
        .map_err(txt)?;
        let r = match r {
            Ok(v) => v,
            Err(e) => {
                let m = e.to_string();
                // Empreinte ajoutée ou retirée dans le téléphone : la clé du coffre-fort n'existe plus
                if m.contains("invalidee") {
                    let _ = std::fs::remove_file(fichier_empreinte(&etat));
                    return Err("Les empreintes du téléphone ont changé : ouvrez avec le mot de passe, puis réactivez l'empreinte dans Paramètres.".into());
                }
                return Err("Empreinte non reconnue ou annulée : vous pouvez aussi ouvrir avec le mot de passe.".into());
            }
        };
        let cle = zeroize::Zeroizing::new(
            data_encoding::BASE64.decode(r.get("donnee").and_then(|v| v.as_str()).unwrap_or("").as_bytes()).map_err(txt)?,
        );
        let f = lire_disque(&etat)?;
        match Coffre::ouvrir_par_cle(&f, &cle) {
            Ok(c) => {
                *etat.ouvert.lock().unwrap() = Some(c);
                Ok(())
            }
            Err(_) => {
                // Coffre remplacé (sauvegarde restaurée…) : l'ancienne clé ne vaut plus
                let _ = std::fs::remove_file(fichier_empreinte(&etat));
                Err("L'empreinte ne correspond plus à ces données : ouvrez avec le mot de passe, puis réactivez l'empreinte.".into())
            }
        }
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, etat, titre, annuler);
        Err("L'empreinte n'est disponible que sur le téléphone.".into())
    }
}

/// Efface définitivement le coffre de cet appareil (les sauvegardes exportées ne sont pas touchées).
#[tauri::command]
fn tout_effacer(etat: State<Etat>) -> Res<()> {
    *etat.ouvert.lock().unwrap() = None;
    for f in [etat.fichier.clone(), etat.fichier.with_extension("tmp"), fichier_empreinte(&etat)] {
        if f.exists() {
            std::fs::remove_file(f).map_err(txt)?;
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri::plugin::Builder::<tauri::Wry>::new("partage")
                .setup(|_app, _api| {
                    #[cfg(target_os = "android")]
                    _app.manage(Partage(_api.register_android_plugin("fr.portefeuille.app", "PartagePlugin")?));
                    Ok(())
                })
                .build(),
        )
        .plugin(
            tauri::plugin::Builder::<tauri::Wry>::new("biometrie")
                .setup(|_app, _api| {
                    #[cfg(target_os = "android")]
                    _app.manage(Biometrie(_api.register_android_plugin("fr.portefeuille.app", "BiometriePlugin")?));
                    Ok(())
                })
                .build(),
        )
        .setup(|app| {
            let dossier = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dossier)?;
            app.manage(Etat { fichier: dossier.join(NOM_FICHIER), ouvert: Mutex::new(None) });
            // Calibre Argon2id en tâche de fond pour que la création du coffre soit immédiate
            std::thread::spawn(reglage_appareil);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            etat_coffre,
            creer_coffre,
            deverrouiller,
            recuperer,
            verrouiller,
            changer_mot_de_passe,
            nouvelle_cle_recuperation,
            lire_parametres,
            ecrire_parametres,
            exporter_sauvegarde,
            enregistrer_cle_recuperation,
            enregistrer_export,
            importer_sauvegarde,
            tout_effacer,
            lire_tout,
            ecrire_lot,
            lire_releves,
            lire_releves_chemins,
            taux_bce,
            derniere_version,
            ouvrir_lien,
            envoyer_changements,
            empreinte_disponible,
            activer_empreinte,
            desactiver_empreinte,
            deverrouiller_empreinte,
            recevoir_changements,
            chercher_changements,
        ])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de l'application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seuls_les_liens_de_sesame_s_ouvrent() {
        assert!(lien_autorise("https://github.com/Fram-sudo/sesame/releases/download/v0.1.2/Sesame-Android.apk"));
        assert!(!lien_autorise("https://github.com/autre/depot/x.exe"));
        assert!(!lien_autorise("https://github.com/Fram-sudo/sesame/../../autre"));
        assert!(!lien_autorise("file:///C:/Windows/system32/calc.exe"));
    }

    #[test]
    fn texte_windows_1252_et_utf8() {
        assert_eq!(decoder_texte(b"Libell\xe9;\x80"), "Libellé;€");
        assert_eq!(decoder_texte("\u{feff}Libellé".as_bytes()), "Libellé");
    }

    #[test]
    fn pdf_transmis_en_base64() {
        let r = analyser_releve("a.pdf".into(), b"%PDF-1.7".to_vec()).unwrap();
        assert_eq!(r.pdf.as_deref(), Some("JVBERi0xLjc="));
    }
}
