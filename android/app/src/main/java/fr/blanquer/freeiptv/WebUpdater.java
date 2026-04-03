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
    private static final String PREFS_NAME = "web_updater";
    private static final String KEY_BUILD = "installed_build";

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

    private String remoteSignature;
    private ApkUpdateListener apkUpdateListener;

    public interface ApkUpdateListener {
        void onApkUpdateAvailable(int remoteVersion);
    }

    public void setApkUpdateListener(ApkUpdateListener listener) {
        this.apkUpdateListener = listener;
    }

    public void checkAndUpdate(Runnable onUpdated) {
        new Thread(() -> {
            try {
                JSONObject versionInfo = fetchVersionInfo();
                if (versionInfo == null) return;
                String remoteBuild = versionInfo.optString("build", versionInfo.optString("version"));
                remoteSignature = versionInfo.optString("signature", null);
                int remoteApkVersion = versionInfo.optInt("apkVersion", 0);
                if (remoteApkVersion > 0) {
                    checkApkUpdate(remoteApkVersion);
                }
                String localBuild = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                        .getString(KEY_BUILD, null);
                if (remoteBuild.equals(localBuild)) {
                    Log.d(TAG, "Up to date: " + remoteBuild);
                    return;
                }
                Log.d(TAG, "Update available: " + localBuild + " -> " + remoteBuild);
                if (downloadAndExtract()) {
                    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                            .edit()
                            .putString(KEY_BUILD, remoteBuild)
                            .apply();
                    Log.d(TAG, "Update installed: " + remoteBuild);
                    if (onUpdated != null) onUpdated.run();
                }
            } catch (Exception e) {
                Log.e(TAG, "Update check failed: " + e.getMessage());
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
