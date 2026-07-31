# CityPulse AI Deployment Guide

## Overview
This guide covers deploying both the Next.js frontend and FastAPI backend to production.

## Prerequisites
- Node.js 18+ installed
- Python 3.12 installed
- Vercel CLI installed (`npm install -g vercel`)
- Docker and Docker Compose installed (for backend)
- GitHub account (for Vercel integration) or Vercel account

## Frontend Deployment (Vercel)

### Step 1: Install Vercel CLI
```bash
npm install -g vercel
```

### Step 2: Login to Vercel
```bash
vercel login
```

### Step 3: Deploy Frontend
From the `/frontend` directory:
```bash
cd frontend
vercel --prod
```

### Step 4: Configure Environment Variables in Vercel
After deployment, go to Vercel dashboard → Settings → Environment Variables:
- `NEXT_PUBLIC_BACKEND_URL`: Your deployed backend URL (e.g., `https://your-backend.onrender.com`)

### Step 5: Verify Deployment
- Visit the Vercel URL provided after deployment
- Test the signin → redirect flow
- Verify all pages load with the new dark theme

## Backend Deployment Options

### Option 1: Render (Recommended for Python + Background Tasks)

#### Step 1: Create Render Account
Go to [render.com](https://render.com) and create an account

#### Step 2: Create Web Service
1. Click "New +" → "Web Service"
2. Connect your GitHub repository
3. Configure:
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Environment Variables** (from `.env.example`):
     - `GOOGLE_API_KEY`: Your Google API key
     - `GEMMA_MODEL_ID`: `google/gemma-4-12B-it`
     - `DATABASE_URL`: PostgreSQL connection string (Render provides this)
     - `OLLAMA_BASE_URL`: `http://localhost:11434` (or external Ollama instance)
     - `CORS_ORIGINS`: Add your Vercel frontend URL (e.g., `https://your-app.vercel.app`)

#### Step 3: Deploy
Click "Create Web Service" and wait for deployment

#### Step 4: Note the Backend URL
Copy the URL provided (e.g., `https://your-backend.onrender.com`)

### Option 2: Railway

#### Step 1: Create Railway Account
Go to [railway.app](https://railway.app) and create an account

#### Step 2: Create New Project
1. Click "New Project" → "Deploy from GitHub repo"
2. Select your repository
3. Configure environment variables in the dashboard
4. Deploy

### Option 3: Self-Hosted with Docker

#### Step 1: Build and Run
From the `/backend` directory:
```bash
cd backend
docker-compose up -d
```

#### Step 2: Configure Environment
Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
# Edit .env with your values
```

#### Step 3: Access Backend
The backend will be available at `http://localhost:8000`

## Post-Deployment Configuration

### Update CORS Settings
In your backend `.env` file or deployment platform environment variables, add your frontend URL to `CORS_ORIGINS`:

```
CORS_ORIGINS=https://your-frontend.vercel.app,https://your-frontend.vercel.app/*
```

### Update Frontend Backend URL
In Vercel environment variables, set:
```
NEXT_PUBLIC_BACKEND_URL=https://your-backend-url.com
```

## Verification Checklist

- [ ] Frontend deploys successfully to Vercel
- [ ] Backend deploys successfully (Render/Railway/Docker)
- [ ] Frontend can reach backend API
- [ ] CORS settings allow frontend domain
- [ ] Signin page redirects to `/agent` after successful login
- [ ] Landing page "Launch Dashboard" button redirects to `/agent`
- [ ] All feature pages display with consistent dark theme
- [ ] Status colors (red/green/amber) remain visible
- [ ] Camera feeds, maps, and charts render correctly

## Troubleshooting

### Frontend Issues
- **Build fails**: Check `npm run build` locally first
- **Environment variables not loading**: Verify Vercel dashboard settings
- **API calls failing**: Check CORS settings and backend URL

### Backend Issues
- **Deployment fails**: Check logs in deployment platform
- **Database connection issues**: Verify DATABASE_URL format
- **CORS errors**: Ensure frontend URL is in CORS_ORIGINS

## URLs to Save
After deployment, save these URLs:
- Frontend: `https://your-app.vercel.app`
- Backend: `https://your-backend.onrender.com` (or similar)
- Admin dashboards: Vercel dashboard, Render/Railway dashboard
