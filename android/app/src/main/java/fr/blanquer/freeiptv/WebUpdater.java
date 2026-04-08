package fr.blanquer.freeiptv;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public class WebUpdater {
    private static final String TAG = "WebUpdater";
    private static final String BASE_URL = "https://iptv.blanquer.org/android/";
    private static final String VERSION_URL = BASE_URL + "version.json";
    private static final String ZIP_URL = BASE_URL + "web-assets.zip";
    private static final String APK_URL = "https://iptv.blanquer.org/app.apk";
    private static final String PREFS_NAME = "web_updater";
    private static final String KEY_BUILD = "installed_build";
    private static final String KEY_LAST_CHECK = "last_check_time";
    private static final String KEY_PENDING_LOAD = "pending_load";
    private static final String KEY_BLACKLISTED_BUILD = "blacklisted_build";
    // TODO: restore to 24h after testing phase
    private static final long CHECK_THROTTLE_MS = 0L;

    private final Context context;
    private final File webDir;

    private static final String KEY_APK_VERSION = "apk_version_code";

    public WebUpdater(Context context) {
        this.context = context;
        this.webDir = new File(context.getFilesDir(), "web");
        clearWebAssetsOnApkUpdate();
    }

    private void clearWebAssetsOnApkUpdate() {
        try {
            int currentApk = context.getPackageManager()
                    .getPackageInfo(context.getPackageName(), 0).versionCode;
            int savedApk = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .getInt(KEY_APK_VERSION, 0);
            if (savedApk != 0 && currentApk != savedApk) {
                Log.d(TAG, "APK updated " + savedApk + " -> " + currentApk + ", clearing web assets");
                deleteDir(webDir);
                context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                        .edit().remove(KEY_BUILD).apply();
            }
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .edit().putInt(KEY_APK_VERSION, currentApk).apply();
        } catch (Exception e) {
            Log.e(TAG, "clearWebAssetsOnApkUpdate: " + e.getMessage());
        }
    }

    public String getLocalWebPath() {
        File index = new File(webDir, "index.html");
        if (index.exists()) {
            return "file://" + webDir.getAbsolutePath() + "/index.html";
        }
        return null;
    }

    public String getInstalledBuild() {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getString(KEY_BUILD, null);
    }

    public void markPendingLoad() {
        String build = getInstalledBuild();
        if (build == null) return;
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit().putString(KEY_PENDING_LOAD, build).apply();
        Log.d(TAG, "markPendingLoad: " + build);
    }

    public void clearPendingLoad() {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit().remove(KEY_PENDING_LOAD).apply();
        Log.d(TAG, "clearPendingLoad");
    }

    public boolean rollbackUnhealthyCacheIfNeeded() {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String pending = prefs.getString(KEY_PENDING_LOAD, null);
        String installed = prefs.getString(KEY_BUILD, null);
        if (pending == null || installed == null) return false;
        if (!pending.equals(installed)) {
            prefs.edit().remove(KEY_PENDING_LOAD).apply();
            return false;
        }
        Log.w(TAG, "Cached web build " + installed + " never reached healthy state, rolling back to bundled");
        deleteDir(webDir);
        prefs.edit()
                .remove(KEY_BUILD)
                .remove(KEY_PENDING_LOAD)
                .remove(KEY_LAST_CHECK)
                .putString(KEY_BLACKLISTED_BUILD, installed)
                .apply();
        return true;
    }

    private boolean isBlacklisted(String build) {
        if (build == null) return false;
        String blacklisted = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getString(KEY_BLACKLISTED_BUILD, null);
        return blacklisted != null && blacklisted.equals(build);
    }

    private String remoteSignature;
    private String remoteApkSignature;
    private int remoteApkVersionCode;
    private ApkUpdateListener apkUpdateListener;

    public int getRemoteApkVersion() { return remoteApkVersionCode; }

    public interface ApkDownloadListener {
        void onProgress(int percent);
        void onReady(File apkFile);
        void onError(String message);
    }

    public void downloadApk(ApkDownloadListener listener) {
        new Thread(() -> {
            HttpURLConnection conn = null;
            File updatesDir = new File(context.getFilesDir(), "updates");
            if (!updatesDir.exists()) updatesDir.mkdirs();
            File apkFile = new File(updatesDir, "update.apk");
            try {
                conn = (HttpURLConnection) new URL(APK_URL).openConnection();
                conn.setConnectTimeout(10000);
                conn.setReadTimeout(60000);
                if (conn.getResponseCode() != 200) {
                    if (listener != null) listener.onError("HTTP " + conn.getResponseCode());
                    return;
                }
                int total = conn.getContentLength();
                int downloaded = 0;
                int lastPercent = -1;
                try (InputStream in = new BufferedInputStream(conn.getInputStream());
                     OutputStream out = new FileOutputStream(apkFile)) {
                    byte[] buffer = new byte[16384];
                    int count;
                    while ((count = in.read(buffer)) != -1) {
                        out.write(buffer, 0, count);
                        downloaded += count;
                        if (total > 0 && listener != null) {
                            int percent = (int) ((downloaded * 100L) / total);
                            if (percent != lastPercent) {
                                lastPercent = percent;
                                listener.onProgress(percent);
                            }
                        }
                    }
                }
                if (!verifyApkSignature(apkFile)) {
                    Log.e(TAG, "APK signature verification FAILED");
                    apkFile.delete();
                    if (listener != null) listener.onError("signature");
                    return;
                }
                Log.d(TAG, "APK downloaded and verified: " + apkFile.getAbsolutePath());
                if (listener != null) listener.onReady(apkFile);
            } catch (Exception e) {
                Log.e(TAG, "downloadApk: " + e.getMessage());
                apkFile.delete();
                if (listener != null) listener.onError(e.getMessage() == null ? "unknown" : e.getMessage());
            } finally {
                if (conn != null) conn.disconnect();
            }
        }).start();
    }

    private boolean verifyApkSignature(File apkFile) {
        if (remoteApkSignature == null || remoteApkSignature.isEmpty()) {
            Log.w(TAG, "No APK signature in version.json");
            return false;
        }
        try {
            InputStream keyStream = context.getAssets().open("signing-key-public.pem");
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            byte[] buf = new byte[1024];
            int len;
            while ((len = keyStream.read(buf)) != -1) baos.write(buf, 0, len);
            keyStream.close();
            String pemKey = baos.toString("UTF-8")
                    .replace("-----BEGIN PUBLIC KEY-----", "")
                    .replace("-----END PUBLIC KEY-----", "")
                    .replaceAll("\\s", "");
            byte[] keyBytes = android.util.Base64.decode(pemKey, android.util.Base64.DEFAULT);
            PublicKey publicKey = KeyFactory.getInstance("RSA")
                    .generatePublic(new X509EncodedKeySpec(keyBytes));
            Signature sig = Signature.getInstance("SHA256withRSA");
            sig.initVerify(publicKey);
            FileInputStream fis = new FileInputStream(apkFile);
            byte[] buffer = new byte[8192];
            int count;
            while ((count = fis.read(buffer)) != -1) {
                sig.update(buffer, 0, count);
            }
            fis.close();
            byte[] signatureBytes = android.util.Base64.decode(remoteApkSignature, android.util.Base64.DEFAULT);
            return sig.verify(signatureBytes);
        } catch (Exception e) {
            Log.e(TAG, "verifyApkSignature: " + e.getMessage());
            return false;
        }
    }

    public interface ApkUpdateListener {
        void onApkUpdateAvailable(int remoteVersion);
    }

    public void setApkUpdateListener(ApkUpdateListener listener) {
        this.apkUpdateListener = listener;
    }

    public interface CheckCompleteListener {
        void onComplete(boolean hasUpdate);
    }

    public void checkAndUpdate(Runnable onUpdated) {
        checkAndUpdate(onUpdated, false, null);
    }

    public void checkAndUpdate(Runnable onUpdated, boolean force, CheckCompleteListener onComplete) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        if (!force) {
            long lastCheck = prefs.getLong(KEY_LAST_CHECK, 0);
            long now = System.currentTimeMillis();
            if (now - lastCheck < CHECK_THROTTLE_MS) {
                Log.d(TAG, "Skipping check, last was " + ((now - lastCheck) / 60000) + " min ago");
                if (onComplete != null) onComplete.onComplete(false);
                return;
            }
        }
        new Thread(() -> {
            boolean hasUpdate = false;
            try {
                context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                        .edit().putLong(KEY_LAST_CHECK, System.currentTimeMillis()).apply();
                JSONObject versionInfo = fetchVersionInfo();
                if (versionInfo == null) {
                    if (onComplete != null) onComplete.onComplete(false);
                    return;
                }
                String remoteBuild = versionInfo.optString("build", versionInfo.optString("version"));
                remoteSignature = versionInfo.optString("signature", null);
                remoteApkSignature = versionInfo.optString("apkSignature", null);
                int remoteApkVersion = versionInfo.optInt("apkVersion", 0);
                remoteApkVersionCode = remoteApkVersion;
                if (remoteApkVersion > 0) {
                    try {
                        int localApkVersion = context.getPackageManager()
                                .getPackageInfo(context.getPackageName(), 0).versionCode;
                        if (remoteApkVersion > localApkVersion) {
                            hasUpdate = true;
                        }
                    }
                    catch (Exception ex) {}
                    checkApkUpdate(remoteApkVersion);
                }
                String localBuild = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                        .getString(KEY_BUILD, null);
                boolean webUpdateAvailable = !remoteBuild.equals(localBuild);
                if (!webUpdateAvailable) {
                    Log.d(TAG, "Up to date: " + remoteBuild);
                    return;
                }
                if (isBlacklisted(remoteBuild)) {
                    Log.w(TAG, "Refusing to install blacklisted build: " + remoteBuild);
                    return;
                }
                hasUpdate = true;
                Log.d(TAG, "Update available: " + localBuild + " -> " + remoteBuild);
                if (downloadAndExtract()) {
                    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                            .edit()
                            .putString(KEY_BUILD, remoteBuild)
                            .remove(KEY_BLACKLISTED_BUILD)
                            .apply();
                    Log.d(TAG, "Update installed: " + remoteBuild);
                    if (onUpdated != null) onUpdated.run();
                }
            } catch (Exception e) {
                Log.e(TAG, "Update check failed: " + e.getMessage());
            } finally {
                if (onComplete != null) onComplete.onComplete(hasUpdate);
            }
        }).start();
    }

    private JSONObject fetchVersionInfo() {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(VERSION_URL).openConnection();
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);
            if (conn.getResponseCode() != 200) return null;
            InputStream is = conn.getInputStream();
            byte[] buf = new byte[4096];
            int len = is.read(buf);
            is.close();
            return new JSONObject(new String(buf, 0, len));
        } catch (Exception e) {
            Log.e(TAG, "fetchVersionInfo: " + e.getMessage());
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private boolean downloadAndExtract() {
        HttpURLConnection conn = null;
        File tempZip = new File(context.getCacheDir(), "web-assets.zip");
        try {
            conn = (HttpURLConnection) new URL(ZIP_URL).openConnection();
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(30000);
            if (conn.getResponseCode() != 200) return false;
            try (InputStream in = new BufferedInputStream(conn.getInputStream());
                 OutputStream out = new FileOutputStream(tempZip)) {
                byte[] buffer = new byte[8192];
                int count;
                while ((count = in.read(buffer)) != -1) {
                    out.write(buffer, 0, count);
                }
            }
            if (!verifySignature(tempZip)) {
                Log.e(TAG, "Signature verification FAILED - rejecting update");
                tempZip.delete();
                return false;
            }
            Log.d(TAG, "Signature verified OK");
            File tempDir = new File(webDir.getAbsolutePath() + "_tmp");
            deleteDir(tempDir);
            tempDir.mkdirs();
            try (ZipInputStream zis = new ZipInputStream(new BufferedInputStream(new FileInputStream(tempZip)))) {
                ZipEntry entry;
                byte[] buffer = new byte[8192];
                while ((entry = zis.getNextEntry()) != null) {
                    if (entry.isDirectory()) {
                        new File(tempDir, entry.getName()).mkdirs();
                        continue;
                    }
                    File outFile = new File(tempDir, entry.getName());
                    outFile.getParentFile().mkdirs();
                    try (OutputStream out = new FileOutputStream(outFile)) {
                        int count;
                        while ((count = zis.read(buffer)) != -1) {
                            out.write(buffer, 0, count);
                        }
                    }
                }
            }
            tempZip.delete();
            File index = new File(tempDir, "index.html");
            if (!index.exists()) {
                Log.e(TAG, "Invalid zip: no index.html");
                deleteDir(tempDir);
                return false;
            }
            deleteDir(webDir);
            tempDir.renameTo(webDir);
            Log.d(TAG, "Extracted to " + webDir.getAbsolutePath());
            return true;
        } catch (Exception e) {
            Log.e(TAG, "downloadAndExtract: " + e.getMessage());
            tempZip.delete();
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private boolean verifySignature(File zipFile) {
        if (remoteSignature == null || remoteSignature.isEmpty()) {
            Log.w(TAG, "No signature in version.json");
            return false;
        }
        try {
            InputStream keyStream = context.getAssets().open("signing-key-public.pem");
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            byte[] buf = new byte[1024];
            int len;
            while ((len = keyStream.read(buf)) != -1) baos.write(buf, 0, len);
            keyStream.close();
            String pemKey = baos.toString("UTF-8")
                    .replace("-----BEGIN PUBLIC KEY-----", "")
                    .replace("-----END PUBLIC KEY-----", "")
                    .replaceAll("\\s", "");
            byte[] keyBytes = android.util.Base64.decode(pemKey, android.util.Base64.DEFAULT);
            PublicKey publicKey = KeyFactory.getInstance("RSA")
                    .generatePublic(new X509EncodedKeySpec(keyBytes));
            Signature sig = Signature.getInstance("SHA256withRSA");
            sig.initVerify(publicKey);
            FileInputStream fis = new FileInputStream(zipFile);
            byte[] buffer = new byte[8192];
            int count;
            while ((count = fis.read(buffer)) != -1) {
                sig.update(buffer, 0, count);
            }
            fis.close();
            byte[] signatureBytes = android.util.Base64.decode(remoteSignature, android.util.Base64.DEFAULT);
            return sig.verify(signatureBytes);
        } catch (Exception e) {
            Log.e(TAG, "verifySignature: " + e.getMessage());
            return false;
        }
    }

    private void checkApkUpdate(int remoteApkVersion) {
        try {
            int localVersion = context.getPackageManager()
                    .getPackageInfo(context.getPackageName(), 0).versionCode;
            if (remoteApkVersion > localVersion) {
                Log.d(TAG, "APK update available: " + localVersion + " -> " + remoteApkVersion);
                if (apkUpdateListener != null) {
                    apkUpdateListener.onApkUpdateAvailable(remoteApkVersion);
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "checkApkUpdate: " + e.getMessage());
        }
    }

    private void deleteDir(File dir) {
        if (dir == null || !dir.exists()) return;
        File[] files = dir.listFiles();
        if (files != null) {
            for (File f : files) {
                if (f.isDirectory()) deleteDir(f);
                else f.delete();
            }
        }
        dir.delete();
    }
}
