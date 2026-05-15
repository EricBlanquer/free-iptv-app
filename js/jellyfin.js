/**
 * Jellyfin API Client
 * @class JellyfinAPI
 * @description Client for Jellyfin media server, exposes the same interface as
 *              ProviderAPI so it can be used as a drop-in replacement inside
 *              the existing autoConnect / cache / browse flow.
 */
class JellyfinAPI {
    static redactUrl(url) {
        return url.replace(/api_key=[^&]+/g, 'api_key=***')
                  .replace(/Token="[^"]+"/g, 'Token="***"');
    }

    constructor(server, username, password, userId, accessToken) {
        this.server = (server || '').replace(/\/+$/, '');
        this.username = username || '';
        this.password = password || '';
        this.userId = userId || null;
        this.accessToken = accessToken || null;
        this.authData = null;
        this.maxRetries = 3;
        this.retryDelay = 1000;
        this.defaultTimeout = 30000;
        this.longTimeout = 60000;
        this.cache = {
            liveCategories: null,
            vodCategories: null,
            seriesCategories: null,
            liveStreams: {},
            vodStreams: {},
            series: {}
        };
        this._libraries = { movies: [], tvshows: [], homevideos: [], mixed: [] };
    }

    _deviceId() {
        if (window.app && window.app.settings && window.app.settings.duid) {
            return window.app.settings.duid;
        }
        return 'free-iptv-app';
    }

    _authHeader() {
        var device = this._deviceId();
        var version = window.APP_VERSION || '1.0.0';
        var hdr = 'MediaBrowser Client="Free IPTV", Device="' + device
            + '", DeviceId="' + device + '", Version="' + version + '"';
        if (this.accessToken) {
            hdr += ', Token="' + this.accessToken + '"';
        }
        return hdr;
    }

    async _fetchJellyfinOnce(path, options) {
        options = options || {};
        var url = this.server + path;
        var headers = options.headers || {};
        headers['Authorization'] = this._authHeader();
        if (options.body && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }
        var timeout = options.timeout || this.defaultTimeout;
        window.log('HTTP> ' + JellyfinAPI.redactUrl(url) + ' (timeout=' + (timeout / 1000) + 's)');
        var timeoutPromise = new Promise(function(_, reject) {
            setTimeout(function() { reject(new Error('Timeout')); }, timeout);
        });
        var fetchPromise = fetch(url, {
            method: options.method || 'GET',
            headers: headers,
            body: options.body
        });
        var response = await Promise.race([fetchPromise, timeoutPromise]);
        window.log('HTTP< ' + response.status + ' ' + JellyfinAPI.redactUrl(url));
        if (!response.ok) {
            throw new Error('HTTP ' + response.status);
        }
        if (response.status === 204) return null;
        var text = await response.text();
        if (!text) return null;
        return JSON.parse(text);
    }

    async _reauthAndPersist() {
        await this.authenticate();
        if (window.app && this.playlistId && typeof window.app.getPlaylistById === 'function') {
            var pl = window.app.getPlaylistById(this.playlistId);
            if (pl) {
                pl.jellyfinToken = this.accessToken;
                pl.jellyfinUserId = this.userId;
                if (typeof window.app.saveSettings === 'function') {
                    window.app.saveSettings();
                }
            }
        }
    }

