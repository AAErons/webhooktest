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

const mongoUri = 'mongodb+srv://eriksfreimanis6:UKjp2GpYC7grrbp9@kardano.0dovgev.mongodb.net/?retryWrites=true&w=majority&appName=webhook';
const mongoDbName = 'webhook';
const requestsCollectionName = 'requests';

const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5000 });
const dbPromise = client.connect().then((c) => c.db(mongoDbName));
const requestsColPromise: Promise<Collection<StoredDoc>> = dbPromise.then((db) => db.collection(requestsCollectionName));

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


