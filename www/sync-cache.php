<?php
/**
 * Provider cache sync endpoint
 * Stores provider data cache for faster loading across devices
 */

// Increase memory limit for large merged playlists
ini_set('memory_limit', '512M');

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

$cacheDir = __DIR__ . '/provider-cache/';
if (!is_dir($cacheDir)) {
    mkdir($cacheDir, 0755, true);
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $device = $_GET['device'] ?? '';
    $playlist = $_GET['playlist'] ?? '';
    if (!$device || !$playlist) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing device or playlist']);
        exit;
    }
    $file = $cacheDir . ($device . '_' . $playlist) . '.json';
    if (file_exists($file)) {
        readfile($file);
    }
    else {
        http_response_code(404);
        echo json_encode(['error' => 'Not found']);
    }
}
elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = file_get_contents('php://input');
    $inputSize = strlen($rawInput);

    // Extract device and playlist without full JSON parsing (memory efficient)
    if (!preg_match('/"device"\s*:\s*"([^"]+)"/', $rawInput, $deviceMatch) ||
        !preg_match('/"playlist"\s*:\s*"([^"]+)"/', $rawInput, $playlistMatch)) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing device or playlist', 'inputSize' => $inputSize]);
        exit;
    }

    $device = $deviceMatch[1];
    $playlist = $playlistMatch[1];

    // Extract data portion without parsing - find "data": and take everything after
    $dataPos = strpos($rawInput, '"data":');
    if ($dataPos === false) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing data field']);
        exit;
    }

    // Get the data object (skip "data": and the final })
    $dataStart = $dataPos + 7; // length of "data":
    $dataJson = substr($rawInput, $dataStart, -1); // remove trailing }
    $dataJson = trim($dataJson);

    $file = $cacheDir . ($device . '_' . $playlist) . '.json';
    $dataSize = strlen($dataJson);
    $result = file_put_contents($file, $dataJson);

    // Free memory
    unset($rawInput);
    unset($dataJson);

    if ($result === false) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to write file', 'file' => basename($file), 'dataSize' => $dataSize]);
        exit;
    }

    echo json_encode(['ok' => true, 'file' => basename($file), 'written' => $result, 'size' => $dataSize]);
}
