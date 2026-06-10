// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  Service : Cryptage AES-256-GCM (niveau militaire)                         ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Récupère la clé maître depuis les variables d'environnement.
 */
function getMasterKey() {
  const hex = process.env.MASTER_ENCRYPTION_KEY;
  if (!hex || hex.length < 64) {
    throw new Error('MASTER_ENCRYPTION_KEY manquante ou trop courte (64 caractères hex minimum).');
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Génère une clé de fichier aléatoire (256 bits).
 */
function generateFileKey() {
  return crypto.randomBytes(KEY_LENGTH);
}

/**
 * Chiffre un buffer de données avec une clé donnée (AES-256-GCM).
 * Retourne : { encrypted, iv, authTag }
 */
function encryptBuffer(data, key) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // On concatène authTag + encrypted pour le stockage
  return {
    encrypted: Buffer.concat([authTag, encrypted]),
    iv: iv.toString('hex'),
  };
}

/**
 * Déchiffre un buffer de données avec une clé et un IV donnés.
 */
function decryptBuffer(encryptedData, key, ivHex) {
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = encryptedData.subarray(0, AUTH_TAG_LENGTH);
  const data = encryptedData.subarray(AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

/**
 * Chiffre la clé de fichier avec la clé maître pour le stockage en DB.
 */
function encryptFileKey(fileKey) {
  const masterKey = getMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, masterKey, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(fileKey), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Format : iv_hex:authTag_hex:encrypted_hex
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Déchiffre la clé de fichier stockée en DB avec la clé maître.
 */
function decryptFileKey(encryptedKeyString) {
  const masterKey = getMasterKey();
  const [ivHex, authTagHex, encryptedHex] = encryptedKeyString.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, masterKey, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

module.exports = {
  generateFileKey,
  encryptBuffer,
  decryptBuffer,
  encryptFileKey,
  decryptFileKey,
};
