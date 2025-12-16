export default function HomePage() {
	return (
		<main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
			<a
				href="/stage-check"
				style={{
					display: 'inline-flex',
					alignItems: 'center',
					gap: 10,
					padding: '12px 16px',
					borderRadius: 12,
					border: '1px solid rgba(255,255,255,0.14)',
					background: 'rgba(255,255,255,0.06)',
					color: 'inherit',
					textDecoration: 'none',
					backdropFilter: 'blur(10px)',
				}}
			>
				<span style={{ fontWeight: 700 }}>Open Stage Check</span>
				<span aria-hidden>→</span>
			</a>
		</main>
	);
}


