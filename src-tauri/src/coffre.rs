//! Le coffre : toutes les données de l'appli, chiffrées dans un seul fichier.
//!
//! Principe (« enveloppes ») :
//! - une clé de données aléatoire de 256 bits chiffre le contenu (AES-256-GCM) ;
//! - cette clé est rangée deux fois, chiffrée :
//!   1. par une clé dérivée du mot de passe maître (Argon2id, volontairement lent),
//!   2. par une clé dérivée de la clé de récupération (HKDF-SHA256 : elle est déjà
//!      aléatoire sur 256 bits, inutile de la ralentir).
//! Changer de mot de passe ne rechiffre donc que l'enveloppe, pas les données.
//! Le second facteur (jalon 8) ajoutera une enveloppe du même type.

use aes_gcm::aead::{rand_core::RngCore, Aead, OsRng, Payload};
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use argon2::{Algorithm, Argon2, Params, Version};
use data_encoding::{BASE32_NOPAD, BASE64};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use zeroize::Zeroizing;

pub type Cle = Zeroizing<[u8; 32]>;

#[derive(Debug, PartialEq)]
pub enum Erreur {
    MotDePasseIncorrect,
    CleRecuperationIncorrecte,
    FichierIllisible,
    /// Fichier de changements venu d'un appareil qui n'a pas le même coffre
    AutreCoffre,
    Interne(String),
}

impl std::fmt::Display for Erreur {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        f.write_str(match self {
            Erreur::MotDePasseIncorrect => "Mot de passe incorrect.",
            Erreur::CleRecuperationIncorrecte => "Clé de récupération incorrecte.",
            Erreur::FichierIllisible => "Fichier illisible : il est abîmé ou ce n'est pas un coffre Sésame.",
            Erreur::AutreCoffre => "Ce fichier vient d'un appareil qui n'a pas les mêmes données de départ : restaurez d'abord une sauvegarde de l'un sur l'autre.",
            Erreur::Interne(e) => e,
        })
    }
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct ParamsKdf {
    pub m_kib: u32,
    pub t: u32,
    pub p: u32,
}

/// Un bloc chiffré AES-256-GCM : nonce aléatoire + texte chiffré (avec son code d'intégrité).
#[derive(Serialize, Deserialize, Clone)]
struct Enveloppe {
    nonce: String,
    chiffre: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct Entete {
    version: u32,
    id: String,
    kdf: ParamsKdf,
    sel_mdp: String,
    cle_par_mdp: Enveloppe,
    sel_recup: String,
    cle_par_recup: Enveloppe,
}

/// Ce qui est écrit sur le disque (et dans une sauvegarde) : rien n'y est en clair
/// à part les paramètres techniques du chiffrement.
#[derive(Serialize, Deserialize, Clone)]
pub struct Fichier {
    entete: Entete,
    donnees: Enveloppe,
}

/// Un enregistrement synchronisable : identifiant unique, date de modification,
/// marque de suppression (voir jalon 9).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Enregistrement {
    pub collection: String,
    pub maj: i64,
    pub supprime: bool,
    pub valeur: serde_json::Value,
}

#[derive(Serialize, Deserialize, Default, Clone, Debug, PartialEq)]
pub struct Donnees {
    pub enregistrements: BTreeMap<String, Enregistrement>,
}

pub struct Coffre {
    entete: Entete,
    cle: Cle,
    pub donnees: Donnees,
}

fn aleatoire<const N: usize>() -> [u8; N] {
    let mut b = [0u8; N];
    OsRng.fill_bytes(&mut b);
    b
}

fn b64(b: &[u8]) -> String {
    BASE64.encode(b)
}

fn de_b64(s: &str) -> Result<Vec<u8>, Erreur> {
    BASE64.decode(s.as_bytes()).map_err(|_| Erreur::FichierIllisible)
}

fn chiffrer(cle: &[u8; 32], clair: &[u8], aad: &[u8]) -> Enveloppe {
    let nonce = aleatoire::<12>();
    let chiffre = Aes256Gcm::new(cle.into())
        .encrypt(Nonce::from_slice(&nonce), Payload { msg: clair, aad })
        .expect("AES-GCM ne peut pas échouer au chiffrement");
    Enveloppe { nonce: b64(&nonce), chiffre: b64(&chiffre) }
}

