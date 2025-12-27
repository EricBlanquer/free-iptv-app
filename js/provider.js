/**
 * Provider API Client
 * @class ProviderAPI
 * @description Client for interacting with IPTV provider servers
 */
class ProviderAPI {
    /**
     * Create an Provider API client
     * @param {string} server - Server URL
     * @param {string} username - Account username
     * @param {string} password - Account password
     */
    constructor(server, username, password, proxyUrl) {
        this.server = server.replace(Regex.trailingSlash, '');
        this.username = username;
        this.password = password;
        this.authData = null;
        this.maxRetries = 3;
        this.retryDelay = 1000;
        this.defaultTimeout = 30000;
        this.longTimeout = 45000;
        // Use configured proxy URL if provided
        this.proxyUrl = proxyUrl || '';
        // Cache for categories and streams (session only)
        this.cache = {
            liveCategories: null,
            vodCategories: null,
            seriesCategories: null,
            liveStreams: {},
            vodStreams: {},
            series: {}
        };
    }

    /**
     * Get URL with optional CORS proxy
     * @param {string} url - Original URL
     * @returns {string} URL with proxy if configured
     */
    getUrl(url) {
        if (this.proxyUrl) {
            var baseUrl = this.proxyUrl.replace(/\/+$/, '');
            return baseUrl + '/?url=' + encodeURIComponent(url) + proxyDuidParam();
        }
        return url;
    }

