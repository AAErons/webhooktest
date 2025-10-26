import { listTimeslotsInRange } from '../../../../db';
import ExcelJS from 'exceljs';

export const runtime = 'nodejs';

function formatYMD(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}.${m}.${d}`;
}

function msToHm(ms: number): string {
	const totalMinutes = Math.max(0, Math.floor(ms / 60000));
	const h = Math.floor(totalMinutes / 60);
	const m = totalMinutes % 60;
	return h ? `${h}h${String(m)}m` : `${m}m`;
}

export async function GET(req: Request) {
	const url = new URL(req.url);
	const dateFrom = url.searchParams.get('dateFrom');
	const dateTo = url.searchParams.get('dateTo');
	if (!dateFrom || !dateTo) {
		return Response.json({ error: 'Missing dateFrom or dateTo (ISO date-time or date)' }, { status: 400 });
	}

	const from = new Date(dateFrom);
	const to = new Date(dateTo);
	if (isNaN(from.getTime()) || isNaN(to.getTime())) {
		return Response.json({ error: 'Invalid dateFrom/dateTo' }, { status: 400 });
	}

	const fromMs = from.getTime();
	const toMs = to.getTime();
	const rows = await listTimeslotsInRange({ fromMs, toMs });

	// Aggregate for sheet 1
	const totalsByPerson: Record<string, number> = {};
	for (const r of rows) {
		const name = r.key === 'face_unknown'
			? 'Nezināms(unknown_face)'
			: r.key === 'person_movement'
				? 'Nezināms darbinieka kustība'
				: (r.personId || 'Nezināms(unknown_face)');
		const end = r.ended_at ?? Math.min(r.last_seen_at, toMs);
		const start = Math.max(r.started_at, fromMs);
		const dur = Math.max(0, end - start);
		totalsByPerson[name] = (totalsByPerson[name] || 0) + dur;
	}

	// Group by person -> day for sheet 2
	const byPersonDay: Record<string, Record<string, Array<{ start: number; end: number }>>> = {};
	for (const r of rows) {
		const name = r.key === 'face_unknown'
			? 'Nezināms(unknown_face)'
			: r.key === 'person_movement'
				? 'Nezināms darbinieka kustība'
				: (r.personId || 'Nezināms(unknown_face)');
		const end = r.ended_at ?? Math.min(r.last_seen_at, toMs);
		const start = Math.max(r.started_at, fromMs);
		let s = start;
		let e = end;
		if (e <= s) continue;

		// Split by day boundaries
		let cur = new Date(s);
		while (true) {
			const dayKey = formatYMD(cur);
			const dayEnd = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1).getTime();
			const segEnd = Math.min(e, dayEnd);
			(byPersonDay[name] = byPersonDay[name] || {})[dayKey] = byPersonDay[name][dayKey] || [];
			byPersonDay[name][dayKey].push({ start: s, end: segEnd });
			if (segEnd >= e) break;
			s = segEnd;
			cur = new Date(segEnd);
		}
	}

	const wb = new ExcelJS.Workbook();
	const sheet1 = wb.addWorksheet('Kopsavilkums');
	const rangeLabel = `${formatYMD(new Date(fromMs))}-${formatYMD(new Date(toMs))}`;
	// Title row
	const title1 = sheet1.addRow([`Strādnieku darba stundas perioda no ${rangeLabel}:`]);
	sheet1.columns = [ { width: 32 }, { width: 14 } ] as any;
	sheet1.mergeCells(title1.number, 1, title1.number, 2);
	title1.font = { bold: true, size: 14 } as any;
	title1.alignment = { vertical: 'middle', horizontal: 'center' } as any;
	sheet1.addRow([]);
	// Header row
	const header1 = sheet1.addRow(['Strādnieks', 'Kopējais laiks']);
	header1.font = { bold: true } as any;
	header1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } } as any;
	header1.border = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } } as any;
	sheet1.views = [{ state: 'frozen', ySplit: 3 }];
	Object.entries(totalsByPerson)
		.sort((a, b) => b[1] - a[1])
		.forEach(([name, dur]) => {
			const r = sheet1.addRow([name, msToHm(dur)]);
			const isAlt = (r.number % 2) === 0; // zebra after header
			if (isAlt) {
				r.eachCell((cell) => {
					cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9F9F9' } } as any;
				});
			}
		});

	const sheet2 = wb.addWorksheet('Periodi');
	// Title row
	const title2 = sheet2.addRow([`Strādnieku darba periodi par periodu ${rangeLabel}:`]);
	sheet2.columns = [ { width: 30 } ] as any;
	sheet2.mergeCells(title2.number, 1, title2.number, 1);
	title2.font = { bold: true, size: 14 } as any;
	title2.alignment = { vertical: 'middle' } as any;
	sheet2.addRow([]);
	sheet2.views = [{ state: 'frozen', ySplit: 2 }];
	const personNames = Object.keys(byPersonDay).sort();
	for (const name of personNames) {
		const days = byPersonDay[name];
		const dayKeys = Object.keys(days).sort();
		for (const day of dayKeys) {
			const groupRow = sheet2.addRow([`${name} ${day}:`]);
			groupRow.font = { bold: true } as any;
			groupRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } } as any;
			for (const seg of days[day]) {
				const start = new Date(seg.start);
				const end = new Date(seg.end);
				const pad = (n: number) => String(n).padStart(2, '0');
				const label = `${pad(start.getHours())}:${pad(start.getMinutes())}-${pad(end.getHours())}:${pad(end.getMinutes())}`;
				const row = sheet2.addRow([label]);
				row.alignment = { indent: 1 } as any;
			}
			sheet2.addRow([]);
		}
	}

	const filename = `timeslots_${formatYMD(new Date(fromMs))}_to_${formatYMD(new Date(toMs))}.xlsx`;
	const buffer = await wb.xlsx.writeBuffer();
	return new Response(buffer, {
		status: 200,
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': `attachment; filename="${filename}"`,
		},
	});
}


