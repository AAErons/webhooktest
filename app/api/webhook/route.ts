import { insertRequest } from '../../../db';

export const runtime = 'nodejs';

export async function GET(req: Request) { return handle(req); }
export async function POST(req: Request) { return handle(req); }
export async function PUT(req: Request) { return handle(req); }
export async function PATCH(req: Request) { return handle(req); }
export async function DELETE(req: Request) { return handle(req); }
export async function OPTIONS() { return new Response(null, { status: 204 }); }

async function handle(req: Request) {
	const headersObj: Record<string, string> = {};
	req.headers.forEach((v, k) => { headersObj[k] = v; });
	const contentType = headersObj['content-type'] || '';
	let rawBodyText: string | undefined;
	let bodyText: string | undefined;
	let bodyJson: string | null = null;

	try {
		const buf = Buffer.from(await req.arrayBuffer());
		rawBodyText = buf.length ? buf.toString('utf8') : undefined;
		bodyText = rawBodyText;
		if (rawBodyText && /json/i.test(contentType)) {
			try { bodyJson = JSON.stringify(JSON.parse(rawBodyText)); } catch {}
		}
	} catch {}

	const url = new URL(req.url);
	const query = Object.fromEntries(url.searchParams.entries());

	const ip = headersObj['x-forwarded-for']?.split(',')[0];

	const doc = {
		received_at: new Date().toISOString(),
		ip,
		method: req.method,
		path: url.pathname + (url.search || ''),
		query_json: JSON.stringify(query),
		content_type: contentType,
		headers_json: JSON.stringify(headersObj),
		raw_body_text: rawBodyText,
		body_text: bodyText || '',
		body_json: bodyJson,
	};

	const id = await insertRequest(doc);
	return Response.json({ id }, { status: 202 });
}

