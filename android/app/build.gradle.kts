plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "dev.capnolithyl.mikan.pocket"
    compileSdk = 35

    defaultConfig {
        applicationId = "dev.capnolithyl.mikan.pocket"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("com.google.mlkit:genai-prompt:1.0.0-beta5")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
}
