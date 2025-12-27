<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit; }
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    if ($data && isset($data['msg'])) {
        $time = isset($data['time']) ? $data['time'] : date('Y-m-d H:i:s');
        $device = isset($data['device']) ? $data['device'] : 'unknown';
        $line = '[' . $time . '] [' . $device . '] ' . $data['msg'] . "\n";
        file_put_contents(__DIR__ . '/debug.log', $line, FILE_APPEND | LOCK_EX);
    }
}
