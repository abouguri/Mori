# Deploying Mori

A split deploy: the Next.js frontend on Vercel, the API + worker on an
AWS EC2 `t3.micro`, Postgres on Neon, Redis on Upstash, media on
Cloudflare R2. Neon/Upstash/R2 are genuinely free indefinitely at this
scale. The compute piece is not, currently — see the note below — so this
is **not a permanent $0/month setup as written**, just the least-friction
starting point; revisit before the credit runs out.

**Why AWS, and its real cost:** Oracle Cloud's Always Free VM (2 OCPU /
12 GB RAM, any region, genuinely free forever) is the best option if
their signup accepts you — it rejects a meaningful fraction of legitimate
signups outright with a generic fraud-check error, independent of VPN
use, card type, or anything else identifiable. GCP's `e2-micro` (1 GB
RAM, US regions only, genuinely free forever) is the fallback if Oracle
won't cooperate, but as of March 2026 some new GCP accounts are required
to prepay a one-time $10 before billing activates at all (still a
one-time cost, not recurring — this doc used GCP until this requirement
showed up). AWS EC2 has no such friction and no per-request prepayment,
but its free tier is not indefinite the way Oracle/GCP's Always Free is:
new-ish AWS accounts get a **consumable credit balance** (not a
time-boxed 12-month offer — that legacy deal is gone for accounts created
after July 2025), and EC2 usage draws down against it at normal hourly
rates. A `t3.micro` running 24/7 plus ~30 GB of storage costs roughly
**$10/month** in actual usage — cheap, but very much not $0, it's just
paid for by credit until that credit is gone. Check your remaining
balance at
[console.aws.amazon.com/billing/home#/freetier](https://console.aws.amazon.com/billing/home#/freetier)
and divide by ~$10/month to know your runway. When it's close to running
out, either move to Oracle/GCP (steps unchanged, just swap which cloud
you SSH into) or accept paying AWS directly from then on.

Do these roughly in order — later steps need values from earlier ones.

## 1. Neon (Postgres)

1. Create a project at [neon.tech](https://neon.tech) (free, no card).
2. From the project dashboard, copy the **direct** (non-pooled) connection
   string, not the "-pooler" one — it looks like
   `postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require`. PgBouncer's
   transaction-mode pooling (the pooler endpoint) conflicts with
   asyncpg's prepared-statement cache unless you explicitly disable it,
   so direct is the simpler default here.
3. Change the scheme from `postgresql://` to `postgresql+asyncpg://` —
   that's the only edit needed. Keep `?sslmode=require` as-is;
   `app/db.py::translate_database_url` handles it (asyncpg doesn't accept
   `sslmode` directly — confirmed directly, it's a hard `TypeError` if you
   don't translate it, not a soft ignore).
4. Save the result as `DATABASE_URL` for step 6.

## 2. Upstash (Redis)

1. Create a database at [upstash.com](https://upstash.com) (free, no
   card) — pick a region close to wherever your EC2 instance ends up (us-east-1 etc.).
2. Copy the connection string in `redis://default:PASSWORD@HOST:PORT`
   form from the database's dashboard.
3. Save it as `REDIS_URL` for step 6.

## 3. Cloudflare R2 (media storage)

1. Enable R2 in the Cloudflare dashboard (free tier, no card needed for
   the free allowance) and create a bucket, e.g. `mori-media`.
2. Under the bucket's Settings, enable public access via either an
   `r2.dev` subdomain or a custom domain — you need a browser-reachable
   URL for `S3_PUBLIC_URL`.
3. Under **R2 → Manage API tokens**, create a token scoped to this bucket
   with read+write. You get an Access Key ID and Secret Access Key —
   these only display once, save them now.
4. Your account ID is in the R2 dashboard's sidebar. Save:
   - `S3_ENDPOINT_URL=https://ACCOUNT_ID.r2.cloudflarestorage.com`
   - `S3_PUBLIC_URL=` whatever public URL you enabled in step 2
   - `S3_ACCESS_KEY` / `S3_SECRET_KEY` from step 3
   - `S3_BUCKET=mori-media`

## 4. AWS EC2 (the VM running `api` + `worker`)

1. In the EC2 console, **Launch Instance**:
   - **Name**: `mori`
   - **AMI**: Ubuntu Server 24.04 LTS
   - **Instance type**: `t3.micro` (2 vCPU burstable, 1 GB RAM — the
     same tight-RAM situation as GCP's e2-micro, see the swap step below)
   - **Key pair**: create a new one, download the `.pem` file — this is
     the only time you get it.
   - **Network settings → Edit**: add rules for HTTP (port 80) and HTTPS
     (port 443) from Anywhere (`0.0.0.0/0`), alongside the default SSH
     rule. Let's Encrypt's HTTP-01 challenge and HTTPS itself both need
     these open — EC2's default security group otherwise only opens 22.
   - **Storage**: 30 GB gp3 is plenty.
2. **Allocate an Elastic IP and associate it with the instance** (EC2 →
   Network & Security → Elastic IPs → Allocate, then Actions → Associate
   Elastic IP address). This step matters: a plain EC2 instance's public
   IP is **not stable** — it changes if the instance ever stops and
   restarts, which would silently break the DNS record from step 5. An
   Elastic IP is free as long as it's attached to a running instance.
3. SSH in and install Docker:
   ```sh
   chmod 400 your-key.pem
   ssh -i your-key.pem ubuntu@<elastic-ip>
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker $USER
   # log out and back in for the group change to take effect
   ```
4. **Add swap** — `t3.micro`'s 1 GB RAM isn't enough headroom for the
   worker image's FSRS optimizer job (torch + pandas alone need several
   hundred MB just to import) without it. The optimizer job isn't
   latency-sensitive, so swapping during it is a fine tradeoff to keep
   the feature working on a box this small:
   ```sh
   sudo fallocate -l 4G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   ```

## 5. DuckDNS (free subdomain for the API)

Caddy's automatic HTTPS needs a real domain pointed at the VM — Let's
Encrypt won't issue a certificate otherwise, and a Vercel-hosted (HTTPS)
frontend can't fetch from a non-HTTPS API anyway (browsers block that as
mixed content).

1. Sign in at [duckdns.org](https://www.duckdns.org) (GitHub/Google
   login, no separate account).
2. Add a subdomain, e.g. `mori-api` → `mori-api.duckdns.org`.
3. Point it at the Elastic IP from step 4.2 and save.
4. Save `mori-api.duckdns.org` as `API_DOMAIN` for step 6. The Elastic IP
   won't change unless you release it, so this shouldn't need touching
   again — DuckDNS also has a small curl-based updater script on their
   site if you want extra insurance anyway.

## 6. Deploy the backend

On the EC2 instance:

```sh
git clone <your-fork-url> mori
cd mori
cp .env.prod.example .env
```

Fill in `.env` with every value collected above, plus:
- `JWT_SECRET` — generate with
  `python3 -c "import secrets; print(secrets.token_urlsafe(48))"`.
  Don't reuse the dev default; `app/config.py`'s fallback is
  intentionally named to make that obvious.
- `CORS_ORIGINS` — the exact Vercel origin, e.g.
  `["https://your-project.vercel.app"]`. If you don't have it yet, leave
  a placeholder and fix it in step 8 once it exists.
- `COOKIE_SECURE=true` and `COOKIE_SAMESITE=none` — required because the
  frontend and API are on different domains in this deploy. `SameSite=Lax`
  cookies are never sent on cross-site fetch/XHR, only on same-site or
  top-level-navigation requests — see the comments in
  `app/routers/auth.py`.

Then:

```sh
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml run --rm api alembic upgrade head
docker compose -f docker-compose.prod.yml up -d
```

Verify: `curl https://mori-api.duckdns.org/health` (give Caddy a minute
on first start — it's requesting the Let's Encrypt certificate) should
return `{"status":"ok"}`.

## 7. Deploy the frontend to Vercel

1. Import the repo at [vercel.com/new](https://vercel.com/new).
2. **Root Directory**: `apps/web`. This is an npm workspace monorepo —
   `apps/web` depends on `packages/renderer` via the workspace link, so
   the install has to happen from the repo root, not `apps/web` alone
   (the CI workflow does the same thing for the same reason — see
   `.github/workflows/ci.yml`'s comment). Override:
   - **Install Command**: `cd ../.. && npm install`
   - **Build Command**: `cd ../.. && npm run build --workspace=apps/web`
3. Add the environment variable `NEXT_PUBLIC_API_URL` =
   `https://mori-api.duckdns.org` (or whatever `API_DOMAIN` you set).
4. Deploy. Note the resulting `*.vercel.app` URL.

## 8. Close the loop: point CORS at the real frontend URL

Back on the EC2 instance, edit `.env`:

```
CORS_ORIGINS=["https://your-actual-project.vercel.app"]
```

Then:

```sh
docker compose -f docker-compose.prod.yml up -d api
```

(only `api` needs restarting — `worker` doesn't read `CORS_ORIGINS`.)

## Verify end to end

Open the Vercel URL, register an account, import a deck. If login
succeeds but every subsequent request 401s, it's almost always the
cookie/CORS pairing — double check `COOKIE_SAMESITE=none`,
`COOKIE_SECURE=true`, and that `CORS_ORIGINS` is the exact Vercel origin
(no trailing slash, exact scheme+host).

## What's still self-managed

- **VM updates**: `apt update && apt upgrade` on the EC2 instance yourself,
  periodically. Nothing automates this.
- **Backups**: Neon and Upstash back up their own services; R2 media
  isn't separately backed up here. Nothing on the EC2 instance needs backing
  up since it's stateless (api + worker only — no volumes with real data).
- **Redeploys**: `git pull && docker compose -f docker-compose.prod.yml up
  -d --build` on the VM for backend changes; Vercel redeploys the
  frontend automatically on push if you connect the GitHub repo.
