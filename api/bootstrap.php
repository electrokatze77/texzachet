<?php

declare(strict_types=1);

const PLATEGA_ALLOWED_STATUSES = [
    'PENDING',
    'CONFIRMED',
    'CANCELED',
    'CHARGEBACKED',
];

function payment_config(): array
{
    static $config = null;

    if (is_array($config)) {
        return $config;
    }

    $root = dirname(__DIR__);
    $config = [
        'merchant_id' => getenv('PLATEGA_MERCHANT_ID') ?: '',
        'secret' => getenv('PLATEGA_SECRET') ?: '',
        'app_url' => getenv('APP_URL') ?: '',
        'storage_dir' => getenv('PAYMENT_STORAGE_DIR') ?: $root . DIRECTORY_SEPARATOR . 'storage',
        'api_base' => getenv('PLATEGA_API_BASE') ?: 'https://app.platega.io/',
        'timeout_seconds' => (int) (getenv('PLATEGA_TIMEOUT_SECONDS') ?: 20),
        'connect_timeout_seconds' => (int) (getenv('PLATEGA_CONNECT_TIMEOUT_SECONDS') ?: 5),
        'rate_limit_count' => (int) (getenv('PAYMENT_RATE_LIMIT_COUNT') ?: 10),
        'rate_limit_window_seconds' => (int) (getenv('PAYMENT_RATE_LIMIT_WINDOW') ?: 600),
    ];

    $localConfigPath = $root . DIRECTORY_SEPARATOR . 'config' . DIRECTORY_SEPARATOR . 'platega.local.php';
    if (is_file($localConfigPath)) {
        $localConfig = require $localConfigPath;
        if (!is_array($localConfig)) {
            throw new RuntimeException('Local payment configuration must return an array.');
        }
        $config = array_replace($config, $localConfig);
    }

    $config['api_base'] = rtrim((string) $config['api_base'], '/') . '/';
    $config['app_url'] = rtrim((string) $config['app_url'], '/');
    $config['storage_dir'] = rtrim((string) $config['storage_dir'], '/\\');

    return $config;
}

function require_payment_config(): array
{
    $config = payment_config();
    $missing = [];

    foreach (['merchant_id', 'secret', 'app_url', 'storage_dir'] as $key) {
        if (!isset($config[$key]) || trim((string) $config[$key]) === '') {
            $missing[] = $key;
        }
    }

    if ($missing !== []) {
        throw new RuntimeException('Missing payment configuration: ' . implode(', ', $missing));
    }

    $appUrl = parse_url((string) $config['app_url']);
    if (!is_array($appUrl) || ($appUrl['scheme'] ?? '') !== 'https' || empty($appUrl['host'])) {
        throw new RuntimeException('app_url must be an absolute HTTPS URL.');
    }

    $apiUrl = parse_url((string) $config['api_base']);
    if (!is_array($apiUrl) || ($apiUrl['scheme'] ?? '') !== 'https' || empty($apiUrl['host'])) {
        throw new RuntimeException('api_base must be an absolute HTTPS URL.');
    }

    if (!extension_loaded('curl')) {
        throw new RuntimeException('The PHP cURL extension is required.');
    }

    ensure_runtime_directories($config);

    return $config;
}

function ensure_runtime_directories(array $config): void
{
    $directories = [
        $config['storage_dir'],
        $config['storage_dir'] . DIRECTORY_SEPARATOR . 'orders',
        $config['storage_dir'] . DIRECTORY_SEPARATOR . 'rate-limits',
    ];

    foreach ($directories as $directory) {
        if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
            throw new RuntimeException('Unable to create payment storage directory.');
        }
    }
}

function send_security_headers(): void
{
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: no-referrer');
    header('Cache-Control: no-store, private');
}

