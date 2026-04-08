<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, PUT, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Admin-Secret');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

define('DATA_DIR', __DIR__ . '/premium-data');
define('ADMIN_SECRET', '52422509b81423a7d07bc06bbc1cfc64');

if (!is_dir(DATA_DIR)) {
    mkdir(DATA_DIR, 0755, true);
}

function rateLimitCheck($key, $maxPerMinute) {
    $file = DATA_DIR . '/.rate_' . md5($key) . '.json';
    $now = time();
    $data = file_exists($file) ? json_decode(@file_get_contents($file), true) : [];
    if (!is_array($data)) $data = [];
    $data = array_values(array_filter($data, function($t) use ($now) { return $t > $now - 60; }));
    if (count($data) >= $maxPerMinute) return false;
    $data[] = $now;
    @file_put_contents($file, json_encode($data), LOCK_EX);
    return true;
}

function purgeInactiveDevices($maxAgeDays = 365) {
    $cutoff = (time() - $maxAgeDays * 86400) * 1000;
    foreach (glob(DATA_DIR . '/device_*.json') as $file) {
        $data = json_decode(@file_get_contents($file), true);
        if (!$data) continue;
        if (!empty($data['licenseCode'])) continue;
        $lastSeen = $data['lastSeen'] ?? $data['installDate'] ?? 0;
        if ($lastSeen > 0 && $lastSeen < $cutoff) {
            @unlink($file);
        }
    }
    foreach (glob(DATA_DIR . '/.rate_*.json') as $file) {
        if (filemtime($file) < time() - 3600) @unlink($file);
    }
}

function getClientIp() {
    if (!empty($_SERVER['HTTP_CF_CONNECTING_IP'])) return $_SERVER['HTTP_CF_CONNECTING_IP'];
    if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) return explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'])[0];
    return $_SERVER['REMOTE_ADDR'] ?? '';
}

function getGeoLocation($ip) {
    if (!$ip || $ip === '127.0.0.1') return null;
    $ctx = stream_context_create(['http' => ['timeout' => 3]]);
    $json = @file_get_contents("http://ip-api.com/json/{$ip}?fields=country,city,regionName,isp", false, $ctx);
    if (!$json) return null;
    $data = json_decode($json, true);
    if (!$data || isset($data['fail'])) return null;
    return [
        'location' => trim(($data['city'] ?? '') . ', ' . ($data['regionName'] ?? '') . ', ' . ($data['country'] ?? ''), ', '),
        'isp' => $data['isp'] ?? null
    ];
}

$action = isset($_GET['action']) ? $_GET['action'] : '';

