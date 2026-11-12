package fr.portefeuille.app

import android.app.Activity
import android.content.ClipData
import android.content.Intent
import android.net.Uri
import android.util.Base64
import android.webkit.WebView
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File

@InvokeArg
class ArgsPartage {
  lateinit var chemin: String
}

/**
 * Synchronisation sans réseau : envoie le fichier de changements par le menu de partage Android
 * (Quick Share, Bluetooth, e-mail…) et garde le fichier ouvert avec « Ouvrir avec Portefeuille ».
 */
@TauriPlugin
class PartagePlugin(private val activity: Activity) : Plugin(activity) {
  private var recu: Uri? = null

  override fun load(webView: WebView) {
    garder(activity.intent)
  }

  override fun onNewIntent(intent: Intent) {
    garder(intent)
  }

  @Suppress("DEPRECATION")
  private fun garder(intent: Intent?) {
    val uri = when (intent?.action) {
      Intent.ACTION_VIEW -> intent.data
      Intent.ACTION_SEND -> intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
      else -> null
    }
    if (uri != null) recu = uri
  }

  /** Contenu (base64) du dernier fichier reçu, une seule fois ; objet vide sinon. */
  @Command
  fun fichierRecu(invoke: Invoke) {
    val uri = recu
    recu = null
    val ret = JSObject()
    if (uri != null) {
      try {
        val octets = activity.contentResolver.openInputStream(uri)?.use { it.readBytes() }
        if (octets != null) ret.put("contenu", Base64.encodeToString(octets, Base64.NO_WRAP))
      } catch (e: Exception) {
        invoke.reject("Impossible de lire le fichier reçu.")
        return
      }
    }
    invoke.resolve(ret)
  }

  @Command
  fun partager(invoke: Invoke) {
    val args = invoke.parseArgs(ArgsPartage::class.java)
    val uri = FileProvider.getUriForFile(activity, activity.packageName + ".fileprovider", File(args.chemin))
    val envoi = Intent(Intent.ACTION_SEND).apply {
      type = "application/octet-stream"
      putExtra(Intent.EXTRA_STREAM, uri)
      clipData = ClipData.newRawUri("", uri)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    activity.startActivity(Intent.createChooser(envoi, "Envoyer mes changements"))
    invoke.resolve()
  }
}
