package pl.infradesk.tv

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.View
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

class MainActivity : Activity() {

    private lateinit var webView: WebView

    // ── ZMIEŃ NA SWÓJ URL ──────────────────────────────────────────
    private val TV_URL         = "https://infradesk.pl/tv"
    private val VERSION_URL    = "https://infradesk.pl/downloads/version-tv.json"
    private val CURRENT_VERSION = "1.0.0"           // <- aktualizuj przy każdym wydaniu
    // ──────────────────────────────────────────────────────────────

    private val handler = Handler(Looper.getMainLooper())
    private var downloadId = -1L
    private var downloadReceiver: BroadcastReceiver? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        )

        webView = WebView(this).also { setContentView(it) }

        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            mediaPlaybackRequiresUserGesture = false
            useWideViewPort = true
            loadWithOverviewMode = true
            userAgentString = "$userAgentString InfraDeskTV/$CURRENT_VERSION"
        }

        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) = false
        }

        webView.loadUrl(TV_URL)

        // Sprawdź aktualizację po 5 sekundach od startu
        handler.postDelayed({ checkForUpdate(silent = true) }, 5_000)
    }

    // ── Update check ──────────────────────────────────────────────

    fun checkForUpdate(silent: Boolean = false) {
        Thread {
            try {
                val conn = URL(VERSION_URL).openConnection() as HttpURLConnection
                conn.connectTimeout = 5_000
                conn.readTimeout = 5_000
                val json = JSONObject(conn.inputStream.bufferedReader().readText())
                conn.disconnect()

                val remoteVersion = json.getString("version")
                val apkUrl = json.getString("url")

                if (isNewerVersion(remoteVersion, CURRENT_VERSION)) {
                    handler.post {
                        showUpdateDialog(remoteVersion, apkUrl)
                    }
                } else if (!silent) {
                    handler.post {
                        showNoUpdateDialog()
                    }
                }
            } catch (e: Exception) {
                if (!silent) {
                    handler.post {
                        showErrorDialog("Nie można sprawdzić aktualizacji: ${e.message}")
                    }
                }
            }
        }.start()
    }

    private fun isNewerVersion(remote: String, current: String): Boolean {
        fun parse(v: String) = v.split(".").map { it.toIntOrNull() ?: 0 }
        val r = parse(remote)
        val c = parse(current)
        for (i in 0 until maxOf(r.size, c.size)) {
            val rv = r.getOrElse(i) { 0 }
            val cv = c.getOrElse(i) { 0 }
            if (rv > cv) return true
            if (rv < cv) return false
        }
        return false
    }

    private fun showUpdateDialog(version: String, apkUrl: String) {
        AlertDialog.Builder(this)
            .setTitle("Dostępna aktualizacja")
            .setMessage("Nowa wersja: $version\nAktualna: $CURRENT_VERSION\n\nCzy chcesz zaktualizować aplikację?")
            .setPositiveButton("Aktualizuj") { _, _ -> downloadAndInstall(apkUrl) }
            .setNegativeButton("Później", null)
            .show()
    }

    private fun showNoUpdateDialog() {
        AlertDialog.Builder(this)
            .setTitle("Brak aktualizacji")
            .setMessage("Masz najnowszą wersję ($CURRENT_VERSION)")
            .setPositiveButton("OK", null)
            .show()
    }

    private fun showErrorDialog(msg: String) {
        AlertDialog.Builder(this)
            .setTitle("Błąd")
            .setMessage(msg)
            .setPositiveButton("OK", null)
            .show()
    }

    // ── Download & Install ────────────────────────────────────────

    private fun downloadAndInstall(apkUrl: String) {
        val apkFile = File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "infradesk-tv-update.apk")
        if (apkFile.exists()) apkFile.delete()

        val request = DownloadManager.Request(Uri.parse(apkUrl)).apply {
            setTitle("InfraDesk TV — aktualizacja")
            setDescription("Pobieranie nowej wersji...")
            setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
            setDestinationUri(Uri.fromFile(apkFile))
        }

        val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        downloadId = dm.enqueue(request)

        // Nasłuchuj zakończenia pobierania
        downloadReceiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context, intent: Intent) {
                val id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1)
                if (id == downloadId) {
                    unregisterReceiver(this)
                    downloadReceiver = null
                    installApk(apkFile)
                }
            }
        }
        registerReceiver(downloadReceiver, IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE))

        AlertDialog.Builder(this)
            .setTitle("Pobieranie...")
            .setMessage("Trwa pobieranie aktualizacji. Instalacja uruchomi się automatycznie po zakończeniu.")
            .setPositiveButton("OK", null)
            .show()
    }

    private fun installApk(apkFile: File) {
        val uri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            FileProvider.getUriForFile(this, "$packageName.fileprovider", apkFile)
        } else {
            Uri.fromFile(apkFile)
        }

        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        startActivity(intent)
    }

    // ── Input handling ────────────────────────────────────────────

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        return when (keyCode) {
            KeyEvent.KEYCODE_BACK -> {
                if (webView.canGoBack()) { webView.goBack(); true }
                else false
            }
            // Długie przytrzymanie przycisku Menu → sprawdź aktualizację
            KeyEvent.KEYCODE_MENU -> {
                checkForUpdate(silent = false)
                true
            }
            else -> super.onKeyDown(keyCode, event)
        }
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
    }

    override fun onDestroy() {
        super.onDestroy()
        downloadReceiver?.let { unregisterReceiver(it) }
        handler.removeCallbacksAndMessages(null)
    }
}