    /**
     * Fetch with automatic retry on network errors
     * @param {string} url - URL to fetch
     * @param {number} [retries=3] - Number of retry attempts
     * @param {number} [timeout] - Timeout in ms (default: this.defaultTimeout)
     * @returns {Promise<Response>} Fetch response
     */
    async fetchWithRetry(url, retries = this.maxRetries, timeout = this.defaultTimeout) {
        var fetchUrl = this.getUrl(url);
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                window.log('HTTP> ' + fetchUrl + ' (timeout=' + (timeout/1000) + 's)');
                const timeoutPromise = new Promise(function(_, reject) {
                    setTimeout(function() { reject(new Error('Timeout')); }, timeout);
                });
                const response = await Promise.race([fetch(fetchUrl), timeoutPromise]);
                var logMsg = 'HTTP< ' + response.status + ' ' + url;
                if (response.redirected) {
                    logMsg += ' -> ' + response.url;
                }
                window.log(logMsg);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return response;
            }
            catch (error) {
                var errorMsg = error.message === 'Timeout' ? 'Timeout after ' + (timeout/1000) + 's' : error.message;
                window.log('ERROR', 'HTTP ' + errorMsg + ' ' + url);
                if (attempt === retries) {
                    throw error;
                }
                const delay = this.retryDelay * attempt;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    /**
     * Authenticate with the provider server
     * @returns {Promise<Object>} Authentication data including user info
     * @throws {Error} If authentication fails
     */
    async authenticate() {
        const url = `${this.server}/player_api.php?username=${this.username}&password=${this.password}`;
        try {
            const response = await this.fetchWithRetry(url);
            if (!response.ok) throw new Error('Authentication failed');
            this.authData = await response.json();
            if (!this.authData.user_info) throw new Error('Invalid credentials');
            // Calculate server time offset
            if (this.authData.server_info && this.authData.server_info.timestamp_now) {
                var serverTime = this.authData.server_info.timestamp_now;
                var localTime = Math.floor(Date.now() / 1000);
                this.serverTimeOffset = serverTime - localTime;
                window.log('Server time offset: ' + this.serverTimeOffset + 's (server=' + serverTime + ' local=' + localTime + ')');
            }
            else {
                this.serverTimeOffset = 0;
            }
            return this.authData;
        }
        catch (ex) {
            window.log('ERROR Auth: ' + (ex.message || ex));
            throw ex;
        }
    }

    async getAccountInfo() {
        const url = `${this.server}/player_api.php?username=${this.username}&password=${this.password}`;
        try {
            const response = await fetch(url);
            if (!response.ok) return null;
            const data = await response.json();
            return data.user_info || null;
        }
        catch (ex) {
            return null;
        }
    }

    /**
     * Get live TV categories
     * @returns {Promise<Array>} List of live categories
     */
    async getLiveCategories() {
        if (this.cache.liveCategories) {
            window.log('CACHE', 'hit liveCategories');
            return this.cache.liveCategories;
        }
        const url = `${this.server}/player_api.php?username=${this.username}&password=${this.password}&action=get_live_categories`;
        const response = await this.fetchWithRetry(url);
        const data = await response.json();
        this.cache.liveCategories = Array.isArray(data) ? data : [];
        return this.cache.liveCategories;
    }

    /**
     * Get live TV streams
     * @param {string|null} [categoryId=null] - Optional category filter
     * @returns {Promise<Array>} List of live streams
     */
    async getLiveStreams(categoryId = null) {
        const cacheKey = categoryId || '_all';
        if (this.cache.liveStreams[cacheKey]) {
            window.log('CACHE hit liveStreams[' + cacheKey + ']');
            return this.cache.liveStreams[cacheKey];
        }
        // If requesting a category but we have all streams cached, filter from cache
        if (categoryId && this.cache.liveStreams['_all']) {
            window.log('CACHE filter liveStreams[_all] for category ' + categoryId);
            const filtered = this.cache.liveStreams['_all'].filter(s => s.category_id == categoryId);
            this.cache.liveStreams[cacheKey] = filtered;
            return filtered;
        }
        let url = `${this.server}/player_api.php?username=${this.username}&password=${this.password}&action=get_live_streams`;
        if (categoryId) url += `&category_id=${categoryId}`;
        const response = await this.fetchWithRetry(url);
        const data = await response.json();
        this.cache.liveStreams[cacheKey] = Array.isArray(data) ? data : [];
        return this.cache.liveStreams[cacheKey];
    }

    /**
     * Get VOD categories
     * @returns {Promise<Array>} List of VOD categories
     */
    async getVodCategories() {
        if (this.cache.vodCategories) {
            window.log('CACHE', 'hit vodCategories');
            return this.cache.vodCategories;
        }
        const url = `${this.server}/player_api.php?username=${this.username}&password=${this.password}&action=get_vod_categories`;
        const response = await this.fetchWithRetry(url);
        const data = await response.json();
        this.cache.vodCategories = Array.isArray(data) ? data : [];
        return this.cache.vodCategories;
    }

    /**
     * Get VOD streams
     * @param {string|null} [categoryId=null] - Optional category filter
     * @returns {Promise<Array>} List of VOD streams
     */
    async getVodStreams(categoryId = null) {
        const cacheKey = categoryId || '_all';
        if (this.cache.vodStreams[cacheKey]) {
            window.log('CACHE hit vodStreams[' + cacheKey + ']');
            return this.cache.vodStreams[cacheKey];
        }
        // If requesting a category but we have all streams cached, filter from cache
        if (categoryId && this.cache.vodStreams['_all']) {
            window.log('CACHE filter vodStreams[_all] for category ' + categoryId);
            const filtered = this.cache.vodStreams['_all'].filter(s => s.category_id == categoryId);
            this.cache.vodStreams[cacheKey] = filtered;
            return filtered;
        }
        let url = `${this.server}/player_api.php?username=${this.username}&password=${this.password}&action=get_vod_streams`;
        if (categoryId) url += `&category_id=${categoryId}`;
        const response = await this.fetchWithRetry(url, 1, this.longTimeout);
        const data = await response.json();
        this.cache.vodStreams[cacheKey] = Array.isArray(data) ? data : [];
        return this.cache.vodStreams[cacheKey];
    }

    /**
     * Get series categories
     * @returns {Promise<Array>} List of series categories
     */
    async getSeriesCategories() {
        if (this.cache.seriesCategories) {
            window.log('CACHE', 'hit seriesCategories');
            return this.cache.seriesCategories;
        }
        const url = `${this.server}/player_api.php?username=${this.username}&password=${this.password}&action=get_series_categories`;
        const response = await this.fetchWithRetry(url);
        const data = await response.json();
        this.cache.seriesCategories = Array.isArray(data) ? data : [];
        return this.cache.seriesCategories;
    }

    /**
     * Get series list
     * @param {string|null} [categoryId=null] - Optional category filter
     * @returns {Promise<Array>} List of series
     */
    async getSeries(categoryId = null) {
        const cacheKey = categoryId || '_all';
        if (this.cache.series[cacheKey]) {
            window.log('CACHE hit series[' + cacheKey + ']');
            return this.cache.series[cacheKey];
        }
        // If requesting a category but we have all series cached, filter from cache
        if (categoryId && this.cache.series['_all']) {
            window.log('CACHE filter series[_all] for category ' + categoryId);
            const filtered = this.cache.series['_all'].filter(s => s.category_id == categoryId);
            this.cache.series[cacheKey] = filtered;
            return filtered;
        }
        let url = `${this.server}/player_api.php?username=${this.username}&password=${this.password}&action=get_series`;
        if (categoryId) url += `&category_id=${categoryId}`;
        const response = await this.fetchWithRetry(url, 1, this.longTimeout);
        const data = await response.json();
        this.cache.series[cacheKey] = Array.isArray(data) ? data : [];
        return this.cache.series[cacheKey];
    }

    /**
     * Get detailed series information including episodes
     * @param {string} seriesId - Series ID
     * @returns {Promise<Object>} Series details with episodes
     */
    async getSeriesInfo(seriesId) {
        const url = `${this.server}/player_api.php?username=${this.username}&password=${this.password}&action=get_series_info&series_id=${seriesId}`;
        const response = await this.fetchWithRetry(url);
        return response.json();
    }

    /**
     * Get detailed VOD information
     * @param {string} vodId - VOD ID
     * @returns {Promise<Object>} VOD details
     */
    async getVodInfo(vodId) {
        const url = `${this.server}/player_api.php?username=${this.username}&password=${this.password}&action=get_vod_info&vod_id=${vodId}`;
        const response = await this.fetchWithRetry(url);
        return response.json();
    }

    /**
     * Preload all streams into cache (runs in background)
     * @param {Function} onProgress - Callback for progress updates (step, total, name)
     * @returns {Promise<void>}
     */
    async preloadCache(onProgress) {
        window.log('CACHE', 'preload starting...');
        var steps = [
            { name: 'TV', fn: async () => { await this.getLiveCategories(); await this.getLiveStreams(); } },
            { name: 'VOD', fn: async () => { await this.getVodCategories(); await this.getVodStreams(); } },
            { name: 'Series', fn: async () => { await this.getSeriesCategories(); await this.getSeries(); } }
        ];
        var yieldToUI = () => new Promise(resolve => setTimeout(resolve, 50));
        var failed = [];
        for (var i = 0; i < steps.length; i++) {
            if (onProgress) onProgress(i + 1, steps.length, steps[i].name);
            await yieldToUI();
            try {
                await steps[i].fn();
            }
            catch (e) {
                window.log('ERROR', 'CACHE preload ' + steps[i].name + ': ' + (e.message || e));
                failed.push(steps[i].name);
                if (onProgress) onProgress(-1, steps.length, steps[i].name);
            }
            await yieldToUI();
        }
        if (onProgress) onProgress(0, 0, null);
        if (failed.length > 0) {
            window.log('CACHE', 'preload complete with errors: ' + failed.join(', '));
        }
        else {
            window.log('CACHE', 'preload complete');
        }
    }

    /**
     * Filter cache by language to reduce memory usage
     * @param {Function} matchFn - Function(categoryName) returning true if category matches
     */
    filterCacheByLanguage(matchFn) {
        var before = {
            vodCat: this.cache.vodCategories ? this.cache.vodCategories.length : 0,
            vodStreams: this.cache.vodStreams['_all'] ? this.cache.vodStreams['_all'].length : 0,
            seriesCat: this.cache.seriesCategories ? this.cache.seriesCategories.length : 0,
            series: this.cache.series['_all'] ? this.cache.series['_all'].length : 0
        };
        // Filter VOD categories
        if (Array.isArray(this.cache.vodCategories)) {
            this.cache.vodCategories = this.cache.vodCategories.filter(function(c) {
                return matchFn(c.category_name || '');
            });
            var vodCatIds = {};
            this.cache.vodCategories.forEach(function(c) { vodCatIds[c.category_id] = true; });
            // Filter VOD streams
            if (Array.isArray(this.cache.vodStreams['_all'])) {
                this.cache.vodStreams['_all'] = this.cache.vodStreams['_all'].filter(function(s) {
                    return vodCatIds[s.category_id];
                });
            }
        }
        // Filter series categories
        if (Array.isArray(this.cache.seriesCategories)) {
            this.cache.seriesCategories = this.cache.seriesCategories.filter(function(c) {
                return matchFn(c.category_name || '');
            });
            var seriesCatIds = {};
            this.cache.seriesCategories.forEach(function(c) { seriesCatIds[c.category_id] = true; });
            // Filter series
            if (Array.isArray(this.cache.series['_all'])) {
                this.cache.series['_all'] = this.cache.series['_all'].filter(function(s) {
                    return seriesCatIds[s.category_id];
                });
            }
        }
        var after = {
            vodCat: this.cache.vodCategories ? this.cache.vodCategories.length : 0,
            vodStreams: this.cache.vodStreams['_all'] ? this.cache.vodStreams['_all'].length : 0,
            seriesCat: this.cache.seriesCategories ? this.cache.seriesCategories.length : 0,
            series: this.cache.series['_all'] ? this.cache.series['_all'].length : 0
        };
        window.log('CACHE filtered: VOD ' + before.vodCat + '->' + after.vodCat + ' cats, ' + before.vodStreams + '->' + after.vodStreams + ' streams | Series ' + before.seriesCat + '->' + after.seriesCat + ' cats, ' + before.series + '->' + after.series + ' streams');
    }

    /**
     * Clear all cached data
     */
    clearCache() {
        this.cache = {
            liveCategories: null,
            vodCategories: null,
            seriesCategories: null,
            liveStreams: {},
            vodStreams: {},
            series: {}
        };
        window.log('CACHE', 'cleared');
    }

    /**
     * Get EPG (Electronic Program Guide) for a stream
     * @param {string} streamId - Stream ID
     * @returns {Promise<Object>} EPG data
     */
    async getEPG(streamId) {
        const url = `${this.server}/player_api.php?username=${this.username}&password=${this.password}&action=get_simple_data_table&stream_id=${streamId}`;
        const response = await this.fetchWithRetry(url);
        return response.json();
    }

    /**
     * Get short EPG (next N programs) for a stream
     * @param {string} streamId - Stream ID
     * @param {number} limit - Number of programs to fetch (default: 4)
     * @returns {Promise<Object>} Short EPG data
     */
    async getShortEPG(streamId, limit = 4) {
        const url = `${this.server}/player_api.php?username=${this.username}&password=${this.password}&action=get_short_epg&stream_id=${streamId}&limit=${limit}`;
        const response = await this.fetchWithRetry(url);
        return response.json();
    }

    getLiveStreamUrl(streamId, extension = 'ts') {
        return `${this.server}/live/${this.username}/${this.password}/${streamId}.${extension}`;
    }

    /**
     * Get catchup/timeshift URL for watching past programs
     * @param {string} streamId - Stream ID
     * @param {number} start - Start timestamp (Unix seconds)
     * @param {number} duration - Duration in minutes
     * @param {string} extension - File extension (default: ts)
     * @returns {string} Catchup stream URL
     */
    getCatchupUrl(streamId, start, duration, extension = 'ts', format = 0) {
        var end = start + (duration * 60);
        // Convert Unix timestamp to YYYY-MM-DD:HH-MM format for some endpoints
        var startDate = new Date(start * 1000);
        var pad = function(n) { return n < 10 ? '0' + n : n; };
        var startFormatted = startDate.getFullYear() + '-' + pad(startDate.getMonth() + 1) + '-' + pad(startDate.getDate()) + ':' + pad(startDate.getHours()) + '-' + pad(startDate.getMinutes());
        switch (format) {
            case 0: // Format 1: streaming/timeshift.php with date format (most compatible)
                return `${this.server}/streaming/timeshift.php?username=${this.username}&password=${this.password}&stream=${streamId}&start=${startFormatted}&duration=${duration}`;
            case 1: // Format 2: timeshift path with Unix timestamp
                return `${this.server}/timeshift/${this.username}/${this.password}/${duration}/${start}/${streamId}.${extension}`;
            case 2: // Format 3: live with utc params
                return `${this.server}/live/${this.username}/${this.password}/${streamId}.${extension}?utc=${start}&lutc=${end}`;
            case 3: // Format 4: simple path with utc
                return `${this.server}/${this.username}/${this.password}/${streamId}?utc=${start}&lutc=${end}`;
            default:
                return `${this.server}/streaming/timeshift.php?username=${this.username}&password=${this.password}&stream=${streamId}&start=${startFormatted}&duration=${duration}`;
        }
    }

    getVodStreamUrl(streamId, extension = 'mkv') {
        return `${this.server}/movie/${this.username}/${this.password}/${streamId}.${extension}`;
    }

    getSeriesStreamUrl(streamId, extension = 'mkv') {
        return `${this.server}/series/${this.username}/${this.password}/${streamId}.${extension}`;
    }
}

window.ProviderAPI = ProviderAPI;
