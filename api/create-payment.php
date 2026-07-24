<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$requestId = request_id();

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    json_response(405, ['error' => 'Метод не поддерживается.', 'requestId' => $requestId]);
}

try {
    $config = require_payment_config();
    assert_same_origin($config);
    enforce_payment_rate_limit($config);
    $input = read_json_request();

    $plans = [
        'lite' => ['name' => 'LITE', 'amount' => 2000],
        'pro' => ['name' => 'PRO', 'amount' => 3000],
        'expert' => ['name' => 'EXPERT', 'amount' => 3900],
    ];

    $planKey = strtolower(trim((string) ($input['plan'] ?? '')));
    if (!isset($plans[$planKey])) {
        json_response(422, ['error' => 'Неизвестный тариф.', 'requestId' => $requestId]);
    }

    $contact = trim((string) ($input['contact'] ?? ''));
    $isEmail = filter_var($contact, FILTER_VALIDATE_EMAIL) !== false;
    $isTelegram = preg_match('/^@?[A-Za-z0-9_]{5,32}$/', $contact) === 1
        || preg_match('~^https://t\.me/[A-Za-z0-9_]{5,32}/?$~i', $contact) === 1;
    if (strlen($contact) > 160 || (!$isEmail && !$isTelegram)) {
        json_response(422, [
            'error' => 'Укажите корректный Telegram или email.',
            'requestId' => $requestId,
        ]);
    }

    if (($input['acceptedTerms'] ?? false) !== true) {
        json_response(422, [
            'error' => 'Для продолжения необходимо принять условия.',
            'requestId' => $requestId,
        ]);
    }

    $plan = $plans[$planKey];
    $orderId = uuid_v4();
    $publicToken = bin2hex(random_bytes(32));
    $now = gmdate('c');

    $order = [
        'orderId' => $orderId,
        'publicTokenHash' => hash('sha256', $publicToken),
        'planKey' => $planKey,
        'plan' => $plan['name'],
        'contact' => $contact,
        'amount' => $plan['amount'],
        'currency' => 'RUB',
        'status' => 'INITIALIZING',
        'providerStatus' => null,
        'transactionId' => null,
        'createdAt' => $now,
        'updatedAt' => $now,
        'termsAcceptedAt' => $now,
        'lastProviderCheckAt' => null,
    ];

    mutate_order(
        $config,
        $orderId,
        static function (?array $existing) use ($order): array {
            if ($existing !== null) {
                throw new RuntimeException('Order ID collision.');
            }

            return $order;
        }
    );

    $query = http_build_query(
        ['order' => $orderId, 'token' => $publicToken],
        '',
        '&',
        PHP_QUERY_RFC3986
    );
    $successUrl = $config['app_url'] . '/payment-success.html?' . $query;
    $failedUrl = $config['app_url'] . '/payment-failed.html?' . $query;

    $providerResponse = platega_request(
        $config,
        'POST',
        'v2/transaction/process',
        [
            'paymentDetails' => [
                'amount' => $plan['amount'],
                'currency' => 'RUB',
            ],
            'description' => 'Персональный подбор ноутбука — тариф ' . $plan['name'],
            'return' => $successUrl,
            'failedUrl' => $failedUrl,
            'payload' => $orderId,
            'metadata' => [
                'userId' => $orderId,
            ],
        ]
    );

    $providerBody = $providerResponse['body'];
    $transactionId = (string) ($providerBody['transactionId'] ?? '');
    $redirect = (string) ($providerBody['url'] ?? $providerBody['redirect'] ?? '');

    if (
        $providerResponse['status_code'] < 200
        || $providerResponse['status_code'] >= 300
        || !is_uuid($transactionId)
        || !is_allowed_platega_redirect($redirect)
    ) {
        mutate_order(
            $config,
            $orderId,
            static function (?array $current): array {
                if (!is_array($current)) {
                    throw new RuntimeException('Order disappeared.');
                }
                $current['status'] = 'PROVIDER_ERROR';
                $current['updatedAt'] = gmdate('c');

                return $current;
            }
        );
        log_payment_error(
            $requestId,
            'Unexpected create-payment response, HTTP ' . $providerResponse['status_code']
        );
        json_response(502, [
            'error' => 'Платёжный сервис временно недоступен. Попробуйте ещё раз.',
            'requestId' => $requestId,
        ]);
    }

    mutate_order(
        $config,
        $orderId,
        static function (?array $current) use ($transactionId, $providerBody): array {
            if (!is_array($current)) {
                throw new RuntimeException('Order disappeared.');
            }
            $current['status'] = 'PENDING';
            $current['providerStatus'] = (string) ($providerBody['status'] ?? 'PENDING');
            $current['transactionId'] = strtolower($transactionId);
            $current['providerExpiresIn'] = $providerBody['expiresIn'] ?? null;
            $current['updatedAt'] = gmdate('c');

            return $current;
        }
    );

    json_response(200, ['redirect' => $redirect]);
} catch (OverflowException $exception) {
    json_response(429, [
        'error' => 'Слишком много попыток. Подождите несколько минут и повторите.',
        'requestId' => $requestId,
    ]);
} catch (InvalidArgumentException | LengthException $exception) {
    json_response(400, ['error' => $exception->getMessage(), 'requestId' => $requestId]);
} catch (Throwable $exception) {
    log_payment_error($requestId, $exception->getMessage());
    json_response(500, [
        'error' => 'Не удалось начать оплату. Сообщите поддержке код запроса.',
        'requestId' => $requestId,
    ]);
}