switch ($action) {

    case 'premium-get':
        $deviceId = isset($_GET['deviceId']) ? $_GET['deviceId'] : '';
        if (strlen($deviceId) < 2) {
            jsonResponse(['error' => 'invalid deviceId'], 400);
        }
        if (!rateLimitCheck('get_' . getClientIp(), 30)) {
            jsonResponse(['error' => 'rate_limit'], 429);
        }
        $data = readJson('device_' . safeFilename($deviceId));
        if ($data) {
            $ip = getClientIp();
            if ($ip) {
                $data['lastIp'] = $ip;
                $geo = getGeoLocation($ip);
                if ($geo) {
                    $data['location'] = $geo['location'];
                    $data['isp'] = $geo['isp'];
                }
                $data['lastSeen'] = round(microtime(true) * 1000);
                writeJson('device_' . safeFilename($deviceId), $data);
            }
        }
        jsonResponse($data);
        break;

    case 'premium-put':
        $deviceId = isset($_GET['deviceId']) ? $_GET['deviceId'] : '';
        if (strlen($deviceId) < 2) {
            jsonResponse(['error' => 'invalid deviceId'], 400);
        }
        $body = json_decode(file_get_contents('php://input'), true);
        if (!$body) {
            jsonResponse(['error' => 'invalid body'], 400);
        }
        $ip = getClientIp();
        if ($ip) {
            $body['lastIp'] = $ip;
            $geo = getGeoLocation($ip);
            if ($geo) {
                $body['location'] = $geo['location'];
                $body['isp'] = $geo['isp'];
            }
        }
        $body['lastSeen'] = round(microtime(true) * 1000);
        writeJson('device_' . safeFilename($deviceId), $body);
        jsonResponse(['ok' => true]);
        break;

    case 'license-validate':
        requirePost();
        $body = json_decode(file_get_contents('php://input'), true);
        $code = strtoupper(trim(isset($body['code']) ? $body['code'] : ''));
        $deviceId = isset($body['deviceId']) ? $body['deviceId'] : '';

        if (strlen($code) < 4) {
            jsonResponse(['valid' => false, 'error' => 'invalid_code']);
        }

        $license = readJson('license_' . $code);
        if (!$license) {
            jsonResponse(['valid' => false, 'error' => 'not_found']);
        }

        if (!empty($license['used']) && !empty($license['deviceId']) && $license['deviceId'] !== $deviceId) {
            jsonResponse(['valid' => false, 'error' => 'already_used']);
        }

        $license['used'] = true;
        $license['deviceId'] = $deviceId;
        $license['activatedAt'] = round(microtime(true) * 1000);
        writeJson('license_' . $code, $license);

        if ($deviceId) {
            $premiumData = readJson('device_' . safeFilename($deviceId));
            if (!$premiumData) {
                $premiumData = [];
            }
            $premiumData['licenseCode'] = $code;
            $premiumData['licensedAt'] = round(microtime(true) * 1000);
            $ip = getClientIp();
            if ($ip) {
                $premiumData['lastIp'] = $ip;
                $geo = getGeoLocation($ip);
                if ($geo) {
                    $premiumData['location'] = $geo['location'];
                    $premiumData['isp'] = $geo['isp'];
                }
            }
            writeJson('device_' . safeFilename($deviceId), $premiumData);
        }

        jsonResponse(['valid' => true]);
        break;

    case 'license-generate':
        requirePost();
        requireAdmin();
        $code = generateLicenseCode();
        writeJson('license_' . $code, [
            'code' => $code,
            'createdAt' => round(microtime(true) * 1000),
            'used' => false,
            'deviceId' => null
        ]);
        jsonResponse(['code' => $code]);
        break;

    case 'admin-license-assign':
        requirePost();
        requireAdmin();
        $body = json_decode(file_get_contents('php://input'), true);
        $code = strtoupper(trim(isset($body['code']) ? $body['code'] : ''));
        $deviceId = isset($body['deviceId']) ? $body['deviceId'] : '';
        if (!$code || !$deviceId) {
            jsonResponse(['error' => 'code and deviceId required'], 400);
        }
        $license = readJson('license_' . $code);
        if (!$license) {
            jsonResponse(['error' => 'not_found'], 404);
        }
        $license['used'] = true;
        $license['deviceId'] = $deviceId;
        $license['activatedAt'] = round(microtime(true) * 1000);
        writeJson('license_' . $code, $license);
        $premiumData = readJson('device_' . safeFilename($deviceId));
        if (!$premiumData) {
            $premiumData = [];
        }
        $premiumData['licenseCode'] = $code;
        writeJson('device_' . safeFilename($deviceId), $premiumData);
        jsonResponse(['ok' => true]);
        break;

    case 'license-revoke':
        requirePost();
        requireAdmin();
        $body = json_decode(file_get_contents('php://input'), true);
        $code = strtoupper(trim(isset($body['code']) ? $body['code'] : ''));
        if (!$code) {
            jsonResponse(['error' => 'code required'], 400);
        }
        $license = readJson('license_' . $code);
        $cleanedDeviceId = null;
        if ($license && !empty($license['deviceId'])) {
            $cleanedDeviceId = $license['deviceId'];
            $devData = readJson('device_' . safeFilename($cleanedDeviceId));
            if ($devData && isset($devData['licenseCode']) && strtoupper($devData['licenseCode']) === $code) {
                unset($devData['licenseCode']);
                unset($devData['licensedAt']);
                writeJson('device_' . safeFilename($cleanedDeviceId), $devData);
            }
        }
        foreach (glob(DATA_DIR . '/device_*.json') as $file) {
            $devData = json_decode(file_get_contents($file), true);
            if ($devData && isset($devData['licenseCode']) && strtoupper($devData['licenseCode']) === $code) {
                unset($devData['licenseCode']);
                unset($devData['licensedAt']);
                file_put_contents($file, json_encode($devData), LOCK_EX);
            }
        }
        deleteJson('license_' . $code);
        jsonResponse(['ok' => true]);
        break;

    case 'license-lookup':
        $email = strtolower(trim(isset($_GET['email']) ? $_GET['email'] : ''));
        if (!$email) {
            jsonResponse(['error' => 'email required'], 400);
        }
        $codes = readJson('email_' . safeFilename($email));
        jsonResponse(['codes' => $codes ? $codes : []]);
        break;

    case 'paypal-ipn':
        requirePost();
        $body = file_get_contents('php://input');

        $ch = curl_init('https://ipnpb.paypal.com/cgi-bin/webscr');
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, 'cmd=_notify-validate&' . $body);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        $verifyResult = curl_exec($ch);
        curl_close($ch);

        if ($verifyResult !== 'VERIFIED') {
            http_response_code(400);
            echo 'IPN not verified';
            exit;
        }

        parse_str($body, $params);
        $paymentStatus = isset($params['payment_status']) ? $params['payment_status'] : '';
        $payerEmail = strtolower(trim(isset($params['payer_email']) ? $params['payer_email'] : ''));
        $txnId = isset($params['txn_id']) ? $params['txn_id'] : '';

        if ($paymentStatus !== 'Completed' || !$payerEmail) {
            echo 'OK';
            exit;
        }

        $existingTxn = readJson('txn_' . safeFilename($txnId));
        if ($existingTxn) {
            echo 'OK';
            exit;
        }

        $ipnCode = generateLicenseCode();

        writeJson('license_' . $ipnCode, [
            'code' => $ipnCode,
            'createdAt' => round(microtime(true) * 1000),
            'used' => false,
            'deviceId' => null,
            'payerEmail' => $payerEmail,
            'txnId' => $txnId
        ]);

        $emailCodes = readJson('email_' . safeFilename($payerEmail));
        if (!$emailCodes) {
            $emailCodes = [];
        }
        $emailCodes[] = [
            'code' => $ipnCode,
            'createdAt' => round(microtime(true) * 1000),
            'txnId' => $txnId
        ];
        writeJson('email_' . safeFilename($payerEmail), $emailCodes);

        writeJson('txn_' . safeFilename($txnId), ['code' => $ipnCode]);

        echo 'OK';
        exit;

    case 'admin-licenses':
        requireAdmin();
        $licenses = [];
        foreach (glob(DATA_DIR . '/license_*.json') as $file) {
            $data = json_decode(file_get_contents($file), true);
            if ($data) {
                $licenses[] = $data;
            }
        }
        usort($licenses, function($a, $b) {
            return ($b['createdAt'] ?? 0) - ($a['createdAt'] ?? 0);
        });
        jsonResponse(['licenses' => $licenses]);
        break;

    case 'admin-devices':
        requireAdmin();
        purgeInactiveDevices(365);
        $devices = [];
        foreach (glob(DATA_DIR . '/device_*.json') as $file) {
            $data = json_decode(file_get_contents($file), true);
            if ($data) {
                $basename = basename($file, '.json');
                $data['deviceId'] = substr($basename, strlen('device_'));
                $devices[] = $data;
            }
        }
        jsonResponse(['devices' => $devices]);
        break;

    case 'admin-device-comment':
        requirePost();
        requireAdmin();
        $body = json_decode(file_get_contents('php://input'), true);
        $deviceId = isset($body['deviceId']) ? $body['deviceId'] : '';
        $comment = isset($body['comment']) ? $body['comment'] : '';
        if (!$deviceId) {
            jsonResponse(['error' => 'deviceId required'], 400);
        }
        $devData = readJson('device_' . safeFilename($deviceId));
        if (!$devData) {
            jsonResponse(['error' => 'not found'], 404);
        }
        $devData['comment'] = mb_substr($comment, 0, 1000);
        writeJson('device_' . safeFilename($deviceId), $devData);
        jsonResponse(['ok' => true]);
        break;

    case 'admin-device-delete':
        requirePost();
        requireAdmin();
        $body = json_decode(file_get_contents('php://input'), true);
        $deviceId = isset($body['deviceId']) ? $body['deviceId'] : '';
        if (!$deviceId) {
            jsonResponse(['error' => 'deviceId required'], 400);
        }
        $devData = readJson('device_' . safeFilename($deviceId));
        if ($devData && !empty($devData['licenseCode'])) {
            deleteJson('license_' . $devData['licenseCode']);
        }
        deleteJson('device_' . safeFilename($deviceId));
        jsonResponse(['ok' => true]);
        break;

    default:
        jsonResponse(['error' => 'unknown action'], 400);
}

