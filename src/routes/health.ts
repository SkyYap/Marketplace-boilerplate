import { Router, Request, Response } from 'express';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
    const startTime = process.uptime();
    res.json({
        status: 'ok',
        uptime: Math.floor(startTime),
        timestamp: new Date().toISOString(),
        version: '1.0.0',
    });
});

export default router;
