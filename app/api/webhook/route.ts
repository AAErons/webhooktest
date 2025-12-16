import { insertRequest, upsertTimeslot, touchAllActiveTimeslots } from '../../../db';

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
	let bodyParsed: any = null;

	try {
		const buf = Buffer.from(await req.arrayBuffer());
		rawBodyText = buf.length ? buf.toString('utf8') : undefined;
		bodyText = rawBodyText;
		if (rawBodyText && /json/i.test(contentType)) {
			try { bodyParsed = JSON.parse(rawBodyText); bodyJson = JSON.stringify(bodyParsed); } catch {}
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

	// Process triggers for timeslots
	try {
		if (bodyParsed && bodyParsed.alarm && Array.isArray(bodyParsed.alarm.triggers)) {
			for (const trig of bodyParsed.alarm.triggers) {
				const key: string | undefined = trig?.key;
				let ts: number = typeof trig?.timestamp === 'number' ? trig.timestamp : Date.now();
				if (ts < 1_000_000_000_000) ts = ts * 1000; // normalize seconds -> ms
				if (key === 'face_unknown') {
					await upsertTimeslot({ key: 'face_unknown', nowMs: ts });
				} else if (key === 'face_known') {
					// Prefer explicit personId; otherwise use provided name or value as identifier
					const personIdentifier: string | null = trig?.group?.personId || trig?.personId || trig?.group?.name || trig?.value || null;
					await upsertTimeslot({ key: 'face_known', personId: personIdentifier || undefined, nowMs: ts });
				} else if (key === 'person') {
					// Treat as a separate worker bucket: unknown body movement
					await upsertTimeslot({ key: 'person_movement', nowMs: ts });
				}
			}
		}
	} catch {}

	return Response.json({ id }, { status: 202 });
}

