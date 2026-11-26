import java.util.Properties

plugins {
    id("com.android.application")
}

// A single, private signing identity for all GitHub Actions APKs.
// CI creates android/signing.properties from one encrypted repository secret.
// Neither this file nor the signing key is committed to Git.
val mikanSigning = Properties()
val signingFile = rootProject.file("signing.properties")
if (signingFile.isFile) {
    signingFile.inputStream().use { mikanSigning.load(it) }
}

android {
    namespace = "dev.capnolithyl.mikan.pocket"
    compileSdk = 35

    defaultConfig {
        applicationId = "dev.capnolithyl.mikan.pocket"
        minSdk = 26
        targetSdk = 35
        versionCode = 22
        versionName = "0.5.1"
    }

    signingConfigs {
        if (mikanSigning.isNotEmpty()) {
            create("personal") {
                storeFile = rootProject.file(mikanSigning.getProperty("storeFile"))
                storePassword = mikanSigning.getProperty("storePassword")
                keyAlias = mikanSigning.getProperty("keyAlias")
                keyPassword = mikanSigning.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        getByName("debug") {
            // Without signing.properties local builds use the SDK's default
            // debug key. CI never uploads that temporary-key APK.
            if (mikanSigning.isNotEmpty()) {
                signingConfig = signingConfigs.getByName("personal")
            }
        }
    }

    // Preserve legacy Pocket sources in Git, but exclude them and their bundled UI from the APK.
    sourceSets {
        getByName("main") {
            java.setSrcDirs(listOf("src/wrapper/java"))
            assets.setSrcDirs(emptyList<String>())
        }
        getByName("test") {
            java.setSrcDirs(listOf("src/wrapperTest/java"))
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
    testImplementation("junit:junit:4.13.2")
}
