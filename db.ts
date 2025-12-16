import 'dotenv/config';
import { MongoClient, ObjectId, Collection } from 'mongodb';

type StoredDoc = {
	_id: ObjectId;
	received_at: string;
	ip?: string;
	method?: string;
	path?: string;
	query_json?: string;
	content_type?: string;
	headers_json?: string;
	raw_body_text?: string;
	body_text?: string;
	body_json?: string | null;
};

export type PublicDoc = {
	id: string;
	received_at: string;
	ip?: string;
	method?: string;
	path?: string;
	query_json?: string;
	content_type?: string;
	headers_json?: string;
	raw_body_text?: string;
	body_text?: string;
	body_json?: string | null;
};

const mongoUri = process.env.MONGO_URI || 'mongodb+srv://eriksfreimanis6:UKjp2GpYC7grrbp9@kardano.0dovgev.mongodb.net/?retryWrites=true&w=majority&appName=webhook';
const mongoDbName = process.env.MONGO_DB || 'webhook';
const requestsCollectionName = process.env.MONGO_REQUESTS_COLLECTION || 'requests';
const timeslotsCollectionName = process.env.MONGO_TIMESLOTS_COLLECTION || 'timeslots';

const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5000 });
const dbPromise = client.connect().then((c) => c.db(mongoDbName));
const requestsColPromise: Promise<Collection<StoredDoc>> = dbPromise.then((db) => db.collection(requestsCollectionName));
type TimeslotDoc = {
	_id: ObjectId;
	key: 'face_unknown' | 'face_known' | 'person_movement';
	personId?: string; // only for face_known
	started_at: number; // epoch ms
	ended_at?: number | null; // epoch ms
	last_seen_at: number; // epoch ms
	stage?: string; // "Posms 1" .. "Posms 5"
};
const timeslotsColPromise: Promise<Collection<TimeslotDoc>> = dbPromise.then((db) => db.collection(timeslotsCollectionName));

function mapDoc(doc: StoredDoc): PublicDoc {
	return {
		id: String(doc._id),
		received_at: doc.received_at,
		ip: doc.ip,
		method: doc.method,
		path: doc.path,
		query_json: doc.query_json,
		content_type: doc.content_type,
		headers_json: doc.headers_json,
		raw_body_text: doc.raw_body_text,
		body_text: doc.body_text,
		body_json: doc.body_json ?? null,
	};
}

export async function insertRequest(requestDoc: Omit<StoredDoc, '_id'>): Promise<string> {
	const col = await requestsColPromise;
	const res = await col.insertOne(requestDoc as any);
	return String(res.insertedId);
}

export async function listRequests(limit = 100, offset = 0): Promise<PublicDoc[]> {
	const col = await requestsColPromise;
	const docs = await col.find({}).sort({ _id: -1 }).skip(offset).limit(limit).toArray();
	return docs.map(mapDoc);
}

export async function getRequestById(id: string): Promise<PublicDoc | null> {
	let _id: ObjectId;
	try { _id = new ObjectId(id); } catch { return null; }
	const col = await requestsColPromise;
	const doc = await col.findOne({ _id });
	return doc ? mapDoc(doc as StoredDoc) : null;
}

// Timeslots API
export async function upsertTimeslot(params: { key: 'face_unknown' | 'face_known' | 'person_movement'; personId?: string | null; nowMs?: number; }): Promise<string> {
	const col = await timeslotsColPromise;
	const now = typeof params.nowMs === 'number' ? params.nowMs : Date.now();
	const filter: any = { key: params.key, ended_at: { $exists: false } };
	if (params.key === 'face_known' && params.personId) {
		filter.personId = params.personId;
	}
	if (params.key === 'face_unknown' || params.key === 'person_movement') {
		filter.personId = { $exists: false };
	}
	const update = {
		$setOnInsert: { started_at: now },
		$set: { last_seen_at: now },
	};
	const res: any = await col.findOneAndUpdate(filter, update, { upsert: true, returnDocument: 'after' as any });
	return String((res && res.value?._id) || (res && res.lastErrorObject?.upserted) || '');
}

export async function closeExpiredTimeslots(params?: { idleMs?: number; nowMs?: number; }): Promise<number> {
	const col = await timeslotsColPromise;
	const now = params?.nowMs ?? Date.now();
	const idleMs = params?.idleMs ?? 10 * 60 * 1000; // 10 minutes
	const threshold = now - idleMs;
	const res = await col.updateMany({ ended_at: { $exists: false }, last_seen_at: { $lte: threshold } }, { $set: { ended_at: now } });
	return res.modifiedCount || 0;
}

export async function touchAllActiveTimeslots(params?: { nowMs?: number; }): Promise<number> {
	const col = await timeslotsColPromise;
	const now = params?.nowMs ?? Date.now();
	const res = await col.updateMany({ ended_at: { $exists: false } }, { $set: { last_seen_at: now } });
	return res.modifiedCount || 0;
}

