<?php
// CORS Proxy for bypassing CORS restrictions during emulator testing
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$url = isset($_GET['url']) ? $_GET['url'] : null;

if (!$url) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Missing url parameter']);
    exit;
}

// Validate URL format
if (!filter_var($url, FILTER_VALIDATE_URL)) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Invalid URL']);
    exit;
}

// Security: Only allow HTTP and HTTPS protocols
$parsed = parse_url($url);
$scheme = strtolower($parsed['scheme'] ?? '');
if ($scheme !== 'http' && $scheme !== 'https') {
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Only HTTP/HTTPS protocols allowed']);
    exit;
}

// Security: Whitelist of allowed domains (prevents open proxy abuse)
$host = $parsed['host'] ?? '';
$allowedHosts = [
    '700730.org',
    '5f6.drnexon.net',
];

// Check if host matches allowed list (including subdomains)
$hostAllowed = false;
foreach ($allowedHosts as $allowed) {
    if ($host === $allowed || substr($host, -strlen('.' . $allowed)) === '.' . $allowed) {
        $hostAllowed = true;
        break;
    }
}
if (!$hostAllowed) {
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Domain not allowed']);
    exit;
}

// Security: Block local/private IP addresses (SSRF protection)
if (empty($host)) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Invalid host']);
    exit;
}

// Resolve hostname to IP for checking
$ip = gethostbyname($host);
if ($ip === $host && !filter_var($host, FILTER_VALIDATE_IP)) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Cannot resolve hostname']);
    exit;
}

// Block localhost
if ($host === 'localhost' || $ip === '127.0.0.1' || $ip === '::1') {
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Localhost not allowed']);
    exit;
}

// Block private IP ranges (RFC 1918 + link-local + AWS metadata)
$blockedRanges = [
    '10.0.0.0/8',       // Private Class A
    '172.16.0.0/12',    // Private Class B
    '192.168.0.0/16',   // Private Class C
    '169.254.0.0/16',   // Link-local (AWS metadata)
    '127.0.0.0/8',      // Loopback
    '0.0.0.0/8',        // Invalid
];

function ipInRange($ip, $cidr) {
    list($range, $bits) = explode('/', $cidr);
    $ipLong = ip2long($ip);
    $rangeLong = ip2long($range);
    $mask = -1 << (32 - $bits);
    return ($ipLong & $mask) === ($rangeLong & $mask);
}

foreach ($blockedRanges as $range) {
    if (ipInRange($ip, $range)) {
        http_response_code(403);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Private/internal IPs not allowed']);
        exit;
    }
}

// Initialize cURL
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_MAXREDIRS, 5);
curl_setopt($ch, CURLOPT_TIMEOUT, 30);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_HEADER, true);

// Forward POST data if present
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    curl_setopt($ch, CURLOPT_POST, true);
    $postData = file_get_contents('php://input');
    curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);

    // Forward Content-Type if set
    if (isset($_SERVER['CONTENT_TYPE'])) {
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: ' . $_SERVER['CONTENT_TYPE']
        ]);
    }
}

// Execute request
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);

if (curl_errno($ch)) {
    http_response_code(502);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Proxy error: ' . curl_error($ch)]);
    curl_close($ch);
    exit;
}

curl_close($ch);

// Separate headers and body
$headers = substr($response, 0, $headerSize);
$body = substr($response, $headerSize);

// Extract Content-Type from response headers
$contentType = 'application/octet-stream';
if (preg_match('/Content-Type:\s*([^\r\n]+)/i', $headers, $matches)) {
    $contentType = trim($matches[1]);
}

// Set response headers
http_response_code($httpCode);
header('Content-Type: ' . $contentType);

// Output body
echo $body;
