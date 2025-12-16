export const runtime = 'nodejs';

type ChatMessage = {
	role: 'system' | 'user' | 'assistant' | string;
	content: string;
};

type ChatBody = {
	model?: string;
	messages?: ChatMessage[];
	// Convenience fields for simple prompt-based calls
	prompt?: string;
	system?: string;
	stream?: boolean;
	temperature?: number;
	max_tokens?: number;
	top_p?: number;
	frequency_penalty?: number;
	presence_penalty?: number;
	stop?: string[] | string;
	[n: string]: unknown;
};

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';

export async function OPTIONS() {
	return new Response(null, {
		status: 204,
		headers: corsHeaders(),
	});
}

export async function POST(req: Request) {
	try {
		const apiKey = process.env.DEEPSEEK_API_KEY;
		if (!apiKey) {
			return Response.json({ error: 'Missing DEEPSEEK_API_KEY' }, { status: 500, headers: corsHeaders() });
		}

		let body: ChatBody | null = null;
		try {
			body = (await req.json()) as ChatBody;
		} catch {
			return Response.json({ error: 'Invalid JSON body' }, { status: 400, headers: corsHeaders() });
		}

		const model = (body.model || 'deepseek-chat').trim();
		const stream = Boolean(body.stream);

		let messages: ChatMessage[] | undefined = body.messages;
		// Allow simple prompt/system input for convenience
		if ((!messages || !Array.isArray(messages) || messages.length === 0) && (body.prompt || body.system)) {
			messages = [
				...(body.system ? [{ role: 'system', content: String(body.system) }] : []),
				...(body.prompt ? [{ role: 'user', content: String(body.prompt) }] : []),
			];
		}
		if (!messages || !Array.isArray(messages) || messages.length === 0) {
			return Response.json({ error: 'Missing messages or prompt' }, { status: 400, headers: corsHeaders() });
		}

		const payload: Record<string, unknown> = {
			model,
			messages,
			stream,
		};

		if (typeof body.temperature === 'number') payload.temperature = body.temperature;
		if (typeof body.max_tokens === 'number') payload.max_tokens = body.max_tokens;
		if (typeof body.top_p === 'number') payload.top_p = body.top_p;
		if (typeof body.frequency_penalty === 'number') payload.frequency_penalty = body.frequency_penalty;
		if (typeof body.presence_penalty === 'number') payload.presence_penalty = body.presence_penalty;
		if (typeof body.stop === 'string' || Array.isArray(body.stop)) payload.stop = body.stop;

		const upstream = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${apiKey}`,
				// Request identity encoding to avoid downstream decompression issues
				'Accept-Encoding': 'identity',
			},
			body: JSON.stringify(payload),
		});

		// Proxy status and headers; include CORS headers
		const headers = new Headers();
		upstream.headers.forEach((v, k) => headers.set(k, v));
		applyCorsHeaders(headers);
		// Always strip compression-related headers since body may be decoded already
		stripCompressionHeaders(headers);

		// Stream passthrough if enabled
		if (stream && upstream.body) {
			return new Response(upstream.body, {
				status: upstream.status,
				headers,
			});
		}

		// Non-streaming JSON
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
	// Ensure JSON content type when returning parsed JSON
	headers.set('Content-Type', 'application/json; charset=utf-8');
	return headers;
}

function stripCompressionHeaders(h: Headers) {
	// Headers keys are case-insensitive and normalized to lower-case
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


