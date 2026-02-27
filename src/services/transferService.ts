import { config } from '../config';
import { getOrderById, transferOrder } from '../db/queries';
import type { Order } from '../types/order';

/**
 * Trigger EigenCompute TEE to execute the miles transfer.
 * Called by escrowListener when order becomes ESCROWED.
 */
export async function triggerTransfer(orderId: string): Promise<void> {
    const order = getOrderById(orderId);
    if (!order) {
        console.error(`[TransferService] Order ${orderId} not found`);
        return;
    }

    if (order.status !== 'ESCROWED') {
        console.error(`[TransferService] Order ${orderId} is not ESCROWED (status: ${order.status})`);
        return;
    }

    // Mark as TRANSFERRING
    transferOrder(orderId);

    console.log(`[TransferService] ──────────────────────────────────────`);
    console.log(`[TransferService] Triggering transfer for order ${orderId}`);
    console.log(`[TransferService]   Seller: ${order.username}`);
    console.log(`[TransferService]   Flight: ${order.buyer_departure} → ${order.buyer_destination}`);
    console.log(`[TransferService]   Miles:  ${order.amount}`);

    try {
        const payload = {
            orderId: order.id,
            encrypted_creds: order.encrypted_creds,
            username: order.username,
            provider_id: order.provider_id,
            departure: order.buyer_departure,
            destination: order.buyer_destination,
            miles_amount: order.amount,
            callback_url: `${config.callbackBaseUrl}/callback/transfer`,
        };

        const response = await fetch(config.eigencomputeUrl + '/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[TransferService] TEE returned error: ${response.status} ${errorText}`);
            return;
        }

        const result = await response.json();
        console.log(`[TransferService] TEE accepted transfer request:`, result);
        console.log(`[TransferService] ──────────────────────────────────────`);
    } catch (err: any) {
        console.error(`[TransferService] Failed to reach EigenCompute: ${err.message}`);
        console.log(`[TransferService] TEE URL: ${config.eigencomputeUrl}`);
    }
}
