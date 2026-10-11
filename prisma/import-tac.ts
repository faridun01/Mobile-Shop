/**
 * Loads the public TAC database into the phone catalog used for IMEI autofill.
 *
 *   npm run phones:import               # downloads tac_full.csv from GitHub
 *   npm run phones:import -- ./tac.csv  # or reads a local copy
 *
 * Re-running it is safe: TACs the catalog already knows are left as they are, so names learned
 * from your own receipts are never overwritten. TACs the database maps to two different models
 * are skipped. Data: https://github.com/MoazEb/tac-database — MIT License, Copyright (c) 2026
 * Moaz Ebrahem.
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { prisma } from '../server/src/prisma/prisma.service.js';
import { parseTacRow, splitCsvLine, type CatalogEntry } from '../server/src/modules/phone-catalog/normalize.js';

const SOURCE_URL = 'https://raw.githubusercontent.com/MoazEb/tac-database/main/tac_full.csv';
const BATCH = 5000;

async function loadCsv(path?: string): Promise<string> {
  if (path) return readFile(path, 'utf8');
  console.log(`Скачивание ${SOURCE_URL} …`);
  const response = await fetch(SOURCE_URL);
  if (!response.ok) throw new Error(`Не удалось скачать базу TAC (HTTP ${response.status})`);
  return response.text();
}

async function main() {
  const csv = await loadCsv(process.argv[2]);
  const lines = csv.split(/\r?\n/).slice(1).filter((line) => line.trim());

  const entries = new Map<string, CatalogEntry>();
  const conflicting = new Set<string>();
  let unusable = 0;
  for (const line of lines) {
    const [brand = '', tac = '', specs = ''] = splitCsvLine(line);
    const entry = parseTacRow(brand, tac, specs);
    if (!entry) { unusable += 1; continue; }
    const known = entries.get(entry.tac);
    if (known && (known.brand !== entry.brand || known.model !== entry.model)) conflicting.add(entry.tac);
    else entries.set(entry.tac, entry);
  }
  for (const tac of conflicting) entries.delete(tac);

  const rows = [...entries.values()];
  let added = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const result = await prisma.phoneCatalog.createMany({ data: rows.slice(i, i + BATCH), skipDuplicates: true });
    added += result.count;
  }

  console.log(`Строк в базе: ${lines.length}. Пригодных TAC: ${rows.length}.`);
  console.log(`Добавлено новых: ${added}. Уже были в каталоге (не тронуты): ${rows.length - added}.`);
  console.log(`Пропущено: без TAC или названия — ${unusable}, с двумя разными моделями — ${conflicting.size}.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
