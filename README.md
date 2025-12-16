# Webhook Receiver (minimal)

Express + MongoDB service with one sink endpoint to capture any webhook payloads for inspection.

## Setup

1. Node.js 18+ recommended.
2. Install dependencies:

```bash
npm install
```

3. Environment variables (optional):

- `PORT` (default `3000`)
- `MONGO_URI` (default `mongodb://127.0.0.1:27017`)
- `MONGO_DB` (default `webhook`)
- `MONGO_REQUESTS_COLLECTION` (default `requests`)
  

## Run

```bash
npm run dev
```

Server starts at `http://localhost:3000`.

## Deploy

- Vercel: import repo, framework "Other", set env `MONGO_URI`, `MONGO_DB` (optional), `MONGO_REQUESTS_COLLECTION` (optional). `vercel.json` routes all paths to the function.

## Endpoints

- `ANY /webhook` — stores any inbound request (method, path, headers, raw and parsed body)
- `GET /health` — healthcheck

## Test with curl

JSON:

```bash
curl -X POST http://localhost:3000/webhook \
	-H "Content-Type: application/json" \
	-d '{"ok":true,"ts":"'"$(date -u +%FT%TZ)'"'}'
```

  

## Notes

- Requires MongoDB. Headers stored as JSON; body stored as raw text and, when JSON, also as parsed JSON string.


