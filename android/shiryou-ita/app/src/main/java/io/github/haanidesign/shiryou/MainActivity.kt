package io.github.haanidesign.shiryou

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.widget.Toast

/* 開くと 窓を うかせて すぐ 閉じる。はじめは「ほかの アプリの 上に 表示」の 許可を もらう */
class MainActivity : Activity() {
    private var asked = false

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        asked = b?.getBoolean("asked") ?: false
    }

    override fun onSaveInstanceState(o: Bundle) {
        super.onSaveInstanceState(o)
        o.putBoolean("asked", asked)
    }

    override fun onResume() {
        super.onResume()
        if (Settings.canDrawOverlays(this)) {
            startForegroundService(Intent(this, OverlayService::class.java))
            finish()
        } else if (!asked) {
            asked = true
            Toast.makeText(this, "「資料いた」を ほかの アプリの 上に 表示 できる ように して ください", Toast.LENGTH_LONG).show()
            startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
        } else {
            finish()
        }
    }
}
