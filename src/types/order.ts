export type ItemType = 'AIRMILES' | 'GIFT_CARD' | 'API_KEY';
export type OrderStatus = 'PENDING' | 'VERIFIED' | 'FAILED' | 'LISTED' | 'ESCROWED' | 'TRANSFERRING' | 'TRANSFERRED' | 'COMPLETED' | 'DISPUTED' | 'REFUNDED';

export interface Order {
    id: string;
    item_type: ItemType;
    provider_id: string;
    username: string;
    amount: number;
    price: number | null;
    price_per_mile: number | null;
    min_miles: number | null;
    buyer_address: string | null;
    buyer_departure: string | null;
    buyer_destination: string | null;
    escrow_tx: string | null;
    encrypted_creds: string | null;
    confirmation_code: string | null;
    ticket_details: string | null;
    status: OrderStatus;
    proof_id: string | null;
    error_msg: string | null;
    created_at: string;
    updated_at: string;
}

export interface CreateOrderParams {
    item_type: ItemType;
    provider_id: string;
    username: string;
    amount: number;
    price?: number;
    status?: OrderStatus;
    proof_id?: string;
    error_msg?: string;
    encrypted_creds?: string;
}
