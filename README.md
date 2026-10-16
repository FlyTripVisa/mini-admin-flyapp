# Fly Trip Visa — Miniprogram Admin CRM

A full-stack Cloudflare Workers admin CRM with AI agents, client management, auto-email, and PDF invoice generation. Matches the FlyTripVisa homepage design.

## 🚀 Quick Start

```bash
npm install
npm run dev          # Local dev server
npm run db:init      # Initialize D1 database
npm test             # Run tests
npm run deploy       # Deploy to Cloudflare
```

## 🔐 Admin Login

- **URL:** `/admin`
- **Username:** `flytripvisa`
- **Password:** `pass1122`

## 📁 Project Structure

```
miniprogram-admin/
├── src/
│   ├── index.ts              # MyAgent — basic stateful agent
│   ├── chat-agent.ts         # ChatAgent — AI chat with history
│   └── server.ts             # Worker: auth, CRM, email, PDF, routing
├── public/
│   ├── index.html            # Homepage (FlyTripVisa style)
│   ├── admin/
│   │   ├── index.html        # Login page
│   │   └── dashboard.html    # CRM dashboard
│   ├── css/style.css         # Shared styles
│   └── js/main.js            # Frontend logic
├── tests/
│   └── index.spec.ts         # Tests
├── schema.sql                # D1 database schema
├── wrangler.jsonc            # All bindings configured
└── package.json
```

## 🔧 Features

### Admin CRM
- **Client Management** — CRUD operations via D1 database
- **Auto Email** — Notifications on registration, status changes, invoices
- **PDF Invoices** — Generated via Browser Rendering API, stored in R2
- **Dashboard Stats** — Total clients, pending, approved, revenue

### AI Integration
- **AI Chat** (`/api/ai-chat`) — Workers AI powered assistant
- **MyAgent** — Durable Object stateful agent
- **ChatAgent** — Persistent conversation history

### All Cloudflare Bindings
- AI & AI Search
- D1 (2 databases)
- R2 (2 buckets)
- KV namespace
- Browser Rendering
- Durable Objects

## 📡 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/admin/login` | POST | Admin authentication |
| `/api/admin/stats` | GET | Dashboard statistics |
| `/api/admin/clients` | GET/POST | List/create clients |
| `/api/admin/clients/:id` | PUT/DELETE | Update/delete client |
| `/api/admin/invoices` | GET/POST | List/create invoices |
| `/api/admin/invoices/:id/pdf` | GET | Download invoice PDF |
| `/api/admin/emails` | GET | Email logs |
| `/api/ai-chat` | POST | AI assistant |
| `/api/health` | GET | Health check |

## 🗄️ Database Schema

Run `npm run db:init` to create:
- `clients` — Client records
- `invoices` — Invoice records with PDF URLs
- `messages` — ChatAgent conversation history

## 🎨 Design

Matches the FlyTripVisa homepage:
- Dark theme (#111 background, #07c160 green accents)
- Responsive mobile-first layout
- Visa card grid with hover effects
- AI chat popup overlay
- Full admin dashboard with sidebar navigation
