package fr.portefeuille.app

import android.app.Activity
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

@InvokeArg
class ArgsChiffrer {
  lateinit var donnee: String
  lateinit var titre: String
  lateinit var annuler: String
}

@InvokeArg
class ArgsDechiffrer {
  lateinit var chiffre: String
  lateinit var iv: String
  lateinit var titre: String
  lateinit var annuler: String
}

/**
 * Empreinte : chiffre la clé des données de Sésame avec une clé du coffre-fort matériel (Android Keystore),
 * utilisable uniquement juste après une empreinte reconnue, et détruite si les empreintes du téléphone changent.
 */
@TauriPlugin
class BiometriePlugin(private val activity: Activity) : Plugin(activity) {
  private val alias = "sesame-empreinte"

  private fun magasin() = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

  private fun nouvelleCle(): SecretKey {
    magasin().deleteEntry(alias)
    val spec = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .setKeySize(256)
      .setUserAuthenticationRequired(true)
      .setInvalidatedByBiometricEnrollment(true)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) spec.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
    val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    gen.init(spec.build())
    return gen.generateKey()
  }

  @Command
  fun disponible(invoke: Invoke) {
    val ok = BiometricManager.from(activity).canAuthenticate(BIOMETRIC_STRONG) == BiometricManager.BIOMETRIC_SUCCESS
    invoke.resolve(JSObject().put("ok", ok))
  }

  @Command
  fun chiffrer(invoke: Invoke) {
    val args = invoke.parseArgs(ArgsChiffrer::class.java)
    val cipher = try {
      Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, nouvelleCle()) }
    } catch (e: Exception) {
      invoke.reject("indisponible")
      return
    }
    demander(cipher, args.titre, args.annuler, invoke) { c ->
      val chiffre = c.doFinal(Base64.decode(args.donnee, Base64.NO_WRAP))
      JSObject()
        .put("chiffre", Base64.encodeToString(chiffre, Base64.NO_WRAP))
        .put("iv", Base64.encodeToString(c.iv, Base64.NO_WRAP))
    }
  }

  @Command
  fun dechiffrer(invoke: Invoke) {
    val args = invoke.parseArgs(ArgsDechiffrer::class.java)
    val cipher = try {
      val cle = magasin().getKey(alias, null) as? SecretKey
      if (cle == null) {
        invoke.reject("invalidee")
        return
      }
      Cipher.getInstance("AES/GCM/NoPadding").apply {
        init(Cipher.DECRYPT_MODE, cle, GCMParameterSpec(128, Base64.decode(args.iv, Base64.NO_WRAP)))
      }
    } catch (e: KeyPermanentlyInvalidatedException) {
      magasin().deleteEntry(alias)
      invoke.reject("invalidee")
      return
    } catch (e: Exception) {
      invoke.reject("indisponible")
      return
    }
    demander(cipher, args.titre, args.annuler, invoke) { c ->
      val clair = c.doFinal(Base64.decode(args.chiffre, Base64.NO_WRAP))
      JSObject().put("donnee", Base64.encodeToString(clair, Base64.NO_WRAP))
    }
  }

  /** Fenêtre d'empreinte du système ; `fin` utilise le chiffreur débloqué par l'empreinte. */
  private fun demander(cipher: Cipher, titre: String, annuler: String, invoke: Invoke, fin: (Cipher) -> JSObject) {
    activity.runOnUiThread {
      val rappel = object : BiometricPrompt.AuthenticationCallback() {
        override fun onAuthenticationSucceeded(resultat: BiometricPrompt.AuthenticationResult) {
          try {
            invoke.resolve(fin(resultat.cryptoObject!!.cipher!!))
          } catch (e: Exception) {
            invoke.reject("echec")
          }
        }

        override fun onAuthenticationError(code: Int, message: CharSequence) {
          invoke.reject("annule")
        }
      }
      val info = BiometricPrompt.PromptInfo.Builder()
        .setTitle(titre)
        .setNegativeButtonText(annuler)
        .setAllowedAuthenticators(BIOMETRIC_STRONG)
        .build()
      BiometricPrompt(activity as FragmentActivity, ContextCompat.getMainExecutor(activity), rappel)
        .authenticate(info, BiometricPrompt.CryptoObject(cipher))
    }
  }
}