/// Renvoie None si la clé est mauvaise ou si le bloc a été modifié.
fn dechiffrer(cle: &[u8; 32], e: &Enveloppe, aad: &[u8]) -> Result<Option<Zeroizing<Vec<u8>>>, Erreur> {
    let nonce = de_b64(&e.nonce)?;
    if nonce.len() != 12 {
        return Err(Erreur::FichierIllisible);
    }
    let chiffre = de_b64(&e.chiffre)?;
    Ok(Aes256Gcm::new(cle.into())
        .decrypt(Nonce::from_slice(&nonce), Payload { msg: &chiffre, aad })
        .ok()
        .map(Zeroizing::new))
}

pub fn deriver_mdp(mdp: &str, sel: &[u8], k: ParamsKdf) -> Result<Cle, Erreur> {
    let params = Params::new(k.m_kib, k.t, k.p, Some(32)).map_err(|e| Erreur::Interne(e.to_string()))?;
    let mut cle = Zeroizing::new([0u8; 32]);
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .hash_password_into(mdp.as_bytes(), sel, cle.as_mut())
        .map_err(|e| Erreur::Interne(e.to_string()))?;
    Ok(cle)
}

fn deriver_recup(secret: &[u8], sel: &[u8]) -> Cle {
    let mut cle = Zeroizing::new([0u8; 32]);
    hkdf::Hkdf::<sha2::Sha256>::new(Some(sel), secret)
        .expand(b"portefeuille cle de recuperation", cle.as_mut())
        .expect("32 octets est une longueur valide pour HKDF");
    cle
}

/// Clé de récupération : 32 octets aléatoires, affichés en 13 groupes de 4 caractères.
fn formater_recup(secret: &[u8; 32]) -> String {
    let s = BASE32_NOPAD.encode(secret);
    s.as_bytes().chunks(4).map(|c| std::str::from_utf8(c).unwrap()).collect::<Vec<_>>().join("-")
}

fn lire_recup(saisie: &str) -> Result<Zeroizing<Vec<u8>>, Erreur> {
    let propre: String = saisie
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .map(|c| c.to_ascii_uppercase())
        .collect();
    let octets = BASE32_NOPAD.decode(propre.as_bytes()).map_err(|_| Erreur::CleRecuperationIncorrecte)?;
    if octets.len() != 32 {
        return Err(Erreur::CleRecuperationIncorrecte);
    }
    Ok(Zeroizing::new(octets))
}

// Les données additionnelles authentifiées (AAD) lient chaque bloc à ce coffre et à
// son rôle : impossible d'échanger une enveloppe entre deux coffres ou deux rôles.
fn aad(id: &str, role: &str) -> Vec<u8> {
    format!("portefeuille/v1/{id}/{role}").into_bytes()
}

impl Coffre {
    /// Crée un coffre vide. Renvoie aussi la clé de récupération à remettre à l'utilisateur.
    pub fn creer(mdp: &str, kdf: ParamsKdf) -> Result<(Coffre, String), Erreur> {
        let cle: Cle = Zeroizing::new(aleatoire::<32>());
        let id = b64(&aleatoire::<16>());
        let sel_mdp = aleatoire::<16>();
        let cle_mdp = deriver_mdp(mdp, &sel_mdp, kdf)?;
        let secret_recup = Zeroizing::new(aleatoire::<32>());
        let sel_recup = aleatoire::<16>();
        let cle_recup = deriver_recup(secret_recup.as_ref(), &sel_recup);
        let entete = Entete {
            version: 1,
            cle_par_mdp: chiffrer(&cle_mdp, cle.as_ref(), &aad(&id, "mdp")),
            cle_par_recup: chiffrer(&cle_recup, cle.as_ref(), &aad(&id, "recup")),
            id,
            kdf,
            sel_mdp: b64(&sel_mdp),
            sel_recup: b64(&sel_recup),
        };
        Ok((Coffre { entete, cle, donnees: Donnees::default() }, formater_recup(&secret_recup)))
    }

    fn ouvrir_avec(f: &Fichier, cle: Cle) -> Result<Coffre, Erreur> {
        let clair = dechiffrer(&cle, &f.donnees, &aad(&f.entete.id, "donnees"))?.ok_or(Erreur::FichierIllisible)?;
        let donnees = serde_json::from_slice(&clair).map_err(|_| Erreur::FichierIllisible)?;
        Ok(Coffre { entete: f.entete.clone(), cle, donnees })
    }

    /// Empreinte (Android) : ouverture avec la clé des données, gardée par le coffre-fort matériel du téléphone.
    /// Une clé fausse est refusée (le contenu ne se déchiffre pas).
    #[cfg_attr(not(target_os = "android"), allow(dead_code))]
    pub fn ouvrir_par_cle(f: &Fichier, cle: &[u8]) -> Result<Coffre, Erreur> {
        Self::ouvrir_avec(f, Self::cle_depuis(Zeroizing::new(cle.to_vec()))?)
    }

