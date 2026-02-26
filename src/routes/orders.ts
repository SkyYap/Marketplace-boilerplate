import { Router, Request, Response } from 'express';
import { getOrders, getOrderById, getProofById } from '../db/queries';

const router = Router();

/**
 * GET /orders — list all orders, with optional filters
 * Query params: ?status=VERIFIED&provider_id=delta
 */
router.get('/', (req: Request, res: Response) => {
    try {
        const filters: { status?: string; provider_id?: string } = {};
        if (req.query.status) filters.status = req.query.status as string;
        if (req.query.provider_id) filters.provider_id = req.query.provider_id as string;

        const orders = getOrders(filters);
        res.json({ orders, count: orders.length });
    } catch (error: any) {
        console.error('[Orders] Error listing orders:', error.message);
        res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
    }
});

/**
 * GET /orders/:id — get a single order with its proof
 */
router.get('/:id', (req: Request, res: Response) => {
    try {
        const orderId = typeof req.params.id === 'string' ? req.params.id : String(req.params.id);
        const order = getOrderById(orderId);
        if (!order) {
            return res.status(404).json({ error: 'NOT_FOUND', message: 'Order not found' });
        }

        let proof = null;
        if (order.proof_id) {
            proof = getProofById(order.proof_id);
        }

        res.json({ order, proof });
    } catch (error: any) {
        console.error('[Orders] Error fetching order:', error.message);
        res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
    }
});

export default router;
