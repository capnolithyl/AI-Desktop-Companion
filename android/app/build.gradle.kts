import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
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
        versionCode = 15
        versionName = "0.4.4"
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

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("com.google.mlkit:genai-prompt:1.0.0-beta5")
    implementation("androidx.webkit:webkit:1.13.0")
    testImplementation("junit:junit:4.13.2")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}
