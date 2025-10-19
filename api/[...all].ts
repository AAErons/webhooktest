import type { VercelRequest, VercelResponse } from '@vercel/node';
import app from '../server';

export default (req: VercelRequest, res: VercelResponse) => (app as any)(req, res);

