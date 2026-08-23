# ТехЗачёт — Production

Project: ТехЗачёт  
Repository: `H:\Saves\Instant\Instant`  
Git remote: `https://github.com/electrokatze77/texzachet.git`  
Production domain: `texzachet.com`  
Production platform: Cloudflare Pages  
Application type: static site + `_worker.js`

## Production НЕ використовує

- VPS
- SSH
- nginx
- systemd
- PM2
- Docker
- `/srv/techrate/app`
- будь-яку інфраструктуру TechRate

## Правило

Усі production-зміни в цьому repository стосуються тільки `texzachet.com`.

Єдиний стандартний production deployment:

```text
git push origin main
```

Після push Cloudflare Pages автоматично запускає Git deployment.

Cloudflare Pages project name/ID можна додати пізніше. Їх відсутність не є підставою шукати VPS або SSH.
