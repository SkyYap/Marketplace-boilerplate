import dotenv from 'dotenv';
dotenv.config();

export const config = {
    port: parseInt(process.env.PORT || '3000', 10),

    // Database
    databasePath: process.env.DATABASE_PATH || './data/db.sqlite',

    // zkTLS — Reclaim Protocol
    reclaimAppId: process.env.RECLAIM_APP_ID || '',
    reclaimAppSecret: process.env.RECLAIM_APP_SECRET || '',
    reclaimProviderId: process.env.RECLAIM_PROVIDER_ID || '',

    // Proof provider: 'reclaim' | 'mock'
    proofProvider: process.env.PROOF_PROVIDER || 'mock',

    // Callback URL (public URL where Reclaim sends proofs)
    callbackBaseUrl: process.env.CALLBACK_BASE_URL || 'http://localhost:3000',

    // On-chain escrow (Base Sepolia)
    rpcUrl: process.env.RPC_URL || 'https://sepolia.base.org',
    escrowContract: process.env.ESCROW_CONTRACT || '',
    sellerWallet: process.env.SELLER_WALLET || '',
    adminPrivateKey: process.env.ADMIN_PRIVATE_KEY || '',

    // EigenCompute TEE
    eigencomputeUrl: process.env.EIGENCOMPUTE_URL || 'http://localhost:4000',
};