    /// Clé des données, pour la confier au coffre-fort matériel du téléphone (empreinte).
    #[cfg_attr(not(target_os = "android"), allow(dead_code))]
    pub fn cle_donnees(&self) -> &[u8; 32] {
        &self.cle
    }

    fn cle_depuis(octets: Zeroizing<Vec<u8>>) -> Result<Cle, Erreur> {
        let tab: [u8; 32] = octets.as_slice().try_into().map_err(|_| Erreur::FichierIllisible)?;
        Ok(Zeroizing::new(tab))
    }

    pub fn ouvrir(f: &Fichier, mdp: &str) -> Result<Coffre, Erreur> {
        let e = &f.entete;
        let cle_mdp = deriver_mdp(mdp, &de_b64(&e.sel_mdp)?, e.kdf)?;
        let cle = dechiffrer(&cle_mdp, &e.cle_par_mdp, &aad(&e.id, "mdp"))?.ok_or(Erreur::MotDePasseIncorrect)?;
        Self::ouvrir_avec(f, Self::cle_depuis(cle)?)
    }

    /// Mot de passe oublié : ouvre avec la clé de récupération et pose un nouveau mot de passe.
    pub fn recuperer(f: &Fichier, saisie: &str, nouveau_mdp: &str, kdf: ParamsKdf) -> Result<Coffre, Erreur> {
        let e = &f.entete;
        let cle_recup = deriver_recup(&lire_recup(saisie)?, &de_b64(&e.sel_recup)?);
        let cle = dechiffrer(&cle_recup, &e.cle_par_recup, &aad(&e.id, "recup"))?
            .ok_or(Erreur::CleRecuperationIncorrecte)?;
        let mut c = Self::ouvrir_avec(f, Self::cle_depuis(cle)?)?;
        c.poser_mdp(nouveau_mdp, kdf)?;
        Ok(c)
    }

    fn poser_mdp(&mut self, mdp: &str, kdf: ParamsKdf) -> Result<(), Erreur> {
        let sel = aleatoire::<16>();
        let cle_mdp = deriver_mdp(mdp, &sel, kdf)?;
        self.entete.cle_par_mdp = chiffrer(&cle_mdp, self.cle.as_ref(), &aad(&self.entete.id, "mdp"));
        self.entete.sel_mdp = b64(&sel);
        self.entete.kdf = kdf;
        Ok(())
    }

    fn verifier_mdp(&self, mdp: &str) -> Result<(), Erreur> {
        let e = &self.entete;
        let cle_mdp = deriver_mdp(mdp, &de_b64(&e.sel_mdp)?, e.kdf)?;
        dechiffrer(&cle_mdp, &e.cle_par_mdp, &aad(&e.id, "mdp"))?.ok_or(Erreur::MotDePasseIncorrect)?;
        Ok(())
    }

    pub fn changer_mdp(&mut self, ancien: &str, nouveau: &str, kdf: ParamsKdf) -> Result<(), Erreur> {
        self.verifier_mdp(ancien)?;
        self.poser_mdp(nouveau, kdf)
    }

    /// Remplace la clé de récupération : l'ancienne ne fonctionne plus.
    pub fn nouvelle_recup(&mut self, mdp: &str) -> Result<String, Erreur> {
        self.verifier_mdp(mdp)?;
        let secret = Zeroizing::new(aleatoire::<32>());
        let sel = aleatoire::<16>();
        let cle_recup = deriver_recup(secret.as_ref(), &sel);
        self.entete.cle_par_recup = chiffrer(&cle_recup, self.cle.as_ref(), &aad(&self.entete.id, "recup"));
        self.entete.sel_recup = b64(&sel);
        Ok(formater_recup(&secret))
    }

    /// Synchronisation : ajoute les données d'un autre appareil (même coffre).
    /// Pour chaque élément, la modification la plus récente gagne ; les suppressions passent aussi.
    /// Les réglages (`exclu`) restent propres à chaque appareil. Renvoie le nombre d'éléments changés.
    pub fn fusionner(&mut self, f: &Fichier, exclu: &str) -> Result<usize, Erreur> {
        if f.entete.id != self.entete.id {
            return Err(Erreur::AutreCoffre);
        }
        let clair = dechiffrer(&self.cle, &f.donnees, &aad(&f.entete.id, "donnees"))?.ok_or(Erreur::FichierIllisible)?;
        let autres: Donnees = serde_json::from_slice(&clair).map_err(|_| Erreur::FichierIllisible)?;
        let mut n = 0;
        for (id, e) in autres.enregistrements {
            if id == exclu || self.donnees.enregistrements.get(&id).is_some_and(|l| l.maj >= e.maj) {
                continue;
            }
            self.donnees.enregistrements.insert(id, e);
            n += 1;
        }
        Ok(n)
    }