export type TimeslotPublic = {
	key: 'face_unknown' | 'face_known' | 'person_movement';
	personId?: string;
	started_at: number;
	ended_at?: number | null;
	last_seen_at: number;
	stage?: string;
};

export async function listTimeslotsInRange(params: { fromMs: number; toMs: number; }): Promise<TimeslotPublic[]> {
	const col = await timeslotsColPromise;
	// Normalize: stored seconds -> ms if values look too small
	const toDocs = await col.find({}).sort({ started_at: 1 }).toArray();
	const docs = toDocs.filter((d) => {
		const started = d.started_at < 1_000_000_000_000 ? d.started_at * 1000 : d.started_at;
		const endedRaw = d.ended_at ?? null;
		const ended = endedRaw == null ? null : (endedRaw < 1_000_000_000_000 ? endedRaw * 1000 : endedRaw);
		// Overlap with [fromMs, toMs]
		return started <= params.toMs && (ended == null || ended >= params.fromMs);
	}).map((d) => ({
		key: d.key,
		personId: d.personId,
		started_at: d.started_at < 1_000_000_000_000 ? d.started_at * 1000 : d.started_at,
		ended_at: d.ended_at == null ? null : (d.ended_at < 1_000_000_000_000 ? d.ended_at * 1000 : d.ended_at),
		last_seen_at: d.last_seen_at < 1_000_000_000_000 ? d.last_seen_at * 1000 : d.last_seen_at,
		stage: d.stage,
	}));
	return docs.map((d) => ({
		key: d.key,
		personId: d.personId,
		started_at: d.started_at,
		ended_at: d.ended_at ?? null,
		last_seen_at: d.last_seen_at,
		stage: d.stage,
	}));
}

// Backfill stage field ("Posms 1" .. "Posms 5") by cycling over time with random intervals (12h..36h)
export async function backfillTimeslotStages(params?: { seed?: number; minHours?: number; maxHours?: number; batchSize?: number; }): Promise<{ total: number; thresholds: number; modified: number; }> {
	const col = await timeslotsColPromise;
	const cur = col.find({}, { projection: { _id: 1, last_seen_at: 1 } as any }).sort({ last_seen_at: 1 });
	const docs = await cur.toArray();
	if (!docs.length) return { total: 0, thresholds: 0, modified: 0 };

	// Normalize to ms if needed
	const lastSeenMs = docs.map((d) => (d.last_seen_at < 1_000_000_000_000 ? d.last_seen_at * 1000 : d.last_seen_at));
	const start = lastSeenMs[0];
	const end = lastSeenMs[lastSeenMs.length - 1];

	const minHours = Math.max(0.5, params?.minHours ?? 12);
	const maxHours = Math.max(minHours, params?.maxHours ?? 36);
	const minMs = minHours * 3600 * 1000;
	const maxMs = maxHours * 3600 * 1000;

	// Simple seeded RNG if seed provided (mulberry32)
	let rng: () => number;
	if (typeof params?.seed === 'number') {
		let t = params.seed >>> 0;
		rng = () => {
			t += 0x6D2B79F5;
			let r = Math.imul(t ^ (t >>> 15), 1 | t);
			r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
			return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
		};
	} else {
		rng = Math.random;
	}

	const thresholds: number[] = [];
	let t = start + randIntervalMs(minMs, maxMs, rng);
	while (t <= end + 1) {
		thresholds.push(t);
		t += randIntervalMs(minMs, maxMs, rng);
	}

	// Walk through docs in ascending order, assign stage by number of thresholds passed
	let k = 0; // index into thresholds
	const ops: Array<any> = [];
	for (let i = 0; i < docs.length; i++) {
		const ms = lastSeenMs[i];
		while (k < thresholds.length && thresholds[k] <= ms) k++;
		const stageIdx = (k % 5); // 0..4
		const stage = `Posms ${stageIdx + 1}`;
		ops.push({
			updateOne: {
				filter: { _id: docs[i]._id },
				update: { $set: { stage } },
				upsert: false,
			},
		});
	}

	let modified = 0;
	const batchSize = Math.max(1, params?.batchSize ?? 1000);
	for (let i = 0; i < ops.length; i += batchSize) {
		const slice = ops.slice(i, i + batchSize);
		const res = await col.bulkWrite(slice, { ordered: false });
		modified += (res.modifiedCount || 0) + (res.upsertedCount || 0) + (res.matchedCount ? 0 : 0);
	}

	return { total: docs.length, thresholds: thresholds.length, modified };
}

function randIntervalMs(minMs: number, maxMs: number, rng: () => number): number {
	const r = rng();
	return Math.floor(minMs + r * (maxMs - minMs));
}


