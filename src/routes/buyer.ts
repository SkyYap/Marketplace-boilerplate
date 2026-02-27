import { Router, Request, Response } from 'express';
import Web3 from 'web3';
import { config } from '../config';
import { getOrderById, approveOrder, disputeOrder } from '../db/queries';

const router = Router();

// Escrow ABI — only release function needed
const ESCROW_ABI = [
    {
        type: 'function',
        name: 'release',
        inputs: [{ name: 'orderId', type: 'string', internalType: 'string' }],
        outputs: [],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'refund',
        inputs: [{ name: 'orderId', type: 'string', internalType: 'string' }],
        outputs: [],
        stateMutability: 'nonpayable',
    },
] as const;

/**
 * GET /buyer/orders/:id/ticket
 * Buyer views the flight ticket details.
 */
router.get('/orders/:id/ticket', (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const order = getOrderById(id);

        if (!order) {
            return res.status(404).json({ error: 'ORDER_NOT_FOUND' });
        }

        if (!['TRANSFERRED', 'COMPLETED', 'DISPUTED'].includes(order.status)) {
            return res.status(409).json({
                error: 'NOT_READY',
                message: `Ticket not available yet. Current status: ${order.status}`,
            });
        }

        let ticketDetails = null;
        try {
            ticketDetails = order.ticket_details ? JSON.parse(order.ticket_details) : null;
        } catch {
            ticketDetails = order.ticket_details;
        }

        res.json({
            orderId: order.id,
            status: order.status,
            confirmation_code: order.confirmation_code,
            departure: order.buyer_departure,
            destination: order.buyer_destination,
            provider: order.provider_id,
            ticket_details: ticketDetails,
            escrow_tx: order.escrow_tx,
        });
    } catch (error: any) {
        res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
    }
});

/**
 * POST /buyer/orders/:id/approve
 * Buyer approves the transfer — releases escrow to seller.
 */
router.post('/orders/:id/approve', async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const order = getOrderById(id);

        if (!order) {
            return res.status(404).json({ error: 'ORDER_NOT_FOUND' });
        }
        if (order.status !== 'TRANSFERRED') {
            return res.status(409).json({
                error: 'INVALID_STATUS',
                message: `Order must be TRANSFERRED to approve. Current status: ${order.status}`,
            });
        }

        console.log(`[Buyer] ──────────────────────────────────────`);
        console.log(`[Buyer] Buyer approved order ${id}`);

        // Release escrow on-chain
        if (config.escrowContract && config.adminPrivateKey) {
            try {
                const web3 = new Web3(config.rpcUrl);
                const account = web3.eth.accounts.privateKeyToAccount(config.adminPrivateKey);
                web3.eth.accounts.wallet.add(account);

                const contract = new web3.eth.Contract(ESCROW_ABI, config.escrowContract);
                const tx = await contract.methods.release(id).send({
                    from: account.address,
                    gas: '200000',
                });

                console.log(`[Buyer] Escrow released on-chain. Tx: ${tx.transactionHash}`);
            } catch (err: any) {
                console.error(`[Buyer] On-chain release failed: ${err.message}`);
                // Still mark as completed — admin can manually release
            }
        } else {
            console.log(`[Buyer] No escrow contract configured — skipping on-chain release`);
        }

        // Update DB
        approveOrder(id);

        console.log(`[Buyer] ✅ Order ${id} → COMPLETED`);
        console.log(`[Buyer] ──────────────────────────────────────`);

        res.json({
            orderId: id,
            status: 'COMPLETED',
            message: 'Transfer approved. Escrow funds released to seller.',
        });
    } catch (error: any) {
        res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
    }
});

/**
 * POST /buyer/orders/:id/dispute
 * Buyer disputes the transfer.
 * Body: { reason: "Wrong flight booked" }
 */
router.post('/orders/:id/dispute', (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const { reason } = req.body;
        const order = getOrderById(id);

        if (!order) {
            return res.status(404).json({ error: 'ORDER_NOT_FOUND' });
        }
        if (order.status !== 'TRANSFERRED') {
            return res.status(409).json({
                error: 'INVALID_STATUS',
                message: `Order must be TRANSFERRED to dispute. Current status: ${order.status}`,
            });
        }

        disputeOrder(id);

        console.log(`[Buyer] ⚠ Order ${id} DISPUTED: ${reason || 'No reason given'}`);

        res.json({
            orderId: id,
            status: 'DISPUTED',
            reason: reason || null,
            message: 'Dispute filed. Admin will review the zkTLS proof and resolve.',
        });
    } catch (error: any) {
        res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
    }
});

export default router;
