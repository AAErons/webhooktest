export const runtime = 'nodejs';

type StageCheckBody = {
	model?: string;
	imageUrl?: string;
	stream?: boolean;
};

const OPENAI_BASE_URL = 'https://api.openai.com/v1';

export async function OPTIONS() {
	return new Response(null, {
		status: 204,
		headers: corsHeaders(),
	});
}

export async function POST(req: Request) {
	try {
		const apiKey = process.env.OPENAI_API_KEY;
		if (!apiKey) {
			return Response.json({ error: 'Missing OPENAI_API_KEY' }, { status: 500, headers: corsHeaders() });
		}

		let imageDataUrl: string | undefined;
		let model = 'gpt-4o-mini';

		const contentType = req.headers.get('content-type') || '';
		if (/multipart\/form-data/i.test(contentType)) {
			const form = await req.formData();
			const file = form.get('file') as unknown as File | null;
			model = String(form.get('model') || model);
			const formImageUrl = form.get('imageUrl') ? String(form.get('imageUrl')) : undefined;
			if (file && typeof file.arrayBuffer === 'function') {
				const ab = await file.arrayBuffer();
				const b64 = Buffer.from(ab).toString('base64');
				const mime = file.type || 'image/jpeg';
				imageDataUrl = `data:${mime};base64,${b64}`;
			} else if (formImageUrl) {
				imageDataUrl = formImageUrl;
			}
		} else {
			let body: StageCheckBody | null = null;
			try {
				body = (await req.json()) as StageCheckBody;
			} catch {
				// ignore
			}
			if (body) {
				model = (body.model || model).trim();
				if (body.imageUrl) imageDataUrl = body.imageUrl;
			}
		}

		// If no image provided, try to read local test.jpg from project root
		if (!imageDataUrl) {
			try {
				const { readFile } = await import('fs/promises');
				const { join } = await import('path');
				const filePath = join(process.cwd(), 'test.jpg');
				const buf = await readFile(filePath);
				const b64 = buf.toString('base64');
				imageDataUrl = `data:image/jpeg;base64,${b64}`;
			} catch {
				return Response.json({ error: 'No image supplied and fallback test.jpg not found' }, { status: 400, headers: corsHeaders() });
			}
		}

		const system = [
			'You are a strict visual classifier for an industrial workstation photo.',
			'Task: Concrete spotting — determine whether a table/workstation has started or has an ongoing process of putting/pouring concrete into a form/mold.',
			'Rules:',
			'- If you clearly see that concrete pouring/placing has started or is ongoing, answer YES.',
			'- If you clearly see that it has NOT started / is NOT ongoing, answer NO.',
			'- If the image is not a relevant workstation scene (or you cannot tell at all), answer INCORRECT_IMAGE.',
			'Output format: respond with exactly one of these tokens and nothing else: YES, NO, INCORRECT_IMAGE.',
		].join('\n');

		const userContent = [
			{ type: 'text', text: 'Classify the image now.' },
			{ type: 'image_url', image_url: { url: imageDataUrl } },
		];

		const payload: Record<string, unknown> = {
			model,
			messages: [
				{ role: 'system', content: system },
				{ role: 'user', content: userContent },
			],
			temperature: 0,
		};

		const headersIn: Record<string, string> = {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${apiKey}`,
			'Accept-Encoding': 'identity',
		};
		const org = process.env.OPENAI_ORG || process.env.OPENAI_ORGANIZATION;
		if (org) headersIn['OpenAI-Organization'] = org;

		const upstream = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
			method: 'POST',
			headers: headersIn,
			body: JSON.stringify(payload),
		});

		const headers = new Headers();
		upstream.headers.forEach((v, k) => headers.set(k, v));
		applyCorsHeaders(headers);
		stripCompressionHeaders(headers);

		const data: any = await safeReadJson(upstream);

		const raw = String(data?.choices?.[0]?.message?.content ?? '').trim();
		const token = normalizeToken(raw);

		if (upstream.status >= 400) {
			return new Response(JSON.stringify({ error: 'Upstream error', upstream: data }), {
				status: upstream.status,
				headers: mergeJsonHeaders(headers),
			});
		}

		if (!token) {
			return Response.json({ error: 'Unexpected model output', raw }, { status: 502, headers: corsHeaders() });
		}

		if (token === 'INCORRECT_IMAGE') {
			return Response.json({ result: 'incorrect image sent', token }, { status: 200, headers: corsHeaders() });
		}
		if (token === 'YES') {
			return Response.json({ result: '2.Posms', token }, { status: 200, headers: corsHeaders() });
		}
		return Response.json({ result: '1.Posms', token }, { status: 200, headers: corsHeaders() });
	} catch (err: any) {
		return Response.json(
			{ error: 'Unexpected server error', details: String(err?.message || err) },
			{ status: 500, headers: corsHeaders() },
		);
	}
}

function normalizeToken(raw: string): 'YES' | 'NO' | 'INCORRECT_IMAGE' | null {
	const s = raw.trim().toUpperCase();
	if (s === 'YES' || s.startsWith('YES')) return 'YES';
	if (s === 'NO' || s.startsWith('NO')) return 'NO';
	if (s === 'INCORRECT_IMAGE' || s.includes('INCORRECT_IMAGE')) return 'INCORRECT_IMAGE';
	// Sometimes the model returns JSON or quotes
	if (/"YES"/.test(raw)) return 'YES';
	if (/"NO"/.test(raw)) return 'NO';
	if (/"INCORRECT_IMAGE"/.test(raw)) return 'INCORRECT_IMAGE';
	return null;
}

function corsHeaders(): HeadersInit {
	return {
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, Authorization',
	};
}

function applyCorsHeaders(h: Headers) {
	const c = corsHeaders();
	Object.entries(c).forEach(([k, v]) => h.set(k, v as string));
}

function mergeJsonHeaders(h: Headers): Headers {
	const headers = new Headers(h);
	headers.set('Content-Type', 'application/json; charset=utf-8');
	return headers;
}

function stripCompressionHeaders(h: Headers) {
	h.delete('content-encoding');
	h.delete('content-length');
	h.delete('transfer-encoding');
}

async function safeReadJson(res: Response): Promise<unknown> {
	try {
		return await res.json();
	} catch {
		const text = await res.text();
		return { raw: text };
	}
}


