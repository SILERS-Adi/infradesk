package pl.infradesk.tv

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.SharedPreferences
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.LayoutInflater
import android.view.View
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

data class MenuItem(val label: String, val icon: String, val path: String)

class MainActivity : Activity() {

    private lateinit var webView: WebView
    private lateinit var menuContainer: LinearLayout
    private lateinit var prefs: SharedPreferences

    private val BASE_URL       = "https://infradesk.pl"
    private val VERSION_URL    = "https://infradesk.pl/downloads/version-tv.json"
    private val CURRENT_VERSION = "1.1.0"

    private val MENU_ITEMS = listOf(
        MenuItem("Zgłoszenia", "🎫", "/tickets"),
        MenuItem("Agenci",     "🤖", "/agents"),
        MenuItem("Zadania",    "✅", "/tasks"),
        MenuItem("Zamówienia", "🛒", "/orders"),
    )

    private var selectedIndex = 0
    private var menuViews = mutableListOf<View>()
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

        prefs = getSharedPreferences("infradesk_tv", Context.MODE_PRIVATE)

        setContentView(R.layout.activity_main)
        webView = findViewById(R.id.webView)
        menuContainer = findViewById(R.id.menuContainer)

        setupMenu()
        setupWebView()

        val credentials = getSavedCredentials()
        if (credentials == null) {
            showCredentialsDialog()
        } else {
            loadPage(MENU_ITEMS[selectedIndex].path)
        }

