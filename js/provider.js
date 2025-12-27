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
    constructor(server, username, password) {
        this.server = server.replace(Regex.trailingSlash, '');
        this.username = username;
        this.password = password;
        this.authData = null;
        this.maxRetries = 3;
        this.retryDelay = 1000;
        // Use CORS proxy for simulator testing (remove for real TV)
        this.useProxy = typeof tizen === 'undefined';
        this.corsProxy = 'https://api.allorigins.win/raw?url=';
    }

    /**
     * Get URL with optional CORS proxy for development
     * @param {string} url - Original URL
     * @returns {string} URL with proxy if needed
     */
    getUrl(url) {
        return this.useProxy ? this.corsProxy + encodeURIComponent(url) : url;
    }

    /**
     * Fetch with automatic retry on network errors
     * @param {string} url - URL to fetch
     * @param {number} [retries=3] - Number of retry attempts
     * @returns {Promise<Response>} Fetch response
     */
    async fetchWithRetry(url, retries = this.maxRetries) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const response = await fetch(this.getUrl(url));
                if (!response.ok && attempt < retries) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return response;
            }
            catch (error) {
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
            return this.authData;
        }
        catch (error) {
            window.log('Auth error:', error);
            throw error;
        }
    }

    /**
     * Get live TV categories
     * @returns {Promise<Array>} List of live categories
     */
    async getLiveCategories() {
        const url = `${this.server}/player_api.php?username=${this.username}&password=${this.password}&action=get_live_categories`;
        const response = await this.fetchWithRetry(url);
        return response.json();
    }

    /**
     * Get live TV streams
     * @param {string|null} [categoryId=null] - Optional category filter
     * @returns {Promise<Array>} List of live streams
     */
    async getLiveStreams(categoryId = null) {
        let url = `${this.server}/player_api.php?username=${this.username}&password=${this.password}&action=get_live_streams`;
        if (categoryId) url += `&category_id=${categoryId}`;
        const response = await this.fetchWithRetry(url);
        return response.json();
    }

    /**
     * Get VOD categories
     * @returns {Promise<Array>} List of VOD categories
     */
    async getVodCategories() {
        const url = `${this.server}/player_api.php?username=${this.username}&password=${this.password}&action=get_vod_categories`;
        const response = await this.fetchWithRetry(url);
        return response.json();
    }

    /**
     * Get VOD streams
     * @param {string|null} [categoryId=null] - Optional category filter
     * @returns {Promise<Array>} List of VOD streams
     */
    async getVodStreams(categoryId = null) {
        let url = `${this.server}/player_api.php?username=${this.username}&password=${this.password}&action=get_vod_streams`;
        if (categoryId) url += `&category_id=${categoryId}`;
        const response = await this.fetchWithRetry(url);
        return response.json();
    }

    /**
     * Get series categories
     * @returns {Promise<Array>} List of series categories
     */
    async getSeriesCategories() {
        const url = `${this.server}/player_api.php?username=${this.username}&password=${this.password}&action=get_series_categories`;
        const response = await this.fetchWithRetry(url);
        return response.json();
    }

    /**
     * Get series list
     * @param {string|null} [categoryId=null] - Optional category filter
     * @returns {Promise<Array>} List of series
     */
    async getSeries(categoryId = null) {
        let url = `${this.server}/player_api.php?username=${this.username}&password=${this.password}&action=get_series`;
        if (categoryId) url += `&category_id=${categoryId}`;
        const response = await this.fetchWithRetry(url);
        return response.json();
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
     * Get EPG (Electronic Program Guide) for a stream
     * @param {string} streamId - Stream ID
     * @returns {Promise<Object>} EPG data
     */
    async getEPG(streamId) {
        const url = `${this.server}/player_api.php?username=${this.username}&password=${this.password}&action=get_simple_data_table&stream_id=${streamId}`;
        const response = await this.fetchWithRetry(url);
        return response.json();
    }

    getLiveStreamUrl(streamId, extension = 'ts') {
        return `${this.server}/live/${this.username}/${this.password}/${streamId}.${extension}`;
    }

    getVodStreamUrl(streamId, extension = 'mkv') {
        return `${this.server}/movie/${this.username}/${this.password}/${streamId}.${extension}`;
    }

    getSeriesStreamUrl(streamId, extension = 'mkv') {
        return `${this.server}/series/${this.username}/${this.password}/${streamId}.${extension}`;
    }
}

window.ProviderAPI = ProviderAPI;
