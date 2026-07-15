/**
 * Network Diagnostic
 * Runs a series of tests when a provider fetch times out and produces a
 * structured result identifying the most likely cause, with an optional
 * auto-fix action the user can trigger with one click.
 */
(function() {
    var QUICK_TIMEOUT = 5000;
    var INTERNET_TIMEOUT = 3000;
    var DOH_TIMEOUT = 3000;

    var INTERNET_PROBE_URL = 'https://1.1.1.1/cdn-cgi/trace';
    var DOH_URL = 'https://cloudflare-dns.com/dns-query';

    function fetchWithTimeout(url, options, timeout) {
        var opts = options || {};
        var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        if (ctrl) opts.signal = ctrl.signal;
        var timer = setTimeout(function() { if (ctrl) ctrl.abort(); }, timeout);
        return fetch(url, opts).then(function(r) {
            clearTimeout(timer);
            return r;
        }).catch(function(ex) {
            clearTimeout(timer);
            throw ex;
        });
    }

    function isMixedContent(targetUrl) {
        try {
            var loc = window.location.protocol;
            return loc === 'https:' && targetUrl.indexOf('http://') === 0;
        }
        catch (ex) {
            return false;
        }
    }

    function parseUrl(url) {
        try {
            var u = new URL(url);
            return {
                protocol: u.protocol,
                hostname: u.hostname,
                port: u.port,
                pathname: u.pathname,
                search: u.search,
                origin: u.origin
            };
        }
        catch (ex) {
            return null;
        }
    }

    function swapProtocol(url) {
        if (url.indexOf('http://') === 0) return 'https://' + url.substring(7);
        if (url.indexOf('https://') === 0) return 'http://' + url.substring(8);
        return url;
    }

    function getResourceTiming(url) {
        try {
            if (!window.performance || !window.performance.getEntriesByName) return null;
            var entries = window.performance.getEntriesByName(url);
            if (!entries || entries.length === 0) return null;
            var e = entries[entries.length - 1];
            return {
                dns: Math.round(e.domainLookupEnd - e.domainLookupStart),
                tcp: Math.round(e.connectEnd - e.connectStart),
                ttfb: Math.round(e.responseStart - e.requestStart),
                total: Math.round(e.responseEnd - e.startTime)
            };
        }
        catch (ex) {
            return null;
        }
    }

    function checkInternet() {
        return fetchWithTimeout(INTERNET_PROBE_URL, { cache: 'no-store' }, INTERNET_TIMEOUT)
            .then(function(r) { return { ok: true, status: r.status }; })
            .catch(function(ex) { return { ok: false, error: ex.message || String(ex) }; });
    }

    function isLikelyOffline() {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
        try {
            if (typeof webapis !== 'undefined' && webapis.network && webapis.network.getActiveConnectionType) {
                var type = webapis.network.getActiveConnectionType();
                var DC = webapis.network.NetworkActiveConnectionType
                    ? webapis.network.NetworkActiveConnectionType.DISCONNECTED
                    : 0;
                if (type === DC) return true;
            }
        }
        catch (ex) {}
        return false;
    }

    function checkDoh(hostname) {
        var url = DOH_URL + '?name=' + encodeURIComponent(hostname) + '&type=A';
        return fetchWithTimeout(url, {
            headers: { 'Accept': 'application/dns-json' },
            cache: 'no-store'
        }, DOH_TIMEOUT).then(function(r) {
            if (!r.ok) return { ok: false, error: 'HTTP ' + r.status };
            return r.json();
        }).then(function(data) {
            if (!data || typeof data !== 'object') return { ok: false, error: 'empty' };
            var answers = (data.Answer || []).filter(function(a) { return a.type === 1; });
            if (answers.length === 0) {
                return { ok: false, error: 'no A record' };
            }
            return { ok: true, ips: answers.map(function(a) { return a.data; }) };
        }).catch(function(ex) {
            return { ok: false, error: ex.message || String(ex) };
        });
    }

    function checkReachable(url, timeout) {
        var start = Date.now();
        var fetched = fetchWithTimeout(url, {
            method: 'GET',
            cache: 'no-store',
            mode: 'no-cors'
        }, timeout).then(function(r) {
            var elapsed = Date.now() - start;
            return { ok: elapsed < timeout, elapsed: elapsed, status: r.status, opaque: r.type === 'opaque', timedOut: elapsed >= timeout };
        }).catch(function(ex) {
            return { ok: false, elapsed: Date.now() - start, error: ex.message || String(ex) };
        });
        var timedOut = new Promise(function(resolve) {
            setTimeout(function() { resolve({ ok: false, elapsed: timeout, timedOut: true }); }, timeout);
        });
        return Promise.race([fetched, timedOut]);
    }

    /**
     * Run full network diagnostic.
     * @param {Object} ctx - { url, server, proxyUrl, hasProxy, app }
     * @param {Function} onStep - called with (key, result) for live updates
     * @returns {Promise<Object>} Diagnostic result
     */
    function run(ctx, onStep) {
        var result = {
            steps: [],
            problem: null,
            severity: 'error',
            details: {},
            autoFix: null
        };

        function step(key, data) {
            var entry = { key: key, data: data };
            result.steps.push(entry);
            window.log('DIAG ' + key + ' ' + JSON.stringify(data));
            if (onStep) {
                try { onStep(key, data); }
                catch (ex) {}
            }
        }

        var httpStatusMatch = (ctx.errorType || '').match(/^http_(\d+)$/);
        if (httpStatusMatch) {
            result.details.providerStatus = parseInt(httpStatusMatch[1], 10);
        }

        if (ctx.blockReason) {
            result.details.blockReason = ctx.blockReason;
            if (/account[_ ]?shar/i.test(ctx.blockReason)) {
                result.problem = 'account_sharing';
                result.severity = 'error';
                return Promise.resolve(result);
            }
        }

        if (ctx.errorType === 'invalid_credentials' || ctx.errorType === 'http_401' || ctx.errorType === 'http_403') {
            result.problem = 'invalid_credentials';
            result.autoFix = buildEditPlaylistFix(ctx.app);
            return Promise.resolve(result);
        }

        var parsed = parseUrl(ctx.server || ctx.url);
        if (!parsed) {
            step('parse', { ok: false });
            result.problem = 'invalid_url';
            return Promise.resolve(result);
        }

        result.details.url = ctx.url;
        result.details.hostname = parsed.hostname;

        if (isMixedContent(ctx.server || ctx.url)) {
            step('mixedContent', { blocked: true });
            result.problem = 'mixed_content';
            return Promise.resolve(result);
        }

        var timing = getResourceTiming(ctx.url);
        if (timing) {
            step('timing', timing);
            result.details.timing = timing;
        }

        return checkInternet().then(function(internet) {
            step('internet', internet);
            result.details.internet = internet;
            if (!internet.ok) {
                result.problem = 'no_internet';
                return result;
            }
            return checkDoh(parsed.hostname).then(function(doh) {
                step('doh', doh);
                result.details.doh = doh;
                if (!doh.ok) {
                    result.problem = 'dns_failure';
                    return result;
                }
                var directServer = parsed.origin;
                return checkReachable(directServer + '/', QUICK_TIMEOUT).then(function(direct) {
                    step('directHead', direct);
                    result.details.direct = direct;
                    var swappedServer = swapProtocol(parsed.origin);
                    return checkReachable(swappedServer + '/', QUICK_TIMEOUT).then(function(swapped) {
                        step('swapped', swapped);
                        result.details.swapped = swapped;
                        return decide(ctx, parsed, result);
                    });
                });
            });
        });
    }

    function decide(ctx, parsed, result) {
        var direct = result.details.direct;
        var swapped = result.details.swapped;
        var app = ctx.app;
        var providerStatus = result.details.providerStatus;

        if (direct && direct.ok) {
            if (providerStatus && providerStatus >= 500) {
                result.problem = 'server_error';
                result.severity = 'error';
                return Promise.resolve(result);
            }
            if (providerStatus && providerStatus >= 400) {
                result.problem = 'client_error';
                result.severity = 'error';
                return Promise.resolve(result);
            }
            result.problem = 'endpoint_slow';
            result.severity = 'warning';
            return Promise.resolve(result);
        }

        if (swapped && swapped.ok) {
            var newProtocol = (parsed.protocol === 'http:') ? 'https:' : 'http:';
            result.problem = (parsed.protocol === 'http:') ? 'should_be_https' : 'should_be_http';
            result.autoFix = {
                available: true,
                labelKey: 'diagnostic.fixProtocol',
                apply: function() {
                    if (!app) return false;
                    var pl = app.getActivePlaylist && app.getActivePlaylist();
                    if (!pl || !pl.serverUrl) return false;
                    var oldUrl = pl.serverUrl;
                    var newUrl = pl.serverUrl.replace(/^https?:/, newProtocol);
                    pl.serverUrl = newUrl;
                    var plId = pl.id;
                    var found = false;
                    for (var i = 0; i < app.settings.playlists.length; i++) {
                        if (app.sameId(app.settings.playlists[i].id, plId)) {
                            app.settings.playlists[i].serverUrl = newUrl;
                            found = true;
                        }
                    }
                    window.log('DIAG fixProtocol ' + oldUrl + ' -> ' + newUrl + ' (playlistId=' + plId + ' found=' + found + ')');
                    app.saveSettings();
                    try {
                        var verify = JSON.parse(localStorage.getItem('settings') || '{}');
                        var verifyPls = verify.playlists || [];
                        for (var j = 0; j < verifyPls.length; j++) {
                            if (app.sameId(verifyPls[j].id, plId)) {
                                window.log('DIAG verify localStorage serverUrl=' + verifyPls[j].serverUrl);
                                break;
                            }
                        }
                    }
                    catch (ex) { window.log('ERROR DIAG verify: ' + (ex.message || ex)); }
                    if (app.api) app.api.clearCache();
                    reconnectAndReloadSection(app);
                    return true;
                }
            };
            return Promise.resolve(result);
        }

        result.problem = 'server_unreachable';
        return Promise.resolve(result);
    }

    function buildEditPlaylistFix(app) {
        return {
            available: true,
            labelKey: 'diagnostic.fixEditPlaylist',
            apply: function() {
                if (!app) return false;
                var pl = app.getActivePlaylist && app.getActivePlaylist();
                if (!pl) return false;
                if (app.showPlaylistEdit) {
                    app.showScreen('playlist-edit');
                    app.showPlaylistEdit(pl.id);
                }
                return true;
            }
        };
    }

    function reconnectAndReloadSection(app) {
        var section = app.currentSection;
        if (app.autoConnect) app.autoConnect();
        if (section && app.openSection) {
            setTimeout(function() {
                app.openSection(section);
            }, 300);
        }
    }

    function messageForProblem(problem, details) {
        var t = function(key, fallback, vars) { return I18n.t(key, fallback, vars || {}); };
        switch (problem) {
            case 'no_internet':
                return t('diagnostic.noInternet', 'No internet connection detected.');
            case 'dns_failure':
                return t('diagnostic.dnsFailure', 'DNS resolution failed for {host}. Try setting your DNS to 1.1.1.1 or 8.8.8.8 on your router.', { host: details.hostname || '' });
            case 'mixed_content':
                return t('diagnostic.mixedContent', 'Your provider uses HTTP but the app was loaded over HTTPS; browsers block this. Install the Android APK or ask your provider for an HTTPS URL.');
            case 'should_be_https':
                return t('diagnostic.shouldBeHttps', 'Your provider uses HTTPS, not HTTP. You can fix this automatically.');
            case 'should_be_http':
                return t('diagnostic.shouldBeHttp', 'Your provider uses HTTP, not HTTPS. You can fix this automatically.');
            case 'endpoint_slow':
                return t('diagnostic.endpointSlow', 'The provider is reachable but this specific endpoint timed out. The provider may be overloaded, try again later.');
            case 'invalid_credentials':
                return t('diagnostic.invalidCredentials', 'Your username or password is invalid, or your subscription has expired. Edit the playlist to fix it.');
            case 'server_error':
                return t('diagnostic.serverError', 'The provider server returned an error (HTTP {status}). The server is overloaded or malfunctioning. Try again later.', { status: details.providerStatus || '?' });
            case 'client_error':
                return t('diagnostic.clientError', 'The provider server rejected the request (HTTP {status}). The URL or credentials may be incorrect.', { status: details.providerStatus || '?' });
            case 'account_sharing':
                return t('diagnostic.accountSharing', 'Your provider detected account sharing and temporarily blocked this subscription (too many simultaneous connections or countries). Use a single network route for this provider, or contact your reseller.');
            case 'server_unreachable':
                return t('diagnostic.serverUnreachable', 'The provider server is unreachable. Your ISP may be blocking it, or the server is down. A VPN may help.');
            case 'invalid_url':
                return t('diagnostic.invalidUrl', 'The provider URL is invalid.');
            default:
                return t('diagnostic.unknown', 'Unknown network issue.');
        }
    }

    function buildSummary(result) {
        var summary = document.createElement('div');
        summary.className = 'diag-summary';
        var msg = document.createElement('div');
        msg.className = 'diag-main-message';
        msg.textContent = messageForProblem(result.problem, result.details);
        summary.appendChild(msg);
        var list = document.createElement('div');
        list.className = 'diag-steps';
        var items = [];
        var d = result.details;
        if (d.providerStatus) {
            var statusIcon = d.providerStatus >= 200 && d.providerStatus < 400 ? '✅ ' : '❌ ';
            items.push(statusIcon + I18n.t('diagnostic.stepProvider', 'Provider') + ' HTTP ' + d.providerStatus);
        }
        if (d.blockReason) {
            var blockedSep = (I18n.getLocale && I18n.getLocale() === 'fr') ? ' : ' : ': ';
            items.push('❌ ' + I18n.t('diagnostic.stepBlocked', 'Blocked') + blockedSep + d.blockReason);
        }
        if (d.internet) {
            items.push((d.internet.ok ? '✅ ' : '❌ ') + I18n.t('diagnostic.stepInternet', 'Internet'));
        }
        if (d.doh) {
            items.push((d.doh.ok ? '✅ ' : '❌ ') + I18n.t('diagnostic.stepDns', 'DNS') + (d.doh.ok && d.doh.ips ? ' (' + d.doh.ips[0] + ')' : ''));
        }
        if (d.direct) {
            var directLabel = I18n.t('diagnostic.stepDirect', 'Direct connection') + ' (' + d.direct.elapsed + 'ms';
            if (d.direct.status) directLabel += ', HTTP ' + d.direct.status;
            directLabel += ')';
            items.push((d.direct.ok ? '✅ ' : '❌ ') + directLabel);
        }
        if (d.timing) {
            items.push('⏱ DNS=' + d.timing.dns + 'ms TCP=' + d.timing.tcp + 'ms TTFB=' + d.timing.ttfb + 'ms');
        }
        for (var i = 0; i < items.length; i++) {
            var line = document.createElement('div');
            line.className = 'diag-step';
            line.textContent = items[i];
            list.appendChild(line);
        }
        summary.appendChild(list);
        return summary;
    }

    /**
     * Run diagnostic for the active provider and display the result modal.
     * Called from provider fetchWithRetry when all retries exhaust.
     */
    function runAndShow(app, url, errorType, srcApi, extra) {
        // A diagnostic stays "in progress" until the user closes its modal, then a
        // cooldown follows: a down provider fails many requests in a row, and each
        // one must NOT stack a fresh modal on top of the one already shown.
        if (app._diagnosticInProgress) return Promise.resolve();
        // The attempt that triggered this may no longer be relevant: the user
        // navigated to manage their providers, or switched to another provider
        // while the slow timeout was still pending. Don't pop a stale
        // connection-problem modal on top of where they went.
        if (app.currentScreen === 'settings' || app.currentScreen === 'playlist-edit') {
            return Promise.resolve();
        }
        if (srcApi && app.api && srcApi !== app.api) return Promise.resolve();
        var now = Date.now();
        if (app._diagnosticCooldownUntil && now < app._diagnosticCooldownUntil) return Promise.resolve();
        app._diagnosticInProgress = true;
        var playlist = app.getActivePlaylist && app.getActivePlaylist();
        var target = (playlist && playlist.serverUrl) || (playlist && playlist.url) || url;
        if (!target) {
            app._diagnosticInProgress = false;
            return Promise.resolve();
        }
        var hasProxy = !!(playlist && playlist.serverUrl && app.settings.proxyEnabled && app.settings.proxyUrl);
        var ctx = {
            url: url,
            server: target,
            proxyUrl: app.settings.proxyUrl || '',
            hasProxy: hasProxy,
            app: app,
            errorType: errorType || 'timeout',
            blockReason: (extra && extra.blockReason) || null
        };
        window.log('DIAG start target=' + target + ' hasProxy=' + ctx.hasProxy + ' errorType=' + ctx.errorType);
        // Land the user on the navigable home screen instead of a blank screen
        // with a lone error: keeps Back and menu navigation working so they can
        // reach Settings even when the provider is unreachable.
        if (app.showLoading) app.showLoading(false);
        if (app.showScreen) app.showScreen('home');
        // Set focusArea before updateHomeMenuVisibility so the home re-applies its own
        // focus (highlight in sync with focusIndex); the modal then captures that valid
        // home focus and Back restores there — not onto the now-hidden modal.
        app.focusArea = 'home';
        if (app.updateHomeMenuVisibility) app.updateHomeMenuVisibility();
        var settle = function() {
            app._diagnosticInProgress = false;
            app._diagnosticCooldownUntil = Date.now() + 60000;
        };
        // Open the modal immediately and stream the tests as they run, so the
        // several-second wait for the network probes is visible, not a blank gap.
        var dismissed = false;
        var progress = buildProgressBody();
        app.showConfirmModal('', null, {
            title: I18n.t('diagnostic.title', 'Connection problem'),
            html: progress.container,
            hideYes: true,
            noLabel: I18n.t('diagnostic.close', 'Close'),
            noAction: function() { dismissed = true; settle(); }
        });
        return run(ctx, function(key, data) {
            appendProgressStep(progress, key, data);
        }).then(function(result) {
            window.log('DIAG result problem=' + result.problem);
            if (!dismissed) finalizeModal(app, result, settle);
        }).catch(function(ex) {
            window.log('ERROR', 'DIAG ' + (ex.message || ex));
            settle();
        });
    }

    var PROGRESS_STEP_LABELS = {
        internet: ['diagnostic.stepInternet', 'Internet'],
        doh: ['diagnostic.stepDns', 'DNS'],
        directHead: ['diagnostic.stepDirect', 'Direct connection']
    };

    function buildProgressBody() {
        var container = document.createElement('div');
        var header = document.createElement('div');
        header.className = 'diag-running';
        header.textContent = I18n.t('diagnostic.running', 'Running network diagnostic…');
        container.appendChild(header);
        var list = document.createElement('div');
        list.className = 'diag-steps';
        container.appendChild(list);
        return { container: container, list: list, seen: {} };
    }

    function appendProgressStep(progress, key, data) {
        var label = PROGRESS_STEP_LABELS[key];
        if (!label || progress.seen[key]) return;
        progress.seen[key] = true;
        var line = document.createElement('div');
        line.className = 'diag-step';
        line.textContent = (data && data.ok ? '✅ ' : '❌ ') + I18n.t(label[0], label[1]);
        progress.list.appendChild(line);
    }

    function finalizeModal(app, result, settle) {
        var messageEl = document.getElementById('confirm-modal-message');
        if (messageEl) {
            while (messageEl.firstChild) messageEl.removeChild(messageEl.firstChild);
            messageEl.appendChild(buildSummary(result));
        }
        var hasFix = !!(result.autoFix && result.autoFix.available);
        var yesBtn = document.getElementById('confirm-yes-btn');
        if (hasFix && yesBtn) {
            yesBtn.textContent = I18n.t(result.autoFix.labelKey || 'diagnostic.fix', 'Fix automatically');
            yesBtn.removeAttribute('data-i18n');
            yesBtn.style.display = '';
            app.confirmModalAction_ = function() {
                if (settle) settle();
                if (result.autoFix.apply) result.autoFix.apply();
            };
            app.focusIndex = 1;
            if (app.updateFocus) app.updateFocus();
        }
    }

    window.NetworkDiagnostic = {
        run: run,
        runAndShow: runAndShow,
        checkInternet: checkInternet,
        isLikelyOffline: isLikelyOffline
    };
})();
