import { Router, Request, Response } from 'express';
import { config } from '../config';
import { MockProvider } from '../proof/MockProvider';
import { ReclaimProvider } from '../proof/ReclaimProvider';
import { createOrder, getProviderById, getActiveOrder } from '../db/queries';
import type { ProofGenerator } from '../proof/ProofGenerator';

const router = Router();

function getProofProvider(): ProofGenerator {
    if (config.proofProvider === 'reclaim') {
        return new ReclaimProvider();
    }
    return new MockProvider();
}

/**
 * POST /sell/airmiles
 *
 * Body: {
 *   provider: "united",           // provider key
 *   username: "user@email.com",   // for order tracking (NOT for login)
 *   listing_price?: 0.015         // price per mile in USD
 * }
 *
 * Flow:
 * 1. Validate input & look up provider
 * 2. Check for duplicate orders
 * 3. Create a PENDING order in DB
 * 4. Generate Reclaim verification request URL
 * 5. Return { orderId, verificationUrl } to the user
 *
 * The user then opens the verificationUrl on their device,
 * logs into United themselves, and Reclaim sends a proof
 * to POST /callback/reclaim.
 */
router.post('/airmiles', async (req: Request, res: Response) => {
    try {
        const { provider: providerId, username, password, listing_price } = req.body;

        // Validate input
        if (!providerId || !username || !password) {
            return res.status(400).json({
                error: 'INVALID_INPUT',
                message: 'provider, username, and password are required',
            });
        }

        // Look up provider
        const provider = getProviderById(providerId);
        if (!provider) {
            return res.status(404).json({
                error: 'PROVIDER_NOT_FOUND',
                message: `Provider "${providerId}" not found. Available providers can be found at GET /providers`,
            });
        }

        console.log(`[Sell] Starting airmiles verification for provider: ${provider.name}`);

        // Check for duplicate active order
        const existingOrder = getActiveOrder(providerId, username);
        if (existingOrder) {
            return res.status(409).json({
                error: 'DUPLICATE_ORDER',
                message: `An active order already exists for this provider and username (status: ${existingOrder.status})`,
                existingOrderId: existingOrder.id,
                status: existingOrder.status,
            });
        }

        // Encrypt password for TEE
        // TODO: Replace with TEE public key encryption (RSA/ECIES)
        // For now, use Base64 encoding as placeholder
        const encryptedCreds = Buffer.from(JSON.stringify({ username, password })).toString('base64');

        // Create pending order
        const order = createOrder({
            item_type: 'AIRMILES',
            provider_id: providerId,
            username,
            amount: 0,
            price: listing_price,
            status: 'PENDING',
            encrypted_creds: encryptedCreds,
        });
        console.log(`[Sell] Created order: ${order.id}`);

        // Create Reclaim verification request
        const proofProvider = getProofProvider();
        const verification = await proofProvider.createVerificationRequest(order.id, providerId);

        console.log(`[Sell] Verification URL generated for order: ${order.id}`);

        res.json({
            orderId: order.id,
            provider: providerId,
            status: 'PENDING',
            verificationUrl: verification.verificationUrl,
            sessionId: verification.sessionId,
            message: 'Open the verificationUrl on your device to verify your airline account. Once verified, the proof will be sent automatically.',
            timestamp: new Date().toISOString(),
        });
    } catch (error: any) {
        console.error('[Sell] Unexpected error:', error);
        res.status(500).json({
            error: 'INTERNAL_ERROR',
            message: error.message,
        });
    }
});

export default router;
