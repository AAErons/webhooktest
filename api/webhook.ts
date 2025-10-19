import { insertRequest } from '../../db';

export default async function handler(req: any, res: any) {
	const headers = req.headers || {};
	const contentType = String(headers['content-type'] || '');
	const method = req.method || 'GET';
	const url = new URL(req.url || '/', 'http://localhost');
	const query = Object.fromEntries(url.searchParams.entries());

	const rawBuffer: Buffer = await new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		req.on('data', (c: any) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
		req.on('end', () => resolve(Buffer.concat(chunks)));
		req.on('error', reject);
	});

	const rawBodyText = rawBuffer.length ? rawBuffer.toString('utf8') : undefined;
	let bodyText = rawBodyText;
	let bodyJson: string | null = null;
	if (rawBodyText && /json/i.test(contentType)) {
		try { bodyJson = JSON.stringify(JSON.parse(rawBodyText)); } catch {}
	}

	const ipHeader = String(headers['x-forwarded-for'] || '');
	const ip = ipHeader.split(',')[0] || (req.socket && req.socket.remoteAddress) || undefined;

	const requestDoc = {
		received_at: new Date().toISOString(),
		ip,
		method,
		path: url.pathname + (url.search || ''),
		query_json: JSON.stringify(query),
		content_type: contentType,
		headers_json: JSON.stringify(headers),
		raw_body_text: rawBodyText,
		body_text: bodyText || '',
		body_json: bodyJson,
	};

	const id = await insertRequest(requestDoc);
	return res.status(202).json({ id });
}

