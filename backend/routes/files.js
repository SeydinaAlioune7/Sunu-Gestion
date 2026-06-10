// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  Routes : Fichiers cryptés (upload, download, delete)                      ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

const express = require('express');
const router = express.Router();
const multer = require('multer');
const pool = require('../db/pool');
const authenticate = require('../middleware/auth');
const trialCheck = require('../middleware/trialCheck');
const { generateFileKey, encryptBuffer, decryptBuffer, encryptFileKey, decryptFileKey } = require('../services/cryptoService');
const { saveEncryptedFile, readEncryptedFile, deleteEncryptedFile } = require('../services/storageService');

router.use(authenticate, trialCheck);

// Multer en mémoire (max 50 Mo)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const MAX_STORAGE = 15 * 1024 * 1024 * 1024; // 15 Go

// ── GET /api/files ───────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, original_name, size_bytes, mime_type, uploaded_at FROM encrypted_files WHERE company_id = $1 ORDER BY uploaded_at DESC',
      [req.user.company_id]
    );

    // Utilisation du stockage
    const usage = await pool.query(
      'SELECT storage_used_bytes FROM companies WHERE id = $1',
      [req.user.company_id]
    );

    res.json({
      files: result.rows,
      storage: {
        used: parseInt(usage.rows[0].storage_used_bytes),
        max: MAX_STORAGE,
        percentage: ((parseInt(usage.rows[0].storage_used_bytes) / MAX_STORAGE) * 100).toFixed(1),
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── POST /api/files/upload ───────────────────────────────────────────────────
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier envoyé.' });

    // Vérifier la limite de stockage
    const usage = await pool.query(
      'SELECT storage_used_bytes FROM companies WHERE id = $1',
      [req.user.company_id]
    );
    const currentUsage = parseInt(usage.rows[0].storage_used_bytes);
    if (currentUsage + req.file.size > MAX_STORAGE) {
      return res.status(413).json({
        error: 'Stockage insuffisant.',
        message: `Vous avez utilisé ${(currentUsage / 1024 / 1024 / 1024).toFixed(2)} Go sur 15 Go.`,
      });
    }

    // 1. Générer une clé de fichier unique
    const fileKey = generateFileKey();

    // 2. Chiffrer le contenu du fichier
    const { encrypted, iv } = encryptBuffer(req.file.buffer, fileKey);

    // 3. Chiffrer la clé de fichier avec la clé maître
    const encryptedKey = encryptFileKey(fileKey);

    // 4. Sauvegarder le fichier chiffré sur le disque
    const storedName = await saveEncryptedFile(encrypted);

    // 5. Enregistrer en base
    const result = await pool.query(
      `INSERT INTO encrypted_files (company_id, original_name, stored_name, encrypted_key, iv, size_bytes, mime_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, original_name, size_bytes, mime_type, uploaded_at`,
      [req.user.company_id, req.file.originalname, storedName, encryptedKey, iv, req.file.size, req.file.mimetype]
    );

    // 6. Mettre à jour le stockage utilisé
    await pool.query(
      'UPDATE companies SET storage_used_bytes = storage_used_bytes + $1 WHERE id = $2',
      [req.file.size, req.user.company_id]
    );

    // Log
    await pool.query(
      'INSERT INTO activity_logs (company_id, user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.user.company_id, req.user.id, 'UPLOAD_FILE', 'file', result.rows[0].id, `Fichier "${req.file.originalname}" uploadé et chiffré`]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erreur upload :', err);
    res.status(500).json({ error: 'Erreur lors du chiffrement et de l\'upload.' });
  }
});

// ── GET /api/files/:id/download ──────────────────────────────────────────────
router.get('/:id/download', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM encrypted_files WHERE id = $1 AND company_id = $2',
      [req.params.id, req.user.company_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Fichier introuvable.' });

    const file = result.rows[0];

    // 1. Lire le fichier chiffré du disque
    const encryptedData = await readEncryptedFile(file.stored_name);

    // 2. Déchiffrer la clé de fichier
    const fileKey = decryptFileKey(file.encrypted_key);

    // 3. Déchiffrer le contenu
    const decrypted = decryptBuffer(encryptedData, fileKey, file.iv);

    // 4. Envoyer le fichier déchiffré
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${file.original_name}"`);
    res.send(decrypted);
  } catch (err) {
    console.error('Erreur téléchargement :', err);
    res.status(500).json({ error: 'Erreur lors du déchiffrement.' });
  }
});

// ── DELETE /api/files/:id ────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM encrypted_files WHERE id = $1 AND company_id = $2',
      [req.params.id, req.user.company_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Fichier introuvable.' });

    const file = result.rows[0];

    // Supprimer du disque
    await deleteEncryptedFile(file.stored_name);

    // Supprimer de la DB
    await pool.query('DELETE FROM encrypted_files WHERE id = $1', [file.id]);

    // Mettre à jour le stockage
    await pool.query(
      'UPDATE companies SET storage_used_bytes = GREATEST(storage_used_bytes - $1, 0) WHERE id = $2',
      [file.size_bytes, req.user.company_id]
    );

    res.json({ message: 'Fichier supprimé.' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;
