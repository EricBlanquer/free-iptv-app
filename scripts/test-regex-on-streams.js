#!/usr/bin/env node
/**
 * Test regex patterns against real provider data
 * Fetches all streams from configured providers and checks for false positives
 */

const https = require('https');
const http = require('http');

// Regex patterns from js/regex.js
const Regex = {
    categoryPrefix: /^(?:(?:EU|AF|24\/7)[-\s]*\|?\s*)?([A-Za-z]{2,3})[-\s]*\|\s*/i,
    streamPrefix: /^(?:24\/7\|\s*)?(?:(?:FR|EN|DE|ES|IT|PT|NL|PL|RU|TR|AR|ZH|JA|KO|HI|TH|VI|ID|MS|FIL|SV|NO|DA|FI|CS|SK|HU|RO|BG|HR|SR|SL|UK|EL|HE|FA|UR|BN|TA|TE|MR|GU|KN|ML|PA|NE|SI|MY|KM|LO|MN|KA|AM|SW|ZU|XH|AF|EU|CA|GL|CY|GA|GD|MT|IS|LB|MK|SQ|BS|ET|LV|LT|AZ|KK|UZ|TG|KY|TK|PS|SD|KU|EO|LA|VFF|VF|VO|VOST|VOSTFR|MULTI)[-:\s]+)/i,
    qualityPrefix: /^(?:4K|3D|SD|HD|FHD|UHD)[-|\s]+/i,
    contentTypePrefix: /^(Movies|Films|Séries|Series|Películas|Filme|Film|Filmy|Фильмы|Filmler|أفلام|电影|映画|영화|Manga|Anime|Animé|Dessins?\s*Animés?|Cartoons?|Dibujos|Zeichentrick|Мультфильмы|Çizgi\s*Film|رسوم\s*متحركة|动画|アニメ|애니메이션|Documentaires?|Documentar(?:y|ies)|Dokument(?:ar)?|Документальные|Belgesel|وثائقي|纪录片|ドキュメンタリー|다큐멘터리)\s+/i,
};

// Providers - configure your own credentials to test
const providers = [
    {
        name: "Provider 1",
        serverUrl: "http://example.com:8080",
        username: "your_username",
        password: "your_password"
    }
];

function fetch(url) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        protocol.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error('Invalid JSON: ' + e.message));
                }
            });
        }).on('error', reject);
    });
}

function stripPrefix(title) {
    if (!title) return '';
    let clean = title.trim();
    // Quality prefix (4K, HD, etc.)
    let result = clean.replace(Regex.qualityPrefix, '');
    if (result !== clean) return result;
    // Content type prefix (Movies, Films, etc.)
    if (Regex.contentTypePrefix) {
        result = clean.replace(Regex.contentTypePrefix, '');
        if (result !== clean) return result;
    }
    // Category prefix (FR|, EN-, etc.)
    result = clean.replace(Regex.categoryPrefix, '');
    if (result !== clean) return result;
    // Stream prefix (known language codes)
    return clean.replace(Regex.streamPrefix, '');
}

// Common English words that should NOT be stripped
const commonWords = [
    'You', 'The', 'Two', 'One', 'Ten', 'All', 'Big', 'Bad', 'New', 'Old', 'Red', 'Hot',
    'Ice', 'Top', 'End', 'Day', 'Way', 'Man', 'Men', 'Boy', 'War', 'Cry', 'Run', 'Die',
    'Fly', 'Try', 'Spy', 'Sky', 'Sea', 'Sun', 'Son', 'Sin', 'Win', 'Toy', 'Joy', 'Guy',
    'Her', 'Him', 'His', 'Our', 'Out', 'How', 'Why', 'Who', 'Now', 'Low', 'Row', 'Bow',
    'Box', 'Fox', 'Dog', 'Cat', 'Bat', 'Rat', 'Pig', 'Ape', 'Ant', 'Bee', 'Owl', 'Elk'
];

