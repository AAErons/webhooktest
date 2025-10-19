import 'dotenv/config';
import express, { Request, Response } from 'express';
import morgan from 'morgan';
import { insertRequest } from './db';

const app = express();
app.set('trust proxy', true);

app.use(morgan('combined'));
app.use(express.raw({ type: '*/*', limit: '5mb' }));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: ['text/*', 'application/xml', 'application/*+xml'] }));

app.get('/health', (_req: Request, res: Response) => {
	res.json({ status: 'ok' });
});

// Single webhook sink: accepts any method and stores into `requests`
app.all(/^\/webhook(?:\/.*)?$/, async (req: Request, res: Response) => {
	const contentType = req.get('content-type') || '';
	const headersJson = JSON.stringify(req.headers);
	const method = req.method;
	const path = req.originalUrl;
	const queryJson = JSON.stringify(req.query || {});
	let bodyText: string | undefined;
	let bodyJson: string | null = null;
	let rawBodyText: string | undefined = undefined;

	if (Buffer.isBuffer(req.body)) {
		rawBodyText = req.body.toString('utf8');
	}

	if (typeof req.body === 'string') {
		bodyText = req.body;
		if (/json/i.test(contentType)) {
			try {
				const parsed = JSON.parse(req.body);
				bodyJson = JSON.stringify(parsed);
			} catch {}
		}
	} else {
		try {
			bodyText = JSON.stringify(req.body as unknown);
			if (/json/i.test(contentType)) bodyJson = bodyText;
		} catch {
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


const port = Number(process.env.PORT) || 3000;
if (require.main === module) {
	app.listen(port, () => {
		console.log(`Webhook listener running on http://localhost:${port}`);
	});
}

export default app;

