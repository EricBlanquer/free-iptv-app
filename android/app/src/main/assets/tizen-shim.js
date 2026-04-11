(function() {
    if (typeof window.webapis !== 'undefined') return;

    var meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'viewport';
        (document.head || document.documentElement).appendChild(meta);
    }
    meta.content = 'width=1920, initial-scale=1.0, user-scalable=no';

    function addTouchClass() {
        if (document.body) {
            document.body.classList.add('touch');
        } else {
            document.addEventListener('DOMContentLoaded', function() {
                document.body.classList.add('touch');
            });
        }
    }
    addTouchClass();

    var noop = function() {};

    var generateDuid = function() {
        return 'ANDROID-' + Android.getDeviceId();
    };

    var listener = {};
    var prepareSuccessCb = null;
    var prepareErrorCb = null;

    window.__avplay_listener = {
        onbufferingstart: function() { if (listener.onbufferingstart) listener.onbufferingstart(); },
        onbufferingprogress: function(p) { if (listener.onbufferingprogress) listener.onbufferingprogress(p); },
        onbufferingcomplete: function() { if (listener.onbufferingcomplete) listener.onbufferingcomplete(); },
        oncurrentplaytime: function(t) { if (listener.oncurrentplaytime) listener.oncurrentplaytime(t); },
        onerror: function(e) { if (listener.onerror) listener.onerror(e); },
        onsubtitlechange: function(d, t, a, b) { if (listener.onsubtitlechange) listener.onsubtitlechange(d, t, a, b); },
        onstreamcompleted: function() { if (listener.onstreamcompleted) listener.onstreamcompleted(); },
        onevent: function(t, d) { if (listener.onevent) listener.onevent(t, d); },
        ondrmevent: function(e, d) { if (listener.ondrmevent) listener.ondrmevent(e, d); }
    };
    window.__avplay_prepare_success = function() { if (prepareSuccessCb) prepareSuccessCb(); };
    window.__avplay_prepare_error = function(e) { if (prepareErrorCb) prepareErrorCb(e); };

    window.webapis = {
        avplay: {
            open: function(url) {
                Android.playerOpen(url);
                Android.playerSetVisible(true);
                document.body.classList.add('native-player-active');
            },
            close: function() {
                Android.playerClose();
                Android.playerSetVisible(false);
                document.body.classList.remove('native-player-active');
            },
            prepareAsync: function(successCb, errorCb) {
                prepareSuccessCb = successCb || null;
                prepareErrorCb = errorCb || null;
                Android.playerPrepareAsync();
            },
            play: function() { Android.playerPlay(); },
            pause: function() { Android.playerPause(); },
            stop: function() { Android.playerStop(); },
            seekTo: function(ms, successCb, errorCb) {
                Android.playerSeekTo(ms);
                if (successCb) setTimeout(successCb, 0);
            },
            jumpForward: function(ms, successCb, errorCb) {
                var cur = Android.playerGetCurrentTime();
                Android.playerSeekTo(cur + ms);
                if (successCb) setTimeout(successCb, 0);
            },
            jumpBackward: function(ms, successCb, errorCb) {
                var cur = Android.playerGetCurrentTime();
                var target = cur - ms;
                Android.playerSeekTo(target > 0 ? target : 0);
                if (successCb) setTimeout(successCb, 0);
            },
            setSpeed: function(speed) { Android.playerSetSpeed(speed); },
            getState: function() { return Android.playerGetState(); },
            getCurrentTime: function() { return Android.playerGetCurrentTime(); },
            getDuration: function() { return Android.playerGetDuration(); },
            getTotalTrackInfo: function() {
                var json = Android.playerGetTotalTrackInfo();
                try { return JSON.parse(json); }
                catch (e) { return []; }
            },
            getCurrentStreamInfo: function() {
                var json = Android.playerGetCurrentStreamInfo();
                try { return JSON.parse(json); }
                catch (e) { return []; }
            },
            setSelectTrack: function(type, index) { Android.playerSetSelectTrack(type, index); },
            setSilentSubtitle: function(silent) { Android.playerSetSilentSubtitle(silent); },
            setSubtitlePosition: function(ms) { Android.playerSetSubtitlePosition(ms); },
            setListener: function(l) { listener = l || {}; },
            setDisplayMethod: function(method) { Android.playerSetDisplayMethod(method); },
            setDisplayRect: noop,
            setTimeoutForBuffering: noop,
            setStreamingProperty: noop,
            suspend: noop,
            restore: noop,
            setDrm: noop,
            getDrm: function() { return ''; },
            getStreamingProperty: function() { return ''; }
        },
        network: {
            getMac: function() { return ''; },
            getWiFiMac: function() { return ''; }
        },
        productinfo: {
            getDuid: function() { return generateDuid(); }
        },
        ime: {
            setInputMode: noop,
            ImeInputMode: { TEXT: 0 }
        }
    };

    var duid = generateDuid().toLowerCase();
    localStorage.setItem('deviceId', duid);
    localStorage.setItem('__android_duid', duid);


    window.tizen = {
        tvinputdevice: {
            registerKey: noop,
            unregisterKey: noop,
            getSupportedKeys: function() { return []; },
            getKey: function() { return null; }
        },
        application: {
            getCurrentApplication: function() {
                return {
                    exit: function() {
                        if (window.Android && window.Android.exitApp) {
                            window.Android.exitApp();
                        }
                    },
                    appInfo: { id: 'fr.blanquer.freeiptv' }
                };
            }
        },
        systeminfo: {
            getPropertyValue: function(prop, success) {
                if (success) success({});
            }
        }
    };
    // Android-only CSS: hide #html5-video (Android always uses native player) +
    // make container backgrounds transparent when native player is visible.
    document.addEventListener('DOMContentLoaded', function() {
        var style = document.createElement('style');
        style.textContent = '#html5-video { display: none !important; } body.native-player-active, body.native-player-active #player-screen, body.native-player-active #player-container, body.native-player-active #av-player { background: transparent !important; }';
        document.head.appendChild(style);
    });
})();
