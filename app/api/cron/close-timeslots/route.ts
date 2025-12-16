import { closeExpiredTimeslots } from '../../../../db';

export const runtime = 'nodejs';

export async function GET() {
	const modified = await closeExpiredTimeslots();
	return Response.json({ modified });
}


