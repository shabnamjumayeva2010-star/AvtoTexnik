import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import zlib from 'node:zlib';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import type {
  AdminSecurityConfigView,
  Client,
  ClientNotification,
  InventoryPart,
  MaintenanceItem,
  SecurityLogEntry,
  ServiceBooking,
  ServiceCatalogItem,
  ServiceRecord,
  Vehicle,
} from './src/types.ts';

const PORT = 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const SQLITE_FILE = path.join(DATA_DIR, 'avtotexnik.db');

const CRYPTO_SALT = process.env.ADMIN_CRYPTO_SALT || 'avtotexnik-protocol-v2-salt-2026';
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const DEFAULT_OPERATOR_ID = process.env.ADMIN_OPERATOR_ID || 'AT-ADMIN-01';
const DEFAULT_MASTER_PIN = process.env.ADMIN_MASTER_PIN || '482910';
const DEFAULT_SECURITY_PHRASE = process.env.ADMIN_SECURITY_PHRASE || 'KARDAN-770';

const MAX_FAILED_ATTEMPTS = 3;
const LOCKOUT_DURATION_MS = 60_000;
const SESSION_TTL_MS = 15 * 60_000;

const activeChallenges = new Map<string, { nonce: string; expiresAt: number }>();
const activeSessions = new Map<string, { operatorId: string; expiresAt: number }>();

const SERVICE_CATALOG: ServiceCatalogItem[] = [
  {
    id: 'cat-oil-synthetic',
    title: 'Sintetik Dvigatel Moyi va Filtr',
    subtitle: '5W-30 / 5W-40 original moy, moy filtri va karter diagnostikasi',
    durationLabel: '35 daqiqa',
    priceFromUzs: 480000,
    category: 'oil',
    imageUrl: '/src/assets/images/service_oil_engine_1795080892617.jpg',
    includedChecks: ['Eski moyni vakuumda tozalash', 'Original moy filtri almashtirish', 'Suyuqliklar sathini tekshirish'],
  },
  {
    id: 'cat-brakes-service',
    title: 'Tormoz Tizimi va Disklar Servisi',
    subtitle: 'Old/orqa tormoz kolodkalari, suport moylash va disk o‘lchovi',
    durationLabel: '50 daqiqa',
    priceFromUzs: 360000,
    category: 'brakes',
    imageUrl: '/src/assets/images/service_brakes_parts_1795080893720.jpg',
    includedChecks: ['Kolodka qalinligi nazorati', 'Tormoz suyuqligi namlik testi', 'Suport yo‘naltirgichlarini tozalash'],
  },
  {
    id: 'cat-filters-ignition',
    title: 'Havo, Salon Filtrlari va Svechalar',
    subtitle: 'Iridium o‘t oldirish shamlari va dvigatel nafas olish tizimi',
    durationLabel: '40 daqiqa',
    priceFromUzs: 410000,
    category: 'ignition',
    imageUrl: '/src/assets/images/service_oil_engine_1795080892617.jpg',
    includedChecks: ['Havo va salon filtrini almashtirish', 'Kompyuter OBD-II diagnostika', 'Sham bo‘shliqlarini kalibrlash'],
  },
  {
    id: 'cat-chassis-alignment',
    title: 'Yurish Qismi va 3D Razval-Balans',
    subtitle: 'Amortizatorlar, sharovoy tayanchlar va g‘ildirak geometriyasi',
    durationLabel: '60 daqiqa',
    priceFromUzs: 320000,
    category: 'chassis',
    imageUrl: '/src/assets/images/hero_garage_workshop_1795080894356.jpg',
    includedChecks: ['Podveska to‘liq ko‘rigi', '3D lazerli razval sozlash', 'Shina bosimi va protektor nazorati'],
  },
];

