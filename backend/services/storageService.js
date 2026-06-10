// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  Service : Stockage de fichiers                                            ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

// S'assurer que le dossier d'uploads existe
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * Sauvegarde un buffer chiffré sur le disque.
 * Retourne le nom du fichier stocké.
 */
async function saveEncryptedFile(encryptedBuffer) {
  const storedName = `${uuidv4()}.enc`;
  const filePath = path.join(UPLOAD_DIR, storedName);
  await fs.promises.writeFile(filePath, encryptedBuffer);
  return storedName;
}

/**
 * Lit un fichier chiffré depuis le disque.
 */
async function readEncryptedFile(storedName) {
  const filePath = path.join(UPLOAD_DIR, storedName);
  return fs.promises.readFile(filePath);
}

/**
 * Supprime un fichier chiffré du disque.
 */
async function deleteEncryptedFile(storedName) {
  const filePath = path.join(UPLOAD_DIR, storedName);
  if (fs.existsSync(filePath)) {
    await fs.promises.unlink(filePath);
  }
}

module.exports = {
  saveEncryptedFile,
  readEncryptedFile,
  deleteEncryptedFile,
};
