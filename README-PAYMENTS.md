# Platega на Cloudflare Pages

Платіжний бекенд працює як Cloudflare Worker у файлі `_worker.js`. PHP для
цього розгортання не потрібний і Cloudflare Pages його не виконує.

Worker:

- створює платіжне посилання Platega;
- зберігає замовлення в Cloudflare D1;
- перевіряє callback за Merchant ID, секретом, ID транзакції, сумою та валютою;
- ідемпотентно обробляє повторні callback-и;
- перевіряє статус транзакції після повернення покупця;
- обмежує кількість спроб створення платежу.

## 1. Secrets

У Cloudflare відкрийте:

`Workers & Pages → ваш Pages-проєкт → Settings → Variables and Secrets`

Додайте як secrets:

```text
PLATEGA_MERCHANT_ID
PLATEGA_SECRET
```

За бажанням додайте звичайну змінну:

```text
APP_URL=https://texzachet.com
```

Якщо `APP_URL` не заданий, Worker використає домен поточного запиту.

## 2. Створення D1

1. У Cloudflare відкрийте `Storage & Databases → D1 SQL Database`.
2. Натисніть `Create database`.
3. Назвіть базу `texzachet-payments`.
4. Відкрийте створену базу та перейдіть у `Console`.
5. Скопіюйте весь вміст `schema.sql`, вставте в консоль і виконайте запит.

Схема створює таблиці:

- `payment_orders` — замовлення і статуси транзакцій;
- `payment_rate_limits` — захист endpoint-а від масових запитів.

## 3. Прив’язка D1 до Pages

Відкрийте:

`Workers & Pages → ваш Pages-проєкт → Settings → Bindings → Add`

Виберіть:

```text
Type: D1 database
Variable name: DB
Database: texzachet-payments
```

Назва binding має бути саме `DB`. Після додавання binding виконайте новий
deployment — без нього зміна не застосовується.

## 4. Deployment

Файл `_worker.js` повинен знаходитися в корені завантажуваного каталогу поруч
з `index.html`. Завантажуйте весь проєкт новим deployment-ом, а не окремі
файли.

Для Git deployment достатньо відправити зміни в підключений репозиторій.
Для Direct Upload створіть новий deployment і завантажте весь каталог або ZIP,
у якому `_worker.js` лежить на верхньому рівні.

## 5. Callback Platega

У кабінеті Platega вкажіть:

```text
https://texzachet.com/api/platega-webhook
```

Під час збереження Platega надішле порожній `POST`; Worker відповість
`200 OK`. Справжні callback-и приймаються лише з правильною парою
`X-MerchantId` / `X-Secret`.

## 6. Перевірка

Після deployment:

1. Відкрийте `https://texzachet.com/api/payment-status`.
   Відповідь `400` про некоректні параметри означає, що Worker і D1 працюють.
2. Натисніть тариф на сайті.
3. Введіть Telegram або email і прийміть умови.
4. Перевірте суму на формі Platega.
5. Проведіть погоджений тестовий платіж.
6. У D1 відкрийте `payment_orders` і перевірте статус `CONFIRMED`.

## Маршрути

```text
POST /api/create-payment
GET  /api/payment-status
POST /api/platega-webhook
```

Серверні ціни:

| Тариф | Сума |
|---|---:|
| LITE | 1 USD |
| PRO | 3000 RUB |
| EXPERT | 3900 RUB |

Секрети не повинні знаходитися у файлах, HTML, JavaScript або Git.
