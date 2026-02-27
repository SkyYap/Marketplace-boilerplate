import { Router, Request, Response } from 'express';
import { config } from '../config';
import { getOrderById, listOrder, getListings, escrowOrder } from '../db/queries';

const router = Router();

/**
 * GET /listings
 * Browse all LISTED airmiles orders.
 * Query params: ?provider=united&max_price=0.02
 */
router.get('/', (_req: Request, res: Response) => {
    try {
        const filters: { provider_id?: string; max_price?: number } = {};

        if (_req.query.provider) {
            filters.provider_id = _req.query.provider as string;
        }
        if (_req.query.max_price) {
            filters.max_price = parseFloat(_req.query.max_price as string);
        }

        const listings = getListings(filters);

        res.json({
            listings: listings.map(l => ({
                id: l.id,
                provider_id: l.provider_id,
                miles_available: l.amount,
                price_per_mile: l.price_per_mile,
                min_miles: l.min_miles,
                proof_id: l.proof_id,
                created_at: l.created_at,
            })),
            count: listings.length,
        });
    } catch (error: any) {
        res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
    }
});

/**
 * POST /orders/:id/list
 * Seller lists their verified order for sale.
 * Body: { price_per_mile: 0.015, min_miles: 1000 }
 */
router.post('/orders/:id/list', (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const { price_per_mile, min_miles } = req.body;

        // Validate input
        if (!price_per_mile || price_per_mile <= 0) {
            return res.status(400).json({
                error: 'INVALID_INPUT',
                message: 'price_per_mile is required and must be > 0',
            });
        }
        if (!min_miles || min_miles <= 0) {
            return res.status(400).json({
                error: 'INVALID_INPUT',
                message: 'min_miles is required and must be > 0',
            });
        }

        // Look up order
        const order = getOrderById(id);
        if (!order) {
            return res.status(404).json({ error: 'ORDER_NOT_FOUND', message: `Order "${id}" not found` });
        }
        if (order.status !== 'VERIFIED') {
            return res.status(409).json({
                error: 'INVALID_STATUS',
                message: `Order must be VERIFIED to list. Current status: ${order.status}`,
            });
        }
        if (min_miles > order.amount) {
            return res.status(400).json({
                error: 'INVALID_INPUT',
                message: `min_miles (${min_miles}) cannot exceed available balance (${order.amount})`,
            });
        }

        // Update order to LISTED
        listOrder(id, price_per_mile as number, min_miles as number);
        const updated = getOrderById(id as string)!;

        console.log(`[Listings] Order ${id} listed: $${price_per_mile}/mile, min ${min_miles} miles`);

        res.json({
            orderId: updated.id,
            status: updated.status,
            miles_available: updated.amount,
            price_per_mile: updated.price_per_mile,
            min_miles: updated.min_miles,
            message: 'Order is now listed for sale',
        });
    } catch (error: any) {
        res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
    }
});

/**
 * POST /listings/:id/buy
 * Buyer initiates purchase — provides wallet, flight details.
 * Body: { buyer_address: "0x...", miles_amount: 5000, departure: "LAX", destination: "NRT" }
 */
router.post('/:id/buy', (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const { buyer_address, miles_amount, departure, destination } = req.body;

        // Validate input
        if (!buyer_address || !miles_amount || !departure || !destination) {
            return res.status(400).json({
                error: 'INVALID_INPUT',
                message: 'buyer_address, miles_amount, departure, and destination are required',
            });
        }

        // Look up listing
        const order = getOrderById(id);
        if (!order) {
            return res.status(404).json({ error: 'ORDER_NOT_FOUND', message: `Order "${id}" not found` });
        }
        if (order.status !== 'LISTED') {
            return res.status(409).json({
                error: 'INVALID_STATUS',
                message: `Order must be LISTED to buy. Current status: ${order.status}`,
            });
        }
        if (miles_amount < (order.min_miles || 0)) {
            return res.status(400).json({
                error: 'BELOW_MINIMUM',
                message: `miles_amount (${miles_amount}) is below the minimum (${order.min_miles})`,
            });
        }
        if (miles_amount > order.amount) {
            return res.status(400).json({
                error: 'INSUFFICIENT_MILES',
                message: `miles_amount (${miles_amount}) exceeds available balance (${order.amount})`,
            });
        }

        // Calculate cost
        const totalCost = miles_amount * (order.price_per_mile || 0);

        console.log(`[Listings] Buy request for order ${id}: ${miles_amount} miles, ${departure} → ${destination}, cost: $${totalCost.toFixed(2)}`);

        // Return escrow instructions (buyer deposits on-chain next)
        res.json({
            orderId: order.id,
            miles_amount,
            price_per_mile: order.price_per_mile,
            total_cost_usd: totalCost,
            departure,
            destination,
            escrow_contract: config.escrowContract || '(not deployed yet)',
            instructions: `Deposit ${totalCost.toFixed(6)} USDC to the escrow contract with orderId=${order.id}. After deposit, call POST /listings/${order.id}/confirm-escrow with your tx hash.`,
        });
    } catch (error: any) {
        res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
    }
});

/**
 * POST /listings/:id/confirm-escrow
 * Buyer confirms escrow deposit by providing the transaction hash.
 * Body: { buyer_address: "0x...", escrow_tx: "0x...", departure: "LAX", destination: "NRT" }
 */
router.post('/:id/confirm-escrow', (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const { buyer_address, escrow_tx, departure, destination } = req.body;

        if (!buyer_address || !escrow_tx || !departure || !destination) {
            return res.status(400).json({
                error: 'INVALID_INPUT',
                message: 'buyer_address, escrow_tx, departure, and destination are required',
            });
        }

        const order = getOrderById(id);
        if (!order) {
            return res.status(404).json({ error: 'ORDER_NOT_FOUND', message: `Order "${id}" not found` });
        }
        if (order.status !== 'LISTED') {
            return res.status(409).json({
                error: 'INVALID_STATUS',
                message: `Order must be LISTED to escrow. Current status: ${order.status}`,
            });
        }

        // TODO: Verify escrow_tx on-chain before updating
        escrowOrder(id, buyer_address as string, departure as string, destination as string, escrow_tx as string);
        const updated = getOrderById(id as string)!;

        console.log(`[Listings] Order ${id} escrowed by ${buyer_address}, tx: ${escrow_tx}`);

        res.json({
            orderId: updated.id,
            status: updated.status,
            buyer_address: updated.buyer_address,
            departure: updated.buyer_departure,
            destination: updated.buyer_destination,
            escrow_tx: updated.escrow_tx,
            message: 'Escrow confirmed. EigenCompute will process the transfer.',
        });
    } catch (error: any) {
        res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
    }
});

export default router;
