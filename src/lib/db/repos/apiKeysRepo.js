import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";

function rowToKey(row) {
  if (!row) return null;
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    machineId: row.machineId,
    isActive: row.isActive === 1 || row.isActive === true,
    createdAt: row.createdAt,
  };
}

export async function getApiKeys() {
  const db = await getAdapter();
  const rows = db.all(`SELECT * FROM apiKeys ORDER BY createdAt ASC`);
  return rows.map(rowToKey);
}

// Collapse duplicate "Default Key" rows (keep the earliest) so exactly one default
// key exists. Transactional and safe to call on every list to self-heal old state.
export async function collapseDefaultKeyDuplicates() {
  const db = await getAdapter();
  db.transaction(() => {
    const rows = db.all(`SELECT * FROM apiKeys WHERE name = ? ORDER BY createdAt ASC`, ["Default Key"]);
    for (const dup of rows.slice(1)) {
      db.run(`DELETE FROM apiKeys WHERE id = ?`, [dup.id]);
    }
  });
}

export async function getApiKeyById(id) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM apiKeys WHERE id = ?`, [id]);
  return rowToKey(row);
}

export async function createApiKey(name, machineId) {
  if (!machineId) throw new Error("machineId is required");
  const db = await getAdapter();
  const { generateApiKeyWithMachine } = await import("@/shared/utils/apiKey");
  const result = generateApiKeyWithMachine(machineId);
  const apiKey = {
    id: uuidv4(),
    name,
    key: result.key,
    machineId,
    isActive: true,
    createdAt: new Date().toISOString(),
  };
  db.run(
    `INSERT INTO apiKeys(id, key, name, machineId, isActive, createdAt) VALUES(?, ?, ?, ?, ?, ?)`,
    [apiKey.id, apiKey.key, apiKey.name, apiKey.machineId, 1, apiKey.createdAt]
  );
  return apiKey;
}

// Idempotent "Default Key" provisioning. Runs inside one synchronous transaction
// so concurrent auto-provision calls can never create more than one default key.
// Existing duplicates (from older race bugs) are collapsed to the earliest row.
export async function getOrCreateDefaultKey(machineId) {
  if (!machineId) throw new Error("machineId is required");
  const db = await getAdapter();
  const { generateApiKeyWithMachine } = await import("@/shared/utils/apiKey");
  return db.transaction(() => {
    const rows = db.all(`SELECT * FROM apiKeys WHERE name = ? ORDER BY createdAt ASC`, ["Default Key"]);
    const keep = rows[0] || null;
    for (const dup of rows.slice(1)) {
      db.run(`DELETE FROM apiKeys WHERE id = ?`, [dup.id]);
    }
    if (keep) return rowToKey(keep);

    const result = generateApiKeyWithMachine(machineId);
    const apiKey = {
      id: uuidv4(),
      name: "Default Key",
      key: result.key,
      machineId,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    db.run(
      `INSERT INTO apiKeys(id, key, name, machineId, isActive, createdAt) VALUES(?, ?, ?, ?, ?, ?)`,
      [apiKey.id, apiKey.key, apiKey.name, apiKey.machineId, 1, apiKey.createdAt]
    );
    return apiKey;
  });
}

export async function updateApiKey(id, data) {
  const db = await getAdapter();
  let result = null;
  db.transaction(() => {
    const row = db.get(`SELECT * FROM apiKeys WHERE id = ?`, [id]);
    if (!row) return;
    const merged = { ...rowToKey(row), ...data };
    db.run(
      `UPDATE apiKeys SET key = ?, name = ?, machineId = ?, isActive = ? WHERE id = ?`,
      [merged.key, merged.name, merged.machineId, merged.isActive ? 1 : 0, id]
    );
    result = merged;
  });
  return result;
}

export async function deleteApiKey(id) {
  const db = await getAdapter();
  const res = db.run(`DELETE FROM apiKeys WHERE id = ?`, [id]);
  return (res?.changes ?? 0) > 0;
}

export async function validateApiKey(key) {
  const db = await getAdapter();
  const row = db.get(`SELECT isActive FROM apiKeys WHERE key = ?`, [key]);
  if (!row) return false;
  return row.isActive === 1 || row.isActive === true;
}