    /// Produit la version chiffrée, prête à écrire sur le disque ou à exporter.
    pub fn sceller(&self) -> Fichier {
        let clair = Zeroizing::new(serde_json::to_vec(&self.donnees).expect("données sérialisables"));
        Fichier {
            entete: self.entete.clone(),
            donnees: chiffrer(&self.cle, &clair, &aad(&self.entete.id, "donnees")),
        }
    }
}

pub fn lire_fichier(octets: &[u8]) -> Result<Fichier, Erreur> {
    let f: Fichier = serde_json::from_slice(octets).map_err(|_| Erreur::FichierIllisible)?;
    if f.entete.version != 1 {
        return Err(Erreur::FichierIllisible);
    }
    Ok(f)
}

pub fn ecrire_fichier(f: &Fichier) -> Vec<u8> {
    serde_json::to_vec(f).expect("fichier sérialisable")
}

#[cfg(test)]
mod tests {
    use super::*;

    // Réglages minuscules pour que les tests soient rapides (jamais utilisés en vrai)
    const RAPIDE: ParamsKdf = ParamsKdf { m_kib: 64, t: 1, p: 1 };

    fn exemple() -> (Coffre, String) {
        let (mut c, recup) = Coffre::creer("bon mot de passe", RAPIDE).unwrap();
        c.donnees.enregistrements.insert(
            "op1".into(),
            Enregistrement { collection: "operations".into(), maj: 1, supprime: false, valeur: serde_json::json!({"montant": -1234}) },
        );
        (c, recup)
    }

    fn aller_retour(c: &Coffre) -> Fichier {
        lire_fichier(&ecrire_fichier(&c.sceller())).unwrap()
    }

    #[test]
    fn ouvre_avec_le_bon_mot_de_passe() {
        let (c, _) = exemple();
        let relu = Coffre::ouvrir(&aller_retour(&c), "bon mot de passe").unwrap();
        assert_eq!(relu.donnees, c.donnees);
    }

    #[test]
    fn refuse_un_mauvais_mot_de_passe() {
        let (c, _) = exemple();
        assert_eq!(Coffre::ouvrir(&aller_retour(&c), "mauvais").err(), Some(Erreur::MotDePasseIncorrect));
    }

    #[test]
    fn aucune_donnee_en_clair_dans_le_fichier() {
        let (c, _) = exemple();
        let texte = String::from_utf8(ecrire_fichier(&c.sceller())).unwrap();
        assert!(!texte.contains("operations") && !texte.contains("1234") && !texte.contains("op1"));
    }

    #[test]
    fn change_le_mot_de_passe() {
        let (mut c, _) = exemple();
        assert_eq!(c.changer_mdp("faux", "nouveau", RAPIDE).err(), Some(Erreur::MotDePasseIncorrect));
        c.changer_mdp("bon mot de passe", "nouveau", RAPIDE).unwrap();
        let f = aller_retour(&c);
        assert!(Coffre::ouvrir(&f, "bon mot de passe").is_err());
        assert_eq!(Coffre::ouvrir(&f, "nouveau").unwrap().donnees, c.donnees);
    }

    #[test]
    fn recupere_avec_la_cle_de_recuperation() {
        let (c, recup) = exemple();
        assert_eq!(recup.split('-').count(), 13);
        let f = aller_retour(&c);
        // Saisie tolérante : minuscules et espaces au lieu des tirets
        let saisie = recup.to_lowercase().replace('-', " ");
        let r = Coffre::recuperer(&f, &saisie, "tout neuf", RAPIDE).unwrap();
        assert_eq!(r.donnees, c.donnees);
        assert!(Coffre::ouvrir(&aller_retour(&r), "tout neuf").is_ok());
        // L'ancien mot de passe ne marche plus après récupération
        assert!(Coffre::ouvrir(&aller_retour(&r), "bon mot de passe").is_err());
    }

