# 11hotel

Source for [11hotel.vip](https://11hotel.vip/), an Astro site for browsing NOT A HOTEL THE KEY stay listings and related information.

## Local development

```sh
npm ci
cp .env.example .env
npm run dev
```

Set the required values in `.env` before using services that need credentials. The `.env` file is ignored by Git.

## Build

```sh
npm run build
```

The site uses the Cloudflare adapter. Deployment settings are in `astro.config.mjs` and `wrangler.toml`; database migrations are in `supabase/migrations/`.
