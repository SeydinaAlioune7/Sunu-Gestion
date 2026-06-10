// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  Database Adapter – SQLite (développement local sans PostgreSQL)            ║
// ║  Compatible avec l'interface pg Pool (query avec $1, $2...)                 ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'app.db');
const db = new Database(DB_PATH);

// Activer WAL mode pour de meilleures performances
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialiser le schéma si la base est vide
function initSchema() {
  const initSQL = fs.readFileSync(path.join(__dirname, 'init-sqlite.sql'), 'utf-8');
  db.exec(initSQL);
  console.log('✅ Base de données SQLite initialisée.');
}

initSchema();

/**
 * Adaptateur qui imite l'interface de pg Pool.
 * Convertit les placeholders $1, $2 en ?.
 */
const pool = {
  query: (text, params = []) => {
    // Convertir $1, $2... en ? et gérer les paramètres dupliqués
    // PostgreSQL permet de réutiliser $2 plusieurs fois, SQLite non (chaque ? est unique)
    let sqliteText = text;
    const expandedParams = [];

    // Trouver tous les $N dans l'ordre d'apparition et les remplacer par ?
    sqliteText = sqliteText.replace(/\$(\d+)/g, (match, numStr) => {
      const idx = parseInt(numStr) - 1; // $1 → index 0
      expandedParams.push(params[idx]);
      return '?';
    });

    // Nettoyer les syntaxes PostgreSQL non supportées par SQLite
    // ILIKE → LIKE (SQLite est case-insensitive par défaut sur ASCII)
    sqliteText = sqliteText.replace(/ILIKE/gi, 'LIKE');
    // ::date → rien (cast)
    sqliteText = sqliteText.replace(/::date/gi, '');
    // CURRENT_DATE
    sqliteText = sqliteText.replace(/CURRENT_DATE/gi, "date('now')");
    // NOW() → datetime('now')
    sqliteText = sqliteText.replace(/NOW\(\)/gi, "datetime('now')");
    // COALESCE fonctionne en SQLite
    // GREATEST → MAX
    sqliteText = sqliteText.replace(/GREATEST\(/gi, 'MAX(');

    const trimmed = sqliteText.trim();
    
    try {
      if (trimmed.toUpperCase().startsWith('SELECT') || trimmed.toUpperCase().startsWith('WITH')) {
        const stmt = db.prepare(sqliteText);
        const rows = stmt.all(...expandedParams);
        return { rows };
      } else if (trimmed.toUpperCase().startsWith('INSERT') && trimmed.toUpperCase().includes('RETURNING')) {
        const returningMatch = sqliteText.match(/RETURNING\s+(.*)/i);
        const mainSQL = sqliteText.replace(/RETURNING\s+.*/i, '').trim();
        const stmt = db.prepare(mainSQL);
        const info = stmt.run(...expandedParams);
        
        if (returningMatch) {
          const tableName = mainSQL.match(/INSERT\s+INTO\s+(\w+)/i)?.[1];
          if (tableName) {
            const row = db.prepare(`SELECT * FROM ${tableName} WHERE rowid = ?`).get(info.lastInsertRowid);
            return { rows: row ? [row] : [] };
          }
        }
        return { rows: [{ id: info.lastInsertRowid }], rowCount: info.changes };
      } else if (trimmed.toUpperCase().startsWith('UPDATE') && trimmed.toUpperCase().includes('RETURNING')) {
        const returningMatch = sqliteText.match(/RETURNING\s+(.*)/i);
        const mainSQL = sqliteText.replace(/RETURNING\s+.*/i, '').trim();
        const stmt = db.prepare(mainSQL);
        const info = stmt.run(...expandedParams);
        
        if (returningMatch) {
          const tableName = mainSQL.match(/UPDATE\s+(\w+)/i)?.[1];
          const whereMatch = mainSQL.match(/WHERE\s+(.*)/i);
          if (tableName && whereMatch) {
            const whereParams = expandedParams.slice(-countPlaceholders(whereMatch[1]));
            const rows = db.prepare(`SELECT * FROM ${tableName} WHERE ${whereMatch[1]}`).all(...whereParams);
            return { rows, rowCount: info.changes };
          }
        }
        return { rows: [], rowCount: info.changes };
      } else if (trimmed.toUpperCase().startsWith('DELETE') && trimmed.toUpperCase().includes('RETURNING')) {
        const tableName = sqliteText.match(/DELETE\s+FROM\s+(\w+)/i)?.[1];
        const whereMatch = sqliteText.match(/WHERE\s+(.+?)(?:\s+RETURNING)/i);
        const returningCols = sqliteText.match(/RETURNING\s+(.*)/i)?.[1] || '*';
        
        let rows = [];
        if (tableName && whereMatch) {
          const selectSQL = `SELECT ${returningCols} FROM ${tableName} WHERE ${whereMatch[1]}`;
          rows = db.prepare(selectSQL).all(...expandedParams);
        }
        
        const mainSQL = sqliteText.replace(/RETURNING\s+.*/i, '').trim();
        const stmt = db.prepare(mainSQL);
        const info = stmt.run(...expandedParams);
        return { rows, rowCount: info.changes };
      } else {
        const stmt = db.prepare(sqliteText);
        const info = stmt.run(...expandedParams);
        return { rows: [], rowCount: info.changes };
      }
    } catch (err) {
      // Ignorer les erreurs bénignes (déjà existant)
      if (err.message.includes('already exists') || err.message.includes('duplicate column')) {
        return { rows: [] };
      }
      console.error('SQLite Error:', err.message, '\nSQL:', sqliteText.substring(0, 200));
      throw err;
    }
  },

  // Simuler pool.connect() pour les transactions
  connect: async () => {
    return {
      query: (text, params) => {
        const t = text.trim().toUpperCase();
        if (t === 'BEGIN') { db.exec('BEGIN'); return { rows: [] }; }
        if (t === 'COMMIT') { db.exec('COMMIT'); return { rows: [] }; }
        if (t === 'ROLLBACK') { try { db.exec('ROLLBACK'); } catch(e) {} return { rows: [] }; }
        return pool.query(text, params);
      },
      release: () => {},
    };
  },
};

function countPlaceholders(str) {
  return (str.match(/\?/g) || []).length;
}

pool.on = () => {}; // noop pour la compatibilité

module.exports = pool;
