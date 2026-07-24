<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$requestId = request_id();

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET');
    json_response(405, ['error' => 'Метод не поддерживается.', 'requestId' => $requestId]);
}

try {
    $config = require_payment_config();
    $orderId = strtolower(trim((string) ($_GET['order'] ?? '')));
    $token = trim((string) ($_GET['token'] ?? ''));

    if (!is_uuid($orderId) || preg_match('/^[0-9a-f]{64}$/', $token) !== 1) {
        json_response(400, ['error' => 'Некорректные параметры заказа.']);
    }

    $order = load_order($config, $orderId);
    if (
        $order === null
        || !isset($order['publicTokenHash'])
        || !hash_equals((string) $order['publicTokenHash'], hash('sha256', $token))
    ) {
        json_response(404, ['error' => 'Заказ не найден.']);
    }

    $providerStatus = (string) ($order['providerStatus'] ?? '');
    $lastCheck = isset($order['lastProviderCheckAt']) ? strtotime((string) $order['lastProviderCheckAt']) : false;
    $mayRefresh = $providerStatus === 'PENDING'
        && is_uuid((string) ($order['transactionId'] ?? ''))
        && ($lastCheck === false || $lastCheck <= time() - 10);

    if ($mayRefresh) {
        try {
            $providerResponse = platega_request(
                $config,
                'GET',
                'transaction/' . rawurlencode((string) $order['transactionId'])
            );
            $providerBody = $providerResponse['body'];
            $freshStatus = strtoupper((string) ($providerBody['status'] ?? ''));
            $freshTransactionId = strtolower((string) ($providerBody['id'] ?? ''));
            $freshPaymentDetails = is_array($providerBody['paymentDetails'] ?? null)
                ? $providerBody['paymentDetails']
                : [];
            $freshAmount = $freshPaymentDetails['amount'] ?? null;
            $freshCurrency = strtoupper((string) ($freshPaymentDetails['currency'] ?? ''));
            $providerTransactionMatches = is_uuid($freshTransactionId)
                && hash_equals((string) $order['transactionId'], $freshTransactionId)
                && is_numeric($freshAmount)
                && abs((float) $order['amount'] - (float) $freshAmount) <= 0.00001
                && hash_equals((string) $order['currency'], $freshCurrency);

            if (
                $providerResponse['status_code'] >= 200
                && $providerResponse['status_code'] < 300
                && !$providerTransactionMatches
            ) {
                log_payment_error($requestId, 'Status response does not match the order.');
            }

            $order = mutate_order(
                $config,
                $orderId,
                static function (?array $current) use (
                    $providerResponse,
                    $freshStatus,
                    $providerBody,
                    $providerTransactionMatches
                ): array {
                    if (!is_array($current)) {
                        throw new RuntimeException('Order disappeared.');
                    }

                    $current['lastProviderCheckAt'] = gmdate('c');
                    if (
                        $providerResponse['status_code'] >= 200
                        && $providerResponse['status_code'] < 300
                        && $providerTransactionMatches
                        && in_array($freshStatus, PLATEGA_ALLOWED_STATUSES, true)
                    ) {
                        $current['status'] = $freshStatus;
                        $current['providerStatus'] = $freshStatus;
                        $current['paymentMethod'] = $providerBody['paymentMethod']
                            ?? ($current['paymentMethod'] ?? null);
                        $current['updatedAt'] = gmdate('c');
                    }

                    return $current;
                }
            );
        } catch (Throwable $refreshException) {
            log_payment_error($requestId, 'Status refresh failed: ' . $refreshException->getMessage());
        }
    }

    json_response(200, public_payment_status($order));
} catch (Throwable $exception) {
    log_payment_error($requestId, $exception->getMessage());
    json_response(500, [
        'error' => 'Не удалось проверить статус оплаты.',
        'requestId' => $requestId,
    ]);
}
