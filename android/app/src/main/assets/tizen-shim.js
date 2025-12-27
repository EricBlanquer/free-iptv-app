(function() {
    if (typeof window.webapis !== 'undefined') return;

    var meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'viewport';
        (document.head || document.documentElement).appendChild(meta);
    }
    meta.content = 'width=1920';

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
    var areaSelectors = {
        'modal': '#resume-modal .modal-btn',
        'home': '#playlist-selector .focusable, #home-grid .focusable',
        'continue': '#continue-grid .continue-item',
        'sidebar': '#categories-list .category-item',
        'filters': '#filters-bar .focusable',
        'grid': '#content-grid .grid-item',
        'details': '#details-screen .focusable:not(.hidden)',
        'actor': '#actor-filmography-grid .filmography-item',
        'settings': '#settings-screen .focusable',
        'playlists': '#playlists-screen .focusable',
        'playlist-edit': '#playlist-edit-screen .focusable',
        'confirm-modal': '#confirm-modal .modal-btn'
    };
    document.addEventListener('click', function(e) {
        if (!window.app) return;
        var el = e.target;
        while (el && el !== document.body) {
            if (el.classList.contains('focusable') || el.classList.contains('grid-item') ||
                el.classList.contains('category-item') || el.classList.contains('continue-item') ||
                el.classList.contains('modal-btn') || el.classList.contains('episode-item') ||
                el.classList.contains('season-btn') || el.classList.contains('action-btn') ||
                el.classList.contains('cast-card') || el.classList.contains('filmography-item')) {
                break;
            }
            el = el.parentElement;
        }
        if (!el || el === document.body) {
            if (window.app.currentScreen === 'player') {
                window.app.showPlayerOverlay();
            }
            return;
        }
        for (var area in areaSelectors) {
            var items = document.querySelectorAll(areaSelectors[area]);
            for (var i = 0; i < items.length; i++) {
                if (items[i] === el) {
                    window.app.focusArea = area;
                    window.app.focusIndex = i;
                    window.app.updateFocus();
                    window.app.select();
                    return;
                }
            }
        }
    });
    document.addEventListener('DOMContentLoaded', function() {
        var style = document.createElement('style');
        style.textContent = 'video::-webkit-media-controls { display: none !important; } video::-webkit-media-controls-enclosure { display: none !important; } video::-webkit-media-controls-overlay-play-button { display: none !important; } video { object-fit: contain; background: black !important; } #html5-video { display: none !important; } body.native-player-active, body.native-player-active #player-screen, body.native-player-active #player-container, body.native-player-active #av-player { background: transparent !important; }';
        document.head.appendChild(style);
        var lastScrollTop = -1;
        setInterval(function() {
            if (!window.app || !window.app.currentStreams) return;
            var grid = document.getElementById('content-grid');
            if (!grid) return;
            var spacer = document.getElementById('grid-spacer');
            if (spacer) {
                var viewportBottom = grid.scrollTop + grid.clientHeight;
                if (viewportBottom >= spacer.offsetTop - 300) {
                    window.app.loadMoreItems();
                }
            }
            if (Math.abs(grid.scrollTop - lastScrollTop) > 50) {
                lastScrollTop = grid.scrollTop;
                var items = grid.querySelectorAll('.grid-item');
                var cols = window.app.gridColumns || 5;
                var scrollTop = grid.scrollTop;
                var scrollBottom = scrollTop + grid.clientHeight;
                for (var i = 0; i < items.length; i++) {
                    var item = items[i];
                    if (item.offsetTop + item.offsetHeight < scrollTop - 200) continue;
                    if (item.offsetTop > scrollBottom + 200) break;
                    var imageDiv = item.querySelector('.grid-item-image');
                    if (!imageDiv || imageDiv.dataset.loaded) continue;
                    var url = item.dataset.imageUrl;
                    if (!url) {
                        imageDiv.dataset.loaded = 'none';
                        imageDiv.classList.add('no-image');
                        continue;
                    }
                    (function(div, imgUrl) {
                        div.dataset.loaded = 'loading';
                        var optimized = window.app.optimizeTmdbImageUrl ? window.app.optimizeTmdbImageUrl(imgUrl, 'w300') : imgUrl;
                        var img = new Image();
                        img.onload = function() {
                            div.style.backgroundImage = 'url(' + optimized + ')';
                            div.dataset.loaded = 'true';
                        };
                        img.onerror = function() {
                            div.dataset.loaded = 'none';
                            div.classList.add('no-image');
                        };
                        img.src = optimized;
                    })(imageDiv, url);
                }
            }
        }, 300);
        var progress = document.getElementById('player-progress');
        if (progress) {
            progress.addEventListener('click', function(e) {
                if (!window.app || !window.app.player) return;
                var rect = progress.getBoundingClientRect();
                var percent = (e.clientX - rect.left) / rect.width;
                var duration = window.app.player.duration || Android.playerGetDuration();
                if (duration > 0) {
                    var seekMs = Math.round(percent * duration);
                    window.app.seekTargetPosition = seekMs;
                    window.app.player.seekTo(seekMs);
                    window.app.showPlayerOverlay();
                }
            });
        }
    });
})();
