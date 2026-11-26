package dev.capnolithyl.mikan.pocket;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.text.InputType;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.net.URI;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Locale;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import org.json.JSONObject;

/** A browser shell only. All chat, inference, memory and UI run on Beholder. */
public final class NasActivity extends Activity {
    private static final String PREFS = "pocket_nas_wrapper";
    private static final String SERVER = "server_url";
    private static final int PICK_FILE = 4546;
    private static final int SAVE_JSON = 4547;
    private static final int MAX_EXPORT_BYTES = 8 * 1024 * 1024;
    private static final String EXPORT_BRIDGE = "MikanJsonExport";
    private byte[] pendingExport;
    private boolean exportBridgeInstalled;
    private WebView web;
    private String endpoint;
    private ValueCallback<Uri[]> chooser;
    private boolean errorShowing;

    // No credentials, query strings or fragments in the configured start URL.
    static String normalizeEndpoint(String value) {
        try {
            URI uri = new URI(value.trim());
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null
                || uri.getRawUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null
                || uri.getPort() == 0 || uri.getPort() > 65535) return null;
            return uri.toASCIIString();
        } catch (Exception e) { return null; }
    }

    static boolean sameOrigin(String endpoint, String target) {
        try {
            URI a = new URI(endpoint), b = new URI(target);
            int ap = a.getPort() == -1 ? 443 : a.getPort();
            int bp = b.getPort() == -1 ? 443 : b.getPort();
            return "https".equalsIgnoreCase(b.getScheme()) && b.getRawUserInfo() == null
                && a.getHost() != null && a.getHost().equalsIgnoreCase(b.getHost()) && ap == bp;
        } catch (Exception e) { return false; }
    }

    static String exportOrigin(String value) {
        String normalized = value == null ? null : normalizeEndpoint(value);
        if (normalized == null) return null;
        URI uri = URI.create(normalized);
        return "https://" + uri.getHost().toLowerCase(Locale.ROOT)
            + (uri.getPort() == -1 || uri.getPort() == 443 ? "" : ":" + uri.getPort());
    }

    static boolean validExportFilename(String filename) {
        return filename != null && filename.matches("mikan-nas-(chat|brain)-[A-Za-z0-9_-]{1,100}\\.json");
    }

    // Only the configured HTTPS main frame can request a user-approved JSON save.
    // No credentials, filesystem reads, arbitrary paths, or general JavaScript interface.
    private void installExportBridge() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return;
        if (exportBridgeInstalled) {
            WebViewCompat.removeWebMessageListener(web, EXPORT_BRIDGE);
            exportBridgeInstalled = false;
        }
        String origin = exportOrigin(endpoint);
        if (origin == null) return;
        WebViewCompat.addWebMessageListener(web, EXPORT_BRIDGE, Collections.singleton(origin),
            (view, message, sourceOrigin, isMainFrame, replyProxy) -> {
                if (!isMainFrame || !sameOrigin(endpoint, sourceOrigin.toString()) ||
                    !sameOrigin(endpoint, view.getUrl()) || isFinishing() || isDestroyed()) return;
                try {
                    String data = message.getData();
                    if (data == null || data.length() > MAX_EXPORT_BYTES * 2 + 1024)
                        throw new IllegalArgumentException("Export exceeds limit");
                    JSONObject request = new JSONObject(data);
                    Object rawName = request.opt("filename"), rawText = request.opt("text");
                    if (!(rawName instanceof String) || !(rawText instanceof String) ||
                        !validExportFilename((String) rawName))
                        throw new IllegalArgumentException("Invalid export");
                    if (pendingExport != null) {
                        Toast.makeText(this, "Finish the current save first.", Toast.LENGTH_SHORT).show();
                        return;
                    }
                    byte[] bytes = ((String) rawText).getBytes(StandardCharsets.UTF_8);
                    if (bytes.length == 0 || bytes.length > MAX_EXPORT_BYTES)
                        throw new IllegalArgumentException("Export exceeds limit");
                    Intent picker = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                        .addCategory(Intent.CATEGORY_OPENABLE)
                        .setType("application/json")
                        .putExtra(Intent.EXTRA_TITLE, (String) rawName);
                    pendingExport = bytes;
                    try { startActivityForResult(picker, SAVE_JSON); }
                    catch (Exception e) {
                        pendingExport = null;
                        Toast.makeText(this, "Could not open the document picker.", Toast.LENGTH_LONG).show();
                    }
                } catch (Exception e) {
                    Toast.makeText(this, "Invalid JSON export or file exceeds 8 MB.", Toast.LENGTH_LONG).show();
                }
            });
        exportBridgeInstalled = true;
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        windowSetup();
        endpoint = getSharedPreferences(PREFS, MODE_PRIVATE).getString(SERVER, null);
        if (endpoint != null) endpoint = normalizeEndpoint(endpoint);
        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(Color.rgb(33, 20, 18));
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(33, 20, 18));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true); // User-selected files via Android's document picker.
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setSupportMultipleWindows(true);
        s.setSafeBrowsingEnabled(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        // No JavascriptInterface, injected credentials, or native AI methods.
        installExportBridge();
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                String target = request.getUrl().toString();
                if (sameOrigin(endpoint, target)) return false;
                if (request.hasGesture()) openBrowser(target);
                return true;
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame() && sameOrigin(endpoint, request.getUrl().toString())) showConnectionError();
            }
            @Override public void onReceivedSslError(WebView view, android.webkit.SslErrorHandler handler,
                    android.net.http.SslError error) {
                handler.cancel();
                showConnectionError();
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onCreateWindow(WebView view, boolean dialog, boolean gesture, Message result) {
                if (!gesture) return false;
                // The web app opens source links with window.open(..., "_blank").
                // Route those links to the regular browser, never give them a native bridge.
                WebView popup = new WebView(NasActivity.this);
                popup.getSettings().setAllowFileAccess(false);
                popup.getSettings().setAllowContentAccess(false);
                popup.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
                popup.setWebViewClient(new WebViewClient() {
                    @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                        openBrowser(r.getUrl().toString());
                        v.post(v::destroy);
                        return true;
                    }
                });
                WebView.WebViewTransport transport = (WebView.WebViewTransport) result.obj;
                transport.setWebView(popup);
                result.sendToTarget();
                return true;
            }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                    FileChooserParams params) {
                if (chooser != null) chooser.onReceiveValue(null);
                chooser = callback;
                try { startActivityForResult(params.createIntent(), PICK_FILE); return true; }
                catch (Exception e) { chooser = null; callback.onReceiveValue(null); return true; }
            }
        });
        web.setDownloadListener((url, userAgent, disposition, mime, length) -> {
            if (url.startsWith("blob:")) {
                Toast.makeText(this, "Open Mikan in your browser to download this export.", Toast.LENGTH_LONG).show();
                openBrowser(endpoint);
            } else {
                openBrowser(url);
            }
        });
        frame.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(frame);
        frame.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
            }
            return insets;
        });
        frame.requestApplyInsets();
        if (endpoint == null) chooseEndpoint();
        else if (state == null || web.restoreState(state) == null) web.loadUrl(endpoint);
    }

    private void windowSetup() {
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
    }

    private void chooseEndpoint() {
        EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        input.setHint("https://your-beholder-address.ts.net");
        input.setText(endpoint == null ? "" : endpoint);
        AlertDialog dialog = new AlertDialog.Builder(this)
            .setTitle("Connect to Mikan")
            .setMessage("Enter the same HTTPS URL you use in your browser. Tailscale must be connected. Sign in on the website as usual.")
            .setView(input).setPositiveButton("Open", null)
            .setNegativeButton("Cancel", (d, w) -> { if (endpoint == null) finish(); }).create();
        dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            String target = normalizeEndpoint(input.getText().toString());
            if (target == null) { input.setError("Enter a valid HTTPS URL without credentials or a query."); return; }
            endpoint = target;
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(SERVER, target).apply();
            web.stopLoading();
            installExportBridge();
            web.loadUrl(target);
            dialog.dismiss();
        }));
        dialog.show();
    }

    private void showConnectionError() {
        if (errorShowing || isFinishing() || isDestroyed()) return;
        errorShowing = true;
        AlertDialog dialog = new AlertDialog.Builder(this)
            .setTitle("Cannot reach Mikan")
            .setMessage("Check that Beholder is online and Tailscale is connected. HTTPS certificate errors are never bypassed.")
            .setPositiveButton("Retry", (d, w) -> { if (endpoint != null) web.loadUrl(endpoint); })
            .setNeutralButton("Change URL", (d, w) -> chooseEndpoint())
            .setNegativeButton("Close", null).create();
        dialog.setOnDismissListener(d -> errorShowing = false);
        dialog.show();
    }

    private void openBrowser(String target) {
        if (target == null) return;
        Uri uri = Uri.parse(target);
        if (!"https".equalsIgnoreCase(uri.getScheme()) && !"http".equalsIgnoreCase(uri.getScheme())) return;
        try { startActivity(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE)); }
        catch (Exception e) { Toast.makeText(this, "No browser available.", Toast.LENGTH_SHORT).show(); }
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == SAVE_JSON) {
            byte[] bytes = pendingExport;
            pendingExport = null;
            if (result != RESULT_OK) {
                Toast.makeText(this, "Save cancelled.", Toast.LENGTH_SHORT).show();
                return;
            }
            Uri destination = data == null ? null : data.getData();
            if (bytes == null || destination == null || !"content".equals(destination.getScheme())) {
                Toast.makeText(this, "Export unavailable. Try downloading again.", Toast.LENGTH_LONG).show();
                return;
            }
            new Thread(() -> {
                boolean saved = false;
                try (OutputStream out = getContentResolver().openOutputStream(destination, "wt")) {
                    if (out == null) throw new IllegalStateException("No output stream");
                    out.write(bytes);
                    out.flush();
                    saved = true;
                } catch (Exception ignored) {
                    // Do not log private document content or its destination.
                    saved = false;
                }
                final boolean ok = saved;
                runOnUiThread(() -> Toast.makeText(this, ok ? "JSON saved. Review before sharing." :
                    "Could not save JSON. Try again.", Toast.LENGTH_LONG).show());
            }, "MikanJsonSave").start();
            return;
        }
        if (request == PICK_FILE && chooser != null) {
            ValueCallback<Uri[]> callback = chooser;
            chooser = null;
            callback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
        }
    }
    @Override protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        web.saveState(state);
    }
    @Override public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }
    @Override protected void onPause() { super.onPause(); web.onPause(); }
    @Override protected void onResume() { super.onResume(); web.onResume(); }
    @Override protected void onDestroy() {
        if (chooser != null) { chooser.onReceiveValue(null); chooser = null; }
        pendingExport = null;
        ((FrameLayout) web.getParent()).removeView(web);
        web.destroy();
        super.onDestroy();
    }
}
