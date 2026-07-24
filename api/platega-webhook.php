<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$requestId = request_id();

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    no_content_response(405);
}

try {
    $config = require_payment_config();
    $rawBody = read_request_body(65536);

    // Platega sends an empty POST while validating the callback URL in the dashboard.
    if (trim($rawBody) === '') {
        no_content_response(200);
    }

    $merchantId = request_header('X-MerchantId') ?? '';
    $secret = request_header('X-Secret') ?? '';
    if (
        !hash_equals((string) $config['merchant_id'], $merchantId)
        || !hash_equals((string) $config['secret'], $secret)
    ) {
        log_payment_error($requestId, 'Rejected webhook with invalid credentials.');
        no_content_response(401);
    }

    try {
        $payload = json_decode($rawBody, true, 32, JSON_THROW_ON_ERROR);
    } catch (JsonException $exception) {
        throw new InvalidArgumentException('Invalid webhook JSON.', 0, $exception);
    }
    if (!is_array($payload)) {
        throw new InvalidArgumentException('Webhook body must be an object.');
    }

    $orderId = is_string($payload['payload'] ?? null) ? trim($payload['payload']) : '';
    $transactionId = is_string($payload['id'] ?? null) ? strtolower(trim($payload['id'])) : '';
    $status = is_string($payload['status'] ?? null) ? strtoupper(trim($payload['status'])) : '';
    $currency = is_string($payload['currency'] ?? null) ? strtoupper(trim($payload['currency'])) : '';
    $amount = $payload['amount'] ?? null;

    if (
        !is_uuid($orderId)
        || !is_uuid($transactionId)
        || !in_array($status, PLATEGA_ALLOWED_STATUSES, true)
        || !is_numeric($amount)
        || $currency === ''
    ) {
        throw new InvalidArgumentException('Webhook has invalid required fields.');
    }

    $order = load_order($config, $orderId);
    if ($order === null) {
        log_payment_error($requestId, 'Webhook references an unknown order.');
        no_content_response(200);
    }

    if (
        !hash_equals((string) ($order['transactionId'] ?? ''), $transactionId)
        || abs((float) $order['amount'] - (float) $amount) > 0.00001
        || !hash_equals((string) $order['currency'], $currency)
    ) {
        log_payment_error($requestId, 'Webhook transaction details do not match the order.');
        no_content_response(409);
    }

    mutate_order(
        $config,
        $orderId,
        static function (?array $current) use ($status, $payload): array {
            if (!is_array($current)) {
                throw new RuntimeException('Order disappeared.');
            }

            $previous = (string) ($current['providerStatus'] ?? '');
            $terminal = in_array($previous, ['CONFIRMED', 'CHARGEBACKED'], true);
            $allowedTransition = !$terminal
                || $previous === $status
                || ($previous === 'CONFIRMED' && $status === 'CHARGEBACKED');

            if ($allowedTransition) {
                $current['status'] = $status;
                $current['providerStatus'] = $status;
                $current['paymentMethod'] = $payload['paymentMethod'] ?? ($current['paymentMethod'] ?? null);
                $current['updatedAt'] = gmdate('c');
                $current['lastWebhookAt'] = gmdate('c');
            }

            return $current;
        }
    );

    no_content_response(200);
} catch (InvalidArgumentException | LengthException $exception) {
    log_payment_error($requestId, $exception->getMessage());
    no_content_response(400);
} catch (Throwable $exception) {
    log_payment_error($requestId, $exception->getMessage());
    no_content_response(500);
}

