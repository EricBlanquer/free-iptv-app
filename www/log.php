<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

$logDir = __DIR__;
$logFile = $logDir . '/debug.log';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// DELETE = clear logs
if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    file_put_contents($logFile, '');
    http_response_code(200);
    echo json_encode(['status' => 'cleared']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    exit;
}

$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data) {
    http_response_code(400);
    exit;
}

// action=clear to clear logs
if (isset($data['action']) && $data['action'] === 'clear') {
    file_put_contents($logFile, '');
    http_response_code(200);
    echo json_encode(['status' => 'cleared']);
    exit;
}

if (!isset($data['msg'])) {
    http_response_code(400);
    exit;
}

$timestamp = isset($data['time']) ? $data['time'] : date('Y-m-d H:i:s');
$deviceId = isset($data['device']) ? $data['device'] : 'unknown';
$msg = $data['msg'];

// Remove NUL bytes and other control characters (except newline/tab)
$msg = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', $msg);

// Fix double-encoded UTF-8 (UTF-8 interpreted as Latin-1 then re-encoded)
if (preg_match('/[\xC3][\x80-\xBF]/', $msg)) {
    $decoded = @iconv('UTF-8', 'ISO-8859-1//IGNORE', $msg);
    if ($decoded && mb_check_encoding($decoded, 'UTF-8')) {
        $msg = $decoded;
    }
}
$line = "[$timestamp] [$deviceId] $msg\n";

$maxSize = 500 * 1024;
$trimSize = 250 * 1024;

file_put_contents($logFile, $line, FILE_APPEND | LOCK_EX);
if (filesize($logFile) > $maxSize) {
    $content = file_get_contents($logFile);
    $trimmed = substr($content, -$trimSize);
    $nlPos = strpos($trimmed, "\n");
    if ($nlPos !== false) {
        $trimmed = substr($trimmed, $nlPos + 1);
    }
    file_put_contents($logFile, $trimmed, LOCK_EX);
}

if ($deviceId && $deviceId !== 'unknown') {
    $safeId = preg_replace('/[^a-zA-Z0-9_-]/', '', $deviceId);
    $deviceLogFile = $logDir . '/debug-' . $safeId . '.log';
    file_put_contents($deviceLogFile, "[$timestamp] $msg\n", FILE_APPEND | LOCK_EX);
    if (filesize($deviceLogFile) > $maxSize) {
        $content = file_get_contents($deviceLogFile);
        $trimmed = substr($content, -$trimSize);
        $nlPos = strpos($trimmed, "\n");
        if ($nlPos !== false) {
            $trimmed = substr($trimmed, $nlPos + 1);
        }
        file_put_contents($deviceLogFile, $trimmed, LOCK_EX);
    }
}

http_response_code(200);
echo json_encode(['status' => 'ok']);