    async fetchJellyfin(path, options) {
        var didReauth = false;
        var timeout = (options && options.timeout) || this.defaultTimeout;
        for (var attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                return await this._fetchJellyfinOnce(path, options);
            }
            catch (error) {
                var msg = error.message || '';
                if (msg === 'HTTP 401' && !didReauth && this.username && this.password) {
                    didReauth = true;
                    window.log('HTTP 401 on Jellyfin — re-authenticating');
                    try {
                        await this._reauthAndPersist();
                        attempt--;
                        continue;
                    }
                    catch (reauthErr) {
                        throw reauthErr;
                    }
                }
                if (msg.indexOf('HTTP 4') === 0) {
                    window.log('ERROR HTTP ' + msg + ' ' + JellyfinAPI.redactUrl(this.server + path));
                    throw error;
                }
                var errorMsg = msg === 'Timeout' ? 'Timeout after ' + (timeout / 1000) + 's' : msg;
                window.log('ERROR HTTP ' + errorMsg + ' ' + JellyfinAPI.redactUrl(this.server + path));
                if (attempt === this.maxRetries) throw error;
                await new Promise(function(resolve) { setTimeout(resolve, this.retryDelay * attempt); }.bind(this));
            }
        }
    }

    async authenticate() {
        var device = this._deviceId();
        var version = window.APP_VERSION || '1.0.0';
        var hdr = 'MediaBrowser Client="Free IPTV", Device="' + device
            + '", DeviceId="' + device + '", Version="' + version + '"';
        var url = this.server + '/Users/AuthenticateByName';
        try {
            window.log('HTTP> ' + url + ' (auth)');
            var response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': hdr },
                body: JSON.stringify({ Username: this.username, Pw: this.password })
            });
            window.log('HTTP< ' + response.status + ' ' + url);
            if (!response.ok) {
                if (response.status === 401) throw new Error('Invalid credentials');
                throw new Error('HTTP ' + response.status);
            }
            var data = await response.json();
            this.accessToken = data.AccessToken;
            this.userId = data.User && data.User.Id;
            this.authData = data;
            window.log('INIT Jellyfin auth OK user=' + (data.User && data.User.Name) + ' userId=' + this.userId);
            return data;
        }
        catch (ex) {
            window.log('ERROR Jellyfin auth: ' + (ex.message || ex));
            throw ex;
        }
    }

    async getAccountInfo() {
        if (!this.authData) return null;
        return {
            username: this.authData.User && this.authData.User.Name,
            userId: this.userId
        };
    }

    async _loadLibraries() {
        var libs = await this.fetchJellyfin('/Library/VirtualFolders');
        this._libraries = { movies: [], tvshows: [], homevideos: [], mixed: [] };
        if (!Array.isArray(libs)) return [];
        for (var i = 0; i < libs.length; i++) {
            var lib = libs[i];
            var ct = lib.CollectionType || 'mixed';
            if (!this._libraries[ct]) this._libraries[ct] = [];
            this._libraries[ct].push(lib);
        }
        return libs;
    }

    _imageUrl(itemId, type, width) {
        type = type || 'Primary';
        width = width || 400;
        return this.server + '/Items/' + itemId + '/Images/' + type
            + '?api_key=' + (this.accessToken || '')
            + '&maxWidth=' + width;
    }

    _streamUrl(itemId, container) {
        var ext = container ? '.' + container : '';
        return this.server + '/Videos/' + itemId + '/stream' + ext
            + '?api_key=' + (this.accessToken || '')
            + '&Static=true&MediaSourceId=' + itemId;
    }

    _mapItemToVod(item, libId) {
        return {
            stream_id: item.Id,
            num: 0,
            name: item.Name,
            stream_icon: this._imageUrl(item.Id, 'Primary'),
            cover: this._imageUrl(item.Id, 'Primary'),
            cover_big: this._imageUrl(item.Id, 'Backdrop', 1280),
            category_id: libId,
            container_extension: item.Container || 'mkv',
            year: item.ProductionYear || 0,
            plot: item.Overview || '',
            rating: item.CommunityRating || 0,
            rating_5based: item.CommunityRating ? (item.CommunityRating / 2) : 0,
            genre: (item.Genres || []).join(', '),
            tmdb: '',
            url: this._streamUrl(item.Id, item.Container),
            _jellyfin: true,
            _jellyfinItem: item
        };
    }

    _mapItemToSeries(item, libId) {
        return {
            series_id: item.Id,
            num: 0,
            name: item.Name,
            cover: this._imageUrl(item.Id, 'Primary'),
            cover_big: this._imageUrl(item.Id, 'Backdrop', 1280),
            category_id: libId,
            plot: item.Overview || '',
            year: item.ProductionYear || 0,
            rating: item.CommunityRating || 0,
            rating_5based: item.CommunityRating ? (item.CommunityRating / 2) : 0,
            genre: (item.Genres || []).join(', '),
            tmdb: '',
            _jellyfin: true,
            _jellyfinItem: item
        };
    }

    async _fetchItems(parentId, includeTypes) {
        var path = '/Users/' + this.userId + '/Items?ParentId=' + encodeURIComponent(parentId)
            + '&IncludeItemTypes=' + includeTypes + '&Recursive=true'
            + '&Fields=Overview,ProductionYear,CommunityRating,Genres,Path,Container,DateCreated'
            + '&ImageTypeLimit=1&EnableImageTypes=Primary,Backdrop'
            + '&SortBy=SortName&SortOrder=Ascending';
        var data = await this.fetchJellyfin(path, { timeout: this.longTimeout });
        return (data && data.Items) || [];
    }

    async getLiveCategories() {
        if (this.cache.liveCategories) return this.cache.liveCategories;
        this.cache.liveCategories = [];
        return [];
    }

    async getLiveStreams(categoryId) {
        var key = categoryId || '_all';
        this.cache.liveStreams[key] = [];
        return [];
    }

    async getVodCategories() {
        if (this.cache.vodCategories) {
            window.log('CACHE hit Jellyfin vodCategories');
            return this.cache.vodCategories;
        }
        await this._loadLibraries();
        var cats = [];
        var allLibs = [].concat(this._libraries.movies || [], this._libraries.homevideos || []);
        for (var i = 0; i < allLibs.length; i++) {
            cats.push({
                category_id: allLibs[i].ItemId,
                category_name: allLibs[i].Name,
                parent_id: 0
            });
        }
        this.cache.vodCategories = cats;
        window.log('INIT Jellyfin vodCategories=' + cats.length);
        return cats;
    }

    async getVodStreams(categoryId) {
        var key = categoryId || '_all';
        if (this.cache.vodStreams[key]) {
            window.log('CACHE hit Jellyfin vodStreams[' + key + ']');
            return this.cache.vodStreams[key];
        }
        if (categoryId && this.cache.vodStreams['_all']) {
            var filtered = this.cache.vodStreams['_all'].filter(function(s) {
                return s.category_id == categoryId;
            });
            this.cache.vodStreams[key] = filtered;
            return filtered;
        }
        if (!categoryId) {
            await this.getVodCategories();
            var cats = this.cache.vodCategories || [];
            var all = [];
            for (var i = 0; i < cats.length; i++) {
                var libId = cats[i].category_id;
                var items = await this._fetchItems(libId, 'Movie,Video');
                for (var j = 0; j < items.length; j++) {
                    all.push(this._mapItemToVod(items[j], libId));
                }
            }
            this.cache.vodStreams['_all'] = all;
            window.log('INIT Jellyfin vodStreams total=' + all.length);
            return all;
        }
        var items2 = await this._fetchItems(categoryId, 'Movie,Video');
        var streams = items2.map(function(it) { return this._mapItemToVod(it, categoryId); }, this);
        this.cache.vodStreams[key] = streams;
        return streams;
    }

    async getSeriesCategories() {
        if (this.cache.seriesCategories) return this.cache.seriesCategories;
        await this._loadLibraries();
        var cats = [];
        var tvLibs = this._libraries.tvshows || [];
        for (var i = 0; i < tvLibs.length; i++) {
            cats.push({
                category_id: tvLibs[i].ItemId,
                category_name: tvLibs[i].Name,
                parent_id: 0
            });
        }
        this.cache.seriesCategories = cats;
        window.log('INIT Jellyfin seriesCategories=' + cats.length);
        return cats;
    }

    async getSeries(categoryId) {
        var key = categoryId || '_all';
        if (this.cache.series[key]) {
            window.log('CACHE hit Jellyfin series[' + key + ']');
            return this.cache.series[key];
        }
        if (categoryId && this.cache.series['_all']) {
            var filtered = this.cache.series['_all'].filter(function(s) {
                return s.category_id == categoryId;
            });
            this.cache.series[key] = filtered;
            return filtered;
        }
        if (!categoryId) {
            await this.getSeriesCategories();
            var cats = this.cache.seriesCategories || [];
            var all = [];
            for (var i = 0; i < cats.length; i++) {
                var libId = cats[i].category_id;
                var items = await this._fetchItems(libId, 'Series');
                for (var j = 0; j < items.length; j++) {
                    all.push(this._mapItemToSeries(items[j], libId));
                }
            }
            this.cache.series['_all'] = all;
            window.log('INIT Jellyfin series total=' + all.length);
            return all;
        }
        var items2 = await this._fetchItems(categoryId, 'Series');
        var seriesArr = items2.map(function(it) { return this._mapItemToSeries(it, categoryId); }, this);
        this.cache.series[key] = seriesArr;
        return seriesArr;
    }

    async getSeriesInfo(seriesId) {
        var seasonsResp = await this.fetchJellyfin('/Shows/' + encodeURIComponent(seriesId) + '/Seasons?userId=' + this.userId);
        var seasons = (seasonsResp && seasonsResp.Items) || [];
        var episodesResp = await this.fetchJellyfin('/Shows/' + encodeURIComponent(seriesId) + '/Episodes?userId=' + this.userId
            + '&Fields=Overview,ProductionYear,Path,Container,RunTimeTicks,DateCreated'
            + '&ImageTypeLimit=1&EnableImageTypes=Primary');
        var allEps = (episodesResp && episodesResp.Items) || [];
        var seriesItem = await this.fetchJellyfin('/Users/' + this.userId + '/Items/' + encodeURIComponent(seriesId)
            + '?Fields=Overview,ProductionYear,CommunityRating,Genres,People');
        var byNumber = {};
        var self = this;
        for (var i = 0; i < allEps.length; i++) {
            var ep = allEps[i];
            var seasonNum = (typeof ep.ParentIndexNumber === 'number') ? ep.ParentIndexNumber : 1;
            var key = String(seasonNum);
            if (!byNumber[key]) byNumber[key] = [];
            byNumber[key].push({
                id: ep.Id,
                title: ep.Name,
                episode_num: ep.IndexNumber,
                container_extension: ep.Container || 'mkv',
                added: ep.DateCreated || '',
                info: {
                    name: ep.Name,
                    plot: ep.Overview || '',
                    season: seasonNum,
                    episode_num: ep.IndexNumber,
                    movie_image: self._imageUrl(ep.Id, 'Primary'),
                    cover_big: self._imageUrl(ep.Id, 'Primary', 1280),
                    year: ep.ProductionYear,
                    duration_secs: Math.floor((ep.RunTimeTicks || 0) / 10000000),
                    rating: 0
                },
                _jellyfin: true,
                _jellyfinItem: ep,
                url: self._streamUrl(ep.Id, ep.Container)
            });
        }
        return {
            info: {
                name: seriesItem ? seriesItem.Name : '',
                cover: seriesItem ? this._imageUrl(seriesItem.Id, 'Primary') : '',
                cover_big: seriesItem ? this._imageUrl(seriesItem.Id, 'Backdrop', 1280) : '',
                plot: (seriesItem && seriesItem.Overview) || '',
                releaseDate: (seriesItem && seriesItem.PremiereDate) || '',
                year: (seriesItem && seriesItem.ProductionYear) || 0,
                rating: (seriesItem && seriesItem.CommunityRating) || 0,
                genre: ((seriesItem && seriesItem.Genres) || []).join(', '),
                cast: ((seriesItem && seriesItem.People) || []).map(function(p) { return p.Name; }).join(', '),
                director: ((seriesItem && seriesItem.People) || [])
                    .filter(function(p) { return p.Type === 'Director'; })
                    .map(function(p) { return p.Name; }).join(', ')
            },
            seasons: seasons.map(function(s) {
                return {
                    season_number: s.IndexNumber,
                    name: s.Name,
                    cover: self._imageUrl(s.Id, 'Primary'),
                    overview: s.Overview || ''
                };
            }),
            episodes: byNumber
        };
    }

    async getVodInfo(vodId) {
        var item = await this.fetchJellyfin('/Users/' + this.userId + '/Items/' + encodeURIComponent(vodId)
            + '?Fields=Overview,ProductionYear,CommunityRating,Genres,People,RunTimeTicks,Container,ProviderIds');
        if (!item) return null;
        var tmdbId = (item.ProviderIds && item.ProviderIds.Tmdb) || '';
        return {
            info: {
                name: item.Name,
                plot: item.Overview || '',
                year: item.ProductionYear || 0,
                rating: item.CommunityRating || 0,
                rating_5based: item.CommunityRating ? (item.CommunityRating / 2) : 0,
                genre: (item.Genres || []).join(', '),
                cast: (item.People || []).map(function(p) { return p.Name; }).join(', '),
                director: ((item.People || []).filter(function(p) { return p.Type === 'Director'; })
                    .map(function(p) { return p.Name; })).join(', '),
                movie_image: this._imageUrl(item.Id, 'Primary'),
                cover_big: this._imageUrl(item.Id, 'Backdrop', 1280),
                duration_secs: Math.floor((item.RunTimeTicks || 0) / 10000000),
                tmdb_id: tmdbId,
                releasedate: item.PremiereDate || ''
            },
            movie_data: {
                stream_id: item.Id,
                name: item.Name,
                container_extension: item.Container || 'mkv'
            }
        };
    }

    async preloadCache(onProgress) {
        window.log('CACHE Jellyfin preload starting');
        var self = this;
        var steps = [
            { name: 'VOD', fn: async function() { await self.getVodCategories(); await self.getVodStreams(); } },
            { name: 'Series', fn: async function() { await self.getSeriesCategories(); await self.getSeries(); } }
        ];
        var yieldToUI = function() { return new Promise(function(r) { setTimeout(r, 50); }); };
        var failed = [];
        for (var i = 0; i < steps.length; i++) {
            if (onProgress) onProgress(i + 1, steps.length, steps[i].name);
            await yieldToUI();
            try {
                await steps[i].fn();
            }
            catch (e) {
                window.log('ERROR CACHE Jellyfin ' + steps[i].name + ': ' + (e.message || e));
                failed.push(steps[i].name);
                if (onProgress) onProgress(-1, steps.length, steps[i].name);
            }
            await yieldToUI();
        }
        if (onProgress) onProgress(0, 0, null);
        if (failed.length > 0) {
            window.log('CACHE Jellyfin preload complete with errors: ' + failed.join(', '));
        }
        else {
            window.log('CACHE Jellyfin preload complete');
        }
    }

    filterCacheByLanguage(matchFn) {
    }
}

window.JellyfinAPI = JellyfinAPI;
