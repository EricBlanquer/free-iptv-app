/**
 * Regression test for "cannot add a movie to favorites" (reported 2026-07-03).
 *
 * On the details screen, a VOD that has duplicate versions across providers
 * gets a `_duplicateVersions` array whose entries reference the stream itself
 * (versions[0].data === primaryStream, and primaryStream._duplicateVersions
 * === versions). Favouriting such a stream pushed it into `this.favorites`,
 * and saveFavorites() did JSON.stringify(this.favorites) which threw:
 *   "Converting circular structure to JSON"
 * so the favourite was never persisted.
 *
 * Fix: saveFavorites serialises with a replacer that drops the transient
 * `_duplicateVersions` field (it is rebuilt when browsing).
 */

const fs = require('fs');

function slice(src, name) {
    const re = new RegExp('IPTVApp\\.prototype\\.' + name + '\\s*=\\s*function[\\s\\S]*?\\n\\};');
    const m = src.match(re);
    if (!m) throw new Error('Could not extract ' + name);
    return m[0].replace('IPTVApp.prototype.', 'TestApp.prototype.');
}

const storageSrc = fs.readFileSync('./js/storage.js', 'utf8');

function TestApp() {
    this.favorites = [];
    this._saved = null;
}
TestApp.prototype._safeLocalSet = function(key, value) { this._saved = value; return true; };
TestApp.prototype._rebuildFavoritesIndex = function() {};
eval(slice(storageSrc, 'saveFavorites'));

function circularVodFavorite() {
    const primary = {
        stream_id: 63598, name: 'The Call', _type: 'vod', _section: 'vod',
        _playlistId: '1782994642235', cover: 'x.jpg'
    };
    const versions = [{ id: 63598, tag: 'VF', quality: '1080p', data: primary }];
    primary._duplicateVersions = versions; // circular: primary -> versions[0].data -> primary
    return primary;
}

describe('saveFavorites — circular _duplicateVersions', () => {
    it('does not throw when a favorite stream references itself via _duplicateVersions', () => {
        const app = new TestApp();
        app.favorites = [circularVodFavorite()];
        expect(() => app.saveFavorites()).not.toThrow();
        expect(app._saved).toBeTruthy();
    });

    it('persists the favorite and strips the transient _duplicateVersions field', () => {
        const app = new TestApp();
        app.favorites = [circularVodFavorite()];
        app.saveFavorites();
        const parsed = JSON.parse(app._saved);
        expect(parsed).toHaveLength(1);
        expect(parsed[0].stream_id).toBe(63598);
        expect(parsed[0].name).toBe('The Call');
        expect(parsed[0]._playlistId).toBe('1782994642235');
        expect(parsed[0]._duplicateVersions).toBeUndefined();
    });

    it('still serialises a plain favorite without duplicate versions', () => {
        const app = new TestApp();
        app.favorites = [{ stream_id: 1, name: 'Plain', _type: 'vod', _playlistId: 'p1' }];
        app.saveFavorites();
        const parsed = JSON.parse(app._saved);
        expect(parsed[0].name).toBe('Plain');
    });
});
