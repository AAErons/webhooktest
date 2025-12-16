import type { ReactNode } from 'react';

export const metadata = {
	title: 'Stage check',
	description: 'Upload an image and classify stage',
};

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="lv">
			<body style={{ margin: 0, background: '#0b1020', color: '#e9edf7', fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial' }}>
				{children}
			</body>
		</html>
	);
}