function json_response(int $status, array $payload): never
{
    http_response_code($status);
    send_security_headers();
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function no_content_response(int $status = 200): never
{
    http_response_code($status);
    send_security_headers();
    exit;
}

function request_id(): string
{
    return bin2hex(random_bytes(8));
}

function log_payment_error(string $requestId, string $message): void
{
    error_log('[payments][' . $requestId . '] ' . $message);
}

function request_header(string $name): ?string
{
    if (function_exists('getallheaders')) {
        $headers = getallheaders();
        if (is_array($headers)) {
            foreach ($headers as $headerName => $value) {
                if (strcasecmp((string) $headerName, $name) === 0) {
                    return is_string($value) ? trim($value) : null;
                }
            }
        }
    }

    $serverKey = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    $value = $_SERVER[$serverKey] ?? null;

    return is_string($value) ? trim($value) : null;
}

function read_request_body(int $maxBytes = 65536): string
{
    $contentLength = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($contentLength > $maxBytes) {
        throw new LengthException('Request body is too large.');
    }

    $body = file_get_contents('php://input');
    if (!is_string($body)) {
        throw new RuntimeException('Unable to read request body.');
    }
    if (strlen($body) > $maxBytes) {
        throw new LengthException('Request body is too large.');
    }

    return $body;
}

function read_json_request(): array
{
    $contentType = strtolower((string) (request_header('Content-Type') ?? ''));
    if (!str_starts_with($contentType, 'application/json')) {
        throw new InvalidArgumentException('Content-Type must be application/json.');
    }

    $body = read_request_body(16384);
    if (trim($body) === '') {
        throw new InvalidArgumentException('Request body is required.');
    }

    try {
        $decoded = json_decode($body, true, 32, JSON_THROW_ON_ERROR);
    } catch (JsonException $exception) {
        throw new InvalidArgumentException('Invalid JSON body.', 0, $exception);
    }

    if (!is_array($decoded)) {
        throw new InvalidArgumentException('JSON body must be an object.');
    }

    return $decoded;
}

function assert_same_origin(array $config): void
{
    $origin = request_header('Origin');
    if ($origin === null || $origin === '') {
        return;
    }

    $expected = parse_url((string) $config['app_url']);
    $actual = parse_url($origin);
    if (!is_array($expected) || !is_array($actual)) {
        throw new RuntimeException('Invalid request origin.');
    }

    $expectedPort = (int) ($expected['port'] ?? 443);
    $actualPort = (int) ($actual['port'] ?? 443);
    $matches = ($actual['scheme'] ?? '') === ($expected['scheme'] ?? '')
        && strcasecmp((string) ($actual['host'] ?? ''), (string) ($expected['host'] ?? '')) === 0
        && $actualPort === $expectedPort;

    if (!$matches) {
        throw new RuntimeException('Cross-origin payment requests are not allowed.');
    }
}

function enforce_payment_rate_limit(array $config): void
{
    $limit = max(1, (int) $config['rate_limit_count']);
    $window = max(60, (int) $config['rate_limit_window_seconds']);
    $clientKey = hash('sha256', (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
    $path = $config['storage_dir'] . DIRECTORY_SEPARATOR . 'rate-limits'
        . DIRECTORY_SEPARATOR . $clientKey . '.json';

    $handle = fopen($path, 'c+');
    if ($handle === false) {
        throw new RuntimeException('Unable to access rate-limit storage.');
    }

    try {
        if (!flock($handle, LOCK_EX)) {
            throw new RuntimeException('Unable to lock rate-limit storage.');
        }

        $contents = stream_get_contents($handle);
        $timestamps = [];
        if (is_string($contents) && $contents !== '') {
            $decoded = json_decode($contents, true);
            if (is_array($decoded)) {
                $timestamps = array_values(array_filter($decoded, 'is_int'));
            }
        }

        $cutoff = time() - $window;
        $timestamps = array_values(array_filter(
            $timestamps,
            static fn (int $timestamp): bool => $timestamp >= $cutoff
        ));

        if (count($timestamps) >= $limit) {
            throw new OverflowException('Too many payment attempts.');
        }

        $timestamps[] = time();
        rewind($handle);
        if (!ftruncate($handle, 0)) {
            throw new RuntimeException('Unable to update rate-limit storage.');
        }
        if (fwrite($handle, json_encode($timestamps, JSON_THROW_ON_ERROR)) === false) {
            throw new RuntimeException('Unable to write rate-limit storage.');
        }
        fflush($handle);
        flock($handle, LOCK_UN);
    } finally {
        fclose($handle);
    }
}

function uuid_v4(): string
{
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
    $hex = bin2hex($bytes);

    return substr($hex, 0, 8) . '-'
        . substr($hex, 8, 4) . '-'
        . substr($hex, 12, 4) . '-'
        . substr($hex, 16, 4) . '-'
        . substr($hex, 20, 12);
}

function is_uuid(string $value): bool
{
    return preg_match(
        '/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i',
        $value
    ) === 1;
}

function order_path(array $config, string $orderId): string
{
    if (!is_uuid($orderId)) {
        throw new InvalidArgumentException('Invalid order ID.');
    }

    return $config['storage_dir'] . DIRECTORY_SEPARATOR . 'orders'
        . DIRECTORY_SEPARATOR . strtolower($orderId) . '.json';
}

function load_order(array $config, string $orderId): ?array
{
    $path = order_path($config, $orderId);
    if (!is_file($path)) {
        return null;
    }

    $contents = file_get_contents($path);
    if (!is_string($contents) || $contents === '') {
        throw new RuntimeException('Unable to read order.');
    }

    $order = json_decode($contents, true, 32, JSON_THROW_ON_ERROR);
    if (!is_array($order)) {
        throw new RuntimeException('Invalid order data.');
    }

    return $order;
}

function mutate_order(array $config, string $orderId, callable $mutation): array
{
    $path = order_path($config, $orderId);
    $lockPath = $path . '.lock';
    $lock = fopen($lockPath, 'c+');
    if ($lock === false) {
        throw new RuntimeException('Unable to open order lock.');
    }

    $temporaryPath = null;

    try {
        if (!flock($lock, LOCK_EX)) {
            throw new RuntimeException('Unable to lock order.');
        }

        $order = null;
        if (is_file($path)) {
            $contents = file_get_contents($path);
            if (!is_string($contents) || $contents === '') {
                throw new RuntimeException('Unable to read order.');
            }
            $order = json_decode($contents, true, 32, JSON_THROW_ON_ERROR);
        }

        $updated = $mutation($order);
        if (!is_array($updated)) {
            throw new RuntimeException('Order mutation must return an array.');
        }

        $temporaryPath = $path . '.tmp.' . bin2hex(random_bytes(6));
        $json = json_encode(
            $updated,
            JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
        );
        if (file_put_contents($temporaryPath, $json . PHP_EOL, LOCK_EX) === false) {
            throw new RuntimeException('Unable to write order.');
        }
        @chmod($temporaryPath, 0600);

        if (!rename($temporaryPath, $path)) {
            throw new RuntimeException('Unable to finalize order.');
        }
        $temporaryPath = null;

        flock($lock, LOCK_UN);

        return $updated;
    } finally {
        if (is_string($temporaryPath) && is_file($temporaryPath)) {
            @unlink($temporaryPath);
        }
        fclose($lock);
    }
}

function is_allowed_platega_redirect(string $url): bool
{
    $parts = parse_url($url);
    if (!is_array($parts) || ($parts['scheme'] ?? '') !== 'https') {
        return false;
    }

    $host = strtolower((string) ($parts['host'] ?? ''));

    return $host === 'platega.io' || str_ends_with($host, '.platega.io');
}

function platega_request(
    array $config,
    string $method,
    string $path,
    ?array $body = null
): array {
    $url = $config['api_base'] . ltrim($path, '/');
    $headers = [
        'Accept: application/json',
        'X-MerchantId: ' . $config['merchant_id'],
        'X-Secret: ' . $config['secret'],
    ];

    $curl = curl_init($url);
    if ($curl === false) {
        throw new RuntimeException('Unable to initialize cURL.');
    }

    $options = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => strtoupper($method),
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_CONNECTTIMEOUT => max(1, (int) $config['connect_timeout_seconds']),
        CURLOPT_TIMEOUT => max(1, (int) $config['timeout_seconds']),
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_USERAGENT => 'TexZachet-Platega/1.0',
    ];

    if ($body !== null) {
        $encodedBody = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $headers[] = 'Content-Type: application/json';
        $options[CURLOPT_HTTPHEADER] = $headers;
        $options[CURLOPT_POSTFIELDS] = $encodedBody;
    }

    curl_setopt_array($curl, $options);
    $responseBody = curl_exec($curl);
    $curlError = curl_error($curl);
    $statusCode = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    curl_close($curl);

    if (!is_string($responseBody)) {
        throw new RuntimeException('Platega request failed: ' . ($curlError ?: 'unknown transport error'));
    }

    $decoded = null;
    if (trim($responseBody) !== '') {
        try {
            $decoded = json_decode($responseBody, true, 32, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new RuntimeException('Platega returned invalid JSON.', 0, $exception);
        }
    }

    return [
        'status_code' => $statusCode,
        'body' => is_array($decoded) ? $decoded : [],
    ];
}

function public_payment_status(array $order): array
{
    $status = (string) ($order['providerStatus'] ?? $order['status'] ?? 'PENDING');

    return [
        'orderId' => $order['orderId'],
        'plan' => $order['plan'],
        'amount' => $order['amount'],
        'currency' => $order['currency'],
        'status' => $status,
        'paid' => $status === 'CONFIRMED',
    ];
}