        handler.postDelayed({ checkForUpdate(silent = true) }, 8_000)
    }

    // ── Menu ──────────────────────────────────────────────────────────────────

    private fun setupMenu() {
        menuContainer.removeAllViews()
        menuViews.clear()

        MENU_ITEMS.forEachIndexed { index, item ->
            val view = LayoutInflater.from(this).inflate(R.layout.item_menu, menuContainer, false)
            view.findViewById<TextView>(R.id.menuIcon).text = item.icon
            view.findViewById<TextView>(R.id.menuLabel).text = item.label

            view.setOnClickListener { selectMenuItem(index) }
            view.setOnFocusChangeListener { v, hasFocus ->
                if (hasFocus) highlightItem(index)
            }

            menuContainer.addView(view)
            menuViews.add(view)
        }

        highlightItem(0)
    }

    private fun selectMenuItem(index: Int) {
        selectedIndex = index
        highlightItem(index)
        loadPage(MENU_ITEMS[index].path)
    }

    private fun highlightItem(index: Int) {
        menuViews.forEachIndexed { i, v ->
            val label = v.findViewById<TextView>(R.id.menuLabel)
            val icon  = v.findViewById<TextView>(R.id.menuIcon)
            if (i == index) {
                v.isSelected = true
                label.setTextColor(0xFFFFFFFF.toInt())
                icon.setTextColor(0xFF4da6ff.toInt())
                v.setBackgroundResource(R.drawable.menu_item_bg)
            } else {
                v.isSelected = false
                label.setTextColor(0xFFc8dff0.toInt())
                icon.setTextColor(0xFF8ab4d4.toInt())
                v.setBackgroundResource(R.drawable.menu_item_bg)
            }
        }
    }

    // ── WebView ───────────────────────────────────────────────────────────────

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
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
        webView.addJavascriptInterface(LoginBridge(), "InfraDeskBridge")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) = false

            override fun onPageFinished(view: WebView, url: String) {
                // Jeśli jesteśmy na stronie logowania — wstrzyknij dane
                if (url.contains("/login", ignoreCase = true)) {
                    val creds = getSavedCredentials()
                    if (creds != null) {
                        injectLogin(creds.first, creds.second)
                    }
                }

                // Zaktualizuj aktywne menu na podstawie URL
                MENU_ITEMS.forEachIndexed { i, item ->
                    if (url.contains(item.path)) {
                        selectedIndex = i
                        highlightItem(i)
                    }
                }
            }
        }
    }

    private fun loadPage(path: String) {
        webView.loadUrl("$BASE_URL$path")
    }

    private fun injectLogin(email: String, password: String) {
        val js = """
            (function() {
                var emailField = document.querySelector('input[type="email"], input[name="email"], input[placeholder*="mail"], input[placeholder*="login"]');
                var passField  = document.querySelector('input[type="password"]');
                var submitBtn  = document.querySelector('button[type="submit"], input[type="submit"]');
                if (emailField && passField) {
                    var nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                    nativeInputValueSetter.call(emailField, '$email');
                    emailField.dispatchEvent(new Event('input', { bubbles: true }));
                    nativeInputValueSetter.call(passField, '$password');
                    passField.dispatchEvent(new Event('input', { bubbles: true }));
                    if (submitBtn) { setTimeout(function(){ submitBtn.click(); }, 300); }
                }
            })();
        """.trimIndent()
        webView.evaluateJavascript(js, null)
    }

    // ── Credentials ───────────────────────────────────────────────────────────

    private fun getSavedCredentials(): Pair<String, String>? {
        val email = prefs.getString("email", null)
        val pass  = prefs.getString("password", null)
        return if (!email.isNullOrEmpty() && !pass.isNullOrEmpty()) Pair(email, pass) else null
    }

    private fun showCredentialsDialog() {
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(60, 40, 60, 20)
        }

        val emailView = android.widget.EditText(this).apply {
            hint = "Email / Login"
            inputType = android.text.InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
        }
        val passView = android.widget.EditText(this).apply {
            hint = "Hasło"
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
        }

        layout.addView(emailView)
        layout.addView(passView)

        AlertDialog.Builder(this)
            .setTitle("Konfiguracja InfraDesk TV")
            .setMessage("Podaj dane logowania administratora")
            .setView(layout)
            .setCancelable(false)
            .setPositiveButton("Zaloguj") { _, _ ->
                val email = emailView.text.toString().trim()
                val pass  = passView.text.toString()
                if (email.isNotEmpty() && pass.isNotEmpty()) {
                    prefs.edit().putString("email", email).putString("password", pass).apply()
                    loadPage(MENU_ITEMS[selectedIndex].path)
                } else {
                    showCredentialsDialog()
                }
            }
            .show()
    }

    // ── JavaScript bridge ─────────────────────────────────────────────────────

    inner class LoginBridge {
        @JavascriptInterface
        fun onLoginSuccess() {
            handler.post { loadPage(MENU_ITEMS[selectedIndex].path) }
        }
    }

    // ── Input handling ────────────────────────────────────────────────────────

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        return when (keyCode) {
            KeyEvent.KEYCODE_BACK -> {
                if (webView.canGoBack()) { webView.goBack(); true }
                else false
            }
            KeyEvent.KEYCODE_DPAD_UP -> {
                val next = (selectedIndex - 1 + MENU_ITEMS.size) % MENU_ITEMS.size
                selectMenuItem(next); true
            }
            KeyEvent.KEYCODE_DPAD_DOWN -> {
                val next = (selectedIndex + 1) % MENU_ITEMS.size
                selectMenuItem(next); true
            }
            KeyEvent.KEYCODE_MENU -> {
                checkForUpdate(silent = false); true
            }
            else -> super.onKeyDown(keyCode, event)
        }
    }

    // ── Update check ──────────────────────────────────────────────────────────

    fun checkForUpdate(silent: Boolean = false) {
        Thread {
            try {
                val conn = URL(VERSION_URL).openConnection() as HttpURLConnection
                conn.connectTimeout = 5_000
                conn.readTimeout = 5_000
                val json = JSONObject(conn.inputStream.bufferedReader().readText())
                conn.disconnect()
                val remote = json.getString("version")
                val apkUrl = json.getString("url")
                if (isNewerVersion(remote, CURRENT_VERSION)) {
                    handler.post { showUpdateDialog(remote, apkUrl) }
                } else if (!silent) {
                    handler.post { showNoUpdateDialog() }
                }
            } catch (e: Exception) {
                if (!silent) handler.post { showErrorDialog("Błąd aktualizacji: ${e.message}") }
            }
        }.start()
    }

    private fun isNewerVersion(remote: String, current: String): Boolean {
        fun parse(v: String) = v.split(".").map { it.toIntOrNull() ?: 0 }
        val r = parse(remote); val c = parse(current)
        for (i in 0 until maxOf(r.size, c.size)) {
            val rv = r.getOrElse(i) { 0 }; val cv = c.getOrElse(i) { 0 }
            if (rv > cv) return true; if (rv < cv) return false
        }
        return false
    }

    private fun showUpdateDialog(version: String, apkUrl: String) {
        AlertDialog.Builder(this)
            .setTitle("Dostępna aktualizacja")
            .setMessage("Nowa wersja: $version\nAktualna: $CURRENT_VERSION\n\nZaktualizować?")
            .setPositiveButton("Aktualizuj") { _, _ -> downloadAndInstall(apkUrl) }
            .setNegativeButton("Później", null).show()
    }

    private fun showNoUpdateDialog() {
        AlertDialog.Builder(this).setTitle("Brak aktualizacji")
            .setMessage("Masz najnowszą wersję ($CURRENT_VERSION)")
            .setPositiveButton("OK", null).show()
    }

    private fun showErrorDialog(msg: String) {
        AlertDialog.Builder(this).setTitle("Błąd").setMessage(msg)
            .setPositiveButton("OK", null).show()
    }

    // ── Download & Install ────────────────────────────────────────────────────

    private fun downloadAndInstall(apkUrl: String) {
        val apkFile = File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "infradesk-tv-update.apk")
        if (apkFile.exists()) apkFile.delete()
        val request = DownloadManager.Request(Uri.parse(apkUrl)).apply {
            setTitle("InfraDesk TV — aktualizacja")
            setDescription("Pobieranie...")
            setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
            setDestinationUri(Uri.fromFile(apkFile))
        }
        val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        downloadId = dm.enqueue(request)
        downloadReceiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context, intent: Intent) {
                if (intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1) == downloadId) {
                    unregisterReceiver(this); downloadReceiver = null; installApk(apkFile)
                }
            }
        }
        registerReceiver(downloadReceiver, IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE))
        AlertDialog.Builder(this).setTitle("Pobieranie...")
            .setMessage("Trwa pobieranie aktualizacji.")
            .setPositiveButton("OK", null).show()
    }

    private fun installApk(apkFile: File) {
        val uri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N)
            FileProvider.getUriForFile(this, "$packageName.fileprovider", apkFile)
        else Uri.fromFile(apkFile)
        startActivity(Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        })
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    override fun onResume() { super.onResume(); webView.onResume() }
    override fun onPause()  { super.onPause();  webView.onPause()  }
    override fun onDestroy() {
        super.onDestroy()
        downloadReceiver?.let { unregisterReceiver(it) }
        handler.removeCallbacksAndMessages(null)
    }
}
