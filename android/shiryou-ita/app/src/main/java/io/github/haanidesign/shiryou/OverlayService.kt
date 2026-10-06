package io.github.haanidesign.shiryou

import android.annotation.SuppressLint
import android.app.AlertDialog
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.ClipboardManager
import android.content.ContentValues
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.MediaStore
import android.util.Base64
import android.view.ContextThemeWrapper
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.TextView
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import java.io.IOException
import kotlin.math.abs
import kotlin.math.max

/* ほかの アプリの 上に うく 窓。中身は サイトの 資料いた（WebView） */
class OverlayService : Service() {
    companion object {
        var pick: ((Array<Uri>?) -> Unit)? = null
        const val STOP = "stop"
        const val OVERLAY = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    }

    private val ui = Handler(Looper.getMainLooper())
    private lateinit var wm: WindowManager
    private lateinit var root: FrameLayout
    private lateinit var web: WebView
    private lateinit var lp: WindowManager.LayoutParams
    private lateinit var bub: TextView
    private lateinit var blp: WindowManager.LayoutParams
    private var shown = false      // 窓が 出て いるか
    private var bubShown = false
    private var ghost = false
    // 窓を 動かす とき。指の 位置は 画面の 座標（rawX）で 見る
    private var drag = 0           // 0 なし 1 動かす 2 大きさ
    private var cancelSent = false
    private var rx = 0f; private var ry = 0f
    private val picked = HashMap<String, Uri>()   // えらんだ 画像。/pick/番号 で 渡す
    private var pickN = 0
    private var gx = 0; private var gy = 0; private var gw = 0; private var gh = 0

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    override fun onBind(i: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        foreground()
        wm = getSystemService(WINDOW_SERVICE) as WindowManager
        makeWindow()
        makeBubble()
        wm.addView(root, lp)
        shown = true
    }

    override fun onStartCommand(i: Intent?, f: Int, id: Int): Int {
        if (i?.action == STOP) stopSelf()
        else restore()   // もう 一度 開いたら 窓を もどす
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        if (shown) wm.removeView(root)
        if (bubShown) wm.removeView(bub)
        web.destroy()
        super.onDestroy()
    }

