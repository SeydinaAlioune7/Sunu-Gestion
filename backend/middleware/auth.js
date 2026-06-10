// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  Middleware : Authentification JWT                                          ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const { sendExpiredSMS } = require('../utils/sms');

/**
 * Vérifie le token JWT et attache user + company à req.
 */
const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token d\'authentification requis.' });
    }

    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Charger l'utilisateur depuis la DB pour vérifier qu'il existe toujours
    const result = await pool.query(
      'SELECT u.id, u.email, u.full_name, u.role, u.company_id, c.name, c.phone, c.alternate_phone, c.subscription_status, c.trial_end_date FROM users u JOIN companies c ON u.company_id = c.id WHERE u.id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Utilisateur introuvable.' });
    }

    const user = result.rows[0];

    // ── Vérification abonnement / trial ─────────────────────────────────────
    const ownerEmails = ['alioune@diene.sn', 'aliounebadaraibnabutalibdiene@gmail.com'];
    // Les routes billing et auth/me sont toujours accessibles (sinon boucle infinie)
    const exemptPaths = ['/api/billing', '/api/auth/me', '/api/subscription'];
    const isExempt = exemptPaths.some(p => req.originalUrl.startsWith(p));
    if (!isExempt && !ownerEmails.includes(user.email)) {
      const status = user.subscription_status;
      if (status === 'pending_payment') {
        return res.status(403).json({ error: 'Paiement requis pour accéder à votre compte.', code: 'PENDING_PAYMENT' });
      }
      if (status === 'blocked') {
        return res.status(403).json({ error: 'Votre accès a été suspendu par l\'administrateur.', code: 'ACCOUNT_BLOCKED' });
      }
      if (status === 'maintenance') {
        return res.status(503).json({ error: 'Votre compte est en maintenance.', code: 'MAINTENANCE' });
      }
      if (status === 'expired' || status === 'cancelled') {
        return res.status(403).json({ error: 'Abonnement expiré. Veuillez renouveler votre abonnement.', code: 'SUBSCRIPTION_EXPIRED' });
      }
      if (status === 'trial' && user.trial_end_date) {
        const expired = new Date(user.trial_end_date) < new Date();
        if (expired) {
          await pool.query("UPDATE companies SET subscription_status = 'expired' WHERE id = $1", [user.company_id]);
          sendExpiredSMS({ name: user.name, phone: user.phone, alternate_phone: user.alternate_phone }).catch(() => {});
          return res.status(403).json({ error: 'Votre période d\'essai est terminée. Abonnez-vous pour continuer.', code: 'TRIAL_EXPIRED' });
        }
      }
    }

    // Maintenance Check
    const fs = require('fs');
    const path = require('path');
    const maintFile = path.join(__dirname, '..', 'maintenance.json');
    if (fs.existsSync(maintFile)) {
        try {
            const maint = JSON.parse(fs.readFileSync(maintFile));
            if (maint.active) {
                const ownerEmails = ['alioune@diene.sn', 'aliounebadaraibnabutalibdiene@gmail.com'];
                if (!ownerEmails.includes(user.email)) {
                    return res.status(503).json({ error: 'Système en maintenance', code: 'MAINTENANCE' });
                }
            }
        } catch(e) {}
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expiré. Veuillez vous reconnecter.', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Token invalide.' });
  }
};

module.exports = authenticate;
