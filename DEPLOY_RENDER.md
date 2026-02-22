# Deploying Band Scheduler on Render (Free)

## What this setup does
- Hosts this project as a **Node web service** on Render's free tier.
- Serves the frontend and API from one service.
- Uses the included `/Users/johnreynolds/Documents/Band_Scheduler/render.yaml` Blueprint file.

## Shared-data mode
- The frontend now auto-detects `/api/health` and uses the shared backend (`/api/db`) when available.
- If the API is unavailable, it falls back to browser localStorage.

## Data persistence choices
- If `DATABASE_URL` is set, the server stores data in Postgres (recommended for persistence).
- If `DATABASE_URL` is not set, it stores data in `data/app-db.json` on the service filesystem.
- Render free web services may restart/redeploy, so file-based mode is best for demos only.

## Free Postgres options for `DATABASE_URL`
- [Neon](https://neon.tech) (free tier)
- [Supabase](https://supabase.com) (free tier Postgres)

From your chosen provider, copy the Postgres connection string and add it in Render:
1. Open your Render service.
2. Go to **Environment**.
3. Add `DATABASE_URL` with the connection string value.
4. Redeploy service.

## Option A: One-click with Blueprint (recommended)
1. Push this repo to GitHub.
2. In Render, go to **New +** -> **Blueprint**.
3. Select your repo.
4. Render detects `render.yaml` and proposes a Node web service.
5. Click **Apply**.

Render will install dependencies and give you a URL like:
- `https://your-service-name.onrender.com`

## Option B: Manual Web Service setup
1. In Render, go to **New +** -> **Web Service**.
2. Connect your repo.
3. Use:
   - Runtime: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Choose the **Free** plan and deploy.
5. Optional but recommended: add `DATABASE_URL` to use a hosted Postgres DB.

## After deploy
- Open `/index.html` from your Render URL.
- Verify pages load:
  - `/calendar.html`
  - `/bands.html`
  - `/band_profile.html?id=<bandId>`
  - `/user_profile.html?id=<userId>`

## Notes
- Export/download features (like `.ics`) work on the deployed service.
- Public profile pages and shared schedules now work across users when backend mode is active.
- Current backend API is intentionally simple (single shared app dataset, last-write-wins).
