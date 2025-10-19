# Webhook Test Receiver

Simple Express + MongoDB service to receive webhook POSTs from devices (e.g., Ubiquiti camera) and store them for inspection.

## Setup

1. Node.js 18+ recommended.
2. Install dependencies:

```bash
npm install
```

3. Environment variables (optional):

- `PORT` (default `3000`)
- `MONGO_URI` (default `mongodb://127.0.0.1:27017`)
- `MONGO_DB` (default `webhook_test`)
- `MONGO_COLLECTION` (default `events`)
 - `MONGO_COLLECTION` (default `events`)
 - `MONGO_REQUESTS_COLLECTION` (default `requests`)
  

## Run

```bash
npm run dev
```

Server starts at `http://localhost:3000`.

## Deploy to Vercel via GitHub

1. Create a GitHub repo and push this project:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M master
git remote add origin git@github.com:<you>/<repo>.git
git push -u origin master
```

2. In Vercel, "Add New... > Project" and import your GitHub repo.
3. Framework preset: "Other". Root: repository root.
4. Environment Variables in Vercel:
   - `MONGO_URI`
   - `MONGO_DB` (optional)
   - `MONGO_COLLECTION` (optional)
   - `MONGO_REQUESTS_COLLECTION` (optional)
5. Deploy. Your API will be served by the serverless function at the root path using `vercel.json` routing.

## Endpoints

- `POST /webhook` — accepts JSON, URL-encoded forms, and common text/xml payloads
  - Responds `202` with `{ id }`
- `GET /events?limit=100&offset=0` — list recent events
- `GET /events/:id` — fetch a single event
- `ANY /requests*` — stores any inbound request (method, path, headers, raw and parsed body)
- `GET /requests?limit=100&offset=0` — list recent captured requests
- `GET /requests/:id` — fetch a single captured request
- `GET /health` — healthcheck

## Test with curl

JSON:

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{"device":"ubiquiti","event":"motion","timestamp":"2025-10-18T12:00:00Z"}'
```

Form-encoded:

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "event=motion&camera=lobby"
```

  

## Notes

- Requires a running MongoDB (local or cloud). Defaults connect to `127.0.0.1:27017`.
- Headers are stored as JSON. Body is stored as raw text and, when JSON, also as parsed JSON string for convenience.