// --- Base32 & RFC 6238 TOTP helpers (zero external dependencies) ---
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function generateBase32Secret(byteLen = 20): string {
  const buf = crypto.randomBytes(byteLen);
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function decodeBase32(base32: string): Buffer {
  const clean = base32.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function computeTotpCode(secretBase32: string, stepOffset = 0): string {
  const key = decodeBase32(secretBase32);
  const counter = Math.floor(Date.now() / 1000 / 30) + stepOffset;
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter), 0);
  const hmac = crypto.createHmac('sha1', key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

function verifyTotpCode(secretBase32: string, code: string): boolean {
  const clean = code.trim();
  if (!/^\d{6}$/.test(clean)) return false;
  for (const offset of [-1, 0, 1]) {
    if (computeTotpCode(secretBase32, offset) === clean) {
      return true;
    }
  }
  return false;
}

function hashSecretHex(secret: string): string {
  return crypto.scryptSync(secret.trim(), CRYPTO_SALT, 64).toString('hex');
}

function verifySecretHex(input: string, expectedHex: string): boolean {
  const inputBuf = crypto.scryptSync(input.trim(), CRYPTO_SALT, 64);
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (inputBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(inputBuf, expectedBuf);
}

// --- SQLite Database Initialization ---
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new DatabaseSync(SQLITE_FILE);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    city TEXT NOT NULL,
    member_since TEXT NOT NULL,
    notifications_enabled INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS vehicles (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    brand TEXT NOT NULL,
    model TEXT NOT NULL,
    year INTEGER NOT NULL,
    plate_number TEXT NOT NULL,
    vin TEXT NOT NULL,
    current_km INTEGER NOT NULL,
    avg_daily_km INTEGER NOT NULL,
    oil_type TEXT NOT NULL,
    image_url TEXT
  );

  CREATE TABLE IF NOT EXISTS maintenance_items (
    id TEXT PRIMARY KEY,
    vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    interval_km INTEGER NOT NULL,
    interval_months INTEGER NOT NULL,
    last_service_km INTEGER NOT NULL,
    last_service_date TEXT NOT NULL,
    estimated_cost_uzs INTEGER NOT NULL,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS service_records (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    vehicle_label TEXT NOT NULL,
    date TEXT NOT NULL,
    odometer_km INTEGER NOT NULL,
    services_performed_json TEXT NOT NULL,
    parts_replaced_json TEXT NOT NULL,
    technician_name TEXT NOT NULL,
    warranty_months INTEGER NOT NULL,
    total_cost_uzs INTEGER NOT NULL,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    client_name TEXT NOT NULL,
    client_phone TEXT NOT NULL,
    vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    vehicle_label TEXT NOT NULL,
    plate_number TEXT NOT NULL,
    requested_services_json TEXT NOT NULL,
    preferred_date TEXT NOT NULL,
    preferred_time TEXT NOT NULL,
    status TEXT NOT NULL,
    assigned_master TEXT,
    estimated_cost_uzs INTEGER NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS inventory (
    id TEXT PRIMARY KEY,
    sku TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    brand TEXT NOT NULL,
    stock_qty INTEGER NOT NULL,
    min_threshold INTEGER NOT NULL,
    unit_price_uzs INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    vehicle_id TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL,
    read INTEGER NOT NULL DEFAULT 0,
    priority TEXT NOT NULL DEFAULT 'normal'
  );

  CREATE TABLE IF NOT EXISTS security_logs (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    event TEXT NOT NULL,
    actor TEXT NOT NULL,
    severity TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    details TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    operator_id TEXT NOT NULL,
    pin_hash TEXT NOT NULL,
    phrase_hash TEXT NOT NULL,
    totp_enabled INTEGER NOT NULL DEFAULT 0,
    totp_secret TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS rate_limits (
    ip_address TEXT PRIMARY KEY,
    attempts INTEGER NOT NULL DEFAULT 0,
    lockout_until INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS client_otps (
    client_id TEXT PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0
  );
`);

function seedDatabaseIfEmpty(): void {
  const existingConfig = db.prepare('SELECT id FROM admin_config WHERE id = 1').get();
  if (!existingConfig) {
    db.prepare(
      'INSERT INTO admin_config (id, operator_id, pin_hash, phrase_hash, totp_enabled, totp_secret) VALUES (1, ?, ?, ?, 0, ?)',
    ).run(
      DEFAULT_OPERATOR_ID,
      hashSecretHex(DEFAULT_MASTER_PIN),
      hashSecretHex(DEFAULT_SECURITY_PHRASE.toUpperCase()),
      generateBase32Secret(),
    );
  }

  const clientCountRow = db.prepare('SELECT COUNT(*) as cnt FROM clients').get() as { cnt: number };
  if (clientCountRow.cnt > 0) return;

  db.exec('BEGIN');
  try {
    const insertClient = db.prepare(
      'INSERT INTO clients (id, full_name, phone, city, member_since, notifications_enabled) VALUES (?, ?, ?, ?, ?, ?)',
    );
    insertClient.run('cli-azizbek', 'Azizbek Karimov', '+998 90 412 88 10', 'Toshkent', '2024-03-14', 1);
    insertClient.run('cli-dilnoza', 'Dilnoza Tursunova', '+998 93 551 24 09', 'Toshkent', '2025-01-20', 1);

    const insertVehicle = db.prepare(
      'INSERT INTO vehicles (id, client_id, brand, model, year, plate_number, vin, current_km, avg_daily_km, oil_type, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    insertVehicle.run(
      'veh-malibu',
      'cli-azizbek',
      'Chevrolet',
      'Malibu 2 Turbo',
      2022,
      '01 A 777 AA',
      '1G1ZD5ST4NF104829',
      84320,
      52,
      '5W-30 Dexos1 Gen3',
      '/src/assets/images/car_sedan_profile_1795080892208.jpg',
    );
    insertVehicle.run(
      'veh-cobalt',
      'cli-azizbek',
      'Chevrolet',
      'Cobalt LTZ',
      2023,
      '01 M 318 DA',
      'XWBJA69V8PA019442',
      36400,
      38,
      '5W-30 Synthetic',
      '/src/assets/images/car_sedan_profile_1795080892208.jpg',
    );
    insertVehicle.run(
      'veh-k5',
      'cli-dilnoza',
      'Kia',
      'K5 Prestige',
      2023,
      '01 B 452 KA',
      'KNAG3412BP5198201',
      42150,
      41,
      '0W-20 SP Full Synth',
      '/src/assets/images/car_sedan_profile_1795080892208.jpg',
    );

    const insertMnt = db.prepare(
      'INSERT INTO maintenance_items (id, vehicle_id, name, category, interval_km, interval_months, last_service_km, last_service_date, estimated_cost_uzs, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    insertMnt.run('mnt-1', 'veh-malibu', 'Dvigatel moyi (5W-30 Dexos1)', 'oil', 7000, 6, 77800, '2026-06-12', 540000, 'Turbo dvigatel uchun 7 000 km oralig‘ida almashtirish tavsiya etiladi.');
    insertMnt.run('mnt-2', 'veh-malibu', 'Moy filtri va karter probkasi', 'filter', 7000, 6, 77800, '2026-06-12', 110000, null);
    insertMnt.run('mnt-3', 'veh-malibu', 'Old tormoz kolodkalari (keramik)', 'brakes', 30000, 24, 53900, '2025-07-04', 490000, 'Qalinlik 3 mm dan kamayganda shoshilinch almashtirish zarur.');
    insertMnt.run('mnt-4', 'veh-malibu', 'Havo va salon filtrlari', 'filter', 15000, 12, 72500, '2026-03-19', 210000, null);
    insertMnt.run('mnt-5', 'veh-malibu', "O't oldirish shamlari (Iridium)", 'ignition', 35000, 24, 59000, '2025-10-08', 520000, null);
    insertMnt.run('mnt-6', 'veh-malibu', 'G‘ildirak 3D razval-balansirovka', 'chassis', 20000, 12, 74000, '2026-04-22', 260000, null);
    insertMnt.run('mnt-7', 'veh-cobalt', 'Dvigatel moyi (5W-30)', 'oil', 8000, 6, 30100, '2026-07-02', 390000, null);
    insertMnt.run('mnt-8', 'veh-cobalt', 'Akkumulyator va generator diagnostikasi', 'battery', 25000, 12, 20000, '2025-11-28', 140000, null);
    insertMnt.run('mnt-9', 'veh-k5', 'Dvigatel moyi (0W-20 SP)', 'oil', 7500, 6, 34200, '2026-05-15', 560000, null);
    insertMnt.run('mnt-10', 'veh-k5', 'Tormoz suyuqligi DOT-4 almashtirish', 'brakes', 40000, 24, 12000, '2024-12-10', 230000, null);

    const insertRec = db.prepare(
      'INSERT INTO service_records (id, client_id, vehicle_id, vehicle_label, date, odometer_km, services_performed_json, parts_replaced_json, technician_name, warranty_months, total_cost_uzs, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    insertRec.run(
      'rec-1042',
      'cli-azizbek',
      'veh-malibu',
      'Chevrolet Malibu 2 Turbo (01 A 777 AA)',
      '2026-06-12',
      77800,
      JSON.stringify(['Dvigatel moyi almashtirish', 'Moy filtri yangilash', 'OBD-II kompyuter diagnostikasi']),
      JSON.stringify(['5W-30 Dexos1 Gen3 (5L)', 'ACDelco PF64 moy filtri']),
      'Sardorbek Xolmatov',
      6,
      650000,
      'Dvigatel bosimi va turbina holati me’yorda.',
    );
    insertRec.run(
      'rec-0985',
      'cli-azizbek',
      'veh-malibu',
      'Chevrolet Malibu 2 Turbo (01 A 777 AA)',
      '2026-04-22',
      74000,
      JSON.stringify(['3D razval-balansirovka', 'Old podveska ko‘rigi']),
      JSON.stringify(['Balans og‘irliklari to‘plami']),
      'Jasur Rahimov',
      3,
      260000,
      null,
    );
    insertRec.run(
      'rec-0911',
      'cli-azizbek',
      'veh-malibu',
      'Chevrolet Malibu 2 Turbo (01 A 777 AA)',
      '2026-03-19',
      72500,
      JSON.stringify(['Havo va salon filtrini almashtirish', 'Drossel zaslonkasini tozalash']),
      JSON.stringify(['Original havo filtri', 'Uglerodli salon filtri']),
      'Sardorbek Xolmatov',
      6,
      340000,
      null,
    );
    insertRec.run(
      'rec-0840',
      'cli-dilnoza',
      'veh-k5',
      'Kia K5 Prestige (01 B 452 KA)',
      '2026-05-15',
      34200,
      JSON.stringify(['0W-20 sintetik moy almashtirish', 'Filtrlar majmuasi']),
      JSON.stringify(['Kia Original 0W-20 (4.5L)', 'Hyundai/Kia moy filtri']),
      'Otabek Rustamov',
      6,
      610000,
      null,
    );

    const insertBkg = db.prepare(
      'INSERT INTO bookings (id, client_id, client_name, client_phone, vehicle_id, vehicle_label, plate_number, requested_services_json, preferred_date, preferred_time, status, assigned_master, estimated_cost_uzs, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    insertBkg.run(
      'bkg-201',
      'cli-azizbek',
      'Azizbek Karimov',
      '+998 90 412 88 10',
      'veh-malibu',
      'Chevrolet Malibu 2 Turbo',
      '01 A 777 AA',
      JSON.stringify(['Old tormoz kolodkalari (keramik)', 'Dvigatel moyi (5W-30 Dexos1)']),
      '2026-11-21',
      '10:30',
      'pending',
      null,
      1030000,
      'Tormoz bosilganda yengil ovoz bor.',
      '2026-11-18T14:20:00Z',
    );
    insertBkg.run(
      'bkg-202',
      'cli-dilnoza',
      'Dilnoza Tursunova',
      '+998 93 551 24 09',
      'veh-k5',
      'Kia K5 Prestige',
      '01 B 452 KA',
      JSON.stringify(['Dvigatel moyi (0W-20 SP)']),
      '2026-11-20',
      '15:00',
      'in_progress',
      'Otabek Rustamov',
      560000,
      null,
      '2026-11-18T09:10:00Z',
    );

    const insertInv = db.prepare(
      'INSERT INTO inventory (id, sku, name, category, brand, stock_qty, min_threshold, unit_price_uzs) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    );
    insertInv.run('inv-1', 'OIL-5W30-DX1', 'Dvigatel moyi 5W-30 Dexos1 (4L)', 'oil', 'Mobil 1', 24, 8, 460000);
    insertInv.run('inv-2', 'OIL-0W20-SP', 'Dvigatel moyi 0W-20 SP (4L)', 'oil', 'Liqui Moly', 6, 8, 520000);
    insertInv.run('inv-3', 'BRK-CER-MLB', 'Old tormoz kolodkalari (Keramik)', 'brakes', 'Brembo', 5, 6, 440000);
    insertInv.run('inv-4', 'FLT-OIL-GEN', 'Moy filtri (GM / Kia / Hyundai)', 'filter', 'Mann-Filter', 42, 12, 95000);
    insertInv.run('inv-5', 'IGN-IRD-4X', "O't oldirish shamlari to'plami (4 dona)", 'ignition', 'NGK Iridium', 11, 5, 480000);

    const insertNtf = db.prepare(
      'INSERT INTO notifications (id, client_id, vehicle_id, title, message, created_at, read, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    );
    insertNtf.run(
      'ntf-1',
      'cli-azizbek',
      'veh-malibu',
      'Old tormoz kolodkalari muddati o‘tdi',
      'Malibu 2 Turbo (84 320 km): old kolodkalar resursi tugagan. Xavfsizlik uchun almashtirish tavsiya etiladi.',
      '2026-11-19T06:00:00Z',
      0,
      'high',
    );
    insertNtf.run(
      'ntf-2',
      'cli-azizbek',
      'veh-malibu',
      'Dvigatel moyini yangilash yaqinlashdi',
      '5W-30 Dexos1 moyi almashtirishigacha atigi 480 km qoldi (reja: 84 800 km).',
      '2026-11-19T06:15:00Z',
      0,
      'high',
    );

    const insertLog = db.prepare(
      'INSERT INTO security_logs (id, timestamp, event, actor, severity, ip_address, details) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    insertLog.run(
      'sec-1',
      new Date().toISOString(),
      'SQLite xavfsizlik bazasi ishga tushdi',
      'SYSTEM',
      'info',
      '127.0.0.1',
      'Relatsion ma’lumotlar bazasi, TOTP 2FA moduli va doimiy brute-force cheklovi faollashtirildi.',
    );
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

seedDatabaseIfEmpty();

// --- Row Mappers ---
function mapClient(r: Record<string, unknown>): Client {
  return {
    id: String(r.id),
    fullName: String(r.full_name),
    phone: String(r.phone),
    city: String(r.city),
    memberSince: String(r.member_since),
    notificationsEnabled: Boolean(r.notifications_enabled),
  };
}

function mapVehicle(r: Record<string, unknown>): Vehicle {
  return {
    id: String(r.id),
    clientId: String(r.client_id),
    brand: String(r.brand),
    model: String(r.model),
    year: Number(r.year),
    plateNumber: String(r.plate_number),
    vin: String(r.vin),
    currentKm: Number(r.current_km),
    avgDailyKm: Number(r.avg_daily_km),
    oilType: String(r.oil_type),
    imageUrl: r.image_url ? String(r.image_url) : undefined,
  };
}

function mapMaintenance(r: Record<string, unknown>): MaintenanceItem {
  return {
    id: String(r.id),
    vehicleId: String(r.vehicle_id),
    name: String(r.name),
    category: String(r.category) as MaintenanceItem['category'],
    intervalKm: Number(r.interval_km),
    intervalMonths: Number(r.interval_months),
    lastServiceKm: Number(r.last_service_km),
    lastServiceDate: String(r.last_service_date),
    estimatedCostUzs: Number(r.estimated_cost_uzs),
    notes: r.notes ? String(r.notes) : undefined,
  };
}

function mapRecord(r: Record<string, unknown>): ServiceRecord {
  return {
    id: String(r.id),
    clientId: String(r.client_id),
    vehicleId: String(r.vehicle_id),
    vehicleLabel: String(r.vehicle_label),
    date: String(r.date),
    odometerKm: Number(r.odometer_km),
    servicesPerformed: JSON.parse(String(r.services_performed_json)),
    partsReplaced: JSON.parse(String(r.parts_replaced_json)),
    technicianName: String(r.technician_name),
    warrantyMonths: Number(r.warranty_months),
    totalCostUzs: Number(r.total_cost_uzs),
    notes: r.notes ? String(r.notes) : undefined,
  };
}

function mapBooking(r: Record<string, unknown>): ServiceBooking {
  return {
    id: String(r.id),
    clientId: String(r.client_id),
    clientName: String(r.client_name),
    clientPhone: String(r.client_phone),
    vehicleId: String(r.vehicle_id),
    vehicleLabel: String(r.vehicle_label),
    plateNumber: String(r.plate_number),
    requestedServices: JSON.parse(String(r.requested_services_json)),
    preferredDate: String(r.preferred_date),
    preferredTime: String(r.preferred_time),
    status: String(r.status) as ServiceBooking['status'],
    assignedMaster: r.assigned_master ? String(r.assigned_master) : undefined,
    estimatedCostUzs: Number(r.estimated_cost_uzs),
    notes: r.notes ? String(r.notes) : undefined,
    createdAt: String(r.created_at),
  };
}

function mapInventory(r: Record<string, unknown>): InventoryPart {
  return {
    id: String(r.id),
    sku: String(r.sku),
    name: String(r.name),
    category: String(r.category) as InventoryPart['category'],
    brand: String(r.brand),
    stockQty: Number(r.stock_qty),
    minThreshold: Number(r.min_threshold),
    unitPriceUzs: Number(r.unit_price_uzs),
  };
}

function mapNotification(r: Record<string, unknown>): ClientNotification {
  return {
    id: String(r.id),
    clientId: String(r.client_id),
    vehicleId: String(r.vehicle_id),
    title: String(r.title),
    message: String(r.message),
    createdAt: String(r.created_at),
    read: Boolean(r.read),
    priority: String(r.priority) as ClientNotification['priority'],
  };
}

function mapSecurityLog(r: Record<string, unknown>): SecurityLogEntry {
  return {
    id: String(r.id),
    timestamp: String(r.timestamp),
    event: String(r.event),
    actor: String(r.actor),
    severity: String(r.severity) as SecurityLogEntry['severity'],
    ipAddress: String(r.ip_address),
    details: String(r.details),
  };
}

function addSecurityLog(
  event: string,
  actor: string,
  severity: 'info' | 'warning' | 'critical',
  ipAddress: string,
  details: string,
): void {
  db.prepare(
    'INSERT INTO security_logs (id, timestamp, event, actor, severity, ip_address, details) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(`sec-${crypto.randomBytes(4).toString('hex')}`, new Date().toISOString(), event, actor, severity, ipAddress, details);
}

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || '127.0.0.1';
}

function getAdminConfig(): {
  operatorId: string;
  pinHash: string;
  phraseHash: string;
  totpEnabled: boolean;
  totpSecret: string;
} {
  const row = db.prepare('SELECT * FROM admin_config WHERE id = 1').get() as Record<string, unknown>;
  return {
    operatorId: String(row.operator_id),
    pinHash: String(row.pin_hash),
    phraseHash: String(row.phrase_hash),
    totpEnabled: Boolean(row.totp_enabled),
    totpSecret: String(row.totp_secret),
  };
}

function buildSecurityConfigView(): AdminSecurityConfigView {
  const cfg = getAdminConfig();
  const lockedRow = db
    .prepare('SELECT COUNT(*) as cnt FROM rate_limits WHERE lockout_until > ?')
    .get(Date.now()) as { cnt: number };
  return {
    operatorId: cfg.operatorId,
    totpEnabled: cfg.totpEnabled,
    totpSecret: cfg.totpSecret,
    otpAuthUri: `otpauth://totp/AvtoTexnik:${cfg.operatorId}?secret=${cfg.totpSecret}&issuer=AvtoTexnik`,
    currentTotpPreview: computeTotpCode(cfg.totpSecret, 0),
    lockedIpCount: lockedRow.cnt,
  };
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Ruxsat rad etildi: xavfsizlik tokeni topilmadi.' });
    return;
  }
  const token = authHeader.slice(7).trim();
  const session = activeSessions.get(token);
  if (!session || Date.now() > session.expiresAt) {
    if (session) activeSessions.delete(token);
    res.status(401).json({ error: 'Sessiya muddati tugagan. Qayta tasdiqlash talab etiladi.' });
    return;
  }
  next();
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', database: 'sqlite', timestamp: new Date().toISOString() });
  });

  app.get('/api/bootstrap', (req, res) => {
    const allClients = db.prepare('SELECT * FROM clients').all().map(mapClient);
    const requestedClientId = typeof req.query.clientId === 'string' ? req.query.clientId : allClients[0]?.id;
    const activeClient = allClients.find((c) => c.id === requestedClientId) || allClients[0];

    const clientVehicles = db.prepare('SELECT * FROM vehicles WHERE client_id = ?').all(activeClient.id).map(mapVehicle);
    const vehicleIds = clientVehicles.map((v) => v.id);

    let clientMaintenance: MaintenanceItem[] = [];
    if (vehicleIds.length > 0) {
      const placeholders = vehicleIds.map(() => '?').join(',');
      clientMaintenance = db
        .prepare(`SELECT * FROM maintenance_items WHERE vehicle_id IN (${placeholders})`)
        .all(...vehicleIds)
        .map(mapMaintenance);
    }

    const clientRecords = db
      .prepare('SELECT * FROM service_records WHERE client_id = ? ORDER BY date DESC, rowid DESC')
      .all(activeClient.id)
      .map(mapRecord);

    const clientBookings = db
      .prepare('SELECT * FROM bookings WHERE client_id = ? ORDER BY created_at DESC')
      .all(activeClient.id)
      .map(mapBooking);

    const clientNotifications = db
      .prepare('SELECT * FROM notifications WHERE client_id = ? ORDER BY created_at DESC')
      .all(activeClient.id)
      .map(mapNotification);

    res.json({
      activeClient,
      clientsSummary: allClients.map((c) => ({ id: c.id, fullName: c.fullName, phone: c.phone })),
      vehicles: clientVehicles,
      maintenanceItems: clientMaintenance,
      serviceRecords: clientRecords,
      bookings: clientBookings,
      notifications: clientNotifications,
      catalog: SERVICE_CATALOG,
    });
  });

  // --- Client Auth: OTP Request + Verify + Instant Demo Switch ---
  app.post('/api/clients/request-otp', (req, res) => {
    const { query } = req.body as { query?: string };
    const normalized = (query || '').replace(/\s+/g, '').toLowerCase();
    if (!normalized) {
      res.status(400).json({ error: 'Telefon raqam yoki davlat raqamini kiriting.' });
      return;
    }

    const allClients = db.prepare('SELECT * FROM clients').all().map(mapClient);
    let matchedClient = allClients.find((c) => c.phone.replace(/\s+/g, '').toLowerCase().includes(normalized));

    if (!matchedClient) {
      const allVehicles = db.prepare('SELECT * FROM vehicles').all().map(mapVehicle);
      const matchedVehicle = allVehicles.find((v) => v.plateNumber.replace(/\s+/g, '').toLowerCase().includes(normalized));
      if (matchedVehicle) {
        matchedClient = allClients.find((c) => c.id === matchedVehicle.clientId);
      }
    }

    if (!matchedClient) {
      res.status(404).json({ error: 'Mijoz topilmadi. Telefon raqamingizni tekshiring yoki ro‘yxatdan o‘ting.' });
      return;
    }

    const otpCode = String(crypto.randomInt(1000, 9999));
    const expiresAt = Date.now() + 5 * 60_000;
    db.prepare('INSERT OR REPLACE INTO client_otps (client_id, code_hash, expires_at, attempts) VALUES (?, ?, ?, 0)').run(
      matchedClient.id,
      hashSecretHex(otpCode),
      expiresAt,
    );

    res.json({
      clientId: matchedClient.id,
      maskedPhone: matchedClient.phone.replace(/(\+\d{3}\s?\d{2})\s?\d{3}(\s?\d{2}\s?\d{2})/, '$1 ***$2'),
      demoOtpPreview: otpCode,
    });
  });

  app.post('/api/clients/verify-otp', (req, res) => {
    const { clientId, code } = req.body as { clientId?: string; code?: string };
    if (!clientId || !code) {
      res.status(400).json({ error: 'Tasdiqlash kodini kiriting.' });
      return;
    }

    const row = db.prepare('SELECT * FROM client_otps WHERE client_id = ?').get(clientId) as
      | { client_id: string; code_hash: string; expires_at: number; attempts: number }
      | undefined;

    if (!row || Date.now() > row.expires_at) {
      res.status(400).json({ error: 'Tasdiqlash kodi muddati tugagan. Qayta yuboring.' });
      return;
    }

    if (row.attempts >= 5) {
      res.status(429).json({ error: 'Kod kiritish urinishlari tugadi. Yangi kod so‘rang.' });
      return;
    }

    if (!verifySecretHex(code, row.code_hash)) {
      db.prepare('UPDATE client_otps SET attempts = attempts + 1 WHERE client_id = ?').run(clientId);
      res.status(403).json({ error: 'Tasdiqlash kodi noto‘g‘ri.' });
      return;
    }

    db.prepare('DELETE FROM client_otps WHERE client_id = ?').run(clientId);
    res.json({ clientId, verified: true });
  });

  app.post('/api/clients/register', (req, res) => {
    const { fullName, phone, city, brand, model, year, plateNumber, currentKm, oilType } = req.body as {
      fullName?: string;
      phone?: string;
      city?: string;
      brand?: string;
      model?: string;
      year?: number;
      plateNumber?: string;
      currentKm?: number;
      oilType?: string;
    };

    if (!fullName?.trim() || !phone?.trim() || !brand?.trim() || !model?.trim() || !plateNumber?.trim()) {
      res.status(400).json({ error: 'Barcha majburiy maydonlarni to‘ldiring.' });
      return;
    }

    const clientId = `cli-${crypto.randomBytes(4).toString('hex')}`;
    const vehicleId = `veh-${crypto.randomBytes(4).toString('hex')}`;
    const today = new Date().toISOString().slice(0, 10);
    const safeKm = Math.max(0, Number(currentKm) || 15000);
    const cleanOil = (oilType || '5W-30 Synthetic').trim();

    db.exec('BEGIN');
    try {
      db.prepare(
        'INSERT INTO clients (id, full_name, phone, city, member_since, notifications_enabled) VALUES (?, ?, ?, ?, ?, 1)',
      ).run(clientId, fullName.trim(), phone.trim(), (city || 'Toshkent').trim(), today);

      db.prepare(
        'INSERT INTO vehicles (id, client_id, brand, model, year, plate_number, vin, current_km, avg_daily_km, oil_type, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(
        vehicleId,
        clientId,
        brand.trim(),
        model.trim(),
        Number(year) || 2023,
        plateNumber.trim().toUpperCase(),
        `UZ${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
        safeKm,
        40,
        cleanOil,
        '/src/assets/images/car_sedan_profile_1795080892208.jpg',
      );

      const insMnt = db.prepare(
        'INSERT INTO maintenance_items (id, vehicle_id, name, category, interval_km, interval_months, last_service_km, last_service_date, estimated_cost_uzs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      );
      insMnt.run(`mnt-${crypto.randomBytes(4).toString('hex')}`, vehicleId, `Dvigatel moyi (${cleanOil})`, 'oil', 7500, 6, Math.max(0, safeKm - 5200), today, 480000);
      insMnt.run(`mnt-${crypto.randomBytes(4).toString('hex')}`, vehicleId, 'Moy va havo filtrlari', 'filter', 10000, 9, Math.max(0, safeKm - 6100), today, 190000);
      insMnt.run(`mnt-${crypto.randomBytes(4).toString('hex')}`, vehicleId, 'Tormoz kolodkalari tekshiruvi', 'brakes', 30000, 18, Math.max(0, safeKm - 12000), today, 420000);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    res.status(201).json({ clientId, vehicleId });
  });

  app.post('/api/vehicles', (req, res) => {
    const { clientId, brand, model, year, plateNumber, currentKm, oilType } = req.body as {
      clientId?: string;
      brand?: string;
      model?: string;
      year?: number;
      plateNumber?: string;
      currentKm?: number;
      oilType?: string;
    };

    const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId || '');
    if (!client) {
      res.status(404).json({ error: 'Mijoz topilmadi.' });
      return;
    }
    if (!brand?.trim() || !model?.trim() || !plateNumber?.trim()) {
      res.status(400).json({ error: 'Avtomobil rusumi va davlat raqami majburiy.' });
      return;
    }

    const vehicleId = `veh-${crypto.randomBytes(4).toString('hex')}`;
    const safeKm = Math.max(0, Number(currentKm) || 0);
    const today = new Date().toISOString().slice(0, 10);
    const cleanOil = (oilType || '5W-30 Synthetic').trim();
    const vin = `UZ${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

    db.exec('BEGIN');
    try {
      db.prepare(
        'INSERT INTO vehicles (id, client_id, brand, model, year, plate_number, vin, current_km, avg_daily_km, oil_type, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(
        vehicleId,
        clientId!,
        brand.trim(),
        model.trim(),
        Number(year) || 2024,
        plateNumber.trim().toUpperCase(),
        vin,
        safeKm,
        42,
        cleanOil,
        '/src/assets/images/car_sedan_profile_1795080892208.jpg',
      );

      const insMnt = db.prepare(
        'INSERT INTO maintenance_items (id, vehicle_id, name, category, interval_km, interval_months, last_service_km, last_service_date, estimated_cost_uzs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      );
      insMnt.run(`mnt-${crypto.randomBytes(4).toString('hex')}`, vehicleId, `Dvigatel moyi (${cleanOil})`, 'oil', 7000, 6, safeKm, today, 480000);
      insMnt.run(`mnt-${crypto.randomBytes(4).toString('hex')}`, vehicleId, 'Havo va moy filtrlari', 'filter', 10000, 9, safeKm, today, 185000);
      insMnt.run(`mnt-${crypto.randomBytes(4).toString('hex')}`, vehicleId, 'Tormoz kolodkalari nazorati', 'brakes', 30000, 18, safeKm, today, 430000);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    const created = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicleId) as Record<string, unknown>;
    res.status(201).json(mapVehicle(created));
  });

  app.patch('/api/vehicles/:id/odometer', (req, res) => {
    const vehicleRow = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
    if (!vehicleRow) {
      res.status(404).json({ error: 'Avtomobil topilmadi.' });
      return;
    }

    const nextKm = Number(req.body?.currentKm);
    if (!Number.isFinite(nextKm) || nextKm < 0) {
      res.status(400).json({ error: 'Probeg qiymati noto‘g‘ri.' });
      return;
    }

    db.prepare('UPDATE vehicles SET current_km = ? WHERE id = ?').run(Math.round(nextKm), req.params.id);
    const updated = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id) as Record<string, unknown>;
    res.json(mapVehicle(updated));
  });

  // --- Client Custom Spare Part / Maintenance Item CRUD ---
  app.post('/api/maintenance', (req, res) => {
    const { vehicleId, name, category, intervalKm, intervalMonths, lastServiceKm, lastServiceDate, estimatedCostUzs, notes } =
      req.body as {
        vehicleId?: string;
        name?: string;
        category?: MaintenanceItem['category'];
        intervalKm?: number;
        intervalMonths?: number;
        lastServiceKm?: number;
        lastServiceDate?: string;
        estimatedCostUzs?: number;
        notes?: string;
      };

    const vehicleRow = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicleId || '') as
      | Record<string, unknown>
      | undefined;
    if (!vehicleRow) {
      res.status(404).json({ error: 'Avtomobil topilmadi.' });
      return;
    }
    if (!name?.trim()) {
      res.status(400).json({ error: 'Ehtiyot qism yoki xizmat nomini kiriting.' });
      return;
    }

    const id = `mnt-${crypto.randomBytes(4).toString('hex')}`;
    const today = new Date().toISOString().slice(0, 10);
    db.prepare(
      'INSERT INTO maintenance_items (id, vehicle_id, name, category, interval_km, interval_months, last_service_km, last_service_date, estimated_cost_uzs, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      id,
      vehicleId!,
      name.trim(),
      category || 'chassis',
      Math.max(500, Number(intervalKm) || 10000),
      Math.max(1, Number(intervalMonths) || 12),
      Math.max(0, Number(lastServiceKm) ?? Number(vehicleRow.current_km)),
      lastServiceDate || today,
      Math.max(0, Number(estimatedCostUzs) || 250000),
      notes?.trim() || null,
    );

    const created = db.prepare('SELECT * FROM maintenance_items WHERE id = ?').get(id) as Record<string, unknown>;
    res.status(201).json(mapMaintenance(created));
  });

  app.delete('/api/maintenance/:id', (req, res) => {
    const info = db.prepare('DELETE FROM maintenance_items WHERE id = ?').run(req.params.id);
    if (info.changes === 0) {
      res.status(404).json({ error: 'Nazorat bandi topilmadi.' });
      return;
    }
    res.json({ ok: true });
  });

  app.post('/api/vehicles/:id/complete-task', (req, res) => {
    const vehicleRow = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!vehicleRow) {
      res.status(404).json({ error: 'Avtomobil topilmadi.' });
      return;
    }
    const vehicle = mapVehicle(vehicleRow);

    const { maintenanceItemId, technicianName, actualCostUzs, notes } = req.body as {
      maintenanceItemId?: string;
      technicianName?: string;
      actualCostUzs?: number;
      notes?: string;
    };

    const itemRow = db
      .prepare('SELECT * FROM maintenance_items WHERE id = ? AND vehicle_id = ?')
      .get(maintenanceItemId || '', vehicle.id) as Record<string, unknown> | undefined;
    if (!itemRow) {
      res.status(404).json({ error: 'Texnik nazorat bandi topilmadi.' });
      return;
    }
    const item = mapMaintenance(itemRow);

    const today = new Date().toISOString().slice(0, 10);
    const recordId = `rec-${crypto.randomBytes(3).toString('hex')}`;
    const totalCost = Number(actualCostUzs) || item.estimatedCostUzs;
    const tech = (technicianName || 'Sardorbek Xolmatov').trim();

    db.exec('BEGIN');
    try {
      db.prepare('UPDATE maintenance_items SET last_service_km = ?, last_service_date = ? WHERE id = ?').run(
        vehicle.currentKm,
        today,
        item.id,
      );
      db.prepare(
        'INSERT INTO service_records (id, client_id, vehicle_id, vehicle_label, date, odometer_km, services_performed_json, parts_replaced_json, technician_name, warranty_months, total_cost_uzs, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(
        recordId,
        vehicle.clientId,
        vehicle.id,
        `${vehicle.brand} ${vehicle.model} (${vehicle.plateNumber})`,
        today,
        vehicle.currentKm,
        JSON.stringify([`${item.name} — rejali almashtirish`]),
        JSON.stringify([item.name]),
        tech,
        6,
        totalCost,
        notes?.trim() || null,
      );
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    const updatedItem = mapMaintenance(
      db.prepare('SELECT * FROM maintenance_items WHERE id = ?').get(item.id) as Record<string, unknown>,
    );
    const createdRecord = mapRecord(
      db.prepare('SELECT * FROM service_records WHERE id = ?').get(recordId) as Record<string, unknown>,
    );
    res.json({ item: updatedItem, record: createdRecord });
  });

  app.post('/api/clients/:id/notifications/read', (req, res) => {
    db.prepare('UPDATE notifications SET read = 1 WHERE client_id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  app.post('/api/bookings', (req, res) => {
    const { clientId, vehicleId, requestedServices, preferredDate, preferredTime, notes } = req.body as {
      clientId?: string;
      vehicleId?: string;
      requestedServices?: string[];
      preferredDate?: string;
      preferredTime?: string;
      notes?: string;
    };

    const clientRow = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId || '') as
      | Record<string, unknown>
      | undefined;
    const vehicleRow = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicleId || '') as
      | Record<string, unknown>
      | undefined;

    if (!clientRow || !vehicleRow) {
      res.status(404).json({ error: 'Mijoz yoki avtomobil topilmadi.' });
      return;
    }

    if (!Array.isArray(requestedServices) || requestedServices.length === 0) {
      res.status(400).json({ error: 'Kamida bitta xizmat turini tanlang.' });
      return;
    }

    const client = mapClient(clientRow);
    const vehicle = mapVehicle(vehicleRow);
    const bookingId = `bkg-${crypto.randomBytes(3).toString('hex')}`;
    const estimatedCostUzs = requestedServices.length * 420000;
    const pDate = preferredDate || new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const pTime = preferredTime || '11:00';
    const createdAt = new Date().toISOString();

    db.prepare(
      'INSERT INTO bookings (id, client_id, client_name, client_phone, vehicle_id, vehicle_label, plate_number, requested_services_json, preferred_date, preferred_time, status, assigned_master, estimated_cost_uzs, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      bookingId,
      client.id,
      client.fullName,
      client.phone,
      vehicle.id,
      `${vehicle.brand} ${vehicle.model}`,
      vehicle.plateNumber,
      JSON.stringify(requestedServices),
      pDate,
      pTime,
      'pending',
      null,
      estimatedCostUzs,
      notes?.trim() || null,
      createdAt,
    );

    const created = mapBooking(
      db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId) as Record<string, unknown>,
    );
    res.status(201).json(created);
  });

  // --- SECRET ADMIN PROTOCOL ROUTES ---
  app.post('/api/admin/challenge', (req, res) => {
    const ip = getClientIp(req);
    const rate = db.prepare('SELECT * FROM rate_limits WHERE ip_address = ?').get(ip) as
      | { ip_address: string; attempts: number; lockout_until: number }
      | undefined;

    if (rate && rate.lockout_until > Date.now()) {
      const retryAfterSeconds = Math.ceil((rate.lockout_until - Date.now()) / 1000);
      res.status(429).json({
        locked: true,
        retryAfterSeconds,
        error: `Xavfsizlik bloki faol. ${retryAfterSeconds} soniyadan keyin urinib ko'ring.`,
      });
      return;
    }

    const cfg = getAdminConfig();
    const challengeId = crypto.randomBytes(8).toString('hex');
    const nonce = crypto.randomBytes(4).toString('hex').toUpperCase();
    activeChallenges.set(challengeId, { nonce, expiresAt: Date.now() + 120_000 });

    res.json({
      challengeId,
      nonce,
      protocolVersion: 'PROTO-3X',
      totpRequired: cfg.totpEnabled,
      remainingAttempts: MAX_FAILED_ATTEMPTS - (rate?.attempts || 0),
    });
  });

  app.post('/api/admin/verify', (req, res) => {
    const ip = getClientIp(req);
    const rateRow = db.prepare('SELECT * FROM rate_limits WHERE ip_address = ?').get(ip) as
      | { ip_address: string; attempts: number; lockout_until: number }
      | undefined;

    const currentAttempts = rateRow?.attempts || 0;
    const lockoutUntil = rateRow?.lockout_until || 0;

    if (lockoutUntil > Date.now()) {
      const retryAfterSeconds = Math.ceil((lockoutUntil - Date.now()) / 1000);
      res.status(429).json({
        locked: true,
        retryAfterSeconds,
        error: `Brute-force himoyasi faol. ${retryAfterSeconds} soniya kuting.`,
      });
      return;
    }

    const { challengeId, operatorId, pin, phrase, totpCode } = req.body as {
      challengeId?: string;
      operatorId?: string;
      pin?: string;
      phrase?: string;
      totpCode?: string;
    };

    const challenge = challengeId ? activeChallenges.get(challengeId) : undefined;
    if (!challenge || Date.now() > challenge.expiresAt) {
      res.status(400).json({ error: 'Xavfsizlik sessiya kodi eskirgan. Qayta oching.' });
      return;
    }
    activeChallenges.delete(challengeId!);

    const cfg = getAdminConfig();
    const operatorOk = (operatorId || '').trim().toUpperCase() === cfg.operatorId.toUpperCase();
    const pinOk = typeof pin === 'string' && verifySecretHex(pin, cfg.pinHash);
    const phraseOk = typeof phrase === 'string' && verifySecretHex(phrase.toUpperCase(), cfg.phraseHash);
    const totpOk = !cfg.totpEnabled || (typeof totpCode === 'string' && verifyTotpCode(cfg.totpSecret, totpCode));

    if (!operatorOk || !pinOk || !phraseOk || !totpOk) {
      const nextAttempts = currentAttempts + 1;
      if (nextAttempts >= MAX_FAILED_ATTEMPTS) {
        const nextLockout = Date.now() + LOCKOUT_DURATION_MS;
        db.prepare('INSERT OR REPLACE INTO rate_limits (ip_address, attempts, lockout_until) VALUES (?, 0, ?)').run(
          ip,
          nextLockout,
        );
        addSecurityLog(
          'Ruxsatsiz kirish bloki (60s)',
          operatorId || "Noma'lum",
          'critical',
          ip,
          'Ketma-ket 3 ta noto‘g‘ri protokol tasdiqlash urinishi aniqlandi (SQLite da qayd etildi).',
        );
        res.status(429).json({
          locked: true,
          retryAfterSeconds: 60,
          error: '3 marta noto‘g‘ri urinish! Xavfsizlik bloki 60 soniyaga yoqildi.',
        });
        return;
      }

      db.prepare('INSERT OR REPLACE INTO rate_limits (ip_address, attempts, lockout_until) VALUES (?, ?, 0)').run(
        ip,
        nextAttempts,
      );
      addSecurityLog(
        'Muvaffaqiyatsiz autentifikatsiya',
        operatorId || "Noma'lum",
        'warning',
        ip,
        `Qolgan urinishlar: ${MAX_FAILED_ATTEMPTS - nextAttempts}`,
      );
      res.status(403).json({
        locked: false,
        remainingAttempts: MAX_FAILED_ATTEMPTS - nextAttempts,
        error: `Protokol ma'lumotlari mos kelmadi. Qolgan urinishlar: ${MAX_FAILED_ATTEMPTS - nextAttempts}`,
      });
      return;
    }

    db.prepare('DELETE FROM rate_limits WHERE ip_address = ?').run(ip);
    const rawToken = crypto
      .createHmac('sha256', SESSION_SECRET)
      .update(`${cfg.operatorId}:${Date.now()}:${crypto.randomBytes(12).toString('hex')}`)
      .digest('hex');

    const expiresAt = Date.now() + SESSION_TTL_MS;
    activeSessions.set(rawToken, { operatorId: cfg.operatorId, expiresAt });

    addSecurityLog(
      'Admin sessiyasi ochildi',
      cfg.operatorId,
      'info',
      ip,
      cfg.totpEnabled
        ? 'Kriptografik kalit, fraza va TOTP 2FA muvaffaqiyatli tasdiqlandi.'
        : '2-bosqichli kriptografik kalit va maxfiy fraza tasdiqlandi.',
    );

    res.json({
      token: rawToken,
      operatorId: cfg.operatorId,
      expiresAt,
    });
  });

  app.post('/api/admin/logout', (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const session = token ? activeSessions.get(token) : undefined;
    if (token && session) {
      activeSessions.delete(token);
      addSecurityLog('Admin sessiyasi yopildi', session.operatorId, 'info', getClientIp(req), 'Tezkor qulflash orqali chiqildi.');
    }
    res.json({ ok: true });
  });

  app.get('/api/admin/overview', requireAdmin, (req, res) => {
    const token = req.headers.authorization!.slice(7).trim();
    const session = activeSessions.get(token)!;

    const clients = db.prepare('SELECT * FROM clients').all().map(mapClient);
    const vehicles = db.prepare('SELECT * FROM vehicles').all().map(mapVehicle);
    const maintenanceItems = db.prepare('SELECT * FROM maintenance_items').all().map(mapMaintenance);
    const serviceRecords = db.prepare('SELECT * FROM service_records ORDER BY date DESC, rowid DESC').all().map(mapRecord);
    const bookings = db.prepare('SELECT * FROM bookings ORDER BY created_at DESC').all().map(mapBooking);
    const inventory = db.prepare('SELECT * FROM inventory').all().map(mapInventory);
    const securityLogs = db.prepare('SELECT * FROM security_logs ORDER BY timestamp DESC LIMIT 100').all().map(mapSecurityLog);

    let overdueItemsCount = 0;
    for (const item of maintenanceItems) {
      const vehicle = vehicles.find((v) => v.id === item.vehicleId);
      if (vehicle && vehicle.currentKm >= item.lastServiceKm + item.intervalKm) {
        overdueItemsCount += 1;
      }
    }

    const lowStockCount = inventory.filter((i) => i.stockQty <= i.minThreshold).length;
    const activeBookings = bookings.filter((b) => b.status === 'pending' || b.status === 'in_progress').length;
    const monthlyRevenueUzs = serviceRecords.reduce((sum, r) => sum + r.totalCostUzs, 0);

    res.json({
      stats: {
        totalClients: clients.length,
        totalVehicles: vehicles.length,
        activeBookings,
        overdueItemsCount,
        lowStockCount,
        monthlyRevenueUzs,
      },
      clients,
      vehicles,
      maintenanceItems,
      serviceRecords,
      bookings,
      inventory,
      securityLogs,
      securityConfig: buildSecurityConfigView(),
      sessionExpiresAt: session.expiresAt,
    });
  });

  app.patch('/api/admin/security-config', requireAdmin, (req, res) => {
    const { newPin, newPhrase, totpEnabled, regenerateTotpSecret } = req.body as {
      newPin?: string;
      newPhrase?: string;
      totpEnabled?: boolean;
      regenerateTotpSecret?: boolean;
    };

    const cfg = getAdminConfig();
    let pinHash = cfg.pinHash;
    let phraseHash = cfg.phraseHash;
    let nextTotpEnabled = cfg.totpEnabled;
    let nextTotpSecret = cfg.totpSecret;
    const changes: string[] = [];

    if (newPin && newPin.trim().length >= 6) {
      pinHash = hashSecretHex(newPin.trim());
      changes.push('Master PIN yangilandi');
    }
    if (newPhrase && newPhrase.trim().length >= 5) {
      phraseHash = hashSecretHex(newPhrase.trim().toUpperCase());
      changes.push('Maxfiy fraza yangilandi');
    }
    if (typeof totpEnabled === 'boolean' && totpEnabled !== cfg.totpEnabled) {
      nextTotpEnabled = totpEnabled;
      changes.push(totpEnabled ? 'TOTP 2FA yoqildi' : 'TOTP 2FA o‘chirildi');
    }
    if (regenerateTotpSecret) {
      nextTotpSecret = generateBase32Secret();
      changes.push('TOTP maxfiy kaliti qayta yaratildi');
    }

    db.prepare('UPDATE admin_config SET pin_hash = ?, phrase_hash = ?, totp_enabled = ?, totp_secret = ? WHERE id = 1').run(
      pinHash,
      phraseHash,
      nextTotpEnabled ? 1 : 0,
      nextTotpSecret,
    );

    if (changes.length > 0) {
      addSecurityLog('Xavfsizlik sozlamalari o‘zgartirildi', cfg.operatorId, 'warning', getClientIp(req), changes.join(', '));
    }

    res.json(buildSecurityConfigView());
  });

  app.post('/api/admin/security/unlock-ips', requireAdmin, (req, res) => {
    const cfg = getAdminConfig();
    db.prepare('DELETE FROM rate_limits').run();
    addSecurityLog('Bloklangan IP manzillar tozalandi', cfg.operatorId, 'info', getClientIp(req), 'Barcha vaqtinchalik bloklar olib tashlandi.');
    res.json(buildSecurityConfigView());
  });

  app.post('/api/admin/service-records', requireAdmin, (req, res) => {
    const { vehicleId, servicesPerformed, partsReplaced, technicianName, warrantyMonths, totalCostUzs, odometerKm, notes } =
      req.body as {
        vehicleId?: string;
        servicesPerformed?: string[];
        partsReplaced?: string[];
        technicianName?: string;
        warrantyMonths?: number;
        totalCostUzs?: number;
        odometerKm?: number;
        notes?: string;
      };

    const vehicleRow = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicleId || '') as
      | Record<string, unknown>
      | undefined;
    if (!vehicleRow) {
      res.status(404).json({ error: 'Avtomobil topilmadi.' });
      return;
    }
    const vehicle = mapVehicle(vehicleRow);
    const services = Array.isArray(servicesPerformed) && servicesPerformed.length > 0 ? servicesPerformed : ['Texnik ko‘rik'];
    const parts = Array.isArray(partsReplaced) && partsReplaced.length > 0 ? partsReplaced : services;
    const finalKm = Math.max(vehicle.currentKm, Number(odometerKm) || vehicle.currentKm);
    const today = new Date().toISOString().slice(0, 10);
    const recordId = `rec-${crypto.randomBytes(3).toString('hex')}`;
    const cfg = getAdminConfig();

    db.exec('BEGIN');
    try {
      db.prepare('UPDATE vehicles SET current_km = ? WHERE id = ?').run(finalKm, vehicle.id);
      db.prepare(
        'INSERT INTO service_records (id, client_id, vehicle_id, vehicle_label, date, odometer_km, services_performed_json, parts_replaced_json, technician_name, warranty_months, total_cost_uzs, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(
        recordId,
        vehicle.clientId,
        vehicle.id,
        `${vehicle.brand} ${vehicle.model} (${vehicle.plateNumber})`,
        today,
        finalKm,
        JSON.stringify(services),
        JSON.stringify(parts),
        (technicianName || 'Sardorbek Xolmatov').trim(),
        Math.max(1, Number(warrantyMonths) || 6),
        Math.max(0, Number(totalCostUzs) || 350000),
        notes?.trim() || null,
      );
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    addSecurityLog(
      'Admin servis akti kiritdi',
      cfg.operatorId,
      'info',
      getClientIp(req),
      `${vehicle.plateNumber}: ${services.join(', ')}`,
    );

    const created = mapRecord(
      db.prepare('SELECT * FROM service_records WHERE id = ?').get(recordId) as Record<string, unknown>,
    );
    res.status(201).json(created);
  });

  app.patch('/api/admin/bookings/:id', requireAdmin, (req, res) => {
    const row = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      res.status(404).json({ error: 'Buyurtma topilmadi.' });
      return;
    }
    const booking = mapBooking(row);
    const { status, assignedMaster } = req.body as {
      status?: ServiceBooking['status'];
      assignedMaster?: string;
    };

    const nextMaster = assignedMaster !== undefined ? assignedMaster.trim() : booking.assignedMaster || null;
    const prevStatus = booking.status;
    const nextStatus = status || booking.status;
    const cfg = getAdminConfig();

    db.exec('BEGIN');
    try {
      db.prepare('UPDATE bookings SET status = ?, assigned_master = ? WHERE id = ?').run(nextStatus, nextMaster, booking.id);

      if (nextStatus === 'completed' && prevStatus !== 'completed') {
        const vehicleRow = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(booking.vehicleId) as
          | Record<string, unknown>
          | undefined;
        const today = new Date().toISOString().slice(0, 10);
        if (vehicleRow) {
          const vehicle = mapVehicle(vehicleRow);
          db.prepare(
            'INSERT INTO service_records (id, client_id, vehicle_id, vehicle_label, date, odometer_km, services_performed_json, parts_replaced_json, technician_name, warranty_months, total_cost_uzs, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          ).run(
            `rec-${crypto.randomBytes(3).toString('hex')}`,
            booking.clientId,
            vehicle.id,
            `${vehicle.brand} ${vehicle.model} (${vehicle.plateNumber})`,
            today,
            vehicle.currentKm,
            JSON.stringify(booking.requestedServices),
            JSON.stringify(booking.requestedServices),
            nextMaster || 'Sardorbek Xolmatov',
            6,
            booking.estimatedCostUzs,
            booking.notes || 'Admin panel orqali yakunlandi.',
          );

          const mntItems = db.prepare('SELECT * FROM maintenance_items WHERE vehicle_id = ?').all(vehicle.id).map(mapMaintenance);
          for (const item of mntItems) {
            const matched = booking.requestedServices.some((reqSvc) =>
              reqSvc.toLowerCase().includes(item.name.slice(0, 10).toLowerCase()),
            );
            if (matched) {
              db.prepare('UPDATE maintenance_items SET last_service_km = ?, last_service_date = ? WHERE id = ?').run(
                vehicle.currentKm,
                today,
                item.id,
              );
            }
          }
        }
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    addSecurityLog(
      'Buyurtma holati yangilandi',
      cfg.operatorId,
      'info',
      getClientIp(req),
      `${booking.id}: ${prevStatus} → ${nextStatus}`,
    );

    const updated = mapBooking(db.prepare('SELECT * FROM bookings WHERE id = ?').get(booking.id) as Record<string, unknown>);
    res.json(updated);
  });

  app.patch('/api/admin/inventory/:id', requireAdmin, (req, res) => {
    const row = db.prepare('SELECT * FROM inventory WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      res.status(404).json({ error: 'Ehtiyot qism topilmadi.' });
      return;
    }
    const part = mapInventory(row);
    const { stockQty, unitPriceUzs } = req.body as { stockQty?: number; unitPriceUzs?: number };
    const nextQty = typeof stockQty === 'number' && stockQty >= 0 ? Math.round(stockQty) : part.stockQty;
    const nextPrice = typeof unitPriceUzs === 'number' && unitPriceUzs >= 0 ? Math.round(unitPriceUzs) : part.unitPriceUzs;

    db.prepare('UPDATE inventory SET stock_qty = ?, unit_price_uzs = ? WHERE id = ?').run(nextQty, nextPrice, part.id);
    const cfg = getAdminConfig();
    addSecurityLog('Ombor zaxirasi yangilandi', cfg.operatorId, 'info', getClientIp(req), `${part.sku} — soni: ${nextQty}`);

    const updated = mapInventory(db.prepare('SELECT * FROM inventory WHERE id = ?').get(part.id) as Record<string, unknown>);
    res.json(updated);
  });

  app.post('/api/admin/clients/:clientId/notify', requireAdmin, (req, res) => {
    const { vehicleId, title, message } = req.body as { vehicleId?: string; title?: string; message?: string };
    const clientRow = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.clientId) as
      | Record<string, unknown>
      | undefined;
    if (!clientRow) {
      res.status(404).json({ error: 'Mijoz topilmadi.' });
      return;
    }
    const client = mapClient(clientRow);
    const ntfId = `ntf-${crypto.randomBytes(4).toString('hex')}`;
    const ntfTitle = (title || 'Texnik eslatma').trim();
    const ntfMsg = (message || 'Avtomobilingizni rejali texnik ko‘rikdan o‘tkazish vaqti keldi.').trim();
    const createdAt = new Date().toISOString();

    db.prepare(
      'INSERT INTO notifications (id, client_id, vehicle_id, title, message, created_at, read, priority) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
    ).run(ntfId, client.id, vehicleId || '', ntfTitle, ntfMsg, createdAt, 'high');

    const cfg = getAdminConfig();
    addSecurityLog('Mijozga eslatma yuborildi', cfg.operatorId, 'info', getClientIp(req), `${client.fullName}: ${ntfTitle}`);

    const created = mapNotification(
      db.prepare('SELECT * FROM notifications WHERE id = ?').get(ntfId) as Record<string, unknown>,
    );
    res.status(201).json(created);
  });

  app.get('/api/admin/export-zip', requireAdmin, (req, res) => {
    const rootDir = process.cwd();
    const excludeDirs = new Set(['node_modules', 'dist', 'dev-dist', '.git', 'data', '.aistudio', 'aistudio']);
    const excludeFiles = new Set(['.DS_Store']);

    const crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
    const crc32 = (buf: Buffer): number => {
      let c = -1;
      for (let i = 0; i < buf.length; i++) {
        c = (c >>> 8) ^ crcTable[(c ^ buf[i]) & 0xff];
      }
      return (c ^ -1) >>> 0;
    };

    const files: { relPath: string; data: Buffer }[] = [];
    const walk = (dir: string, prefix: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (!excludeDirs.has(entry.name)) {
            walk(path.join(dir, entry.name), prefix ? `${prefix}/${entry.name}` : entry.name);
          }
        } else if (entry.isFile() && !excludeFiles.has(entry.name) && !entry.name.endsWith('.zip')) {
          const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
          files.push({ relPath, data: fs.readFileSync(path.join(dir, entry.name)) });
        }
      }
    };
    walk(rootDir, '');

    const localChunks: Buffer[] = [];
    const centralChunks: Buffer[] = [];
    let offset = 0;

    for (const file of files) {
      const nameBuf = Buffer.from(file.relPath, 'utf8');
      const compressed = zlib.deflateRawSync(file.data);
      const crc = crc32(file.data);

      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(20, 4);
      local.writeUInt16LE(0x0800, 6); // UTF-8
      local.writeUInt16LE(8, 8); // deflate
      local.writeUInt16LE(0, 10);
      local.writeUInt16LE(0, 12);
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(compressed.length, 18);
      local.writeUInt32LE(file.data.length, 22);
      local.writeUInt16LE(nameBuf.length, 26);
      local.writeUInt16LE(0, 28);

      localChunks.push(local, nameBuf, compressed);

      const central = Buffer.alloc(46);
      central.writeUInt32LE(0x02014b50, 0);
      central.writeUInt16LE(20, 4);
      central.writeUInt16LE(20, 6);
      central.writeUInt16LE(0x0800, 8);
      central.writeUInt16LE(8, 10);
      central.writeUInt16LE(0, 12);
      central.writeUInt16LE(0, 14);
      central.writeUInt32LE(crc, 16);
      central.writeUInt32LE(compressed.length, 20);
      central.writeUInt32LE(file.data.length, 24);
      central.writeUInt16LE(nameBuf.length, 28);
      central.writeUInt16LE(0, 30);
      central.writeUInt16LE(0, 32);
      central.writeUInt16LE(0, 34);
      central.writeUInt16LE(0, 36);
      central.writeUInt32LE(0, 38);
      central.writeUInt32LE(offset, 42);

      centralChunks.push(central, nameBuf);
      offset += local.length + nameBuf.length + compressed.length;
    }

    const centralSize = centralChunks.reduce((sum, b) => sum + b.length, 0);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(files.length, 8);
    eocd.writeUInt16LE(files.length, 10);
    eocd.writeUInt32LE(centralSize, 12);
    eocd.writeUInt32LE(offset, 16);
    eocd.writeUInt16LE(0, 20);

    const zipBuffer = Buffer.concat([...localChunks, ...centralChunks, eocd]);
    const cfg = getAdminConfig();
    addSecurityLog('Loyiha kodi ZIP eksport qilindi', cfg.operatorId, 'info', getClientIp(req), `${files.length} ta fayl arxivlandi.`);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="avtotexnik-project.zip"');
    res.send(zipBuffer);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AvtoTexnik server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Server failed to start:', err);
  process.exit(1);
});
