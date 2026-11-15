//! Linux, version AppImage : Sésame s'ajoute lui-même au menu des applications, avec son icône,
//! comme un logiciel installé (fichier .desktop et icônes dans le dossier personnel, rien en administrateur).
//! Si le fichier AppImage est déplacé, l'entrée suit au lancement suivant. « Retirer du menu » est retenu.
use std::path::{Path, PathBuf};

const ID: &str = "fr.portefeuille.app";
const ICONES: [(&str, &[u8]); 2] = [("256x256", include_bytes!("../icons/128x128@2x.png")), ("512x512", include_bytes!("../icons/icon.png"))];

/// Chemin du fichier AppImage en cours d'exécution (variable posée par l'AppImage elle-même)
pub fn appimage() -> Option<PathBuf> {
    std::env::var_os("APPIMAGE").map(PathBuf::from).filter(|p| p.is_absolute() && p.is_file())
}

fn partage() -> Option<PathBuf> {
    std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local/share")))
}

fn fichier_bureau(base: &Path) -> PathBuf {
    base.join("applications").join(format!("{ID}.desktop"))
}

fn fichier_icone(base: &Path, taille: &str) -> PathBuf {
    base.join("icons/hicolor").join(taille).join("apps").join(format!("{ID}.png"))
}

fn marqueur(donnees: &Path) -> PathBuf {
    donnees.join("menu-retire")
}

/// Argument de la ligne Exec= (norme freedesktop) : entre guillemets, caractères spéciaux échappés.
/// None si le chemin contient un caractère qu'on ne sait pas écrire sans ambiguïté.
pub fn argument_exec(chemin: &str) -> Option<String> {
    if chemin.chars().any(|c| c.is_control() || c == '\\') {
        return None;
    }
    let mut s = String::from("\"");
    for c in chemin.chars() {
        match c {
            '"' | '`' | '$' => {
                // l'échappement passe aussi par la lecture des chaînes du fichier : la barre oblique est doublée
                s.push_str("\\\\");
                s.push(c);
            }
            '%' => s.push_str("%%"),
            _ => s.push(c),
        }
    }
    s.push('"');
    Some(s)
}

pub fn contenu(exec: &str, classe: &str) -> String {
    format!(
        "[Desktop Entry]\nType=Application\nVersion=1.0\nName=Sésame\nName[en]=Sesame\n\
GenericName=Suivi de budget\nGenericName[en]=Budget tracker\n\
Comment=Vos finances, chez vous. 100 % local et chiffré.\nComment[en]=Your finances, at home. 100% local and encrypted.\n\
Exec={exec}\nIcon={ID}\nTerminal=false\nCategories=Office;Finance;\n\
Keywords=budget;banque;comptes;finances;bank;money;\nStartupNotify=true\nStartupWMClass={classe}\n"
    )
}

/// Ajoute (ou met à jour) l'entrée du menu, sauf si l'utilisateur l'a retirée
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
pub fn installer(donnees: &Path) -> std::io::Result<()> {
    if marqueur(donnees).exists() {
        return Ok(());
    }
    ecrire()
}

fn ecrire() -> std::io::Result<()> {
    let (Some(image), Some(base)) = (appimage(), partage()) else { return Ok(()) };
    let Some(exec) = image.to_str().and_then(argument_exec) else { return Ok(()) };
    // Nom de la fenêtre sous X11 : celui de l'exécutable lancé à l'intérieur de l'AppImage
    let classe = std::env::current_exe().ok().and_then(|p| p.file_name().map(|n| n.to_string_lossy().into_owned())).unwrap_or_else(|| "portefeuille".into());
    let mut change = false;
    for (taille, octets) in ICONES {
        let f = fichier_icone(&base, taille);
        if std::fs::read(&f).ok().as_deref() != Some(octets) {
            std::fs::create_dir_all(f.parent().unwrap())?;
            std::fs::write(&f, octets)?;
            change = true;
        }
    }
    let f = fichier_bureau(&base);
    let texte = contenu(&exec, &classe);
    if std::fs::read_to_string(&f).ok().as_deref() != Some(texte.as_str()) {
        std::fs::create_dir_all(f.parent().unwrap())?;
        std::fs::write(&f, texte)?;
        change = true;
    }
    if change {
        // Rafraîchit les menus quand ces outils existent (sinon le bureau le fait tout seul)
        let _ = std::process::Command::new("update-desktop-database").arg(base.join("applications")).output();
        let _ = std::process::Command::new("gtk-update-icon-cache").args(["-f", "-t"]).arg(base.join("icons/hicolor")).output();
    }
    Ok(())
}

/// None : pas une AppImage (rien à régler) ; Some(présent dans le menu ou non)
pub fn etat() -> Option<bool> {
    appimage()?;
    Some(partage().map(|b| fichier_bureau(&b).exists()).unwrap_or(false))
}

pub fn regler(donnees: &Path, present: bool) -> std::io::Result<()> {
    if present {
        let _ = std::fs::remove_file(marqueur(donnees));
        return ecrire();
    }
    std::fs::write(marqueur(donnees), b"")?;
    if let Some(base) = partage() {
        let _ = std::fs::remove_file(fichier_bureau(&base));
        for (taille, _) in ICONES {
            let _ = std::fs::remove_file(fichier_icone(&base, taille));
        }
        let _ = std::process::Command::new("update-desktop-database").arg(base.join("applications")).output();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exec_echappe() {
        assert_eq!(argument_exec("/home/g/Applications/Sesame-Linux.AppImage").unwrap(), "\"/home/g/Applications/Sesame-Linux.AppImage\"");
        assert_eq!(argument_exec("/home/g/Mes logiciels/100%/S$\"x\".AppImage").unwrap(), "\"/home/g/Mes logiciels/100%%/S\\\\$\\\\\"x\\\\\".AppImage\"");
        assert!(argument_exec("/home/g/a\nb").is_none());
        assert!(argument_exec("/home/g/a\\b").is_none());
    }

    #[test]
    fn fichier_desktop() {
        let t = contenu("\"/x/Sesame.AppImage\"", "portefeuille");
        assert!(t.starts_with("[Desktop Entry]\n"));
        assert!(t.contains("\nExec=\"/x/Sesame.AppImage\"\n"));
        assert!(t.contains("\nIcon=fr.portefeuille.app\n"));
        assert!(t.contains("\nStartupWMClass=portefeuille\n"));
    }
}
