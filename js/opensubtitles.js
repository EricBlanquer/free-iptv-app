/**
 * OpenSubtitles API Client
 * API docs: https://opensubtitles.stoplight.io/docs/opensubtitles-api
 */
var OpenSubtitles = (function() {
    var API_BASE = 'https://api.opensubtitles.com/api/v1';
    var API_KEY = '';
    var USER_AGENT = 'FreeIPTV v1.0';

    // ISO 639-2B language codes for OpenSubtitles
    var LANG_MAP = {
        'fr': 'fre',
        'en': 'eng',
        'de': 'ger',
        'es': 'spa',
        'it': 'ita',
        'pt': 'por',
        'ru': 'rus',
        'ja': 'jpn',
        'ko': 'kor',
        'zh': 'chi',
        'ar': 'ara',
        'nl': 'dut',
        'pl': 'pol',
        'tr': 'tur',
        'sv': 'swe',
        'da': 'dan',
        'fi': 'fin',
        'no': 'nor',
        'cs': 'cze',
        'hu': 'hun',
        'ro': 'rum',
        'el': 'gre',
        'he': 'heb',
        'th': 'tha',
        'vi': 'vie'
    };

    function setApiKey(key) {
        API_KEY = key || '';
    }

    function isEnabled() {
        return !!API_KEY;
    }

    function getApiKey() {
        if (!API_KEY) {
            try {
                API_KEY = localStorage.getItem('opensubtitles_api_key') || '';
            } catch (e) { /* storage not available */ }
        }
        return API_KEY;
    }

    function mapLanguage(lang) {
        if (!lang) return 'fre';
        var lower = lang.toLowerCase().substring(0, 2);
        return LANG_MAP[lower] || lang;
    }

    function request(method, endpoint, data, callback) {
        var key = getApiKey();
        if (!key) {
            callback({ error: 'API key not set' }, null);
            return;
        }
        var xhr = new XMLHttpRequest();
        var url = API_BASE + endpoint;
        window.log('HTTP> ' + method + ' ' + url);
        xhr.open(method, url, true);
        xhr.setRequestHeader('Api-Key', key);
        xhr.setRequestHeader('Content-Type', 'application/json');
        try { xhr.setRequestHeader('User-Agent', USER_AGENT); } catch(e) { /* may be blocked */ }
        xhr.setRequestHeader('X-User-Agent', USER_AGENT);
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
                        callback(null, response);
                    } catch (e) {
                        callback({ error: 'Invalid JSON response' }, null);
                    }
                }
                else {
                    var truncated = xhr.responseText.length > 500 ? xhr.responseText.substring(0, 500) + '...' : xhr.responseText;
                    window.log('HTTP body ' + url + ': ' + truncated);
                    callback({ error: 'HTTP ' + xhr.status, status: xhr.status }, null);
                }
            }
        };
        xhr.onerror = function() {
            callback({ error: 'Network error' }, null);
        };
        if (method === 'POST' && data) {
            xhr.send(JSON.stringify(data));
        } else {
            xhr.send();
        }
    }

    /**
     * Search for subtitles
     * @param {Object} params - Search parameters
     * @param {string} params.imdb_id - IMDB ID (e.g., "tt1375666")
     * @param {number} params.tmdb_id - TMDB ID
     * @param {string} params.query - Title search
     * @param {string} params.languages - Language codes (e.g., "fr,en")
     * @param {string} params.type - "movie" or "episode"
     * @param {number} params.season_number - Season number for episodes
     * @param {number} params.episode_number - Episode number for episodes
     * @param {number} params.parent_tmdb_id - Series TMDB ID for episodes
     * @param {Function} callback - callback(error, results)
     */
    function search(params, callback) {
        var queryParts = [];
        if (params.imdb_id) {
            var imdbId = params.imdb_id.toString().replace('tt', '');
            queryParts.push('imdb_id=' + encodeURIComponent(imdbId));
        }
        if (params.tmdb_id) queryParts.push('tmdb_id=' + encodeURIComponent(params.tmdb_id));
        if (params.query) queryParts.push('query=' + encodeURIComponent(params.query));
        if (params.parent_tmdb_id) queryParts.push('parent_tmdb_id=' + encodeURIComponent(params.parent_tmdb_id));
        if (params.season_number !== undefined) queryParts.push('season_number=' + params.season_number);
        if (params.episode_number !== undefined) queryParts.push('episode_number=' + params.episode_number);
        if (params.type) queryParts.push('type=' + encodeURIComponent(params.type));
        // Languages (don't encode comma, don't map to ISO 639-2B)
        var langs = params.languages || 'fr,en';
        queryParts.push('languages=' + langs);
        var endpoint = '/subtitles?' + queryParts.join('&');
        request('GET', endpoint, null, function(err, response) {
            if (err) {
                callback(err, null);
                return;
            }
            var results = [];
            if (response && response.data) {
                for (var i = 0; i < response.data.length; i++) {
                    var item = response.data[i];
                    var attr = item.attributes || {};
                    var files = attr.files || [];
                    if (files.length > 0) {
                        results.push({
                            id: item.id,
                            file_id: files[0].file_id,
                            file_name: files[0].file_name || '',
                            language: attr.language || '',
                            release: attr.release || '',
                            fps: attr.fps || 0,
                            votes: attr.votes || 0,
                            download_count: attr.download_count || 0,
                            hearing_impaired: attr.hearing_impaired || false,
                            foreign_parts_only: attr.foreign_parts_only || false,
                            ai_translated: attr.ai_translated || false,
                            machine_translated: attr.machine_translated || false
                        });
                    }
                }
            }
            callback(null, results);
        });
    }

    /**
     * Get download link for a subtitle file
     * @param {number} fileId - file_id from search results
     * @param {Function} callback - callback(error, { link, file_name, remaining })
     */
    function getDownloadLink(fileId, callback) {
        request('POST', '/download', { file_id: fileId }, function(err, response) {
            if (err) {
                callback(err, null);
                return;
            }
            callback(null, {
                link: response.link || '',
                file_name: response.file_name || '',
                remaining: response.remaining || 0
            });
        });
    }

    /**
     * Download subtitle content from link
     * @param {string} url - Download URL
     * @param {Function} callback - callback(error, content)
     */
    function downloadContent(url, callback) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                if (xhr.status >= 200 && xhr.status < 300) {
                    callback(null, xhr.responseText);
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
     * Save subtitle to local storage (Tizen filesystem)
     * @param {string} content - Subtitle content
     * @param {string} fileName - File name
     * @param {Function} callback - callback(error, filePath)
     */
    function saveToFile(content, fileName, callback) {
        try {
            if (typeof tizen !== 'undefined' && tizen.filesystem) {
                tizen.filesystem.resolve('wgt-private', function(dir) {
                    var filePath = dir.fullPath + '/' + fileName;
                    dir.createFile(fileName);
                    tizen.filesystem.resolve(filePath, function(file) {
                        file.openStream('w', function(stream) {
                            stream.write(content);
                            stream.close();
                            callback(null, filePath);
                        }, function(e) {
                            callback({ error: 'Write error: ' + e.message }, null);
                        }, 'UTF-8');
                    }, function(e) {
                        callback({ error: 'Resolve error: ' + e.message }, null);
                    }, 'rw');
                }, function(e) {
                    callback({ error: 'Dir error: ' + e.message }, null);
                }, 'rw');
            } else {
                // Fallback for browser testing - store in memory
                if (!window._subtitleFiles) window._subtitleFiles = {};
                window._subtitleFiles[fileName] = content;
                callback(null, 'memory://' + fileName);
            }
        } catch (e) {
            callback({ error: 'Filesystem error: ' + e.message }, null);
        }
    }

    /**
     * Search, download and save subtitle
     * @param {Object} params - Search parameters (same as search())
     * @param {Function} callback - callback(error, { filePath, subtitle })
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
            // Pick first result (best match)
            var subtitle = results[0];
            getDownloadLink(subtitle.file_id, function(err, download) {
                if (err) {
                    callback(err, null);
                    return;
                }
                downloadContent(download.link, function(err, content) {
                    if (err) {
                        callback(err, null);
                        return;
                    }
                    var fileName = 'subtitle_' + Date.now() + '.srt';
                    saveToFile(content, fileName, function(err, filePath) {
                        if (err) {
                            callback(err, null);
                            return;
                        }
                        callback(null, {
                            filePath: filePath,
                            subtitle: subtitle,
                            content: content
                        });
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
        getDownloadLink: getDownloadLink,
        downloadContent: downloadContent,
        saveToFile: saveToFile,
        searchAndDownload: searchAndDownload,
        LANG_MAP: LANG_MAP
    };
})();

window.OpenSubtitles = OpenSubtitles;
