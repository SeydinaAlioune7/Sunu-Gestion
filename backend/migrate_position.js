const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'db', 'app.db');
const db = new Database(dbPath);

try {
    db.exec("ALTER TABLE products ADD COLUMN position INTEGER DEFAULT 0;");
    console.log("✅ Colonne 'position' ajoutée avec succès.");
} catch (err) {
    if (err.message.includes('duplicate column name')) {
        console.log("ℹ️ La colonne 'position' existe déjà.");
    } else {
        console.error("❌ Erreur lors de l'ajout de la colonne:", err.message);
    }
} finally {
    db.close();
}
