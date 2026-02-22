const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const { Pool } = require("pg");

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "app-db.json");

const DEFAULT_DB = {
  users: [],
  bands: [],
  memberships: [],
  availabilities: [],
  events: [],
  rehearsalSpaces: [],
  helpRequests: []
};

const hasPostgres = !!process.env.DATABASE_URL;
const pool = hasPostgres
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes("localhost")
        ? false
        : { rejectUnauthorized: false }
    })
  : null;

async function ensurePostgresSchema() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY,
      db_json JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    `INSERT INTO app_state (id, db_json) VALUES (1, $1::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(DEFAULT_DB)]
  );
}

function normalizeIncomingDB(value) {
  const input = value && typeof value === "object" ? value : {};
  const out = { ...DEFAULT_DB, ...input };
  for (const key of Object.keys(DEFAULT_DB)) {
    if (!Array.isArray(out[key])) out[key] = [];
  }
  return out;
}

async function readDBFromFile() {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return normalizeIncomingDB(parsed);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(DEFAULT_DB, null, 2), "utf8");
    return { ...DEFAULT_DB };
  }
}

async function writeDBToFile(db) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(normalizeIncomingDB(db), null, 2), "utf8");
}

async function readDB() {
  if (!pool) return readDBFromFile();
  await ensurePostgresSchema();
  const res = await pool.query("SELECT db_json FROM app_state WHERE id = 1");
  if (!res.rows.length) return { ...DEFAULT_DB };
  return normalizeIncomingDB(res.rows[0].db_json);
}

async function writeDB(db) {
  const normalized = normalizeIncomingDB(db);
  if (!pool) {
    await writeDBToFile(normalized);
    return;
  }
  await ensurePostgresSchema();
  await pool.query(
    `INSERT INTO app_state (id, db_json, updated_at)
     VALUES (1, $1::jsonb, NOW())
     ON CONFLICT (id)
     DO UPDATE SET db_json = EXCLUDED.db_json, updated_at = NOW()`,
    [JSON.stringify(normalized)]
  );
}

async function start() {
  if (pool) {
    await ensurePostgresSchema();
  } else {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }

  const app = express();
  app.use(express.json({ limit: "20mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, backend: pool ? "postgres" : "file" });
  });

  app.get("/api/db", async (_req, res) => {
    try {
      const db = await readDB();
      res.json(db);
    } catch (err) {
      res.status(500).json({ ok: false, message: "Failed to read shared data." });
    }
  });

  app.put("/api/db", async (req, res) => {
    try {
      if (!req.body || typeof req.body !== "object") {
        res.status(400).json({ ok: false, message: "Invalid payload." });
        return;
      }
      await writeDB(req.body);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ ok: false, message: "Failed to save shared data." });
    }
  });

  app.use(express.static(__dirname));

  app.get("*", (_req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
  });

  app.listen(PORT, () => {
    console.log(`Band Scheduler server running on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server", err);
  process.exit(1);
});
