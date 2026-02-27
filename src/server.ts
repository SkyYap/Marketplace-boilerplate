import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { initializeSchema, seedProviders } from './db/schema';
import { getAllProviders } from './db/queries';

// Routes
import healthRouter from './routes/health';
import ordersRouter from './routes/orders';
import sellRouter from './routes/sell';
import callbackRouter from './routes/callback';
import listingsRouter from './routes/listings';
import { startEscrowListener } from './services/escrowListener';

const app = express();

// ─── Middleware ────────────────────────────────────────────
app.use(helmet());
app.use(cors());

// Callback route needs raw body — mount BEFORE urlencoded parser
// Reclaim sends JSON as x-www-form-urlencoded which breaks Express's parser
app.use('/callback', express.raw({ type: '*/*' }), callbackRouter);

app.use(express.json());
app.use(express.text());
app.use(express.urlencoded({ extended: true }));

// ─── Routes ───────────────────────────────────────────────
app.use('/health', healthRouter);
app.use('/orders', ordersRouter);
app.use('/sell', sellRouter);
app.use('/listings', listingsRouter);

// GET /providers — list available providers
app.get('/providers', (_req, res) => {
    try {
        const providers = getAllProviders();
        res.json({ providers, count: providers.length });
    } catch (error: any) {
        res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
    }
});

// ─── Global error handler ─────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[Server] Unhandled error:', err);
    res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: err.message || 'An unexpected error occurred',
    });
});

// ─── Start ────────────────────────────────────────────────
function start() {
    console.log('┌─────────────────────────────────────────────┐');
    console.log('│   Marketplace Boilerplate — EigenCompute     │');
    console.log('└─────────────────────────────────────────────┘');

    // Initialize database
    console.log('[Server] Initializing database...');
    initializeSchema();
    seedProviders();

    // Start server
    app.listen(config.port, () => {
        console.log(`[Server] Listening on port ${config.port}`);
        console.log(`[Server] Health:       http://localhost:${config.port}/health`);
        console.log(`[Server] Providers:    http://localhost:${config.port}/providers`);
        console.log(`[Server] Orders:       http://localhost:${config.port}/orders`);
        console.log(`[Server] Listings:     http://localhost:${config.port}/listings`);
        console.log(`[Server] Sell:         POST http://localhost:${config.port}/sell/airmiles`);
        console.log(`[Server] Callback:     POST http://localhost:${config.port}/callback/reclaim`);
        console.log(`[Server] Proof provider: ${config.proofProvider}`);
        console.log(`[Server] Callback URL:   ${config.callbackBaseUrl}`);
        console.log(`[Server] Escrow contract: ${config.escrowContract || '(not set)'}`);

        // Start on-chain event listener
        startEscrowListener();
    });
}

start();

export default app;
