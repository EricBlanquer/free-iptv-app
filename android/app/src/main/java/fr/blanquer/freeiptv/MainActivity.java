package fr.blanquer.freeiptv;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.KeyEvent;
import android.graphics.PixelFormat;
import android.graphics.drawable.ColorDrawable;
import android.view.SurfaceView;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.annotation.OptIn;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.LoadControl;
import androidx.media3.exoplayer.upstream.DefaultBandwidthMeter;
import androidx.media3.ui.AspectRatioFrameLayout;

import java.io.BufferedReader;
import java.io.InputStreamReader;

@OptIn(markerClass = UnstableApi.class)
public class MainActivity extends Activity {

    private WebView mWebView;
    private String mTizenShimJs;
    private View mCustomView;
    private WebChromeClient.CustomViewCallback mCustomViewCallback;
    private FrameLayout mFullscreenContainer;
    private AspectRatioFrameLayout mAspectRatioLayout;
    private SurfaceView mSurfaceView;
    private NativePlayer mNativePlayer;
    private WebUpdater mWebUpdater;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setFormat(PixelFormat.TRANSLUCENT);
        getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        mTizenShimJs = loadAsset("tizen-shim.js");
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.TRANSPARENT);
        mAspectRatioLayout = new AspectRatioFrameLayout(this);
        mSurfaceView = new SurfaceView(this);
        FrameLayout.LayoutParams surfaceParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
        surfaceParams.gravity = android.view.Gravity.CENTER;
        mAspectRatioLayout.addView(mSurfaceView, surfaceParams);
        mAspectRatioLayout.setVisibility(View.GONE);
        FrameLayout.LayoutParams aspectParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
        aspectParams.gravity = android.view.Gravity.CENTER;
        root.addView(mAspectRatioLayout, aspectParams);
        mWebView = new WebView(this);
        root.addView(mWebView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        mFullscreenContainer = new FrameLayout(this);
        mFullscreenContainer.setBackgroundColor(Color.BLACK);
        root.addView(mFullscreenContainer, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        mFullscreenContainer.setVisibility(View.GONE);
        setContentView(root);
        initNativePlayer();
        setupWebView();
        applyImmersiveMode();
        mWebUpdater = new WebUpdater(this);
        mWebUpdater.rollbackUnhealthyCacheIfNeeded();
        String localWebPath = mWebUpdater.getLocalWebPath();
        if (localWebPath != null) {
            mWebUpdater.markPendingLoad();
            mWebView.loadUrl(localWebPath);
        } else {
            mWebView.loadUrl("file:///android_asset/index.html");
        }
        mWebUpdater.setApkUpdateListener(remoteVersion -> {
            runOnUiThread(() -> mWebView.evaluateJavascript(
                "if(window.app && window.app.showApkUpdatePrompt) window.app.showApkUpdatePrompt(" + remoteVersion + ");", null));
        });
        mWebUpdater.checkAndUpdate(() -> {
            runOnUiThread(() -> mWebView.evaluateJavascript(
                "if(window.app && window.app.showWebUpdateReady) window.app.showWebUpdateReady();", null));
        });
    }

    public void reloadWebAssets() {
        runOnUiThread(() -> {
            String updatedPath = mWebUpdater.getLocalWebPath();
            if (updatedPath != null) {
                mWebView.clearCache(true);
                mWebView.loadUrl(updatedPath);
            }
        });
    }

    private DefaultBandwidthMeter mBandwidthMeter;

    private void initNativePlayer() {
        android.content.SharedPreferences prefs = getSharedPreferences("buffer_config", MODE_PRIVATE);
        int playSec = prefs.getInt("play", 2);
        int rebufferSec = prefs.getInt("rebuffer", 5);
        int minSec = prefs.getInt("min", 30);
        int maxSec = prefs.getInt("max", 60);
        ExoPlayer player = buildExoPlayer(playSec, rebufferSec, minSec, maxSec);
        mNativePlayer = new NativePlayer();
        mNativePlayer.init(player, mSurfaceView, mAspectRatioLayout);
        mNativePlayer.setBandwidthMeter(mBandwidthMeter);
        int screenW = getResources().getDisplayMetrics().widthPixels;
        int screenH = getResources().getDisplayMetrics().heightPixels;
        float screenRatio = Math.max(screenW, screenH) / (float) Math.min(screenW, screenH);
        mNativePlayer.setScreenAspectRatio(screenRatio);
        mNativePlayer.setJsCallback(js -> runOnUiThread(() -> mWebView.evaluateJavascript(js, null)));
    }

    private ExoPlayer buildExoPlayer(int playSec, int rebufferSec, int minSec, int maxSec) {
        LoadControl loadControl = new DefaultLoadControl.Builder()
            .setBufferDurationsMs(
                Math.max(minSec, 1) * 1000,
                Math.max(maxSec, minSec) * 1000,
                Math.max(playSec, 1) * 1000,
                Math.max(rebufferSec, 1) * 1000)
            .build();
        mBandwidthMeter = new DefaultBandwidthMeter.Builder(this).build();
        return new ExoPlayer.Builder(this)
            .setLoadControl(loadControl)
            .setBandwidthMeter(mBandwidthMeter)
            .build();
    }

    private void rebuildNativePlayerIfNeeded(int playSec, int rebufferSec, int minSec, int maxSec) {
        if (mNativePlayer == null) return;
        try {
            mNativePlayer.release();
        }
        catch (Exception ex) { /* ignore */ }
        ExoPlayer player = buildExoPlayer(playSec, rebufferSec, minSec, maxSec);
        mNativePlayer.init(player, mSurfaceView, mAspectRatioLayout);
        mNativePlayer.setBandwidthMeter(mBandwidthMeter);
        mNativePlayer.setJsCallback(js -> runOnUiThread(() -> mWebView.evaluateJavascript(js, null)));
    }

    private void setupWebView() {
        WebSettings settings = mWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setAllowFileAccess(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(false);
        settings.setUseWideViewPort(true);
        // Scale content to fit screen width: device dp width / 1920 * 100
        int screenWidth = getResources().getDisplayMetrics().widthPixels;
        float density = getResources().getDisplayMetrics().density;
        int dpWidth = (int)(screenWidth / density);
        int scale = (int)(dpWidth * 100.0f / 1920.0f);
        mWebView.setInitialScale(scale);
        mWebView.setBackgroundColor(Color.TRANSPARENT);
        mWebView.addJavascriptInterface(new AndroidBridge(), "Android");
        mWebView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(android.webkit.WebView view, String url, android.graphics.Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                if (mTizenShimJs != null) {
                    view.evaluateJavascript(mTizenShimJs, null);
                }
            }
        });
        mWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public View getVideoLoadingProgressView() {
                return new View(MainActivity.this);
            }

            @Override
            public android.graphics.Bitmap getDefaultVideoPoster() {
                return android.graphics.Bitmap.createBitmap(1, 1, android.graphics.Bitmap.Config.ARGB_8888);
            }

            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (mCustomView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                mCustomView = view;
                mCustomViewCallback = callback;
                mFullscreenContainer.addView(mCustomView, new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                mFullscreenContainer.setVisibility(View.VISIBLE);
                mWebView.setVisibility(View.GONE);
                applyImmersiveMode();
            }

            @Override
            public void onHideCustomView() {
                if (mCustomView == null) {
                    return;
                }
                mFullscreenContainer.removeView(mCustomView);
                mFullscreenContainer.setVisibility(View.GONE);
                mWebView.setVisibility(View.VISIBLE);
                mCustomViewCallback.onCustomViewHidden();
                mCustomView = null;
                mCustomViewCallback = null;
                applyImmersiveMode();
            }
        });
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int tizenKeyCode = mapToTizenKeyCode(event.getKeyCode());
        if (tizenKeyCode != -1) {
            if (event.getAction() == KeyEvent.ACTION_DOWN) {
                injectKeyEvent(tizenKeyCode);
            }
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    private int mapToTizenKeyCode(int androidKeyCode) {
        switch (androidKeyCode) {
            case KeyEvent.KEYCODE_MEDIA_PLAY:
                return 415;
            case KeyEvent.KEYCODE_MEDIA_PAUSE:
                return 19;
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                return 10252;
            case KeyEvent.KEYCODE_MEDIA_STOP:
                return 413;
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
                return 417;
            case KeyEvent.KEYCODE_MEDIA_REWIND:
                return 412;
            case KeyEvent.KEYCODE_CHANNEL_UP:
                return 427;
            case KeyEvent.KEYCODE_CHANNEL_DOWN:
                return 428;
            case KeyEvent.KEYCODE_DPAD_CENTER:
                return 13;
            case KeyEvent.KEYCODE_BACK:
                return 10009;
            default:
                return -1;
        }
    }

    private void injectKeyEvent(int keyCode) {
        String js = "document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:" + keyCode + ",bubbles:true}));";
        mWebView.evaluateJavascript(js, null);
    }

    private void applyImmersiveMode() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            applyImmersiveMode();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (mNativePlayer != null) {
            mNativePlayer.pauseIfPlaying();
        }
        mWebView.evaluateJavascript("if(window.app&&window.app.stopTTS)window.app.stopTTS()", null);
        mWebView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        mWebView.onResume();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (mNativePlayer != null) {
            mNativePlayer.release();
        }
    }

    private String loadAsset(String filename) {
        StringBuilder sb = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(getAssets().open(filename)))) {
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line).append('\n');
            }
        }
        catch (Exception ex) {
            return null;
        }
        return sb.toString();
    }

    private void launchInstaller(java.io.File apkFile) {
        try {
            android.net.Uri apkUri = androidx.core.content.FileProvider.getUriForFile(
                this, getPackageName() + ".fileprovider", apkFile);
            android.content.Intent intent = new android.content.Intent(android.content.Intent.ACTION_VIEW);
            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            intent.addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        }
        catch (Exception ex) {
            mWebView.evaluateJavascript(
                "if(window.app && window.app.onApkDownloadError) window.app.onApkDownloadError('" + ex.getMessage().replace("'", "\\'") + "');", null);
        }
    }

    private class AndroidBridge {
        @JavascriptInterface
        public String getDeviceId() {
            return android.provider.Settings.Secure.getString(getContentResolver(), android.provider.Settings.Secure.ANDROID_ID);
        }

        @JavascriptInterface
        public String getAppVersion() {
            try {
                android.content.pm.PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
                return pi.versionName + " (" + pi.versionCode + ")";
            }
            catch (Exception ex) {
                return "";
            }
        }

        @JavascriptInterface
        public String getWebBuildHash() {
            if (mWebUpdater == null) return "";
            String build = mWebUpdater.getInstalledBuild();
            if (build == null) return "bundled";
            return build.length() > 8 ? build.substring(0, 8) : build;
        }

        @JavascriptInterface
        public void markWebHealthy() {
            if (mWebUpdater != null) mWebUpdater.clearPendingLoad();
        }

        @JavascriptInterface
        public int getRemoteApkVersion() {
            return mWebUpdater == null ? 0 : mWebUpdater.getRemoteApkVersion();
        }

        @JavascriptInterface
        public boolean canInstallPackages() {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                return getPackageManager().canRequestPackageInstalls();
            }
            return true;
        }

        @JavascriptInterface
        public void requestInstallPermission() {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                runOnUiThread(() -> {
                    try {
                        android.content.Intent intent = new android.content.Intent(
                            android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            android.net.Uri.parse("package:" + getPackageName()));
                        intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(intent);
                    }
                    catch (Exception ex) {
                        runOnUiThread(() -> mWebView.evaluateJavascript(
                            "window.log && window.log('ERROR requestInstallPermission: " + ex.getMessage() + "');", null));
                    }
                });
            }
        }

        @JavascriptInterface
        public void reloadWebAssets() {
            MainActivity.this.reloadWebAssets();
        }

        @JavascriptInterface
        public void forceCheckUpdates() {
            if (mWebUpdater == null) return;
            runOnUiThread(() -> mWebView.evaluateJavascript(
                "if(window.app && window.app.onUpdateCheckStarted) window.app.onUpdateCheckStarted();", null));
            mWebUpdater.checkAndUpdate(() -> {
                runOnUiThread(() -> mWebView.evaluateJavascript(
                    "if(window.app && window.app.showWebUpdateReady) window.app.showWebUpdateReady();", null));
            }, true, hasUpdate -> {
                runOnUiThread(() -> mWebView.evaluateJavascript(
                    "if(window.app && window.app.onUpdateCheckFinished) window.app.onUpdateCheckFinished(" + hasUpdate + ");", null));
            });
        }

        @JavascriptInterface
        public void downloadAndInstallApk() {
            if (mWebUpdater == null) return;
            mWebUpdater.downloadApk(new WebUpdater.ApkDownloadListener() {
                @Override
                public void onProgress(int percent) {
                    runOnUiThread(() -> mWebView.evaluateJavascript(
                        "if(window.app && window.app.updateApkDownloadProgress) window.app.updateApkDownloadProgress(" + percent + ");", null));
                }
                @Override
                public void onReady(java.io.File apkFile) {
                    runOnUiThread(() -> {
                        mWebView.evaluateJavascript(
                            "if(window.app && window.app.onApkDownloadReady) window.app.onApkDownloadReady();", null);
                        launchInstaller(apkFile);
                    });
                }
                @Override
                public void onError(String message) {
                    runOnUiThread(() -> mWebView.evaluateJavascript(
                        "if(window.app && window.app.onApkDownloadError) window.app.onApkDownloadError('" + message.replace("'", "\\'") + "');", null));
                }
            });
        }

        @JavascriptInterface
        public long getBandwidth() {
            try {
                if (mNativePlayer != null) return mNativePlayer.getBandwidthBps();
            }
            catch (Exception ex) { /* ignore */ }
            return 0;
        }

        @JavascriptInterface
        public void setBufferConfig(int playSec, int rebufferSec, int minSec, int maxSec) {
            android.content.SharedPreferences prefs = getSharedPreferences("buffer_config", MODE_PRIVATE);
            prefs.edit()
                .putInt("play", playSec)
                .putInt("rebuffer", rebufferSec)
                .putInt("min", minSec)
                .putInt("max", maxSec)
                .apply();
            runOnUiThread(() -> rebuildNativePlayerIfNeeded(playSec, rebufferSec, minSec, maxSec));
        }

        @JavascriptInterface
        public void exitApp() {
            runOnUiThread(() -> moveTaskToBack(true));
        }

        @JavascriptInterface
        public void playerOpen(String url) {
            mNativePlayer.open(url);
        }

        @JavascriptInterface
        public void playerPrepareAsync() {
            mNativePlayer.prepareAsync();
        }

        @JavascriptInterface
        public void playerPlay() {
            mNativePlayer.play();
        }

        @JavascriptInterface
        public void playerPause() {
            mNativePlayer.pause();
        }

        @JavascriptInterface
        public void playerStop() {
            mNativePlayer.stop();
        }

        @JavascriptInterface
        public void playerClose() {
            mNativePlayer.close();
        }

        @JavascriptInterface
        public void playerSeekTo(long positionMs) {
            mNativePlayer.seekTo(positionMs);
        }

        @JavascriptInterface
        public void playerSetSpeed(float speed) {
            mNativePlayer.setSpeed(speed);
        }

        @JavascriptInterface
        public String playerGetState() {
            return mNativePlayer.getState();
        }

        @JavascriptInterface
        public long playerGetCurrentTime() {
            return mNativePlayer.getCurrentTime();
        }

        @JavascriptInterface
        public long playerGetDuration() {
            return mNativePlayer.getDuration();
        }

        @JavascriptInterface
        public String playerGetTotalTrackInfo() {
            return mNativePlayer.getTotalTrackInfo();
        }

        @JavascriptInterface
        public String playerGetCurrentStreamInfo() {
            return mNativePlayer.getCurrentStreamInfo();
        }

        @JavascriptInterface
        public void playerSetSelectTrack(String type, int index) {
            mNativePlayer.setSelectTrack(type, index);
        }

        @JavascriptInterface
        public void playerSetSilentSubtitle(boolean silent) {
            mNativePlayer.setSilentSubtitle(silent);
        }

        @JavascriptInterface
        public void playerSetDisplayMethod(String method) {
            mNativePlayer.setDisplayMethod(method);
        }

        @JavascriptInterface
        public void playerSetSubtitlePosition(long offsetMs) {
            mNativePlayer.setSubtitlePosition(offsetMs);
        }

        @JavascriptInterface
        public void playerSetVisible(boolean visible) {
            runOnUiThread(() -> mAspectRatioLayout.setVisibility(visible ? View.VISIBLE : View.GONE));
        }

        @JavascriptInterface
        public long downloadFile(String url, String filename) {
            try {
                android.app.DownloadManager dm = (android.app.DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                if (dm == null) return -1;
                String safeName = filename == null || filename.isEmpty() ? "download.ts" : filename.replaceAll("[/\\\\]", "_");
                android.app.DownloadManager.Request req = new android.app.DownloadManager.Request(android.net.Uri.parse(url));
                req.setTitle(safeName);
                req.setNotificationVisibility(android.app.DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                req.setDestinationInExternalPublicDir(android.os.Environment.DIRECTORY_MOVIES, safeName);
                req.setAllowedOverMetered(true);
                req.setAllowedOverRoaming(true);
                return dm.enqueue(req);
            }
            catch (Exception ex) {
                runOnUiThread(() -> mWebView.evaluateJavascript(
                    "window.log && window.log('ERROR downloadFile: " + ex.getMessage().replace("'", "\\'") + "');", null));
                return -1;
            }
        }

        @JavascriptInterface
        public String getAndroidDownloadStatus(long id) {
            try {
                android.app.DownloadManager dm = (android.app.DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                if (dm == null) return "{}";
                android.app.DownloadManager.Query q = new android.app.DownloadManager.Query().setFilterById(id);
                android.database.Cursor c = dm.query(q);
                if (c == null || !c.moveToFirst()) {
                    if (c != null) c.close();
                    return "{}";
                }
                int status = c.getInt(c.getColumnIndexOrThrow(android.app.DownloadManager.COLUMN_STATUS));
                long total = c.getLong(c.getColumnIndexOrThrow(android.app.DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                long downloaded = c.getLong(c.getColumnIndexOrThrow(android.app.DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                c.close();
                String label;
                if (status == android.app.DownloadManager.STATUS_SUCCESSFUL) label = "done";
                else if (status == android.app.DownloadManager.STATUS_FAILED) label = "error";
                else if (status == android.app.DownloadManager.STATUS_PAUSED) label = "paused";
                else if (status == android.app.DownloadManager.STATUS_PENDING) label = "queued";
                else label = "downloading";
                return "{\"status\":\"" + label + "\",\"total\":" + total + ",\"downloaded\":" + downloaded + "}";
            }
            catch (Exception ex) {
                return "{}";
            }
        }

        @JavascriptInterface
        public void cancelAndroidDownload(long id) {
            try {
                android.app.DownloadManager dm = (android.app.DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                if (dm != null) dm.remove(id);
            }
            catch (Exception ex) { /* ignore */ }
        }
    }
}
