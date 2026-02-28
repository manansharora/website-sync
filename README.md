# website-sync

Bun-powered webhook that lets you share an X post from iPhone and append it to your weekly Ghost roundup post.

## What it does

- Exposes `POST /add-tweet` on localhost.
- Validates bearer auth and tweet URL.
- Computes current week key as Monday (`ddmmyyyy`) in `Asia/Kolkata`.
- Finds or creates a Ghost post with that slug/title.
- Appends tweet embed HTML at the bottom.
- Skips duplicates by tweet ID.

## API

### `GET /health`

Returns:

```json
{ "ok": true }
```

### `POST /add-tweet`

Headers:

- `Authorization: Bearer <HOOK_BEARER_TOKEN>`
- `Content-Type: application/json`

Body:

```json
{ "url": "https://x.com/<user>/status/<id>" }
```

Success:

```json
{
  "ok": true,
  "status": "added",
  "slug": "23022026",
  "post_id": "67f...",
  "post_url": "https://your-domain.com/23022026/"
}
```

Duplicate:

```json
{
  "ok": true,
  "status": "duplicate",
  "slug": "23022026",
  "post_id": "67f...",
  "post_url": "https://your-domain.com/23022026/"
}
```

## Environment

Copy `.env.example` to `.env` and fill values:

```bash
cp .env.example .env
```

Required:

- `HOOK_BEARER_TOKEN`
- `GHOST_ADMIN_API_URL`
- `GHOST_ADMIN_API_KEY`

Defaults:

- `PORT=8787`
- `WEEK_TIMEZONE=Asia/Kolkata`

## Local run

```bash
bun install
bun run src/server.mjs
```

`bun install` will generate `bun.lock`.

Health check:

```bash
curl http://127.0.0.1:8787/health
```

Test request:

```bash
curl -X POST http://127.0.0.1:8787/add-tweet \
  -H "Authorization: Bearer $HOOK_BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://x.com/jack/status/20"}'
```

## Ghost requirements

1. Create a Custom Integration in Ghost Admin and copy its Admin API key.
2. Ensure site-level Code Injection (Footer) includes:

```html
<script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>
```

Without this script, posts may render as blockquotes rather than full X embeds.

## systemd deployment (on Ghost VM)

1. Copy project to `/opt/ghost-hooks/website-sync`.
2. Install dependencies:

```bash
cd /opt/ghost-hooks/website-sync
bun install
```

3. Create `.env`.
4. Install service:

```bash
sudo cp deploy/add-tweet.service /etc/systemd/system/add-tweet.service
sudo systemctl daemon-reload
sudo systemctl enable --now add-tweet
```

5. Check logs:

```bash
sudo journalctl -u add-tweet -f
```

If your VM does not use a `ghost` user/group, update `User` and `Group` in the service file before enabling.

## Nginx route

Add contents of `deploy/nginx-snippet.conf` inside your existing Ghost `server {}` block, then:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Public endpoint becomes:

`POST https://<your-domain>/hooks/add-tweet`

## iPhone Shortcut setup

1. Open Shortcuts -> `+` -> New Shortcut.
2. In shortcut settings:
- Enable `Show in Share Sheet`.
- Set accepted input to `URLs`.
3. Add action `Get URLs from Input` (or use `Shortcut Input` directly).
4. Add action `Get Contents of URL`:
- URL: `https://<your-domain>/hooks/add-tweet`
- Method: `POST`
- Headers:
  - `Authorization` = `Bearer <HOOK_BEARER_TOKEN>`
  - `Content-Type` = `application/json`
- Request body: JSON
  - `url` = shared URL variable
5. Add action `Show Notification` with response text.

Now when you share a tweet from iPhone, choose this shortcut to add it to your weekly roundup.
