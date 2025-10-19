require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
const mongoDbName = process.env.MONGO_DB || 'webhook_test';
const mongoCollection = process.env.MONGO_COLLECTION || 'events';
const requestsCollectionName = process.env.MONGO_REQUESTS_COLLECTION || 'requests';

const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5000 });
const dbPromise = client.connect().then((c) => c.db(mongoDbName));
const collectionPromise = dbPromise.then((db) => db.collection(mongoCollection));
const requestsCollectionPromise = dbPromise.then((db) => db.collection(requestsCollectionName));

function mapDoc(doc) {
	return {
		id: doc._id.toString(),
		received_at: doc.received_at,
		ip: doc.ip,
		method: doc.method,
		path: doc.path,
		query_json: doc.query_json,
		content_type: doc.content_type,
		headers_json: doc.headers_json,
		raw_body_text: doc.raw_body_text,
		body_text: doc.body_text,
		body_json: doc.body_json,
	};
}

async function insertEvent(event) {
	const col = await collectionPromise;
	const res = await col.insertOne(event);
	return res.insertedId.toString();
}

async function listEvents(limit = 100, offset = 0) {
	const col = await collectionPromise;
	const docs = await col.find({})
		.sort({ _id: -1 })
		.skip(offset)
		.limit(limit)
		.toArray();
	return docs.map(mapDoc);
}

async function getEventById(id) {
	let _id;
	try {
		_id = new ObjectId(id);
	} catch (_e) {
		return null;
	}
	const col = await collectionPromise;
	const doc = await col.findOne({ _id });
	return doc ? mapDoc(doc) : null;
}

async function insertRequest(requestDoc) {
	const col = await requestsCollectionPromise;
	const res = await col.insertOne(requestDoc);
	return res.insertedId.toString();
}

async function listRequests(limit = 100, offset = 0) {
	const col = await requestsCollectionPromise;
	const docs = await col.find({})
		.sort({ _id: -1 })
		.skip(offset)
		.limit(limit)
		.toArray();
	return docs.map(mapDoc);
}

async function getRequestById(id) {
	let _id;
	try {
		_id = new ObjectId(id);
	} catch (_e) {
		return null;
	}
	const col = await requestsCollectionPromise;
	const doc = await col.findOne({ _id });
	return doc ? mapDoc(doc) : null;
}

module.exports = {
	insertEvent,
	listEvents,
	getEventById,
	insertRequest,
	listRequests,
	getRequestById,
};


