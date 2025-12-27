<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

// Options (can be overridden by log-config.json)
$truncateHttpBody = true;
$maxBodyLength = 500;
$configFile = __DIR__ . '/log-config.json';
if (file_exists($configFile)) {
    $config = json_decode(file_get_contents($configFile), true);
    if (isset($config['truncateHttpBody'])) $truncateHttpBody = $config['truncateHttpBody'];
    if (isset($config['maxBodyLength'])) $maxBodyLength = $config['maxBodyLength'];
}

$logFile = __DIR__ . '/debug.log';

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

// Truncate HTTP body logs if enabled
if ($truncateHttpBody && strpos($msg, 'HTTP body ') === 0) {
    $colonPos = strpos($msg, ': ');
    if ($colonPos !== false) {
        $prefix = substr($msg, 0, $colonPos + 2);
        $body = substr($msg, $colonPos + 2);
        if (strlen($body) > $maxBodyLength) {
            $msg = $prefix . substr($body, 0, $maxBodyLength) . '...';
        }
    }
}

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

file_put_contents($logFile, $line, FILE_APPEND | LOCK_EX);

http_response_code(200);
echo json_encode(['status' => 'ok']);
