package io.github.haanidesign.shiryou

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle

/* うく 窓 からは ファイルを 選べない ので、見えない 画面を はさむ */
class PickerActivity : Activity() {
    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        if (b != null) return
        val i = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = intent.getStringExtra("mime") ?: "*/*"
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, intent.getBooleanExtra("multi", false))
        }
        try {
            startActivityForResult(i, 1)
        } catch (e: Exception) {
            done(null)
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(req: Int, code: Int, data: Intent?) {
        super.onActivityResult(req, code, data)
        if (code != RESULT_OK || data == null) return done(null)
        val out = mutableListOf<Uri>()
        val clip = data.clipData
        if (clip != null) for (k in 0 until clip.itemCount) out.add(clip.getItemAt(k).uri)
        else data.data?.let { out.add(it) }
        done(out.toTypedArray())
    }

    private fun done(r: Array<Uri>?) {
        OverlayService.pick?.invoke(r)
        OverlayService.pick = null
        finish()
    }
}
