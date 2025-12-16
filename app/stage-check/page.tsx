'use client';

import { useMemo, useRef, useState } from 'react';
import styles from './page.module.css';

type ApiOk = { result: '1.Posms' | '2.Posms' | 'incorrect image sent'; token?: string };

function mapResultLabel(result: ApiOk['result']): string {
	if (result === '1.Posms') return '1.posms';
	if (result === '2.Posms') return '2.posms';
	return 'Neatpazīts attēls';
}

export default function StageCheckPage() {
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const [file, setFile] = useState<File | null>(null);
	const [loading, setLoading] = useState(false);
	const [result, setResult] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const previewUrl = useMemo(() => {
		if (!file) return null;
		return URL.createObjectURL(file);
	}, [file]);

	async function onSend() {
		setError(null);
		setResult(null);
		if (!file) {
			setError('Please choose an image first.');
			return;
		}

		setLoading(true);
		try {
			const fd = new FormData();
			fd.append('file', file);
			// Optional: allow model override if needed later
			// fd.append('model', 'gpt-4o-mini');

			const res = await fetch('/api/stage-check', { method: 'POST', body: fd });
			const data = (await res.json()) as any;
			if (!res.ok) {
				setError(data?.error ? String(data.error) : `Request failed (${res.status})`);
				return;
			}

			const apiResult = (data as ApiOk)?.result;
			if (apiResult === '1.Posms' || apiResult === '2.Posms' || apiResult === 'incorrect image sent') {
				setResult(mapResultLabel(apiResult));
			} else {
				setError('Unexpected response from server.');
			}
		} catch (e: any) {
			setError(String(e?.message || e));
		} finally {
			setLoading(false);
		}
	}

	function onPick() {
		fileInputRef.current?.click();
	}

	return (
		<main className={styles.wrap}>
			<div className={styles.card}>
				<div className={styles.titleRow}>
					<div className={styles.title}>Stage check</div>
					<div className={styles.hint}>Uploads image → calls `/api/stage-check`</div>
				</div>

				<div className={styles.grid}>
					<section className={styles.drop}>
						<div className={styles.fileRow}>
							<div className={styles.fileName} title={file?.name || ''}>
								{file ? `Selected: ${file.name}` : 'No file selected'}
							</div>
							<div style={{ display: 'inline-flex', gap: 10 }}>
								<button className={styles.btn} type="button" onClick={onPick} disabled={loading}>
									Upload
								</button>
								<button className={`${styles.btn} ${styles.btnPrimary}`} type="button" onClick={onSend} disabled={loading || !file}>
									{loading ? (
										<span className={styles.loadingRow}>
											<span className={styles.spinner} aria-hidden />
											Sending…
										</span>
									) : (
										'Send'
									)}
								</button>
							</div>
						</div>

						<input
							ref={fileInputRef}
							type="file"
							accept="image/*"
							style={{ display: 'none' }}
							onChange={(e) => {
								const f = e.target.files?.[0] || null;
								setError(null);
								setResult(null);
								setFile(f);
							}}
						/>

						<div className={styles.preview}>
							{previewUrl ? (
								// eslint-disable-next-line @next/next/no-img-element
								<img src={previewUrl} alt="Selected preview" />
							) : (
								<div className={styles.previewEmpty}>
									Choose an image to preview it here.
								</div>
							)}
						</div>
					</section>

					<aside className={styles.resultBox}>
						<div className={styles.resultLabel}>Result</div>
						<div className={styles.resultValue}>{result ?? '—'}</div>
						{error ? <div className={styles.error}>{error}</div> : null}
						<div style={{ fontSize: 12, opacity: 0.7, lineHeight: 1.35 }}>
							Expected outputs: <b>1.posms</b>, <b>2.posms</b>, <b>Neatpazīts attēls</b>
						</div>
					</aside>
				</div>
			</div>
		</main>
	);
}


