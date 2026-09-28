# Alarm Trends API

A Node.js REST API that fetches Google Trends data for an Android Alarm Clock App.

## Endpoints

| Endpoint | Description |
|---|---|
| `GET /` | Health check |
| `GET /api/trending?geo=IN&category=all` | Daily trending topics |
| `GET /api/realtime?geo=IN` | Realtime trending stories |
| `GET /api/alarm-trends?geo=IN` | Smart alarm trends (time-based) |
| `GET /api/search?keyword=alarm&geo=IN` | Search interest (7 days) |
| `GET /api/categories` | Available categories & geo codes |

## Deploy to Render.com

1. Push this repo to GitHub
2. Go to render.com → New Web Service
3. Connect your GitHub repo
4. Build Command: `npm install`
5. Start Command: `npm start`
6. Done!

## Local Run

```bash
npm install
node server.js
```
