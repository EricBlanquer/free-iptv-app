<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit; }

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
    $data = json_decode(file_get_contents('php://input'), true);
    if (!$data) { exit; }
    $device = isset($data['device']) ? $data['device'] : 'unknown';
    $lines = '';
    if (isset($data['entries']) && is_array($data['entries'])) {
        foreach ($data['entries'] as $entry) {
            if (!isset($entry['msg'])) { continue; }
            $time = isset($entry['time']) ? toLocalTime($entry['time']) : date('Y-m-d H:i:s');
            $lines .= '[' . $time . '] [' . $device . '] ' . $entry['msg'] . "\n";
        }
    }
    elseif (isset($data['msg'])) {
        $time = isset($data['time']) ? toLocalTime($data['time']) : date('Y-m-d H:i:s');
        $lines = '[' . $time . '] [' . $device . '] ' . $data['msg'] . "\n";
    }
    if ($lines !== '') {
        file_put_contents(__DIR__ . '/debug.log', $lines, FILE_APPEND | LOCK_EX);
    }
}
