import { getDb } from './connection';
import { v4 as uuidv4 } from 'uuid';
import type { Order, CreateOrderParams } from '../types/order';
import type { ProofResult, Attestations } from '../types/proof';

// ─── Orders ──────────────────────────────────────────────

export function createOrder(params: CreateOrderParams): Order {
    const db = getDb();
    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
    INSERT INTO orders (id, item_type, provider_id, username, amount, price, status, proof_id, error_msg, encrypted_creds, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
        id,
        params.item_type,
        params.provider_id,
        params.username,
        params.amount,
        params.price ?? null,
        params.status ?? 'PENDING',
        params.proof_id ?? null,
        params.error_msg ?? null,
        params.encrypted_creds ?? null,
        now,
        now
    );

    return getOrderById(id)!;
}

export function updateOrderStatus(
    id: string,
    status: string,
    updates: { proof_id?: string; amount?: number; error_msg?: string } = {}
): void {
    const db = getDb();
    const now = new Date().toISOString();

    db.prepare(`
    UPDATE orders
    SET status = ?, proof_id = COALESCE(?, proof_id), amount = COALESCE(?, amount),
        error_msg = COALESCE(?, error_msg), updated_at = ?
    WHERE id = ?
  `).run(status, updates.proof_id ?? null, updates.amount ?? null, updates.error_msg ?? null, now, id);
}

export function getOrderById(id: string): Order | undefined {
    const db = getDb();
    return db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as Order | undefined;
}

export function getOrders(filters: { status?: string; provider_id?: string } = {}): Order[] {
    const db = getDb();
    let query = 'SELECT * FROM orders WHERE 1=1';
    const params: any[] = [];

    if (filters.status) {
        query += ' AND status = ?';
        params.push(filters.status);
    }
    if (filters.provider_id) {
        query += ' AND provider_id = ?';
        params.push(filters.provider_id);
    }

    query += ' ORDER BY created_at DESC';
    return db.prepare(query).all(...params) as Order[];
}

// ─── Listings ─────────────────────────────────────────────

export function listOrder(id: string, pricePerMile: number, minMiles: number): void {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(`
    UPDATE orders SET status = 'LISTED', price_per_mile = ?, min_miles = ?, updated_at = ?
    WHERE id = ? AND status = 'VERIFIED'
  `).run(pricePerMile, minMiles, now, id);
}

export function getListings(filters: { provider_id?: string; max_price?: number } = {}): Order[] {
    const db = getDb();
    let query = `SELECT * FROM orders WHERE status = 'LISTED'`;
    const params: any[] = [];

    if (filters.provider_id) {
        query += ' AND provider_id = ?';
        params.push(filters.provider_id);
    }
    if (filters.max_price) {
        query += ' AND price_per_mile <= ?';
        params.push(filters.max_price);
    }

    query += ' ORDER BY price_per_mile ASC';
    return db.prepare(query).all(...params) as Order[];
}

export function escrowOrder(
    id: string,
    buyerAddress: string,
    departure: string,
    destination: string,
    escrowTx: string
): void {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(`
    UPDATE orders
    SET status = 'ESCROWED', buyer_address = ?, buyer_departure = ?, buyer_destination = ?, escrow_tx = ?, updated_at = ?
    WHERE id = ? AND status = 'LISTED'
  `).run(buyerAddress, departure, destination, escrowTx, now, id);
}

// ─── Phase 3: Transfer ────────────────────────────────────

export function transferOrder(id: string): void {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(`
    UPDATE orders SET status = 'TRANSFERRING', updated_at = ?
    WHERE id = ? AND status = 'ESCROWED'
  `).run(now, id);
}

export function completeTransfer(
    id: string,
    confirmationCode: string,
    ticketDetails: string
): void {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(`
    UPDATE orders
    SET status = 'TRANSFERRED', confirmation_code = ?, ticket_details = ?, updated_at = ?
    WHERE id = ? AND status = 'TRANSFERRING'
  `).run(confirmationCode, ticketDetails, now, id);
}

export function approveOrder(id: string): void {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(`
    UPDATE orders SET status = 'COMPLETED', updated_at = ?
    WHERE id = ? AND status = 'TRANSFERRED'
  `).run(now, id);
}

export function disputeOrder(id: string): void {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(`
    UPDATE orders SET status = 'DISPUTED', updated_at = ?
    WHERE id = ? AND status = 'TRANSFERRED'
  `).run(now, id);
}

// ─── Proofs ──────────────────────────────────────────────

export function createProof(params: {
    provider_domain: string;
    proof_type: 'reclaim' | 'mock';
    attestations: Attestations;
    predicate_expr: string;
    raw_proof: string;
    signature: string;
}): ProofResult {
    const db = getDb();
    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
    INSERT INTO proofs (id, provider_domain, proof_type, attestations, predicate_expr, raw_proof, signature, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
        id,
        params.provider_domain,
        params.proof_type,
        JSON.stringify(params.attestations),
        params.predicate_expr,
        params.raw_proof,
        params.signature,
        now
    );

    return getProofById(id)!;
}

export function getProofById(id: string): ProofResult | undefined {
    const db = getDb();
    const row = db.prepare('SELECT * FROM proofs WHERE id = ?').get(id) as any;
    if (!row) return undefined;

    return {
        ...row,
        attestations: JSON.parse(row.attestations),
    };
}

// ─── Providers ───────────────────────────────────────────

/**
 * Check if there's already a PENDING or VERIFIED order for this provider+username.
 */
export function getActiveOrder(providerId: string, username: string): Order | undefined {
    const db = getDb();
    return db.prepare(
        `SELECT * FROM orders WHERE provider_id = ? AND username = ? AND status IN ('PENDING', 'VERIFIED') ORDER BY created_at DESC LIMIT 1`
    ).get(providerId, username) as Order | undefined;
}

export function getProviderById(id: string): any {
    const db = getDb();
    const row = db.prepare('SELECT * FROM providers WHERE id = ?').get(id) as any;
    if (!row) return undefined;
    return {
        ...row,
        selectors: row.selectors ? JSON.parse(row.selectors) : null,
    };
}

export function getAllProviders(): any[] {
    const db = getDb();
    return (db.prepare('SELECT * FROM providers').all() as any[]).map(row => ({
        ...row,
        selectors: row.selectors ? JSON.parse(row.selectors) : null,
    }));
}
