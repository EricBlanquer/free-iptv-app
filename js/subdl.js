/**
 * SubDL API Client
 * API docs: https://subdl.com/api-doc
 */
var SubDL = (function() {
    var API_BASE = 'https://api.subdl.com/api/v1/subtitles';
    var DOWNLOAD_BASE = 'https://dl.subdl.com';
    var API_KEY = '';

    function setApiKey(key) {
        API_KEY = key || '';
    }

    function isEnabled() {
        return !!API_KEY;
    }

    function getApiKey() {
        return API_KEY;
    }

    /**
     * Search for subtitles
     * @param {Object} params - Search parameters
     * @param {string} params.imdb_id - IMDB ID (e.g., "tt1375666")
     * @param {number} params.tmdb_id - TMDB ID
     * @param {string} params.query - Title search (film_name)
     * @param {string} params.languages - Language codes (e.g., "fr,en")
     * @param {string} params.type - "movie" or "tv"
     * @param {number} params.season_number - Season number
     * @param {number} params.episode_number - Episode number
     * @param {Function} callback - callback(error, results)
     */
    function search(params, callback) {
        var key = getApiKey();
        if (!key) {
            callback({ error: 'API key not set' }, null);
            return;
        }
        var queryParts = ['api_key=' + encodeURIComponent(key)];
        if (params.imdb_id) {
            var imdbId = params.imdb_id.toString();
            if (!imdbId.startsWith('tt')) imdbId = 'tt' + imdbId;
            queryParts.push('imdb_id=' + encodeURIComponent(imdbId));
        }
        if (params.tmdb_id) queryParts.push('tmdb_id=' + encodeURIComponent(params.tmdb_id));
        if (params.query) queryParts.push('film_name=' + encodeURIComponent(params.query));
        if (params.type) queryParts.push('type=' + encodeURIComponent(params.type));
        if (params.season_number !== undefined) queryParts.push('season_number=' + params.season_number);
        if (params.episode_number !== undefined) queryParts.push('episode_number=' + params.episode_number);
        // Languages (don't encode comma, API doesn't accept %2C)
        var langs = params.languages || 'fr,en';
        queryParts.push('languages=' + langs);
        queryParts.push('subs_per_page=30');
        var url = API_BASE + '?' + queryParts.join('&');
        window.log('HTTP> ' + url);
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                var logMsg = 'HTTP< ' + xhr.status + ' ' + url;
                if (xhr.responseURL && xhr.responseURL !== url) {
                    logMsg += ' -> ' + xhr.responseURL;
                }
                window.log(logMsg);
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        var response = JSON.parse(xhr.responseText);
                        if (response.status === false) {
                            var truncated = xhr.responseText.length > 500 ? xhr.responseText.substring(0, 500) + '...' : xhr.responseText;
                            window.log('HTTP body ' + url + ': ' + truncated);
                            callback({ error: response.error || 'API error' }, null);
                            return;
                        }
                        var results = [];
                        var subtitles = response.subtitles || [];
                        for (var i = 0; i < subtitles.length; i++) {
                            var sub = subtitles[i];
                            results.push({
                                id: sub.sd_id || i,
                                file_name: sub.release_name || sub.name || '',
                                language: sub.lang || sub.language || '',
                                release: sub.release_name || '',
                                author: sub.author || '',
                                url: sub.url || '',
                                download_url: DOWNLOAD_BASE + (sub.url || ''),
                                hearing_impaired: sub.hi || false,
                                full_season: sub.full_season || false
                            });
                        }
                        callback(null, results);
                    } catch (e) {
                        callback({ error: 'Invalid JSON response' }, null);
                    }
                }
                else {
                    var truncated = xhr.responseText.length > 500 ? xhr.responseText.substring(0, 500) + '...' : xhr.responseText;
                    window.log('HTTP body ' + url + ': ' + truncated);
                    callback({ error: 'HTTP ' + xhr.status }, null);
                }
            }
        };
        xhr.onerror = function() {
            callback({ error: 'Network error' }, null);
        };
        xhr.send();
    }

    /**
     * Download subtitle content from URL (returns ZIP)
     * @param {string} url - Download URL
     * @param {Function} callback - callback(error, { blob, fileName })
     */
    function downloadZip(url, callback) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'arraybuffer';
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                if (xhr.status >= 200 && xhr.status < 300) {
                    callback(null, {
                        data: xhr.response,
                        contentType: xhr.getResponseHeader('Content-Type')
                    });
                } else {
                    callback({ error: 'Download failed: HTTP ' + xhr.status }, null);
                }
            }
        };
        xhr.onerror = function() {
            callback({ error: 'Download network error' }, null);
        };
        xhr.send();
    }

    /**
     * Extract SRT from ZIP data (simple extraction)
     * @param {ArrayBuffer} zipData - ZIP file data
     * @param {Function} callback - callback(error, srtContent)
     */
    function extractSrtFromZip(zipData, callback) {
        try {
            var data = new Uint8Array(zipData);
            // Find local file header signature (0x04034b50)
            var pos = 0;
            while (pos < data.length - 4) {
                if (data[pos] === 0x50 && data[pos+1] === 0x4b && data[pos+2] === 0x03 && data[pos+3] === 0x04) {
                    // Found local file header
                    var compressionMethod = data[pos + 8] | (data[pos + 9] << 8);
                    var compressedSize = data[pos + 18] | (data[pos + 19] << 8) | (data[pos + 20] << 16) | (data[pos + 21] << 24);
                    var uncompressedSize = data[pos + 22] | (data[pos + 23] << 8) | (data[pos + 24] << 16) | (data[pos + 25] << 24);
                    var fileNameLen = data[pos + 26] | (data[pos + 27] << 8);
                    var extraLen = data[pos + 28] | (data[pos + 29] << 8);
                    var fileName = '';
                    for (var i = 0; i < fileNameLen; i++) {
                        fileName += String.fromCharCode(data[pos + 30 + i]);
                    }
                    var fileDataStart = pos + 30 + fileNameLen + extraLen;
                    // Check if it's an SRT file
                    if (fileName.toLowerCase().endsWith('.srt')) {
                        if (compressionMethod === 0) {
                            // No compression (stored)
                            var srtData = data.slice(fileDataStart, fileDataStart + uncompressedSize);
                            var srtContent = new TextDecoder('utf-8').decode(srtData);
                            callback(null, srtContent);
                            return;
                        } else if (compressionMethod === 8) {
                            // Deflate compression - need to use pako or similar
                            // For now, try raw inflate
                            try {
                                var compressedData = data.slice(fileDataStart, fileDataStart + compressedSize);
                                var inflated = pako.inflateRaw(compressedData);
                                var srtContent = new TextDecoder('utf-8').decode(inflated);
                                callback(null, srtContent);
                                return;
                            } catch (e) {
                                // pako not available or error
                                callback({ error: 'Cannot decompress: ' + e.message }, null);
                                return;
                            }
                        }
                    }
                    pos = fileDataStart + compressedSize;
                } else {
                    pos++;
                }
            }
            callback({ error: 'No SRT file found in ZIP' }, null);
        } catch (e) {
            callback({ error: 'ZIP extraction error: ' + e.message }, null);
        }
    }

    /**
     * Search and download subtitle
     * @param {Object} params - Search parameters (same as search())
     * @param {Function} callback - callback(error, { content, subtitle })
     */
    function searchAndDownload(params, callback) {
        search(params, function(err, results) {
            if (err) {
                callback(err, null);
                return;
            }
            if (!results || results.length === 0) {
                callback({ error: 'No subtitles found' }, null);
                return;
            }
            // Pick first result
            var subtitle = results[0];
            downloadZip(subtitle.download_url, function(err, zipResult) {
                if (err) {
                    callback(err, null);
                    return;
                }
                extractSrtFromZip(zipResult.data, function(err, srtContent) {
                    if (err) {
                        callback(err, null);
                        return;
                    }
                    callback(null, {
                        content: srtContent,
                        subtitle: subtitle
                    });
                });
            });
        });
    }

    return {
        setApiKey: setApiKey,
        isEnabled: isEnabled,
        getApiKey: getApiKey,
        search: search,
        downloadZip: downloadZip,
        extractSrtFromZip: extractSrtFromZip,
        searchAndDownload: searchAndDownload
    };
})();

window.SubDL = SubDL;
