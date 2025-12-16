import { backfillTimeslotStages } from '../../../../db';

export const runtime = 'nodejs';

export async function GET(req: Request) {
	const url = new URL(req.url);
	const seedParam = url.searchParams.get('seed');
	const minHoursParam = url.searchParams.get('minHours');
	const maxHoursParam = url.searchParams.get('maxHours');

	const seed = seedParam != null ? Number(seedParam) : undefined;
	const minHours = minHoursParam != null ? Number(minHoursParam) : undefined;
	const maxHours = maxHoursParam != null ? Number(maxHoursParam) : undefined;

	const res = await backfillTimeslotStages({
		seed: Number.isFinite(seed) ? seed : undefined,
		minHours: Number.isFinite(minHours) ? minHours : undefined,
		maxHours: Number.isFinite(maxHours) ? maxHours : undefined,
	});

	return Response.json(res);
}


