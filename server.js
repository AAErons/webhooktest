require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const { insertEvent, listEvents, getEventById, insertRequest, listRequests, getRequestById } = require('./db');

const app = express();
app.set('trust proxy', true);

// Logging
app.use(morgan('combined'));

// Capture raw body for any content-type
app.use(express.raw({ type: '*/*', limit: '5mb' }));
// Also parse common types for convenience
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: ['text/*', 'application/xml', 'application/*+xml'] }));

app.get('/health', (_req, res) => {
	res.json({ status: 'ok' });
});

app.post('/webhook', async (req, res) => {
	const contentType = req.get('content-type') || '';
	const headersJson = JSON.stringify(req.headers);
	const method = req.method;
	const path = req.originalUrl;
	const queryJson = JSON.stringify(req.query || {});
	let bodyText;
	let bodyJson = null;
	let rawBodyText = undefined;

	if (Buffer.isBuffer(req.body)) {
		rawBodyText = req.body.toString('utf8');
	}

	if (typeof req.body === 'string') {
		bodyText = req.body;
		// Try to parse JSON if it looks like JSON
		if (/json/i.test(contentType)) {
			try {
				const parsed = JSON.parse(req.body);
				bodyJson = JSON.stringify(parsed);
			} catch (_e) {
				// ignore parse errors
			}
		}
	} else {
		// Object parsed by json/urlencoded parser
		try {
			bodyText = JSON.stringify(req.body);
			if (/json/i.test(contentType)) {
				bodyJson = bodyText;
			}
		} catch (_e) {
			bodyText = String(req.body);
		}
	}

	const eventRecord = {
		received_at: new Date().toISOString(),
		ip: req.ip,
		method,
		path,
		query_json: queryJson,
		content_type: contentType,
		headers_json: headersJson,
		raw_body_text: rawBodyText,
		body_text: bodyText || '',
		body_json: bodyJson,
	};

	const id = await insertEvent(eventRecord);
	return res.status(202).json({ id });
});

// Generic request sink: store anything into `requests` collection
app.all('/requests*', async (req, res) => {
	const contentType = req.get('content-type') || '';
	const headersJson = JSON.stringify(req.headers);
	const method = req.method;
	const path = req.originalUrl;
	const queryJson = JSON.stringify(req.query || {});
	let bodyText;
	let bodyJson = null;
	let rawBodyText = undefined;

	if (Buffer.isBuffer(req.body)) {
		rawBodyText = req.body.toString('utf8');
	}

	if (typeof req.body === 'string') {
		bodyText = req.body;
		if (/json/i.test(contentType)) {
			try {
				const parsed = JSON.parse(req.body);
				bodyJson = JSON.stringify(parsed);
			} catch (_e) {}
		}
	} else {
		try {
			bodyText = JSON.stringify(req.body);
			if (/json/i.test(contentType)) bodyJson = bodyText;
		} catch (_e) {
			bodyText = String(req.body);
		}
	}

	const requestDoc = {
		received_at: new Date().toISOString(),
		ip: req.ip,
		method,
		path,
		query_json: queryJson,
		content_type: contentType,
		headers_json: headersJson,
		raw_body_text: rawBodyText,
		body_text: bodyText || '',
		body_json: bodyJson,
	};

	const id = await insertRequest(requestDoc);
	return res.status(202).json({ id });
});

app.get('/events', async (req, res) => {
	const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
	const offset = parseInt(req.query.offset, 10) || 0;
	const rows = (await listEvents(limit, offset)).map((row) => ({
		...row,
		headers: safeParse(row.headers_json),
		body: safeParse(row.body_json) ?? row.body_text,
	}));
	res.json({ events: rows, limit, offset });
});

app.get('/events/:id', async (req, res) => {
	const id = String(req.params.id);
	const row = await getEventById(id);
	if (!row) return res.status(404).json({ error: 'Not found' });
	return res.json({
		...row,
		headers: safeParse(row.headers_json),
		body: safeParse(row.body_json) ?? row.body_text,
	});
});

app.get('/requests', async (req, res) => {
	const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
	const offset = parseInt(req.query.offset, 10) || 0;
	const rows = (await listRequests(limit, offset)).map((row) => ({
		...row,
		headers: safeParse(row.headers_json),
		query: safeParse(row.query_json),
		body: safeParse(row.body_json) ?? row.body_text,
	}));
	res.json({ requests: rows, limit, offset });
});

app.get('/requests/:id', async (req, res) => {
	const id = String(req.params.id);
	const row = await getRequestById(id);
	if (!row) return res.status(404).json({ error: 'Not found' });
	return res.json({
		...row,
		headers: safeParse(row.headers_json),
		query: safeParse(row.query_json),
		body: safeParse(row.body_json) ?? row.body_text,
	});
});

function safeParse(value) {
	if (!value) return null;
	try {
		return JSON.parse(value);
	} catch (_e) {
		return null;
	}
}

const port = Number(process.env.PORT) || 3000;
if (require.main === module) {
	app.listen(port, () => {
		// eslint-disable-next-line no-console
		console.log(`Webhook listener running on http://localhost:${port}`);
	});
}

module.exports = app;
