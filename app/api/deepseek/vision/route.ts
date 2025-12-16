export const runtime = 'nodejs';

type VisionBody = {
	model?: string;
	imageUrl?: string;
	prompt?: string;
	system?: string;
	stream?: boolean;
	temperature?: number;
	max_tokens?: number;
	top_p?: number;
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
		let prompt = 'Describe the image.';
		let model = 'gpt-4o-mini';
		let stream = false;
		let temperature: number | undefined;
		let max_tokens: number | undefined;
		let top_p: number | undefined;
		let system: string | undefined;

		const contentType = req.headers.get('content-type') || '';
		if (/multipart\/form-data/i.test(contentType)) {
			const form = await req.formData();
			const file = form.get('file') as unknown as File | null;
			prompt = String(form.get('prompt') || prompt);
			model = String(form.get('model') || model);
			system = form.get('system') ? String(form.get('system')) : undefined;
			stream = String(form.get('stream') || '').toLowerCase() === 'true';
			temperature = form.get('temperature') ? Number(form.get('temperature')) : undefined;
			max_tokens = form.get('max_tokens') ? Number(form.get('max_tokens')) : undefined;
			top_p = form.get('top_p') ? Number(form.get('top_p')) : undefined;
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
			let body: VisionBody | null = null;
			try {
				body = (await req.json()) as VisionBody;
			} catch {
				// Fall through to default behavior
			}
			if (body) {
				model = (body.model || model).trim();
				prompt = (body.prompt || prompt);
				system = body.system;
				stream = Boolean(body.stream);
				temperature = typeof body.temperature === 'number' ? body.temperature : undefined;
				max_tokens = typeof body.max_tokens === 'number' ? body.max_tokens : undefined;
				top_p = typeof body.top_p === 'number' ? body.top_p : undefined;
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

		// Build OpenAI-compatible multimodal message with image_url
		const userContent = [
			{ type: 'text', text: prompt },
			{ type: 'image_url', image_url: { url: imageDataUrl } },
		];
		const messages: Array<any> = [
			...(system ? [{ role: 'system', content: system }] : []),
			{ role: 'user', content: userContent },
		];

		const payload: Record<string, unknown> = {
			model,
			messages,
			stream,
		};
		if (typeof temperature === 'number') payload.temperature = temperature;
		if (typeof max_tokens === 'number') payload.max_tokens = max_tokens;
		if (typeof top_p === 'number') payload.top_p = top_p;

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

		if (stream && upstream.body) {
			return new Response(upstream.body, {
				status: upstream.status,
				headers,
			});
		}

		const data = await safeReadJson(upstream);
		return new Response(JSON.stringify(data), {
			status: upstream.status,
			headers: mergeJsonHeaders(headers),
		});
	} catch (err: any) {
		return Response.json(
			{ error: 'Unexpected server error', details: String(err?.message || err) },
			{ status: 500, headers: corsHeaders() },
		);
	}
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


