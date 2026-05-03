<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit; }

define('LOG_MAX_LINE_LEN', 4000);
define('LOG_MAX_DEVICE_LEN', 80);
define('LOG_MAX_ENTRIES_PER_REQUEST', 200);
define('LOG_MAX_FILE_BYTES', 64 * 1024 * 1024);
define('LOG_RATE_DIR', __DIR__ . '/log-rate');
define('LOG_RATE_PER_MINUTE', 60);

function logSanitize($s, $maxLen) {
    if (!is_string($s)) {
        $s = (string)$s;
    }
    $s = str_replace(["\r", "\n", "\0"], ' ', $s);
    if (strlen($s) > $maxLen) {
        $s = substr($s, 0, $maxLen);
    }
    return $s;
}

function logRateOk() {
    if (!is_dir(LOG_RATE_DIR)) {
        @mkdir(LOG_RATE_DIR, 0775, true);
    }
    $ip = '';
    if (!empty($_SERVER['HTTP_CF_CONNECTING_IP'])) {
        $ip = $_SERVER['HTTP_CF_CONNECTING_IP'];
    } elseif (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        $parts = explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']);
        $ip = trim($parts[0]);
    } elseif (isset($_SERVER['REMOTE_ADDR'])) {
        $ip = $_SERVER['REMOTE_ADDR'];
    }
    $file = LOG_RATE_DIR . '/' . md5($ip) . '.json';
    $now = time();
    $data = is_file($file) ? json_decode(@file_get_contents($file), true) : [];
    if (!is_array($data)) { $data = []; }
    $data = array_values(array_filter($data, function($t) use ($now) { return $t > $now - 60; }));
    if (count($data) >= LOG_RATE_PER_MINUTE) {
        return false;
    }
    $data[] = $now;
    @file_put_contents($file, json_encode($data), LOCK_EX);
    return true;
}

function toLocalTime($time) {
    try {
        $dt = new DateTime($time);
        $dt->setTimezone(new DateTimeZone('Europe/Paris'));
        return $dt->format('Y-m-d H:i:s.v');
    } catch (Exception $ex) {
        return $time;
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!logRateOk()) {
        http_response_code(429);
        exit;
    }
    $raw = file_get_contents('php://input');
    if (strlen($raw) > 1024 * 1024) {
        http_response_code(413);
        exit;
    }
    $data = json_decode($raw, true);
    if (!$data) { exit; }
    $device = logSanitize(isset($data['device']) ? $data['device'] : 'unknown', LOG_MAX_DEVICE_LEN);
    $lines = '';
    if (isset($data['entries']) && is_array($data['entries'])) {
        $count = 0;
        foreach ($data['entries'] as $entry) {
            if (!isset($entry['msg'])) { continue; }
            if (++$count > LOG_MAX_ENTRIES_PER_REQUEST) { break; }
            $time = isset($entry['time']) ? toLocalTime($entry['time']) : date('Y-m-d H:i:s');
            $time = logSanitize($time, 64);
            $msg = logSanitize($entry['msg'], LOG_MAX_LINE_LEN);
            $lines .= '[' . $time . '] [' . $device . '] ' . $msg . "\n";
        }
    }
    elseif (isset($data['msg'])) {
        $time = isset($data['time']) ? toLocalTime($data['time']) : date('Y-m-d H:i:s');
        $time = logSanitize($time, 64);
        $msg = logSanitize($data['msg'], LOG_MAX_LINE_LEN);
        $lines = '[' . $time . '] [' . $device . '] ' . $msg . "\n";
    }
    if ($lines !== '') {
        $logFile = __DIR__ . '/debug.log';
        if (is_file($logFile) && filesize($logFile) > LOG_MAX_FILE_BYTES) {
            @rename($logFile, $logFile . '.1');
        }
        file_put_contents($logFile, $lines, FILE_APPEND | LOCK_EX);
    }
}
