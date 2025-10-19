import app from '../server';

export default (req: any, res: any) => (app as any)(req, res);

