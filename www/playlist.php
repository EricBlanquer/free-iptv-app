<?php
/**
 * Dynamic geo-filtered IPTV playlist.
 * Detects the client country from its IP (ip-api.com) and returns the
 * corresponding iptv-org country playlist with geo-blocked entries stripped.
 *
 * Query parameters:
 *   cc=XX     Force a country code (e.g. cc=KR) - bypasses geolocation.
 *   debug=1   Output a JSON diagnostic instead of the M3U.
 */

header('Access-Control-Allow-Origin: *');

define('CACHE_DIR', __DIR__ . '/cache');
define('GEO_TTL',   86400);
define('M3U_TTL',   3600);

function cacheDir() {
    if (!is_dir(CACHE_DIR)) {
        @mkdir(CACHE_DIR, 0775, true);
    }
    return CACHE_DIR;
}

function cacheGet($key, $ttl) {
    $path = cacheDir() . '/' . $key;
    if (is_file($path) && (time() - filemtime($path)) < $ttl) {
        return file_get_contents($path);
    }
    return null;
}

function cachePut($key, $value) {
    $path = cacheDir() . '/' . $key;
    @file_put_contents($path, $value, LOCK_EX);
}

function httpGet($url, $timeout = 10) {
    $ch = curl_init($url);
    curl_setopt_array($ch, array(
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT        => $timeout,
        CURLOPT_USERAGENT      => 'FreeIPTV-Playlist/1.0'
    ));
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code >= 200 && $code < 300 && $body) {
        return $body;
    }
    return null;
}

function clientIp() {
    if (!empty($_SERVER['HTTP_CF_CONNECTING_IP'])) {
        return $_SERVER['HTTP_CF_CONNECTING_IP'];
    }
    if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        $ips = explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']);
        return trim($ips[0]);
    }
    return isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '0.0.0.0';
}

function lookupCountry($ip) {
    $cacheKey = 'geo_' . md5($ip);
    $cached = cacheGet($cacheKey, GEO_TTL);
    if ($cached !== null) {
        return $cached;
    }
    $body = httpGet('http://ip-api.com/json/' . urlencode($ip) . '?fields=countryCode', 5);
    if (!$body) {
        return null;
    }
    $data = json_decode($body, true);
    if (!isset($data['countryCode']) || strlen($data['countryCode']) !== 2) {
        return null;
    }
    $cc = strtoupper($data['countryCode']);
    cachePut($cacheKey, $cc);
    return $cc;
}

function fetchM3U($url, $cacheKey) {
    $cached = cacheGet($cacheKey, M3U_TTL);
    if ($cached !== null) {
        return $cached;
    }
    $m3u = httpGet($url, 15);
    if (!$m3u) {
        return null;
    }
    cachePut($cacheKey, $m3u);
    return $m3u;
}

function fetchCountryM3U($cc) {
    $code = strtolower($cc);
    return fetchM3U('https://iptv-org.github.io/iptv/countries/' . $code . '.m3u', 'm3u_' . $code);
}

function fetchCategoryM3U($category) {
    return fetchM3U('https://iptv-org.github.io/iptv/categories/' . $category . '.m3u', 'm3u_cat_' . $category);
}

function parseM3UEntries($m3u) {
    if (!$m3u) {
        return array();
    }
    $lines = preg_split('/\r\n|\r|\n/', $m3u);
    $entries = array();
    $pending = null;
    foreach ($lines as $line) {
        if ($line === '') {
            continue;
        }
        if (strpos($line, '#EXTINF') === 0) {
            $pending = $line;
            continue;
        }
        if (strpos($line, '#') === 0) {
            continue;
        }
        if ($pending !== null) {
            $entries[] = array('extinf' => $pending, 'url' => $line);
            $pending = null;
        }
    }
    return $entries;
}

function mergeAndFilter($entriesList) {
    $seen = array();
    $out = array('#EXTM3U');
    $kept = 0;
    $dropped = 0;
    foreach ($entriesList as $entries) {
        foreach ($entries as $e) {
            $extinf = $e['extinf'];
            $url = $e['url'];
            if (stripos($extinf, '[Geo-Blocked]') !== false || stripos($extinf, '[Not 24/7]') !== false) {
                $dropped++;
                continue;
            }
            if (isset($seen[$url])) {
                continue;
            }
            $seen[$url] = true;
            $out[] = $extinf;
            $out[] = $url;
            $kept++;
        }
    }
    return array(
        'm3u'     => implode("\n", $out) . "\n",
        'kept'    => $kept,
        'dropped' => $dropped
    );
}

$ip       = clientIp();
$ccForced = isset($_GET['cc']) ? strtoupper(trim($_GET['cc'])) : '';
$cc       = ($ccForced && strlen($ccForced) === 2) ? $ccForced : lookupCountry($ip);
$fallback = false;

if (!$cc) {
    $cc = 'INT';
    $fallback = true;
}

$countryM3U = fetchCountryM3U($cc);
if (!$countryM3U) {
    $countryM3U = fetchCountryM3U('INT');
    $fallback = true;
}
$newsM3U    = fetchCategoryM3U('news');
$weatherM3U = fetchCategoryM3U('weather');

if (!$countryM3U && !$newsM3U && !$weatherM3U) {
    http_response_code(503);
    header('Content-Type: text/plain; charset=utf-8');
    echo "# Playlist source unavailable\n";
    exit;
}

$result = mergeAndFilter(array(
    parseM3UEntries($countryM3U),
    parseM3UEntries($newsM3U),
    parseM3UEntries($weatherM3U)
));

if (!empty($_GET['debug'])) {
    header('Content-Type: application/json');
    echo json_encode(array(
        'ip'       => $ip,
        'country'  => $cc,
        'forced'   => $ccForced !== '',
        'fallback' => $fallback,
        'kept'     => $result['kept'],
        'dropped'  => $result['dropped']
    ));
    exit;
}

header('Content-Type: audio/x-mpegurl; charset=utf-8');
header('Cache-Control: public, max-age=300');
header('X-Country-Code: ' . $cc);
echo $result['m3u'];