    #[test]
    fn refuse_une_mauvaise_cle_de_recuperation() {
        let (c, recup) = exemple();
        let f = aller_retour(&c);
        let fausse = recup.replacen(&recup[0..1], if &recup[0..1] == "A" { "B" } else { "A" }, 1);
        assert_eq!(Coffre::recuperer(&f, &fausse, "x", RAPIDE).err(), Some(Erreur::CleRecuperationIncorrecte));
        assert_eq!(Coffre::recuperer(&f, "trop-courte", "x", RAPIDE).err(), Some(Erreur::CleRecuperationIncorrecte));
    }

    #[test]
    fn nouvelle_cle_de_recuperation_invalide_l_ancienne() {
        let (mut c, ancienne) = exemple();
        let nouvelle = c.nouvelle_recup("bon mot de passe").unwrap();
        let f = aller_retour(&c);
        assert!(Coffre::recuperer(&f, &ancienne, "x", RAPIDE).is_err());
        assert!(Coffre::recuperer(&f, &nouvelle, "x", RAPIDE).is_ok());
    }

    #[test]
    fn detecte_une_sauvegarde_modifiee() {
        let (c, _) = exemple();
        let mut f = c.sceller();
        let mut octets = de_b64(&f.donnees.chiffre).unwrap();
        octets[0] ^= 1;
        f.donnees.chiffre = b64(&octets);
        assert_eq!(Coffre::ouvrir(&f, "bon mot de passe").err(), Some(Erreur::FichierIllisible));
        assert_eq!(lire_fichier(b"pas du json").err().map(|e| e.to_string()), Some(Erreur::FichierIllisible.to_string()));
    }

    #[test]
    fn fusionne_le_plus_recent_et_les_suppressions() {
        let (mut pc, _) = exemple();
        let mut tel = Coffre::ouvrir(&aller_retour(&pc), "bon mot de passe").unwrap();
        let e = |maj, supprime, v: i64| Enregistrement { collection: "operations".into(), maj, supprime, valeur: serde_json::json!(v) };
        tel.donnees.enregistrements.insert("op1".into(), e(5, true, 0)); // supprimée sur le téléphone
        tel.donnees.enregistrements.insert("op2".into(), e(3, false, 2)); // nouvelle sur le téléphone
        tel.donnees.enregistrements.insert("op3".into(), e(2, false, 30)); // ancienne version
        tel.donnees.enregistrements.insert("parametres".into(), e(9, false, 9));
        pc.donnees.enregistrements.insert("op3".into(), e(4, false, 31)); // modifiée plus tard sur le PC
        assert_eq!(pc.fusionner(&aller_retour(&tel), "parametres").unwrap(), 2);
        assert!(pc.donnees.enregistrements["op1"].supprime);
        assert_eq!(pc.donnees.enregistrements["op2"].valeur, serde_json::json!(2));
        assert_eq!(pc.donnees.enregistrements["op3"].valeur, serde_json::json!(31));
        assert!(!pc.donnees.enregistrements.contains_key("parametres"));
        // Recevoir deux fois le même fichier ne change rien
        assert_eq!(pc.fusionner(&aller_retour(&tel), "parametres").unwrap(), 0);
        // Dans l'autre sens, le téléphone récupère la version du PC
        assert_eq!(tel.fusionner(&aller_retour(&pc), "parametres").unwrap(), 1);
        assert_eq!(tel.donnees.enregistrements["op3"].valeur, serde_json::json!(31));
    }

    #[test]
    fn refuse_les_changements_d_un_autre_coffre() {
        let (mut c, _) = exemple();
        let (autre, _) = exemple();
        assert_eq!(c.fusionner(&aller_retour(&autre), "parametres").err(), Some(Erreur::AutreCoffre));
    }

    #[test]
    fn ouvre_avec_la_cle_des_donnees_et_refuse_une_autre() {
        let (c, _) = exemple();
        let f = aller_retour(&c);
        let relu = Coffre::ouvrir_par_cle(&f, c.cle_donnees()).unwrap();
        assert_eq!(relu.donnees, c.donnees);
        assert!(Coffre::ouvrir_par_cle(&f, &[7u8; 32]).is_err());
        assert!(Coffre::ouvrir_par_cle(&f, &[7u8; 5]).is_err());
    }

    #[test]
    fn interdit_d_echanger_les_enveloppes() {
        let (c, _) = exemple();
        let (autre, _) = Coffre::creer("bon mot de passe", RAPIDE).unwrap();
        let mut f = c.sceller();
        f.entete.cle_par_mdp = autre.entete.cle_par_mdp.clone();
        assert!(Coffre::ouvrir(&f, "bon mot de passe").is_err());
    }
}
