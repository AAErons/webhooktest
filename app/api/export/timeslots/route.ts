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

function capitalizeFirst(input: string): string {
	const s = (input || '').trim();
	if (!s) return s;
	return s.charAt(0).toUpperCase() + s.slice(1);
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

	// Aggregate for sheet 1 (exclude person movement from totals)
	const totalsByPerson: Record<string, number> = {};
	const totalsByStage: Record<string, number> = {};
	for (const r of rows) {
		const name = r.key === 'face_unknown'
			? 'Neidentificēta persona'
			: r.key === 'person_movement'
				? 'Nezināms darbinieka kustība'
				: capitalizeFirst(r.personId || 'Neidentificēta persona');
		if (name === 'Nezināms darbinieka kustība') continue; // do not show time for movement bucket
		const end = r.ended_at ?? Math.min(r.last_seen_at, toMs);
		const start = Math.max(r.started_at, fromMs);
		const dur = Math.max(0, end - start);
		totalsByPerson[name] = (totalsByPerson[name] || 0) + dur;
		const stage = r.stage || 'Posms (nav norādīts)';
		totalsByStage[stage] = (totalsByStage[stage] || 0) + dur;
	}

	// Group by person -> day for sheet 2
	const byPersonDay: Record<string, Record<string, Array<{ start: number; end: number; stage?: string }>>> = {};
	for (const r of rows) {
		const name = r.key === 'face_unknown'
			? 'Neidentificēta persona'
			: r.key === 'person_movement'
				? 'Nezināms darbinieka kustība'
				: capitalizeFirst(r.personId || 'Neidentificēta persona');
		// Skip movement bucket from daily tabs
		if (name === 'Nezināms darbinieka kustība') continue;
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
			byPersonDay[name][dayKey].push({ start: s, end: segEnd, stage: r.stage });
			if (segEnd >= e) break;
			s = segEnd;
			cur = new Date(segEnd);
		}
	}

	const wb = new ExcelJS.Workbook();
	const sheet1 = wb.addWorksheet('Zona 1');
	const rangeLabel = `${formatYMD(new Date(fromMs))}-${formatYMD(new Date(toMs))}`;
	// Title rows
	const zoneTitle = sheet1.addRow([`Zona 1.`]);
	sheet1.columns = [ { width: 70 }, { width: 18 } ] as any;
	sheet1.mergeCells(zoneTitle.number, 1, zoneTitle.number, 2);
	zoneTitle.font = { bold: true, size: 14 } as any;
	zoneTitle.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true } as any;
	const title1 = sheet1.addRow([`Strādnieku darba stundas perioda no ${rangeLabel}.`]);
	sheet1.mergeCells(title1.number, 1, title1.number, 2);
	title1.font = { bold: true } as any;
	title1.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true } as any;
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

	// Section: total time by stage (in this same sheet)
	sheet1.addRow([]);
	const stageHeader = sheet1.addRow(['Kopējais laiks pēc posma', '']);
	sheet1.mergeCells(stageHeader.number, 1, stageHeader.number, 2);
	stageHeader.font = { bold: true, size: 12 } as any;
	stageHeader.alignment = { vertical: 'middle', horizontal: 'left' } as any;
	const stageHeaderRow = sheet1.addRow(['Posms', 'Kopējais laiks']);
	stageHeaderRow.font = { bold: true } as any;
	stageHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } } as any;
	stageHeaderRow.border = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } } as any;
	Object.entries(totalsByStage)
		.sort((a, b) => b[1] - a[1])
		.forEach(([stage, dur], idx) => {
			const r = sheet1.addRow([stage, msToHm(dur)]);
			const isAlt = (idx % 2) === 1;
			if (isAlt) {
				r.eachCell((cell) => {
					cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9F9F9' } } as any;
				});
			}
		});

	// Section: detailed periods by person and day (in this same sheet)
	sheet1.addRow([]);
	const detailHeader = sheet1.addRow(['Darba periodi pa dienām', '']);
	sheet1.mergeCells(detailHeader.number, 1, detailHeader.number, 2);
	detailHeader.font = { bold: true, size: 12 } as any;
	detailHeader.alignment = { vertical: 'middle', horizontal: 'left' } as any;
	sheet1.addRow([]);
	// Show summary above grouped rows; enables +/- outline toggles
	(sheet1 as any).properties = { ...(sheet1 as any).properties, outlineProperties: { summaryBelow: false } };

	const personOrder = Object.entries(totalsByPerson).sort((a, b) => b[1] - a[1]).map(([name]) => name);
	for (const name of personOrder) {
		const days = byPersonDay[name] || {};
		const dayKeys = Object.keys(days).sort();
		// Person header with total
		const totalMs = totalsByPerson[name] || 0;
		const personRow = sheet1.addRow([name, msToHm(totalMs)]);
		personRow.font = { bold: true } as any;
		personRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } } as any;
		for (const day of dayKeys) {
			const dayTotalMs = (days[day] || []).reduce((acc, seg) => acc + Math.max(0, seg.end - seg.start), 0);
			const dayRow = sheet1.addRow([`${day}: ${msToHm(dayTotalMs)}`, '']);
			dayRow.font = { bold: true } as any;
			// Group detail under person row
			(dayRow as any).outlineLevel = 1;
			(dayRow as any).hidden = true;
			for (const seg of days[day]) {
				const start = new Date(seg.start);
				const end = new Date(seg.end);
				const pad = (n: number) => String(n).padStart(2, '0');
				const baseLabel = `${pad(start.getHours())}:${pad(start.getMinutes())}-${pad(end.getHours())}:${pad(end.getMinutes())}`;
				const label = seg.stage ? `${baseLabel} (${seg.stage})` : baseLabel;
				const r = sheet1.addRow(['', label]);
				r.alignment = { indent: 1 } as any;
				// Nest periods under the day row
				(r as any).outlineLevel = 2;
				(r as any).hidden = true;
			}
			const spacer = sheet1.addRow(['', '']);
			(spacer as any).outlineLevel = 2;
			(spacer as any).hidden = true;
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


