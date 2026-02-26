import { getDb } from './connection';
import fs from 'fs';
import path from 'path';
import type { ProviderRegistry } from '../types/provider';

export function initializeSchema(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      id             TEXT PRIMARY KEY,
      name           TEXT NOT NULL,
      login_url      TEXT NOT NULL,
      dashboard_url  TEXT NOT NULL,
      item_type      TEXT NOT NULL DEFAULT 'AIRMILES',
      selectors      TEXT,
      created_at     TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS proofs (
      id              TEXT PRIMARY KEY,
      provider_domain TEXT NOT NULL,
      proof_type      TEXT NOT NULL,
      attestations    TEXT NOT NULL,
      predicate_expr  TEXT NOT NULL,
      raw_proof       TEXT,
      signature       TEXT,
      created_at      TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id           TEXT PRIMARY KEY,
      item_type    TEXT NOT NULL,
      provider_id  TEXT NOT NULL,
      username     TEXT NOT NULL,
      amount       REAL NOT NULL,
      price        REAL,
      status       TEXT NOT NULL DEFAULT 'PENDING',
      proof_id     TEXT,
      error_msg    TEXT,
      created_at   TEXT DEFAULT (datetime('now')),
      updated_at   TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (provider_id) REFERENCES providers(id),
      FOREIGN KEY (proof_id)    REFERENCES proofs(id)
    );
  `);

  console.log('[DB] Schema initialized');
}

export function seedProviders(): void {
  const db = getDb();
  const registryPath = path.join(__dirname, '..', 'providers', 'airmiles.json');

  // Try dist path first, then src path
  let rawData: string;
  if (fs.existsSync(registryPath)) {
    rawData = fs.readFileSync(registryPath, 'utf-8');
  } else {
    const srcPath = path.join(__dirname, '..', '..', 'src', 'providers', 'airmiles.json');
    if (fs.existsSync(srcPath)) {
      rawData = fs.readFileSync(srcPath, 'utf-8');
    } else {
      console.warn('[DB] airmiles.json not found, skipping provider seed');
      return;
    }
  }

  const registry: ProviderRegistry = JSON.parse(rawData);
  const insert = db.prepare(`
    INSERT OR REPLACE INTO providers (id, name, login_url, dashboard_url, item_type, selectors)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((entries: [string, any][]) => {
    for (const [id, provider] of entries) {
      insert.run(id, provider.name, provider.login_url, provider.dashboard_url, provider.item_type, JSON.stringify(provider.selectors));
    }
  });

  insertMany(Object.entries(registry));
  console.log(`[DB] Seeded ${Object.keys(registry).length} providers`);
}
