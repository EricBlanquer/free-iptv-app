<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

$dataDir = __DIR__ . '/sync-data/';

// Create data directory if it doesn't exist
if (!is_dir($dataDir)) {
    mkdir($dataDir, 0755, true);
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// GET = retrieve sync data for a device
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $device = isset($_GET['device']) ? $_GET['device'] : '';
    if (!$device || !preg_match('/^[a-z0-9]+$/i', $device)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid device ID']);
        exit;
    }
    $file = $dataDir . $device . '.json';
    if (file_exists($file)) {
        readfile($file);
    } else {
        http_response_code(404);
        echo json_encode(['error' => 'No data found']);
    }
    exit;
}

// POST = save sync data for a device
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);
    if (!$data || !isset($data['device']) || !isset($data['data'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid request']);
        exit;
    }
    $device = $data['device'];
    if (!preg_match('/^[a-z0-9]+$/i', $device)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid device ID']);
        exit;
    }
    $file = $dataDir . $device . '.json';
    file_put_contents($file, json_encode($data['data']), LOCK_EX);
    http_response_code(200);
    echo json_encode(['status' => 'ok']);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
