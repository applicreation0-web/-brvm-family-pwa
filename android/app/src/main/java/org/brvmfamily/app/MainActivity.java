package org.brvmfamily.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Local-only Android container for the audited BRVM Family JavaScript engine.
 * Only bundled appassets are executed. All private files use Android's system picker.
 * No login, account data, analytics or personal snapshot is bundled with this APK.
 */
public final class MainActivity extends Activity {
    private static final String ORIGIN = "appassets.androidplatform.net";
    private static final String HOME = "https://" + ORIGIN + "/assets/index.html";
    private static final int OPEN_DOCUMENT = 401;
    private static final int CREATE_DOCUMENT = 402;
    private static final long MAX_EXPORT = 128L * 1024 * 1024;

    private WebView webView;
    private android.webkit.ValueCallback<Uri[]> fileChooser;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Object exportGuard = new Object();
    private PendingExport export;

    private static final class PendingExport {
        final File file;
        final String filename;
        final String mime;
        final int size;
        FileOutputStream output;
        int written;
        boolean finished;

        PendingExport(File file, String filename, String mime, int size) throws IOException {
            this.file = file;
            this.filename = filename;
            this.mime = mime;
            this.size = size;
            this.output = new FileOutputStream(file);
        }
    }

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        cleanOldExports();
        webView = new WebView(this);
        webView.setFitsSystemWindows(true);
        WebView.setWebContentsDebuggingEnabled(false);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) settings.setSafeBrowsingEnabled(true);
        webView.addJavascriptInterface(new FileBridge(), "BRVMAndroid");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return localResource(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (isLocal(url)) return false;
                if (request.isForMainFrame()) openExternal(url);
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request,
                                        android.webkit.WebResourceError error) {
                if (request.isForMainFrame()) notifyUser("Fichier local indisponible : vérifiez l'installation.");
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, android.webkit.ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (fileChooser != null) fileChooser.onReceiveValue(null);
                fileChooser = callback;
                Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                picker.addCategory(Intent.CATEGORY_OPENABLE);
                picker.setType("*/*");
                if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE)
                    picker.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try {
                    startActivityForResult(picker, OPEN_DOCUMENT);
                } catch (ActivityNotFoundException err) {
                    fileChooser = null;
                    callback.onReceiveValue(null);
                    notifyUser("Sélecteur de fichiers Android indisponible.");
                }
                return true;
            }
        });

        setContentView(webView);
        webView.loadUrl(HOME);
    }

    private boolean isLocal(Uri uri) {
        return "https".equalsIgnoreCase(uri.getScheme())
            && ORIGIN.equalsIgnoreCase(uri.getHost())
            && (uri.getPath() == null || uri.getPath().startsWith("/assets/"));
    }

    private WebResourceResponse blocked() {
        return new WebResourceResponse("text/plain", "UTF-8", 403, "Blocked",
            new HashMap<String,String>(), new ByteArrayInputStream(new byte[0]));
    }

    private WebResourceResponse localResource(Uri uri) {
        if (!isLocal(uri)) return blocked();
        String encodedPath = uri.getPath();
        String relative = encodedPath == null ? "" : encodedPath.substring("/assets/".length());
        if (relative.isEmpty()) relative = "index.html";
        if (relative.contains("..") || relative.startsWith("/") || relative.contains("\\"))
            return blocked();
        String mime = "application/octet-stream";
        if (relative.endsWith(".html")) mime = "text/html";
        else if (relative.endsWith(".js")) mime = "application/javascript";
        else if (relative.endsWith(".css")) mime = "text/css";
        else if (relative.endsWith(".json")) mime = "application/json";
        else if (relative.endsWith(".webmanifest")) mime = "application/manifest+json";
        else if (relative.endsWith(".png")) mime = "image/png";
        try {
            InputStream data = getAssets().open("web/" + relative);
            Map<String,String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-store");
            headers.put("X-Content-Type-Options", "nosniff");
            return new WebResourceResponse(mime, mime.startsWith("image/") ? null : "UTF-8",
                200, "OK", headers, data);
        } catch (IOException err) {
            return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                new HashMap<String,String>(), new ByteArrayInputStream(new byte[0]));
        }
    }

    private void openExternal(Uri uri) {
        if (!"https".equalsIgnoreCase(uri.getScheme())) return;
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(intent);
        } catch (ActivityNotFoundException err) {
            notifyUser("Aucun navigateur externe disponible.");
        }
    }

    private void notifyUser(String message) {
        mainHandler.post(() -> Toast.makeText(MainActivity.this, message, Toast.LENGTH_LONG).show());
    }

    private void cleanOldExports() {
        File[] files = getCacheDir().listFiles();
        if (files != null) for (File f : files)
            if (f.getName().startsWith("brvm-export-")) f.delete();
    }

    private void abortExport() {
        synchronized (exportGuard) {
            if (export == null) return;
            try { if (export.output != null) export.output.close(); } catch (IOException ignored) {}
            export.file.delete();
            export = null;
        }
    }

    /** The bridge is reachable only from the bundled HTTPS virtual origin. */
    private final class FileBridge {
        @JavascriptInterface
        public boolean beginSave(String filename, String mime, int size) {
            synchronized (exportGuard) {
                if (export != null || size < 0 || size > MAX_EXPORT ||
                    filename == null || filename.length() > 180 || mime == null) return false;
                try {
                    File temp = File.createTempFile("brvm-export-", ".tmp", getCacheDir());
                    export = new PendingExport(temp, filename.replaceAll("[\\\\/\\r\\n]", "_"), mime, size);
                    return true;
                } catch (IOException err) {
                    abortExport();
                    notifyUser("Stockage temporaire insuffisant pour la sauvegarde.");
                    return false;
                }
            }
        }

        @JavascriptInterface
        public boolean appendChunk(String encoded) {
            synchronized (exportGuard) {
                if (export == null || export.finished || encoded == null || encoded.length() > 50000)
                    return false;
                try {
                    byte[] bytes = Base64.decode(encoded, Base64.NO_WRAP);
                    if ((long)export.written + bytes.length > export.size) {
                        abortExport();
                        return false;
                    }
                    export.output.write(bytes);
                    export.written += bytes.length;
                    return true;
                } catch (IllegalArgumentException | IOException err) {
                    abortExport();
                    return false;
                }
            }
        }

        @JavascriptInterface
        public boolean finishSave() {
            synchronized (exportGuard) {
                if (export == null || export.finished || export.written != export.size)
                    return false;
                try { export.output.close(); } catch (IOException err) {
                    abortExport();
                    return false;
                }
                export.output = null;
                export.finished = true;
                mainHandler.post(MainActivity.this::showSavePicker);
                return true;
            }
        }

        @JavascriptInterface
        public void cancelSave() { abortExport(); }
    }

    private void showSavePicker() {
        PendingExport p;
        synchronized (exportGuard) { p = export; }
        if (p == null || !p.finished) return;
        Intent save = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        save.addCategory(Intent.CATEGORY_OPENABLE);
        save.setType(p.mime.isEmpty() ? "application/octet-stream" : p.mime);
        save.putExtra(Intent.EXTRA_TITLE, p.filename);
        try {
            startActivityForResult(save, CREATE_DOCUMENT);
        } catch (ActivityNotFoundException err) {
            abortExport();
            notifyUser("Enregistrement Android indisponible.");
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == OPEN_DOCUMENT) {
            if (fileChooser != null) {
                Uri[] result = resultCode == RESULT_OK
                    ? WebChromeClient.FileChooserParams.parseResult(resultCode, data) : null;
                fileChooser.onReceiveValue(result);
                fileChooser = null;
            }
        } else if (requestCode == CREATE_DOCUMENT) {
            PendingExport pending;
            synchronized (exportGuard) { pending = export; }
            Uri destination = resultCode == RESULT_OK && data != null ? data.getData() : null;
            if (pending == null) return;
            if (destination == null) { abortExport(); return; }
            new Thread(() -> {
                boolean success = false;
                try (InputStream in = new FileInputStream(pending.file);
                     OutputStream out = getContentResolver().openOutputStream(destination, "w")) {
                    if (out == null) throw new IOException("Destination inaccessible");
                    byte[] buffer = new byte[32768];
                    int size;
                    while ((size = in.read(buffer)) != -1) out.write(buffer, 0, size);
                    out.flush();
                    success = true;
                } catch (IOException | SecurityException ignored) {
                    // Never claim a file was saved on a failed Android Storage Access write.
                }
                abortExport();
                notifyUser(success
                    ? "Fichier enregistré. Pour valider le mois, sélectionnez ce ZIP dans BRVM Family."
                    : "Enregistrement échoué. Exportez à nouveau le fichier.");
            }).start();
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        abortExport();
        if (fileChooser != null) { fileChooser.onReceiveValue(null); fileChooser = null; }
        if (webView != null) {
            webView.removeJavascriptInterface("BRVMAndroid");
            webView.destroy();
        }
        super.onDestroy();
    }
}