    private fun foreground() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel("main", "資料いた", NotificationManager.IMPORTANCE_MIN))
        val stop = PendingIntent.getService(this, 0, Intent(this, OverlayService::class.java).setAction(STOP),
            PendingIntent.FLAG_IMMUTABLE)
        val n = Notification.Builder(this, "main")
            .setSmallIcon(android.R.drawable.ic_menu_gallery)
            .setContentTitle("資料いた")
            .setContentText("タップで とじる")
            .setContentIntent(stop)
            .build()
        if (Build.VERSION.SDK_INT >= 34) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        else startForeground(1, n)
    }

    private fun mime(p: String) = when (p.substringAfterLast('.').lowercase()) {
        "html" -> "text/html"; "js" -> "text/javascript"; "css" -> "text/css"
        "json", "webmanifest" -> "application/json"; "png" -> "image/png"; "svg" -> "image/svg+xml"
        else -> "application/octet-stream"
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun makeWindow() {
        lp = WindowManager.LayoutParams(dp(400), dp(620), OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT).apply {
            gravity = Gravity.TOP or Gravity.START
            x = dp(24); y = dp(80)
        }
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/") { path ->
                try { WebResourceResponse(mime(path), "utf-8", assets.open(path)) } catch (e: IOException) { null }
            }
            .addPathHandler("/pick/") { id ->
                val u = picked[id] ?: return@addPathHandler null
                try {
                    WebResourceResponse(contentResolver.getType(u) ?: "image/png", null, contentResolver.openInputStream(u))
                } catch (e: Exception) { null }
            }.build()
        web = WebView(this)
        web.setBackgroundColor(Color.TRANSPARENT)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.allowFileAccess = false
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(v: WebView, r: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(r.url)
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(v: WebView, cb: ValueCallback<Array<Uri>>, p: FileChooserParams): Boolean {
                val acc = p.acceptTypes.joinToString(",")
                val m = if (acc.contains("image") && !acc.contains("json")) "image/*" else "*/*"
                pick = if (m == "image/*") { r ->
                    // 画像は ここで 受けて、1まいずつ ページに 渡す
                    cb.onReceiveValue(null)
                    val ids = (r ?: arrayOf()).map { u -> (pickN++).toString().also { picked[it] = u } }
                    web.evaluateJavascript("window.__picked && window.__picked(${org.json.JSONArray(ids)})", null)
                } else { r -> cb.onReceiveValue(r) }
                startActivity(Intent(this@OverlayService, PickerActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    .putExtra("mime", m)
                    .putExtra("multi", p.mode == FileChooserParams.MODE_OPEN_MULTIPLE))
                return true
            }

            override fun onJsConfirm(v: WebView, url: String?, msg: String?, r: android.webkit.JsResult): Boolean {
                val d = AlertDialog.Builder(ContextThemeWrapper(this@OverlayService, android.R.style.Theme_Material_Dialog_Alert))
                    .setMessage(msg)
                    .setPositiveButton("OK") { _, _ -> r.confirm() }
                    .setNegativeButton("やめる") { _, _ -> r.cancel() }
                    .setOnCancelListener { r.cancel() }
                    .create()
                d.window?.setType(OVERLAY)
                d.show()
                return true
            }
        }
        web.addJavascriptInterface(Bridge(), "Native")
        root = object : FrameLayout(this) {
            override fun dispatchTouchEvent(e: MotionEvent): Boolean {
                if (e.actionMasked == MotionEvent.ACTION_DOWN) {
                    drag = 0; rx = e.rawX; ry = e.rawY
                    gx = lp.x; gy = lp.y; gw = lp.width; gh = lp.height
                }
                if (drag == 0) return super.dispatchTouchEvent(e)
                if (!cancelSent) {
                    val c = MotionEvent.obtain(e); c.action = MotionEvent.ACTION_CANCEL
                    super.dispatchTouchEvent(c); c.recycle(); cancelSent = true
                }
                when (e.actionMasked) {
                    MotionEvent.ACTION_MOVE -> {
                        val dx = (e.rawX - rx).toInt(); val dy = (e.rawY - ry).toInt()
                        if (drag == 1) { lp.x = gx + dx; lp.y = gy + dy }
                        else { lp.width = max(dp(200), gw + dx); lp.height = max(dp(200), gh + dy) }
                        if (shown) wm.updateViewLayout(this, lp)
                    }
                    MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> drag = 0
                }
                return true
            }
        }
        root.addView(web, FrameLayout.LayoutParams(-1, -1))
        web.loadUrl("https://appassets.androidplatform.net/assets/web/shiryou-ita/index.html")
    }

    /* ゴースト中・ちいさく した ときに 出る まるい ボタン。つまんで 動かせる */
    @SuppressLint("ClickableViewAccessibility")
    private fun makeBubble() {
        bub = TextView(this).apply {
            text = "👻"
            textSize = 22f
            gravity = Gravity.CENTER
            setBackgroundResource(R.drawable.bubble)
        }
        blp = WindowManager.LayoutParams(dp(52), dp(52), OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT).apply { gravity = Gravity.TOP or Gravity.START }
        var sx = 0f; var sy = 0f; var ox = 0; var oy = 0; var moved = false
        bub.setOnTouchListener { _, e ->
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> { sx = e.rawX; sy = e.rawY; ox = blp.x; oy = blp.y; moved = false }
                MotionEvent.ACTION_MOVE -> {
                    if (abs(e.rawX - sx) + abs(e.rawY - sy) > dp(8)) moved = true
                    if (moved) { blp.x = ox + (e.rawX - sx).toInt(); blp.y = oy + (e.rawY - sy).toInt(); wm.updateViewLayout(bub, blp) }
                }
                MotionEvent.ACTION_UP -> if (!moved) restore()
            }
            true
        }
    }

    private fun showBubble() {
        if (bubShown) return
        blp.x = lp.x; blp.y = lp.y
        wm.addView(bub, blp); bubShown = true
    }

    private fun restore() {
        if (ghost) {
            ghost = false
            lp.alpha = 1f
            lp.flags = lp.flags and WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE.inv()
            if (shown) wm.updateViewLayout(root, lp)
        }
        if (!shown) { wm.addView(root, lp); shown = true }
        if (bubShown) { wm.removeView(bub); bubShown = false }
    }

    inner class Bridge {
        @JavascriptInterface fun drag(k: Int) = ui.post { drag = k; cancelSent = false }.let { }

        // ゴースト: 窓を すかして、さわると 後ろの アプリに とおす（Android は こさ 0.8 まで）
        @JavascriptInterface fun ghost(a: Int) = ui.post {
            ghost = true
            lp.alpha = a.coerceIn(5, 80) / 100f
            lp.flags = lp.flags or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
            if (shown) wm.updateViewLayout(root, lp)
            showBubble()
        }.let { }

        @JavascriptInterface fun minimize() = ui.post {
            if (shown) { wm.removeView(root); shown = false }
            showBubble()
        }.let { }

        @JavascriptInterface fun close() = ui.post { stopSelf() }.let { }

        // クリップボードは 前に いる アプリ しか 読めない ので、少しの 間 窓に 入力を むける
        @JavascriptInterface fun clipImage() = ui.post {
            lp.flags = lp.flags and WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE.inv()
            wm.updateViewLayout(root, lp)
            ui.postDelayed({
                var out = ""
                try {
                    val cm = getSystemService(ClipboardManager::class.java)
                    val uri = cm.primaryClip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.uri
                    if (uri != null) {
                        val t = contentResolver.getType(uri) ?: "image/png"
                        if (t.startsWith("image/")) {
                            val bytes = contentResolver.openInputStream(uri)!!.use { it.readBytes() }
                            out = "data:$t;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP)
                        }
                    }
                } catch (e: Exception) { }
                lp.flags = lp.flags or WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                if (shown) wm.updateViewLayout(root, lp)
                web.evaluateJavascript("window.__clip && window.__clip(${JSONObject.quote(out)})", null)
            }, 250)
        }.let { }

        @JavascriptInterface fun saveFile(name: String, type: String, b64: String): Boolean = try {
            val v = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, name)
                put(MediaStore.MediaColumns.MIME_TYPE, type.ifEmpty { "application/octet-stream" })
                put(MediaStore.MediaColumns.RELATIVE_PATH, "Download/資料いた")
            }
            val u = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v)!!
            contentResolver.openOutputStream(u)!!.use { it.write(Base64.decode(b64, Base64.DEFAULT)) }
            true
        } catch (e: Exception) { false }
    }
}
