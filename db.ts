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
	}));
	return docs.map((d) => ({
		key: d.key,
		personId: d.personId,
		started_at: d.started_at,
		ended_at: d.ended_at ?? null,
		last_seen_at: d.last_seen_at,
	}));
}


