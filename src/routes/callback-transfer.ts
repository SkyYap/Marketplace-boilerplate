import { Router, Request, Response } from 'express';
import { getOrderById, completeTransfer } from '../db/queries';

const router = Router();

/**
 * POST /callback/transfer
 * Called by EigenCompute TEE after booking is complete.
 * Body: { orderId, confirmationCode, ticketDetails, proof }
 */
router.post('/transfer', (req: Request, res: Response) => {
    try {
        const { orderId, confirmationCode, ticketDetails, proof } = req.body;

        if (!orderId || !confirmationCode || !ticketDetails) {
            return res.status(400).json({
                error: 'INVALID_INPUT',
                message: 'orderId, confirmationCode, and ticketDetails are required',
            });
        }

        const order = getOrderById(orderId);
        if (!order) {
            return res.status(404).json({ error: 'ORDER_NOT_FOUND', message: `Order "${orderId}" not found` });
        }

        if (order.status !== 'TRANSFERRING') {
            return res.status(409).json({
                error: 'INVALID_STATUS',
                message: `Order must be TRANSFERRING. Current status: ${order.status}`,
            });
        }

        // TODO: Verify zkTLS proof from Reclaim
        console.log(`[TransferCallback] ──────────────────────────────────────`);
        console.log(`[TransferCallback] Transfer completed for order ${orderId}`);
        console.log(`[TransferCallback]   Confirmation: ${confirmationCode}`);
        console.log(`[TransferCallback]   Details: ${ticketDetails}`);
        if (proof) {
            console.log(`[TransferCallback]   Proof: ${JSON.stringify(proof).substring(0, 100)}...`);
        }

        // Update order → TRANSFERRED (waiting for buyer approval)
        completeTransfer(orderId, confirmationCode, JSON.stringify(ticketDetails));

        console.log(`[TransferCallback] ✅ Order ${orderId} → TRANSFERRED`);
        console.log(`[TransferCallback]    Waiting for buyer to approve at POST /buyer/orders/${orderId}/approve`);
        console.log(`[TransferCallback] ──────────────────────────────────────`);

        res.json({
            orderId,
            status: 'TRANSFERRED',
            message: 'Transfer complete. Waiting for buyer approval to release escrow.',
        });
    } catch (error: any) {
        console.error('[TransferCallback] Error:', error);
        res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
    }
});

export default router;
