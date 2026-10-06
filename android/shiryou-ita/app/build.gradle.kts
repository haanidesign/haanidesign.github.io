plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "io.github.haanidesign.shiryou"
    compileSdk = 34
    defaultConfig {
        applicationId = "io.github.haanidesign.shiryou"
        minSdk = 29
        targetSdk = 34
        versionCode = 3
        versionName = "1.1"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("web"))
}

dependencies {
    implementation("androidx.webkit:webkit:1.11.0")
}

// サイトの 資料いた を そのまま 中に 入れる
val web = rootDir.resolve("../../lab/tools")
val copyWeb by tasks.registering(Copy::class) {
    into(layout.buildDirectory.dir("web/web"))
    from(web.resolve("shiryou-ita")) { into("shiryou-ita"); exclude("sw.js") }
    from(web.resolve("skin/icons.js")) { into("skin") }
    from(web.resolve("oekaki-kobo/js/rslider.js")) { into("oekaki-kobo/js") }
}
tasks.named("preBuild") { dependsOn(copyWeb) }
