# ChemistTasker Landing Page & Backend Hub Integration & Deployment Guide

This guide is tailored specifically for the ChemistTasker backend and DevOps engineers. It provides end-to-end instructions on how to integrate the Django `public_hub` application into your existing Django API and deploy the Next.js landing frontend.

---

## Part 1: Backend Integration (Django)

The `backend/django_public_hub` folder contains the `public_hub` application that powers the public articles (blog & news), comments, moderation, bookmarks, and emoji reactions.

### Step 1.1: Copy App Directory
Copy the directory `backend/django_public_hub/public_hub` into your main Django repository's app folder (e.g. alongside `accounts/`, `shifts/`, `billing/`).

### Step 1.2: Update Django `settings.py`

1. **Add to `INSTALLED_APPS`**:
   ```python
   INSTALLED_APPS = [
       # ... your existing apps
       'public_hub',
   ]
   ```

2. **Verify Media & Email Settings**:
   Ensure `MEDIA_URL` and `MEDIA_ROOT` are configured (used for article cover images and author avatars):
   ```python
   MEDIA_URL = '/media/'
   MEDIA_ROOT = os.path.join(BASE_DIR, 'media')
   ```

3. **Email Templates**:
   Copy `backend/django_public_hub/templates/emails/hub_post_tagged.txt` to your Django templates directory (e.g. `templates/emails/hub_post_tagged.txt`). This template is sent when users are tagged or notified about replies.

### Step 1.3: Update Main `urls.py`

Wire in the `public_hub` API endpoints under `/api/public-hub/`:

```python
from django.urls import path, include

urlpatterns = [
    # ... existing routes
    path('api/public-hub/', include('public_hub.urls')),
]
```

### Step 1.4: Apply Database Migrations

Run Django migrations to create the hub database tables:

```bash
python manage.py migrate public_hub
```

**Database Models Created**:
- `HubCategory`: Article categories (e.g. Clinical, Pharmacy Operations, Industry News, Career).
- `HubPost`: Articles and news posts with publication status, slug, cover image, reading time, view counts, and author relationship.
- `HubComment`: Threaded user comments and replies on articles with soft-deletion and reporting flags.
- `HubReaction`: Emoji reactions (thumbs up, heart, applause, insightful) on articles and comments.
- `HubBookmark`: User-saved articles.

### Step 1.5: Seed Preview / Initial Content (Optional)

To immediately populate the landing page and blog with realistic articles and sample data:

```bash
python manage.py seed_hub_preview
```

### Step 1.6: Run Tests

Run the included automated tests to ensure compatibility with your environment:

```bash
python manage.py test public_hub
```
*(All 14 tests should pass).*

---

## Part 2: Frontend Deployment (Next.js 16)

The `frontend/landing_next` directory is a Next.js 16 application using the modern App Router and Turbopack compiler.

### Step 2.1: Environment Variables Configuration

Create a `.env.production` (or configure your hosting provider's environment variables dashboard):

| Variable Name | Required | Default / Example | Purpose |
| :--- | :---: | :--- | :--- |
| `PLATFORM_API_URL` | **Yes** | `https://api.chemisttasker.com/api` | Upstream Django API endpoint for shifts, auth, and platform data |
| `HUB_API_URL` | **Yes** | `https://api.chemisttasker.com/api` | Upstream Django API for public hub articles and comments |
| `NEXT_PUBLIC_SITE_URL` | **Yes** | `https://chemisttasker.com` | Base canonical domain of the public frontend |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Optional | `""` | Google reCAPTCHA v3 site key for contact and registration forms |
| `PORT` | Optional | `3000` | Port for the Node server process |

### Step 2.2: How the API Proxies Work

The Next.js application acts as a reverse proxy for client-side API requests:
- Client fetches `/api/platform/*` ➔ Proxied server-side to `${PLATFORM_API_URL}/*`
- Client fetches `/api/hub/*` ➔ Proxied server-side to `${HUB_API_URL}/public-hub/*`

**Why this is advantageous**:
1. **No CORS Headers Needed**: Browser requests are same-origin (`https://chemisttasker.com/api/...`), completely eliminating CORS preflight overhead and cross-site cookie restrictions.
2. **HttpOnly Session Cookies**: Session tokens (`hub_access`, `hub_refresh`) are stored in secure, `httpOnly`, `sameSite: 'lax'` cookies, preventing XSS token theft.

### Step 2.3: Production Build & Deployment Options

#### Option A: Node.js / VM / Container Deployment
```bash
cd frontend/landing_next
npm ci --only=production
npm run build
npm run start -- --port 3000
```

#### Option B: Dockerfile Example
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3000
CMD ["npm", "start"]
```

#### Option C: Vercel / AWS Amplify / Cloudflare
- **Framework Preset**: Next.js
- **Root Directory**: `frontend/landing_next`
- **Build Command**: `npm run build`
- **Output Directory**: `.next`

---

## Part 3: Verification & Smoke Test Checklist

Once both backend and frontend are running:
1. **Homepage**: Visit `http://localhost:3000` (or your domain). Confirm animations, hero, shift search, and testimonials render smoothly.
2. **Paediatric Calculator**: Visit `/calculator`. Test changing patient age and weight; verify the dose calculations, suspension volume visuals, and medicine regimens update in real time.
3. **Blog & News**: Visit `/blog` and `/news`. Confirm articles appear (loaded from Django API via `/api/hub/articles/`).
4. **Public Job Board**: Visit `/shifts/public-board`. Verify shifts render (if Django API has active shifts).
5. **SEO & Meta**: Check `/robots.txt` and `/sitemap.xml`.
