import { Router, Request, Response } from 'express';
import { config } from '../config';
import { MockProvider } from '../proof/MockProvider';
import { ReclaimProvider } from '../proof/ReclaimProvider';
import { getOrderById, updateOrderStatus, createProof } from '../db/queries';
import type { ProofGenerator } from '../proof/ProofGenerator';

const router = Router();

function getProofProvider(): ProofGenerator {
    if (config.proofProvider === 'reclaim') {
        return new ReclaimProvider();
    }
    return new MockProvider();
}

/**
 * POST /callback/reclaim
 *
 * Webhook endpoint called by Reclaim Protocol when the user completes verification.
 * Query params: orderId
 * Body: Reclaim proof payload (varies by SDK version)
 */
router.post('/reclaim', async (req: Request, res: Response) => {
    try {
        const orderId = req.query.orderId as string;

        if (!orderId) {
            return res.status(400).json({
                error: 'MISSING_ORDER_ID',
                message: 'orderId query parameter is required',
            });
        }

        // Look up the order
        const order = getOrderById(orderId);
        if (!order) {
            return res.status(404).json({
                error: 'ORDER_NOT_FOUND',
                message: `Order "${orderId}" not found`,
            });
        }

        if (order.status !== 'PENDING') {
            return res.status(409).json({
                error: 'ORDER_ALREADY_PROCESSED',
                message: `Order is already ${order.status}`,
                orderId: order.id,
            });
        }

        console.log(`[Callback] Received proof for order: ${orderId}`);
        console.log(`[Callback] Content-Type: ${req.headers['content-type']}`);
        console.log(`[Callback] Body type: ${typeof req.body}, isBuffer: ${Buffer.isBuffer(req.body)}`);

        // Parse body — express.raw() gives us a Buffer
        let proofData: any = null;
        let rawBodyStr = '';

        if (Buffer.isBuffer(req.body)) {
            rawBodyStr = req.body.toString('utf-8');
        } else if (typeof req.body === 'string') {
            rawBodyStr = req.body;
        } else if (typeof req.body === 'object' && req.body !== null) {
            // Fallback: if somehow parsed as object
            const keys = Object.keys(req.body);
            if (keys.length > 0 && keys[0].startsWith('{')) {
                rawBodyStr = keys[0];
            } else {
                proofData = req.body;
            }
        }

        if (rawBodyStr && !proofData) {
            // The raw body might be URL-encoded JSON
            const decoded = decodeURIComponent(rawBodyStr);
            console.log(`[Callback] Decoded body (first 300 chars): ${decoded.substring(0, 300)}`);
            proofData = safeJsonParse(decoded);
            if (!proofData) {
                // Try parsing without decoding
                proofData = safeJsonParse(rawBodyStr);
            }
        }

        console.log(`[Callback] Parsed proof keys:`, proofData ? Object.keys(proofData) : 'none');

        let balance = 0;

        try {
            balance = extractBalanceFromProof(proofData);
        } catch (e: any) {
            console.log(`[Callback] Balance extraction warning: ${e.message}`);
        }

        console.log(`[Callback] Extracted balance: ${balance}`);

        // Generate proof record
        const proofProvider = getProofProvider();
        const domain = 'www.united.com';

        const proofResult = await proofProvider.generateProof({
            domain,
            responseData: { airmiles_balance: balance, raw: proofData },
            predicateField: 'airmiles_balance',
            predicateValue: balance,
            predicateOp: '>=',
        });

        // Store proof in DB
        const storedProof = createProof({
            provider_domain: proofResult.provider_domain,
            proof_type: proofResult.proof_type,
            attestations: proofResult.attestations,
            predicate_expr: proofResult.predicate_expr,
            raw_proof: proofResult.raw_proof,
            signature: proofResult.signature,
        });

        // Update order as VERIFIED
        updateOrderStatus(order.id, 'VERIFIED', {
            proof_id: storedProof.id,
            amount: balance,
        });

        console.log(`[Callback] Order ${order.id} verified with proof ${storedProof.id}, balance: ${balance}`);

        res.json({
            success: true,
            orderId: order.id,
            status: 'VERIFIED',
            balance,
            proofId: storedProof.id,
        });
    } catch (error: any) {
        console.error('[Callback] Error processing proof:', error);
        res.status(500).json({
            error: 'CALLBACK_ERROR',
            message: error.message,
        });
    }
});

/**
 * Extract balance from Reclaim proof data.
 * Handles multiple possible proof formats from different SDK versions.
 */
function extractBalanceFromProof(proofData: any): number {
    if (!proofData) return 0;

    // Format 1: Direct balance field (mock mode)
    if (proofData.balance != null) {
        return toNumber(proofData.balance);
    }

    // Format 2: Reclaim extractedParameters (top level)
    if (proofData.extractedParameters) {
        const params = proofData.extractedParameters;
        const val = params.AccountBalance || params.balance || params.miles || params.points || params.mileageBalance;
        if (val != null) return toNumber(val);
    }

    // Format 3: Reclaim proof with claimData.context
    if (proofData.claimData?.context) {
        const ctx = safeJsonParse(proofData.claimData.context);
        if (ctx?.extractedParameters) {
            const params = ctx.extractedParameters;
            const val = params.AccountBalance || params.balance || params.miles || params.points || params.mileageBalance;
            if (val != null) return toNumber(val);
        }
    }

    // Format 3b: Reclaim proof with claimData.parameters.paramValues (United MileagePlus format)
    if (proofData.claimData?.parameters) {
        const params = safeJsonParse(proofData.claimData.parameters);
        if (params?.paramValues) {
            const val = params.paramValues.AccountBalance || params.paramValues.balance || params.paramValues.miles;
            if (val != null) {
                console.log(`[Callback] Found balance in claimData.parameters.paramValues: ${val}`);
                return toNumber(val);
            }
        }
    }

    // Format 4: Array of proofs
    if (Array.isArray(proofData)) {
        for (const proof of proofData) {
            const balance = extractBalanceFromProof(proof);
            if (balance > 0) return balance;
        }
    }

    // Format 5: Nested proofs array
    if (proofData.proofs && Array.isArray(proofData.proofs)) {
        for (const proof of proofData.proofs) {
            const balance = extractBalanceFromProof(proof);
            if (balance > 0) return balance;
        }
    }

    // Format 6: parameters (alternative key)
    if (proofData.parameters) {
        const params = safeJsonParse(proofData.parameters) || proofData.parameters;
        if (typeof params === 'object') {
            const val = params.balance || params.miles || params.points || params.mileageBalance;
            if (val != null) return toNumber(val);
        }
    }

    // Format 7: context at top level
    if (proofData.context) {
        const ctx = safeJsonParse(proofData.context) || proofData.context;
        if (typeof ctx === 'object' && ctx.extractedParameters) {
            const params = ctx.extractedParameters;
            const val = params.balance || params.miles || params.points || params.mileageBalance;
            if (val != null) return toNumber(val);
        }
    }

    console.log('[Callback] Could not extract balance from proof — returning 0');
    return 0;
}

/** Safely parse JSON, returning null on failure. */
function safeJsonParse(str: any): any {
    if (typeof str !== 'string') return str;
    try {
        return JSON.parse(str);
    } catch {
        return null;
    }
}

/** Convert a value to a number, stripping commas and non-numeric characters. */
function toNumber(val: any): number {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
        const cleaned = val.replace(/[^0-9.]/g, '');
        const n = parseFloat(cleaned);
        return isNaN(n) ? 0 : n;
    }
    return 0;
}

export default router;