async function testProvider(provider) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Provider: ${provider.name}`);
    console.log('='.repeat(60));

    const baseUrl = `${provider.serverUrl}/player_api.php?username=${provider.username}&password=${provider.password}`;

    let issues = [];
    let stats = { total: 0, stripped: 0, suspicious: 0 };

    // Fetch VOD categories and streams
    try {
        console.log('\nFetching VOD...');
        const vodCats = await fetch(`${baseUrl}&action=get_vod_categories`);
        const vodStreams = await fetch(`${baseUrl}&action=get_vod_streams`);
        console.log(`  Categories: ${vodCats.length}, Streams: ${vodStreams.length}`);

        // Test categories
        for (const cat of vodCats) {
            const name = cat.category_name || '';
            const stripped = stripPrefix(name);
            stats.total++;
            if (stripped !== name) {
                stats.stripped++;
                // Check if this looks suspicious
                const firstWord = name.split(/[\s\-|:]+/)[0];
                if (commonWords.includes(firstWord)) {
                    stats.suspicious++;
                    issues.push({ type: 'VOD_CAT', original: name, stripped, firstWord });
                }
            }
        }

        // Test streams
        for (const stream of vodStreams) {
            const name = stream.name || '';
            const stripped = stripPrefix(name);
            stats.total++;
            if (stripped !== name) {
                stats.stripped++;
                const firstWord = name.split(/[\s\-|:]+/)[0];
                if (commonWords.includes(firstWord)) {
                    stats.suspicious++;
                    issues.push({ type: 'VOD', original: name, stripped, firstWord });
                }
            }
        }
    } catch (e) {
        console.log(`  Error: ${e.message}`);
    }

    // Fetch Series
    try {
        console.log('Fetching Series...');
        const seriesCats = await fetch(`${baseUrl}&action=get_series_categories`);
        const series = await fetch(`${baseUrl}&action=get_series`);
        console.log(`  Categories: ${seriesCats.length}, Series: ${series.length}`);

        for (const cat of seriesCats) {
            const name = cat.category_name || '';
            const stripped = stripPrefix(name);
            stats.total++;
            if (stripped !== name) {
                stats.stripped++;
                const firstWord = name.split(/[\s\-|:]+/)[0];
                if (commonWords.includes(firstWord)) {
                    stats.suspicious++;
                    issues.push({ type: 'SERIES_CAT', original: name, stripped, firstWord });
                }
            }
        }

        for (const s of series) {
            const name = s.name || '';
            const stripped = stripPrefix(name);
            stats.total++;
            if (stripped !== name) {
                stats.stripped++;
                const firstWord = name.split(/[\s\-|:]+/)[0];
                if (commonWords.includes(firstWord)) {
                    stats.suspicious++;
                    issues.push({ type: 'SERIES', original: name, stripped, firstWord });
                }
            }
        }
    } catch (e) {
        console.log(`  Error: ${e.message}`);
    }

    // Fetch Live
    try {
        console.log('Fetching Live...');
        const liveCats = await fetch(`${baseUrl}&action=get_live_categories`);
        const liveStreams = await fetch(`${baseUrl}&action=get_live_streams`);
        console.log(`  Categories: ${liveCats.length}, Streams: ${liveStreams.length}`);

        for (const cat of liveCats) {
            const name = cat.category_name || '';
            const stripped = stripPrefix(name);
            stats.total++;
            if (stripped !== name) {
                stats.stripped++;
                const firstWord = name.split(/[\s\-|:]+/)[0];
                if (commonWords.includes(firstWord)) {
                    stats.suspicious++;
                    issues.push({ type: 'LIVE_CAT', original: name, stripped, firstWord });
                }
            }
        }

        for (const stream of liveStreams) {
            const name = stream.name || '';
            const stripped = stripPrefix(name);
            stats.total++;
            if (stripped !== name) {
                stats.stripped++;
                const firstWord = name.split(/[\s\-|:]+/)[0];
                if (commonWords.includes(firstWord)) {
                    stats.suspicious++;
                    issues.push({ type: 'LIVE', original: name, stripped, firstWord });
                }
            }
        }
    } catch (e) {
        console.log(`  Error: ${e.message}`);
    }

    console.log(`\nStats: ${stats.total} titles, ${stats.stripped} stripped, ${stats.suspicious} SUSPICIOUS`);

    if (issues.length > 0) {
        console.log('\n*** SUSPICIOUS TITLES (might be incorrectly stripped) ***');
        // Group by first word
        const byWord = {};
        for (const issue of issues) {
            if (!byWord[issue.firstWord]) byWord[issue.firstWord] = [];
            byWord[issue.firstWord].push(issue);
        }
        for (const word of Object.keys(byWord).sort()) {
            console.log(`\n  "${word}" (${byWord[word].length} occurrences):`);
            for (const issue of byWord[word].slice(0, 5)) {
                console.log(`    [${issue.type}] "${issue.original}" -> "${issue.stripped}"`);
            }
            if (byWord[word].length > 5) {
                console.log(`    ... and ${byWord[word].length - 5} more`);
            }
        }
    } else {
        console.log('\n✓ No suspicious titles found!');
    }

    return issues;
}

async function main() {
    console.log('Testing regex patterns against real provider data...\n');
    console.log('Regex patterns:');
    console.log('  categoryPrefix:', Regex.categoryPrefix.source);
    console.log('  streamPrefix:', Regex.streamPrefix.source.substring(0, 80) + '...');

    let allIssues = [];
    for (const provider of providers) {
        const issues = await testProvider(provider);
        allIssues = allIssues.concat(issues);
    }

    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));

    if (allIssues.length === 0) {
        console.log('\n✓ SUCCESS: No false positives detected!');
        console.log('  The regex patterns correctly preserve titles starting with common words.');
    } else {
        console.log(`\n✗ FOUND ${allIssues.length} potential false positives`);
        console.log('  Review the issues above to determine if they are real problems.');
    }
}

main().catch(console.error);