function generateLicenseCode() {
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $code = '';
    for ($i = 0; $i < 6; $i++) {
        $code .= $chars[random_int(0, strlen($chars) - 1)];
    }
    return $code;
}

function safeFilename($str) {
    return preg_replace('/[^a-zA-Z0-9_\-@.]/', '_', $str);
}

function readJson($name) {
    $file = DATA_DIR . '/' . $name . '.json';
    if (!file_exists($file)) {
        return null;
    }
    return json_decode(file_get_contents($file), true);
}

function writeJson($name, $data) {
    $file = DATA_DIR . '/' . $name . '.json';
    file_put_contents($file, json_encode($data), LOCK_EX);
}

function deleteJson($name) {
    $file = DATA_DIR . '/' . $name . '.json';
    if (file_exists($file)) {
        unlink($file);
    }
}

function jsonResponse($data, $status = 200) {
    http_response_code($status);
    echo json_encode($data);
    exit;
}

function requirePost() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['error' => 'method not allowed'], 405);
    }
}

function requireAdmin() {
    $secret = '';
    if (isset($_SERVER['HTTP_X_ADMIN_SECRET'])) {
        $secret = $_SERVER['HTTP_X_ADMIN_SECRET'];
    }
    if ($secret !== ADMIN_SECRET) {
        jsonResponse(['error' => 'unauthorized'], 401);
    }
}
