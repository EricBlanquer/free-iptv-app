# WebView JavaScript bridge: methods are invoked reflectively from JS, keep them.
-keepclassmembers class fr.blanquer.freeiptv.MainActivity$AndroidBridge {
    @android.webkit.JavascriptInterface <methods>;
}

# AndroidX Media3 (ExoPlayer) ships its own consumer ProGuard rules via the AAR,
# so no extra keep rules are needed for playback classes.
