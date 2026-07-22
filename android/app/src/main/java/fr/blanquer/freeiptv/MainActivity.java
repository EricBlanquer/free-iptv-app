package fr.blanquer.freeiptv;

import android.app.Activity;
import android.app.PictureInPictureParams;
import android.app.UiModeManager;
import android.content.Context;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.util.Rational;
import android.view.KeyEvent;
import android.view.OrientationEventListener;
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
    private boolean mIsAndroidTV;
    private boolean mStopped;
    private OrientationEventListener mOrientationListener;
    private boolean mDeviceLandscape = true;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setFormat(PixelFormat.TRANSLUCENT);
        getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        mTizenShimJs = loadAsset("tizen-shim.js");
        mIsAndroidTV = detectAndroidTV();
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.TRANSPARENT);
        mAspectRatioLayout = new AspectRatioFrameLayout(this);
        mSurfaceView = new SurfaceView(this);
        mSurfaceView.setZOrderMediaOverlay(true);
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
        initOrientationListener();
        mWebUpdater = new WebUpdater(this);
        boolean devNoUpdate = new java.io.File(getFilesDir(), "DEV_NO_UPDATE").exists();
        if (devNoUpdate) {
            mWebView.loadUrl("file:///android_asset/index.html");
            return;
        }
        mWebUpdater.rollbackUnhealthyCacheIfNeeded();
        String localWebPath = mWebUpdater.getLocalWebPath();
        if (localWebPath != null) {
            mWebUpdater.markPendingLoad();
            mWebView.loadUrl(localWebPath);
        } else {
            mWebView.loadUrl("file:///android_asset/index.html");
        }
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

    private boolean detectAndroidTV() {
        UiModeManager uiModeManager = (UiModeManager) getSystemService(Context.UI_MODE_SERVICE);
        boolean tvUiMode = uiModeManager != null
            && uiModeManager.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION;
        boolean leanback = getPackageManager().hasSystemFeature(PackageManager.FEATURE_LEANBACK);
        return tvUiMode || leanback;
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
        updateWebViewScale();
        mWebView.setBackgroundColor(Color.TRANSPARENT);
        mWebView.addJavascriptInterface(new AndroidBridge(), "Android");
        mWebView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(android.webkit.WebView view, String url, android.graphics.Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                view.evaluateJavascript("window.__isAndroidTV=" + mIsAndroidTV + ";", null);
                if (mTizenShimJs != null) {
                    view.evaluateJavascript(mTizenShimJs, null);
                }
            }

            @Override
            public void onPageFinished(android.webkit.WebView view, String url) {
                super.onPageFinished(view, url);
                setWebPortraitOverlay(getResources().getConfiguration().orientation == Configuration.ORIENTATION_PORTRAIT);
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

    private void updateWebViewScale() {
        int screenWidth = getResources().getDisplayMetrics().widthPixels;
        float density = getResources().getDisplayMetrics().density;
        int dpWidth = (int) (screenWidth / density);
        int scale = (int) (dpWidth * 100.0f / 1920.0f);
        mWebView.setInitialScale(scale);
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && isInPictureInPictureMode()) {
            return;
        }
        boolean portrait = newConfig.orientation == Configuration.ORIENTATION_PORTRAIT;
        updateWebViewScale();
        applyImmersiveMode();
        setWebPortraitOverlay(portrait);
    }

    private void lockLandscapeForPlayer(boolean lock) {
        runOnUiThread(() -> setRequestedOrientation(lock
                ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                : ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED));
    }

    private void initOrientationListener() {
        mOrientationListener = new OrientationEventListener(this) {
            @Override
            public void onOrientationChanged(int angle) {
                if (angle == ORIENTATION_UNKNOWN) {
                    return;
                }
                boolean portrait = angle > 315 || angle < 45 || (angle > 135 && angle < 225);
                boolean landscape = (angle > 45 && angle < 135) || (angle > 225 && angle < 315);
                if (portrait && mDeviceLandscape) {
                    mDeviceLandscape = false;
                    onDeviceRotatedToPortrait();
                }
                else if (landscape && !mDeviceLandscape) {
                    mDeviceLandscape = true;
                }
            }
        };
        if (mOrientationListener.canDetectOrientation()) {
            mOrientationListener.enable();
        }
    }

    private void onDeviceRotatedToPortrait() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && isInPictureInPictureMode()) {
            return;
        }
        if (mNativePlayer != null && mNativePlayer.isPlaying()) {
            maybeEnterPictureInPicture();
        }
    }

    private void setWebPortraitOverlay(boolean portrait) {
        mWebView.evaluateJavascript(
                "if(window.__setDeviceOrientation)window.__setDeviceOrientation('"
                        + (portrait ? "portrait" : "landscape") + "');", null);
    }

    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        maybeEnterPictureInPicture();
    }

    private void maybeEnterPictureInPicture() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        if (!getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)) {
            return;
        }
        if (mNativePlayer == null || !mNativePlayer.isPlaying()) {
            return;
        }
        try {
            mWebView.evaluateJavascript("window.__inPip=true;", null);
            enterPictureInPictureMode(buildPictureInPictureParams());
        }
        catch (Exception ex) { /* ignore */ }
    }

    @androidx.annotation.RequiresApi(Build.VERSION_CODES.O)
    private PictureInPictureParams buildPictureInPictureParams() {
        Rational ratio = new Rational(16, 9);
        int width = mNativePlayer.getVideoWidth();
        int height = mNativePlayer.getVideoHeight();
        if (width > 0 && height > 0) {
            float aspect = width / (float) height;
            if (aspect >= 0.42f && aspect <= 2.39f) {
                ratio = new Rational(width, height);
            }
        }
        return new PictureInPictureParams.Builder().setAspectRatio(ratio).build();
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        if (isInPictureInPictureMode) {
            mWebView.evaluateJavascript("window.__inPip=true;", null);
            mWebView.setVisibility(View.GONE);
        }
        else {
            mWebView.evaluateJavascript("window.__inPip=false;", null);
            if (mStopped) {
                finishAndRemoveTask();
                return;
            }
            mWebView.setVisibility(View.VISIBLE);
            applyImmersiveMode();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        boolean inPip = Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && isInPictureInPictureMode();
        if (mNativePlayer != null && !inPip) {
            mNativePlayer.pauseIfPlaying();
        }
        mWebView.evaluateJavascript("if(window.app&&window.app.stopTTS)window.app.stopTTS()", null);
        mWebView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        mStopped = false;
        mWebView.onResume();
    }

    @Override
    protected void onStop() {
        super.onStop();
        mStopped = true;
        boolean inPip = Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && isInPictureInPictureMode();
        if (!inPip && mNativePlayer != null && mNativePlayer.isPlaying()) {
            mNativePlayer.pauseIfPlaying();
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (mOrientationListener != null) {
            mOrientationListener.disable();
        }
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

    private class AndroidBridge {
        @JavascriptInterface
        public boolean isInPip() {
            return Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && isInPictureInPictureMode();
        }

        @JavascriptInterface
        public boolean isPlayerActive() {
            return mNativePlayer != null && mNativePlayer.isSessionActive();
        }

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
        public void reloadWebAssets() {
            MainActivity.this.reloadWebAssets();
        }

        @JavascriptInterface
        public void openAuthWebView(String url) {
            if (url == null || url.isEmpty()) return;
            runOnUiThread(() -> {
                try {
                    android.content.Intent intent = new android.content.Intent(MainActivity.this, AuthWebViewActivity.class);
                    intent.putExtra(AuthWebViewActivity.EXTRA_URL, url);
                    startActivity(intent);
                }
                catch (Exception ex) {
                    mWebView.evaluateJavascript(
                        "window.log && window.log('ERROR openAuthWebView: " + ex.getMessage() + "');", null);
                }
            });
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
            runOnUiThread(() -> finishAndRemoveTask());
        }

        @JavascriptInterface
        public float getBrightness() {
            try {
                float current = getWindow().getAttributes().screenBrightness;
                if (current >= 0f) return current;
                int sys = android.provider.Settings.System.getInt(
                    getContentResolver(), android.provider.Settings.System.SCREEN_BRIGHTNESS, 128);
                return sys / 255f;
            }
            catch (Exception ex) {
                return 0.5f;
            }
        }

        @JavascriptInterface
        public void setBrightness(float level) {
            final float value = level < 0f
                ? WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
                : Math.max(0.01f, Math.min(1f, level));
            runOnUiThread(() -> {
                WindowManager.LayoutParams lp = getWindow().getAttributes();
                lp.screenBrightness = value;
                getWindow().setAttributes(lp);
            });
        }

        @JavascriptInterface
        public float getVolume() {
            try {
                android.media.AudioManager am = (android.media.AudioManager) getSystemService(AUDIO_SERVICE);
                if (am == null) return 0.5f;
                int max = am.getStreamMaxVolume(android.media.AudioManager.STREAM_MUSIC);
                if (max <= 0) return 0.5f;
                return am.getStreamVolume(android.media.AudioManager.STREAM_MUSIC) / (float) max;
            }
            catch (Exception ex) {
                return 0.5f;
            }
        }

        @JavascriptInterface
        public void setVolume(float level) {
            try {
                android.media.AudioManager am = (android.media.AudioManager) getSystemService(AUDIO_SERVICE);
                if (am == null) return;
                int max = am.getStreamMaxVolume(android.media.AudioManager.STREAM_MUSIC);
                int target = Math.round(Math.max(0f, Math.min(1f, level)) * max);
                am.setStreamVolume(android.media.AudioManager.STREAM_MUSIC, target, 0);
            }
            catch (Exception ex) { /* ignore */ }
        }

        @JavascriptInterface
        public void playerOpen(String url) {
            mNativePlayer.open(url);
            lockLandscapeForPlayer(true);
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
            lockLandscapeForPlayer(false);
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
