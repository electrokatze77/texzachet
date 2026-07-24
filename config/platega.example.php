<?php

declare(strict_types=1);

/*
 * Copy this file to platega.local.php on the server and fill in the values.
 * platega.local.php is ignored by Git and must never be committed.
 *
 * Prefer real server environment variables when the hosting panel supports
 * them: PLATEGA_MERCHANT_ID, PLATEGA_SECRET, APP_URL and PAYMENT_STORAGE_DIR.
 */
return [
    'merchant_id' => 'replace-with-merchant-id',
    'secret' => 'replace-with-api-secret',
    'app_url' => 'https://texzachet.com',

    // Prefer a directory outside the public web root when the hosting allows it.
    // 'storage_dir' => '/absolute/private/path/texzachet-payments',

    'api_base' => 'https://app.platega.io/',
    'timeout_seconds' => 20,
    'connect_timeout_seconds' => 5,
    'rate_limit_count' => 10,
    'rate_limit_window_seconds' => 600,
];

