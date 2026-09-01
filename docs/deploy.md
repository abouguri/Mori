# Deploying Mori

A split deploy: the Next.js frontend on Vercel, the API + worker on a free
Google Cloud `e2-micro` VM, Postgres on Neon, Redis on Upstash, media on
Cloudflare R2. Every piece here has a genuine free tier at the scale a new
app runs at — see the cost breakdown in the PR/commit history if you want
the research behind these picks. Total: **$0/month**, at the cost of more
manual ops than a managed PaaS (you own VM updates, uptime, and backups
outside what Neon/Upstash already give you for their own services).

**Why GCP over Oracle Cloud:** Oracle's Always Free VM (2 OCPU / 12 GB RAM,
any region) is the roomier option if their signup flow works for you —
but it rejects a meaningful fraction of legitimate signups outright with
a generic fraud-check error ("unable to finalize your registration"),
independent of VPN use, card type, or anything else identifiable. GCP's
e2-micro is smaller (1 GB RAM, US regions only) but its signup is
reliable. If Oracle works for you, use it instead and skip the swap-file
step below — 12 GB is enough headroom not to need it.

Do these roughly in order — later steps need values from earlier ones.

## 1. Neon (Postgres)

1. Create a project at [neon.tech](https://neon.tech) (free, no card).
2. From the project dashboard, copy the connection string. It looks like
   `postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require`.
3. Change the scheme from `postgresql://` to `postgresql+asyncpg://` —
   that's the only edit needed. Keep `?sslmode=require` as-is;
   `app/db.py::translate_database_url` handles it (asyncpg doesn't accept
   `sslmode` directly — confirmed directly, it's a hard `TypeError` if you
   don't translate it, not a soft ignore).
4. Save the result as `DATABASE_URL` for step 6.

## 2. Upstash (Redis)

1. Create a database at [upstash.com](https://upstash.com) (free, no
   card) — pick a region close to wherever you put the GCP VM (us-central1 etc.).
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

## 4. Google Cloud (the VM running `api` + `worker`)

1. Sign up at [cloud.google.com/free](https://cloud.google.com/free) and
   create a project. A card is required for identity verification even
   though the Always Free resources themselves aren't charged.
2. Create a compute instance (Compute Engine → VM instances → Create
   Instance):
   - **Machine type**: `e2-micro`
   - **Region**: one of `us-west1`, `us-central1`, `us-east1` — Always
     Free only applies in these three; any other region bills normally.
   - **Boot disk**: Ubuntu, up to 30 GB standard persistent disk (the
     free allowance) — the default is fine.
   - Under **Firewall**, check "Allow HTTP traffic" and "Allow HTTPS
     traffic" — this creates the firewall rules for ports 80/443 that
     Let's Encrypt's HTTP-01 challenge and HTTPS itself both need (GCP's
     default network otherwise only opens SSH).
   - Create it, and generate/download an SSH key when prompted, or use
     `gcloud compute ssh` (installs its own key automatically) — either
     works with the steps below.
3. Note the instance's public IP — it's static for the life of the
   instance (as long as you don't stop/restart with an ephemeral IP
   config; the console shows whether it's ephemeral or static), and
   you'll need it for step 5.
4. SSH in and install Docker:
   ```sh
   ssh -i your-key.pem you@<instance-public-ip>
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker $USER
   # log out and back in for the group change to take effect
   ```
5. **Add swap** — e2-micro's 1 GB RAM isn't enough headroom for the
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
3. Point it at the GCP VM's public IP from step 4.3 and save.
4. Save `mori-api.duckdns.org` as `API_DOMAIN` for step 6. If the VM's IP
   ever changes (it won't unless you recreate the instance), update it
   here — DuckDNS also has a small curl-based updater script on their
   site if you want that automated.

## 6. Deploy the backend

On the GCP VM:

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
- `CORS_ORIGINS` — leave as a placeholder for now
  (`["https://placeholder.vercel.app"]`); you'll fix this in step 8 once
  the real Vercel URL exists.
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

Back on the GCP VM, edit `.env`:

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

- **VM updates**: `apt update && apt upgrade` on the GCP VM yourself,
  periodically. Nothing automates this.
- **Backups**: Neon and Upstash back up their own services; R2 media
  isn't separately backed up here. Nothing on the GCP VM needs backing
  up since it's stateless (api + worker only — no volumes with real data).
- **Redeploys**: `git pull && docker compose -f docker-compose.prod.yml up
  -d --build` on the VM for backend changes; Vercel redeploys the
  frontend automatically on push if you connect the GitHub repo.
