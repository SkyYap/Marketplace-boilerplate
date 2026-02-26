/**
 * MockProvider — generates structurally valid proofs for development/testing.
 * Also provides a mock verification URL for local testing.
 */
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import type { ProofGenerator, VerificationRequest } from './ProofGenerator';
import type { ProofResult, ProofGenerateParams, Attestations } from '../types/proof';

export class MockProvider implements ProofGenerator {
    readonly providerName = 'mock' as const;

    /**
     * Create a mock verification request.
     * Returns a mock URL — in dev, you can simulate the callback manually.
     */
    async createVerificationRequest(orderId: string, providerId: string): Promise<VerificationRequest> {
        console.log(`[Mock] Creating mock verification request for order: ${orderId}`);

        // In mock mode, return a URL that tells the user to call the callback manually
        const callbackUrl = `${config.callbackBaseUrl}/callback/reclaim?orderId=${orderId}`;

        return {
            orderId,
            verificationUrl: callbackUrl,
            sessionId: orderId,
        };
    }

    async generateProof(params: ProofGenerateParams): Promise<ProofResult> {
        const { domain, responseData, predicateField, predicateValue, predicateOp } = params;

        // Evaluate predicate
        const actualValue = typeof responseData === 'object'
            ? responseData[predicateField]
            : responseData;

        let predicateSatisfied = false;
        if (typeof actualValue === 'number') {
            switch (predicateOp) {
                case '>=': predicateSatisfied = actualValue >= predicateValue; break;
                case '==': predicateSatisfied = actualValue === predicateValue; break;
                case '>': predicateSatisfied = actualValue > predicateValue; break;
            }
        }

        const attestations: Attestations = {
            airline_authenticity: true,
            tls_session_integrity: true,
            domain_ownership: true,
            predicate_satisfied: predicateSatisfied,
        };

        const predicateExpr = `${predicateField} ${predicateOp} ${predicateValue}`;

        const proofPayload = {
            type: 'mock_zktls_proof',
            domain,
            attestations,
            predicate: predicateExpr,
            actualValue,
            timestamp: new Date().toISOString(),
            nonce: uuidv4(),
        };

        const rawProof = Buffer.from(JSON.stringify(proofPayload)).toString('base64');

        const signature = crypto
            .createHmac('sha256', 'mock-attestor-key')
            .update(rawProof)
            .digest('hex');

        return {
            id: uuidv4(),
            provider_domain: domain,
            proof_type: 'mock',
            attestations,
            predicate_expr: predicateExpr,
            raw_proof: rawProof,
            signature,
            created_at: new Date().toISOString(),
        };
    }

    async verifyProof(proof: ProofResult): Promise<boolean> {
        const expectedSig = crypto
            .createHmac('sha256', 'mock-attestor-key')
            .update(proof.raw_proof)
            .digest('hex');

        return proof.signature === expectedSig;
    }
}
