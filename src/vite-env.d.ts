/// <reference types="vite/client" />

// Injected by Vite from Android Gradle versionName during each build.
declare const __POCKET_VERSION__: string;

// Compiled browser build identity; compared with the running NAS service.
declare const __MIKAN_NAS_BUILD__: {version:string;commit:string;backendHash:string};
