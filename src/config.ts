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
};
