# ChemistTasker Landing Page & Backend Hub Deployment Package

Welcome! This package contains all required frontend and backend source files to deploy the new ChemistTasker landing page, blog, news hub, paediatric dosing calculator, and public job/talent boards.

> **Clean Package Guarantee**: This package contains **only essential source code, configurations, assets, and tests**. All heavy runtime dependencies (`node_modules`), build caches (`.next`), Python bytecode (`__pycache__`, `*.pyc`), and local databases have been omitted.

---

## 📦 What's in this Package

```
chemisttasker-landing-deploy-package/
├── README.md                      # This overview document
├── DEPLOYMENT-INSTRUCTIONS.md     # Step-by-step integration and deployment guide
├── MANIFEST.txt                   # Complete file-by-file inventory
├── frontend/
│   └── landing_next/              # Next.js 16 (App Router + Turbopack) application
│       ├── app/                   # App router pages, layouts, globals, and API proxies
│       │   ├── (hub)/             # Blog, news, article details, comments, and community auth
│       │   ├── (public)/          # Public boards, contact, login, register, policies, onboarding
│       │   ├── calculator/        # Paediatric anti-infective dosing calculator page
│       │   ├── api/               # Proxy endpoints (/api/platform/*, /api/hub/*)
│       │   ├── page.tsx           # Main homepage / landing page
│       │   └── layout.tsx         # Root layout with fonts, metadata, and analytics
│       ├── features/
│       │   └── paediatric-calculator/ # Clinical dosing engine, medicines, regimens, and UI components
│       ├── lib/                   # Hub data-fetching and server-side utilities
│       ├── migrated/              # Shared React components, theme, auth context, shift/talent boards
│       ├── public/                # Logos, pharmacist photos, wordmarks, navigation headers
│       ├── shared-core/           # Skills catalog, API clients, domain models, pricing utilities
│       ├── package.json           # Frontend dependencies
│       ├── tsconfig.json          # TypeScript compiler configuration
│       └── next.config.ts         # Next.js runtime configuration
└── backend/
    └── django_public_hub/         # Django backend app and integration reference
        ├── public_hub/            # Standalone Django app for blog, news, comments, reactions
        │   ├── models.py          # HubCategory, HubPost, HubComment, HubReaction, HubBookmark
        │   ├── views.py           # REST API views for articles, comments, reactions, moderation
        │   ├── serializers.py     # DRF serializers
        │   ├── urls.py            # API URL routing
        │   ├── admin.py           # Django admin dashboard registration
        │   ├── migrations/        # Database migrations (0001_initial.py)
        │   ├── management/        # 'seed_hub_preview' command to seed initial articles
        │   └── tests.py           # 14 automated unit tests
        ├── core/                  # Reference settings.py and urls.py showing integration lines
        ├── templates/             # Email templates for tagged users / notifications
        ├── requirements.txt       # Backend dependencies
        └── manage.py              # Runner for tests and seeding
```

---

## 🚀 Quick Start for the Backend Developer

### 1. Integrate the Django App (`public_hub`)

1. Copy `backend/django_public_hub/public_hub` into your main ChemistTasker Django project directory.
2. In your Django `settings.py`, append `'public_hub'` to `INSTALLED_APPS`:
   ```python
   INSTALLED_APPS = [
       ...,
       'public_hub',
   ]
   ```
3. In your main Django `urls.py`, include the hub routes:
   ```python
   urlpatterns = [
       ...,
       path('api/public-hub/', include('public_hub.urls')),
   ]
   ```
4. Run migrations:
   ```bash
   python manage.py migrate
   ```
5. *(Optional)* Seed initial blog & news posts:
   ```bash
   python manage.py seed_hub_preview
   ```
6. Run tests to confirm everything is working:
   ```bash
   python manage.py test public_hub
   ```

### 2. Deploy the Next.js Frontend

1. Navigate to the frontend directory:
   ```bash
   cd frontend/landing_next
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure environment variables in `.env` (or in your hosting provider's dashboard):
   ```env
   # Backend Django API base URL (server-side calls)
   PLATFORM_API_URL=https://api.chemisttasker.com/api
   HUB_API_URL=https://api.chemisttasker.com/api

   # Public frontend URL
   NEXT_PUBLIC_SITE_URL=https://chemisttasker.com

   # Optional reCAPTCHA key for forms
   NEXT_PUBLIC_RECAPTCHA_SITE_KEY=your_key_here
   ```
4. Build and start:
   ```bash
   npm run build
   npm start
   ```

---

## 🔑 Key Features Overview

| Feature | Route | Description |
| :--- | :--- | :--- |
| **New Landing Page** | `/` | Hero section, animated benefits, shift explorer, software skills, testimonials, FAQs |
| **Paediatric Dosing Calculator** | `/calculator` | Clinical dose calculator for paediatric anti-infectives with suspension visualizer |
| **Blog Listing & Detail** | `/blog`, `/blog/[slug]` | Rich articles, categorization, author details, read-time estimates |
| **News Listing & Detail** | `/news`, `/news/[slug]` | Pharmacy and industry news updates |
| **Article Discussion** | Integrated in `/blog/*` & `/news/*` | Comments, threaded replies, bookmarking, and emoji reactions |
| **Public Shifts Board** | `/shifts/public-board` | Live shift listings with rate filters, calendar view, and quick apply |
| **Public Talent Board** | `/talent/public-board` | Verified locum pharmacist directory with location filters |
| **Public Authentication** | `/login`, `/register`, `/password-reset` | Seamless entry points into the main platform |

For detailed technical instructions, see [DEPLOYMENT-INSTRUCTIONS.md](./DEPLOYMENT-INSTRUCTIONS.md).
