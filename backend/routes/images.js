// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  Routes : Upload d'images produits                                         ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const authenticate = require('../middleware/auth');

// Dossier public d'images produits
const IMAGES_DIR = path.join(__dirname, '..', '..', 'frontend', 'product-images');

// Créer le dossier s'il n'existe pas
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

// Configuration Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, IMAGES_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = `product_${Date.now()}${ext}`;
    cb(null, name);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 Mo max
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Format non supporté. Utilisez JPG, PNG, WEBP ou GIF.'));
  }
});

// ── POST /api/images/upload ──────────────────────────────────────────────────
router.post('/upload', authenticate, upload.single('image'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });

    // L'URL accessible depuis le navigateur
    const imageUrl = `/product-images/${req.file.filename}`;
    res.json({ url: imageUrl, filename: req.file.filename });
  } catch (err) {
    console.error('Erreur upload image:', err);
    res.status(500).json({ error: err.message || 'Erreur serveur.' });
  }
});

module.exports = router;
