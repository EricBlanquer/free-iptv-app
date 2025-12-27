<?php
error_reporting(E_ALL);
ini_set('display_errors', 0);

header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=utf-8');

$logFile = __DIR__ . '/debug.log';

// Check if file exists
if (!file_exists($logFile) && !isset($_GET['config']) && !isset($_GET['clear']) && !isset($_GET['toggleTruncate'])) {
    echo json_encode(['error' => 'Log file not found: ' . $logFile, 'logs' => [], 'devices' => [], 'total' => 0]);
    exit;
}
$configFile = __DIR__ . '/log-config.json';

// Clear action
if (isset($_GET['clear'])) {
    file_put_contents($logFile, '');
    echo json_encode(['status' => 'cleared', 'total' => 0]);
    exit;
}

// Get config
if (isset($_GET['config'])) {
    $config = ['truncateHttpBody' => true, 'maxBodyLength' => 500];
    if (file_exists($configFile)) {
        $saved = json_decode(file_get_contents($configFile), true);
        if ($saved) $config = array_merge($config, $saved);
    }
    echo json_encode($config);
    exit;
}

// Toggle truncate
if (isset($_GET['toggleTruncate'])) {
    $config = ['truncateHttpBody' => true, 'maxBodyLength' => 500];
    if (file_exists($configFile)) {
        $saved = json_decode(file_get_contents($configFile), true);
        if ($saved) $config = array_merge($config, $saved);
    }
    $config['truncateHttpBody'] = !$config['truncateHttpBody'];
    file_put_contents($configFile, json_encode($config));
    echo json_encode($config);
    exit;
}

// Get logs starting from a specific line number
$since = isset($_GET['since']) ? intval($_GET['since']) : 0;

$logs = [];
$devices = [];
$lineNum = 0;

if (file_exists($logFile)) {
    $handle = fopen($logFile, 'r');
    if ($handle) {
        while (($line = fgets($handle)) !== false) {
            $lineNum++;
            if ($lineNum <= $since) continue;

            $line = trim($line);
            if (empty($line)) continue;

            if (preg_match('/^\[([^\]]+)\]\s*\[([^\]]+)\]\s*(.*)$/', $line, $m)) {
                $logs[] = [
                    'id' => $lineNum,
                    'time' => $m[1],
                    'device' => $m[2],
                    'msg' => $m[3]
                ];
                $devices[$m[2]] = true;
            } else {
                $logs[] = ['id' => $lineNum, 'time' => '', 'device' => '', 'msg' => $line];
            }
        }
        fclose($handle);
    }
}

$result = json_encode([
    'logs' => $logs,
    'devices' => array_keys($devices),
    'total' => $lineNum,
    'since' => $since
], JSON_INVALID_UTF8_SUBSTITUTE);

if ($result === false) {
    echo json_encode(['error' => 'JSON encode failed: ' . json_last_error_msg(), 'logs' => [], 'devices' => [], 'total' => 0]);
} else {
    echo $result;
}
