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
import androidx.media3.exoplayer.ExoPlayer;
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
        mAspectRatioLayout.addView(mSurfaceView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        mAspectRatioLayout.setVisibility(View.GONE);
        root.addView(mAspectRatioLayout, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
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
        mWebView.loadUrl("file:///android_asset/index.html");
    }

    private void initNativePlayer() {
        ExoPlayer player = new ExoPlayer.Builder(this).build();
        mNativePlayer = new NativePlayer();
        mNativePlayer.init(player, mSurfaceView, mAspectRatioLayout);
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
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
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
        if (event.getAction() != KeyEvent.ACTION_DOWN) {
            return super.dispatchKeyEvent(event);
        }
        int tizenKeyCode = mapToTizenKeyCode(event.getKeyCode());
        if (tizenKeyCode != -1) {
            injectKeyEvent(tizenKeyCode);
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

    private class AndroidBridge {
        @JavascriptInterface
        public String getDeviceId() {
            return android.provider.Settings.Secure.getString(getContentResolver(), android.provider.Settings.Secure.ANDROID_ID);
        }

        @JavascriptInterface
        public void exitApp() {
            runOnUiThread(() -> finishAndRemoveTask());
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
    }
}
