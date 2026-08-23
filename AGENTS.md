# Production deployment rules

Для цього repository команда «задеплой», «залий на прод», «онови сайт», «викати зміни» або аналогічна ЗАВЖДИ означає:

1. Перевірити, що поточний repository — `electrokatze77/texzachet`.
2. Перевірити, що branch — `main`.
3. Перевірити зміни.
4. Зробити commit, якщо потрібно.
5. Виконати `git push origin main`.
6. НЕ шукати VPS або SSH.
7. НЕ використовувати жоден deployment target TechRate.

Якщо git remote не `electrokatze77/texzachet` — deployment негайно зупинити.

Production для цього repository працює через GitHub → Cloudflare Pages. VPS, SSH, nginx, systemd, PM2, Docker та `/srv/techrate/app` не є production-інфраструктурою цього проєкту.
