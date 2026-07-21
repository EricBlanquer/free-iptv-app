/**
 * Regression test: Android target API level must meet Google Play requirements.
 *
 * Google Play requires apps to target Android 16 (API level 36) or higher to be
 * able to publish updates from August 31, 2026. The app previously targeted
 * API 35, which Google flagged as non-compliant ("L'appli doit cibler Android 16").
 *
 * A silent downgrade of targetSdk/compileSdk below 36 would break Play publishing
 * without any build error, so it is guarded here.
 */

const fs = require('fs');

const MIN_PLAY_API_LEVEL = 36;

function readGradleInt(src, key) {
    const m = src.match(new RegExp(key + '\\s+(\\d+)'));
    if (!m) throw new Error('Could not find ' + key + ' in build.gradle');
    return parseInt(m[1], 10);
}

const gradle = fs.readFileSync('./android/app/build.gradle', 'utf8');

describe('Android Play target API level compliance', () => {
    test('targetSdk meets the Google Play requirement', () => {
        expect(readGradleInt(gradle, 'targetSdk')).toBeGreaterThanOrEqual(MIN_PLAY_API_LEVEL);
    });

    test('compileSdk is at least the target API level', () => {
        expect(readGradleInt(gradle, 'compileSdk')).toBeGreaterThanOrEqual(readGradleInt(gradle, 'targetSdk'));
    });
});
