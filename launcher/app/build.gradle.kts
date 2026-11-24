import java.util.Properties

plugins { id("com.android.application") }
val signing = Properties()
val signingFile = rootProject.file("../android/signing.properties")
if (signingFile.isFile) signingFile.inputStream().use { signing.load(it) }
android {
    namespace = "dev.capnolithyl.mikan.launcher"
    compileSdk = 35
    defaultConfig {
        applicationId = "dev.capnolithyl.mikan.launcher"
        minSdk = 26
        targetSdk = 35
        versionCode = 5
        versionName = "0.5"
    }
    signingConfigs {
        if (signing.isNotEmpty()) create("personal") {
            storeFile = rootProject.file("../android/" + signing.getProperty("storeFile"))
            storePassword = signing.getProperty("storePassword")
            keyAlias = signing.getProperty("keyAlias")
            keyPassword = signing.getProperty("keyPassword")
        }
    }
    buildTypes { getByName("debug") { if (signing.isNotEmpty()) signingConfig = signingConfigs.getByName("personal") } }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    sourceSets.getByName("main").assets.srcDir(layout.buildDirectory.dir("generated/mikanAssets"))
}
val copyMikanAssets by tasks.registering(Sync::class) {
    from(rootProject.file("../public/mikan-backgrounds/reading-nook.webp"))
    from(rootProject.file("../public/mikan-backgrounds/study-nook.webp"))
    from(rootProject.file("../assets/iki/mikan-chat-avatar.webp"))
    into(layout.buildDirectory.dir("generated/mikanAssets"))
}
tasks.named("preBuild") { dependsOn(copyMikanAssets) }
