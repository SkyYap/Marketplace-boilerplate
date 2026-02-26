/**
 * ProofGenerator — abstract interface for generating zkTLS proofs.
 * Supports both Reclaim Protocol (real proofs) and Mock (development).
 */
import type { ProofResult, ProofGenerateParams } from '../types/proof';

export interface VerificationRequest {
    /** Unique order ID this verification is for */
    orderId: string;
    /** URL the user opens to start verification (e.g., Reclaim app link) */
    verificationUrl: string;
    /** Session/status ID for tracking */
    sessionId: string;
}

export interface ProofGenerator {
    readonly providerName: 'reclaim' | 'mock';

    /**
     * Create a verification request that the user opens on their device.
     * Returns a URL the user visits to verify their account.
     */
    createVerificationRequest(orderId: string, providerId: string): Promise<VerificationRequest>;

    /**
     * Generate a proof from verification data (used by callback handler).
     */
    generateProof(params: ProofGenerateParams): Promise<ProofResult>;

    /**
     * Verify an existing proof.
     */
    verifyProof(proof: ProofResult): Promise<boolean>;
}
