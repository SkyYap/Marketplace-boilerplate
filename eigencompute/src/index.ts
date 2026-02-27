import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = parseInt(process.env.PORT || '4000', 10);

/**
 * POST /execute
 * Mock EigenCompute TEE agent.
 * In production, this runs inside Intel TDX TEE and actually books flights.
 * For demo, it simulates the booking and returns mock ticket details.
 */
app.post('/execute', async (req, res) => {
    const { orderId, encrypted_creds, username, provider_id, departure, destination, miles_amount, callback_url } = req.body;

    console.log(`[TEE-Mock] ──────────────────────────────────────`);
    console.log(`[TEE-Mock] Received transfer request`);
    console.log(`[TEE-Mock]   orderId:     ${orderId}`);
    console.log(`[TEE-Mock]   username:    ${username}`);
    console.log(`[TEE-Mock]   provider:    ${provider_id}`);
    console.log(`[TEE-Mock]   flight:      ${departure} → ${destination}`);
    console.log(`[TEE-Mock]   miles:       ${miles_amount}`);
    console.log(`[TEE-Mock]   callback:    ${callback_url}`);

    if (!orderId || !callback_url) {
        return res.status(400).json({ error: 'orderId and callback_url required' });
    }

    // Acknowledge receipt immediately
    res.json({
        status: 'ACCEPTED',
        message: 'Transfer request accepted. Processing in TEE...',
        orderId,
    });

    // Simulate TEE processing (decrypt creds → login → book → proof)
    console.log(`[TEE-Mock] 🔐 Decrypting credentials...`);
    let creds = { username: 'unknown', password: '***' };
    try {
        if (encrypted_creds) {
            creds = JSON.parse(Buffer.from(encrypted_creds, 'base64').toString());
            console.log(`[TEE-Mock]   Decrypted user: ${creds.username}`);
        }
    } catch {
        console.log(`[TEE-Mock]   Could not decrypt (expected in production — needs TEE KMS)`);
    }

    // Simulate booking delay (2-5 seconds)
    const delay = 2000 + Math.random() * 3000;
    console.log(`[TEE-Mock] ✈  Simulating flight booking (${(delay / 1000).toFixed(1)}s)...`);

    setTimeout(async () => {
        // Generate mock ticket details
        const confirmationCode = `UA${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        const ticketDetails = {
            airline: provider_id === 'united' ? 'United Airlines' : provider_id,
            confirmation_code: confirmationCode,
            departure,
            destination,
            flight_number: `UA${Math.floor(100 + Math.random() * 900)}`,
            date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            passenger: username,
            miles_used: miles_amount,
            seat: `${Math.floor(1 + Math.random() * 30)}${['A', 'B', 'C', 'D', 'E', 'F'][Math.floor(Math.random() * 6)]}`,
            class: 'Economy',
            status: 'CONFIRMED',
        };

        const mockProof = {
            type: 'mock-zktls',
            provider: 'reclaim',
            timestamp: new Date().toISOString(),
            verified: true,
            message: 'This is a mock proof. In production, Reclaim generates a real zkTLS proof of the airline booking page.',
        };

        console.log(`[TEE-Mock] ✅ Booking complete!`);
        console.log(`[TEE-Mock]   Confirmation: ${confirmationCode}`);
        console.log(`[TEE-Mock]   Flight: ${ticketDetails.flight_number}`);
        console.log(`[TEE-Mock]   Seat: ${ticketDetails.seat}`);
        console.log(`[TEE-Mock] 📤 Sending callback to ${callback_url}...`);

        // Send callback to marketplace server
        try {
            const response = await fetch(callback_url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId,
                    confirmationCode,
                    ticketDetails,
                    proof: mockProof,
                }),
            });

            if (response.ok) {
                console.log(`[TEE-Mock] ✅ Callback sent successfully`);
            } else {
                console.error(`[TEE-Mock] ❌ Callback failed: ${response.status} ${await response.text()}`);
            }
        } catch (err: any) {
            console.error(`[TEE-Mock] ❌ Callback error: ${err.message}`);
        }

        console.log(`[TEE-Mock] ──────────────────────────────────────`);
    }, delay);
});

app.get('/health', (_req, res) => {
    res.json({ status: 'ok', agent: 'eigencompute-mock-tee', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`┌─────────────────────────────────────────────┐`);
    console.log(`│   EigenCompute Mock TEE Agent                │`);
    console.log(`│   Port: ${PORT}                                  │`);
    console.log(`│   POST /execute — simulate flight booking    │`);
    console.log(`└─────────────────────────────────────────────┘`);
});
