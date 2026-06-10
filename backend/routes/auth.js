// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  Routes : Authentification (inscription, connexion, refresh, logout)        ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const pool = require('../db/pool');
const { authLimiter } = require('../middleware/rateLimiter');
const crypto = require('crypto');
const { sendResetEmail, sendVerificationEmail } = require('../utils/mailer');
const { sendSMS } = require('../utils/sms');

// ── Store OTP en mémoire (TTL 10 min) ───────────────────────────────────────
const otpStore = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of otpStore) {
    if (v.expiresAt < now) otpStore.delete(k);
  }
}, 60_000);

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
const BCRYPT_ROUNDS = 12;

/**
 * Génère access + refresh tokens
 */
function generateTokens(userId, companyId) {
  const accessToken = jwt.sign(
    { userId, companyId },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
  const refreshToken = jwt.sign(
    { userId, companyId },
    process.env.REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
  return { accessToken, refreshToken };
}

// ── POST /api/auth/send-otp ──────────────────────────────────────────────────
router.post('/send-otp',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail().withMessage('Email invalide.'),
    body('phone').trim().notEmpty().withMessage('Téléphone requis.')
      .matches(/^[\d\s\+\-\(\)]{8,20}$/).withMessage('Numéro invalide.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, phone, full_name, company_name, city, country } = req.body;

    const emailCode = generateOTP();
    const smsCode   = generateOTP();
    const expiresAt = Date.now() + 10 * 60 * 1000;
    const expiresAtISO = new Date(expiresAt).toISOString();

    // Stocker en mémoire ET en DB avec les codes (visibles dans l'admin si email/SMS échoue)
    otpStore.set(`otp_${email}`, { emailCode, smsCode, phone, expiresAt });

    try {
      await pool.query(
        `INSERT INTO pending_verifications (email, phone, full_name, company_name, city, country, expires_at, email_code, sms_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (email) DO UPDATE SET
           phone = EXCLUDED.phone, full_name = EXCLUDED.full_name,
           company_name = EXCLUDED.company_name, city = EXCLUDED.city,
           country = EXCLUDED.country, expires_at = EXCLUDED.expires_at,
           created_at = (datetime('now')), email_code = EXCLUDED.email_code, sms_code = EXCLUDED.sms_code`,
        [email, phone || null, full_name || null, company_name || null, city || null, country || null, expiresAtISO, emailCode, smsCode]
      );
    } catch (e) {
      console.error('[send-otp] DB insert error:', e.message);
    }

    // Envoi email + SMS (best-effort — si ça échoue, les codes restent visibles dans l'admin)
    const [emailSent] = await Promise.allSettled([
      sendVerificationEmail(email, emailCode),
      sendSMS(phone, `Sunu Gestion : Code SMS ${smsCode}. Valide 10 min. Ne le partagez pas.`),
    ]);

    const emailOk = emailSent.status === 'fulfilled';
    res.json({
      message: emailOk
        ? 'Codes envoyés sur votre email et par SMS.'
        : 'SMS envoyé. Email non reçu ? Contactez le support — le code est disponible sous 1 min.',
      email_delivered: emailOk,
    });
  }
);

// ── POST /api/auth/verify-otp ────────────────────────────────────────────────
router.post('/verify-otp',
  [
    body('email').isEmail().normalizeEmail(),
    body('email_code').trim().isLength({ min: 6, max: 6 }).withMessage('Code email invalide.'),
    body('sms_code').trim().isLength({ min: 6, max: 6 }).withMessage('Code SMS invalide.'),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, email_code, sms_code } = req.body;
    const entry = otpStore.get(`otp_${email}`);

    if (!entry || Date.now() > entry.expiresAt) {
      return res.status(400).json({ error: 'Codes expirés. Cliquez sur "Renvoyer les codes".' });
    }
    if (entry.emailCode !== email_code.trim()) {
      return res.status(400).json({ error: 'Code email incorrect.' });
    }
    if (entry.smsCode !== sms_code.trim()) {
      return res.status(400).json({ error: 'Code SMS incorrect.' });
    }

    // Générer un token de vérification (usage unique, 15 min)
    const verificationToken = crypto.randomBytes(32).toString('hex');
    otpStore.set(`verified_${verificationToken}`, {
      email,
      phone: entry.phone,
      expiresAt: Date.now() + 15 * 60 * 1000,
    });
    otpStore.delete(`otp_${email}`);

    // Supprimer de la table pending_verifications (vérification accomplie)
    pool.query('DELETE FROM pending_verifications WHERE email = $1', [email]).catch(() => {});

    res.json({ verification_token: verificationToken, message: 'Email et téléphone vérifiés.' });
  }
);

// ── Détection de compte suspect ──────────────────────────────────────────────
const SPAM_DOMAINS = new Set([
  'okcpress.com','mailinator.com','guerrillamail.com','temp-mail.org','yopmail.com',
  'trashmail.com','fakeinbox.com','maildrop.cc','sharklasers.com','spam4.me',
  'dispostable.com','throwam.com','tempmail.com','10minutemail.com','minutemailbox.com',
  'getnada.com','mailnull.com','spamgourmet.com','mytemp.email','trashmail.at',
]);
const KNOWN_TLDS = new Set([
  'com','net','org','fr','sn','ci','ml','bf','bj','tg','gn','ne','ma','dz','tn','eg',
  'ng','gh','ke','tz','cm','cd','co','io','edu','gov','info','biz','me','app','dev',
  'pro','africa','tech','online','store','shop','uk','de','es','it','pt','nl','be',
  'ch','ca','au','in','jp','cn','br','mx','ar','ru','ua','pl','tr','il','sa','ae',
  'qa','kw','pk','bd','th','vn','ph','id','my','sg','hk','tw','kr','nz','za','mu',
]);

function isSuspectAccount({ email, company_name, phone, city, country, full_name }) {
  let score = 0;
  const [localPart, domain = ''] = email.toLowerCase().split('@');
  const tld = domain.split('.').pop();

  if (SPAM_DOMAINS.has(domain)) score += 4;
  if (!KNOWN_TLDS.has(tld)) score += 3;
  if (/^(.)\1{2,}$/.test(localPart)) score += 3;           // kkk@, jjj@
  if (/\d{5,}/.test(localPart)) score += 2;                // joniw58123@

  const nameClean = (company_name || '').replace(/\s+/g, '');
  if (nameClean.length < 3) score += 2;
  if (/^(.)\1{3,}$/i.test(nameClean)) score += 3;          // Lllll, Kkkkk

  if (/^(.)\1{3,}$/i.test((city || '').trim())) score += 2;
  if (/^(.)\1{3,}$/i.test((country || '').trim())) score += 2;

  const nameParts = (full_name || '').trim().split(/\s+/);
  if (nameParts.length > 0 && nameParts.every(w => /^(.)\1{2,}$/i.test(w))) score += 3;

  if (!phone || phone.replace(/\D/g, '').length < 8) score += 2;

  return score >= 4;
}

// ── POST /api/auth/register ──────────────────────────────────────────────────
router.post('/register',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail().withMessage('Email invalide.'),
    body('password').isLength({ min: 8 }).withMessage('Le mot de passe doit faire au moins 8 caractères.'),
    body('full_name').trim().notEmpty().withMessage('Le nom complet est requis.'),
    body('company_name').trim().notEmpty().withMessage('Le nom de l\'entreprise est requis.'),
    body('phone').trim().notEmpty().withMessage('Le numéro de téléphone est obligatoire.')
      .matches(/^[\d\s\+\-\(\)]{8,20}$/).withMessage('Numéro de téléphone invalide (8 à 20 chiffres).'),
    body('verification_token').trim().notEmpty().withMessage('Vérification email/SMS requise avant inscription.'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const {
        email, password, full_name, company_name,
        currency, start_date, website, phone, alternate_phone,
        country, city, zip_code, landmark, timezone,
        tax_rate, fiscal_year_start, verification_token
      } = req.body;

      // Valider le token de vérification OTP
      const normalizedEmail = email.toLowerCase().replace(/\+.*@/, '@');
      const verifiedEntry = otpStore.get(`verified_${verification_token}`);
      if (!verifiedEntry || Date.now() > verifiedEntry.expiresAt) {
        return res.status(400).json({ error: 'Session de vérification expirée. Recommencez la vérification.' });
      }
      if (verifiedEntry.email !== normalizedEmail && verifiedEntry.email !== email) {
        return res.status(400).json({ error: 'L\'email ne correspond pas à la vérification effectuée.' });
      }
      otpStore.delete(`verified_${verification_token}`); // usage unique

      // Vérifier si l'email existe déjà
      const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Un compte avec cet email existe déjà.' });
      }

      // Hacher le mot de passe
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

      // Détection suspect : les suspects restent bloqués, les normaux attendent l'approbation admin
      const suspect = isSuspectAccount({ email, company_name, phone, city, country, full_name });
      // Aucun essai avant approbation — le trial commence seulement quand l'admin approuve
      const trialEndDate = new Date();
      trialEndDate.setDate(trialEndDate.getDate() + 7); // valeur par défaut, utilisée uniquement après approbation
      const subscriptionStatus = suspect ? 'suspect_trial' : 'pending_approval';

      const companyResult = await pool.query(
        `INSERT INTO companies
          (name, subscription_status, trial_end_date, currency, start_date, website, phone, alternate_phone, country, city, zip_code, landmark, timezone, tax_rate, fiscal_year_start)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id`,
        [
          company_name, subscriptionStatus, trialEndDate.toISOString(),
          currency || 'XOF', start_date || null, website || null,
          phone || null, alternate_phone || null, country || null,
          city || null, zip_code || null, landmark || null,
          timezone || 'Africa/Abidjan', tax_rate || 0, fiscal_year_start || null
        ]
      );
      const companyId = companyResult.rows[0].id;

      // Créer l'utilisateur admin
      const userResult = await pool.query(
        'INSERT INTO users (email, password_hash, full_name, role, company_id, registration_status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, full_name, role, registration_status',
        [email, passwordHash, full_name, 'admin', companyId, 'pending']
      );
      const user = userResult.rows[0];

      // Log d'activité
      await pool.query(
        'INSERT INTO activity_logs (company_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
        [companyId, user.id, 'REGISTER', `Création du compte et de l'entreprise "${company_name}"${suspect ? ' [SUSPECT DÉTECTÉ]' : ''}`]
      );

      // Pas de tokens retournés — l'utilisateur doit attendre l'approbation admin avant de se connecter
      res.status(201).json({
        message: suspect
          ? 'Votre compte sera bloqué. Merci de renseigner de bons identifiants : votre vrai nom, une adresse email valide et un numéro de téléphone actif. Tout compte avec des informations fictives est automatiquement restreint.'
          : 'Inscription réussie ! Votre compte est en cours de validation par l\'administrateur. Vous recevrez un accès dès qu\'il sera activé.',
        is_suspect: suspect,
        user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role, status: user.registration_status },
        company: { id: companyId, name: company_name },
      });
    } catch (err) {
      console.error('Erreur inscription :', err);
      res.status(500).json({ error: 'Erreur serveur lors de l\'inscription.' });
    }
  }
);

// ── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;

      const result = await pool.query(
        `SELECT u.id, u.email, u.password_hash, u.full_name, u.role, u.company_id, u.registration_status,
                c.name as company_name, c.subscription_status, c.trial_end_date
         FROM users u JOIN companies c ON u.company_id = c.id
         WHERE u.email = $1`,
        [email]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });
      }

      const user = result.rows[0];
      if (user.registration_status === 'pending') {
        return res.status(403).json({ error: 'Votre compte est en attente de validation. Vous recevrez un email dès qu\'il sera activé.' });
      }
      if (user.registration_status !== 'active') {
        return res.status(403).json({ error: 'Compte non activé. Contactez l\'administrateur.' });
      }
      const validPassword = await bcrypt.compare(password, user.password_hash);
      if (!validPassword) {
        return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });
      }

      // Mettre à jour last_login + IP pour identification dans les analytics
      const loginIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || null;
      await pool.query('UPDATE users SET last_login = NOW(), last_ip = $1 WHERE id = $2', [loginIp, user.id]);

      const tokens = generateTokens(user.id, user.company_id);

      res.json({
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          company_id: user.company_id,
          company_name: user.company_name,
        },
        subscription_status: user.subscription_status,
        trial_end_date: user.trial_end_date,
        ...tokens,
      });
    } catch (err) {
      console.error('Erreur login :', err);
      res.status(500).json({ error: 'Erreur serveur lors de la connexion.' });
    }
  }
);

// ── POST /api/auth/refresh ───────────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token requis.' });
    }

    const decoded = jwt.verify(refreshToken, process.env.REFRESH_SECRET);
    const tokens = generateTokens(decoded.userId, decoded.companyId);
    res.json(tokens);
  } catch (err) {
    res.status(401).json({ error: 'Refresh token invalide ou expiré.' });
  }
});

// ── GET /api/auth/me ─────────────────────────────────────────────────────────
const authenticate = require('../middleware/auth');
router.get('/me', authenticate, async (req, res) => {
  const result = await pool.query(
    `SELECT u.id, u.email, u.full_name, u.role, u.company_id,
            c.name as company_name, c.subscription_status, c.trial_end_date, c.storage_used_bytes
     FROM users u JOIN companies c ON u.company_id = c.id
     WHERE u.id = $1`,
    [req.user.id]
  );
  res.json(result.rows[0]);
});

// ── POST /api/auth/forgot-password ──────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    try {
        const result = await pool.query('SELECT id, full_name FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            // Pour des raisons de sécurité, on ne dit pas si l'email existe ou non
            return res.json({ message: 'Si cet email existe, un lien de réinitialisation a été envoyé.' });
        }

        const user = result.rows[0];
        const token = crypto.randomBytes(32).toString('hex');
        const expiry = new Date(Date.now() + 3600000).toISOString(); // 1 heure

        await pool.query('UPDATE users SET reset_token = $1, reset_token_expiry = $2 WHERE id = $3', [token, expiry, user.id]);

        const resetLink = `http://localhost:3000/reset-password.html?token=${token}&email=${encodeURIComponent(email)}`;
        
        // SIMULATION D'ENVOI (Affichage dans le terminal)
        console.log('-------------------------------------------');
        console.log(`[SIMULATION EMAIL] Pour : ${email}`);
        console.log(`[SIMULATION EMAIL] LIEN DE RÉINITIALISATION : ${resetLink}`);
        console.log('-------------------------------------------');

        res.json({ message: 'Simulation : Le lien de réinitialisation a été généré dans le terminal.' });
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur.' });
    }
});

// ── POST /api/auth/reset-password ───────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
    const { email, token, newPassword } = req.body;
    try {
        const result = await pool.query(
            'SELECT id, reset_token_expiry FROM users WHERE email = $1 AND reset_token = $2',
            [email, token]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Token ou email invalide.' });
        }

        const user = result.rows[0];
        if (new Date() > new Date(user.reset_token_expiry)) {
            return res.status(400).json({ error: 'Le token a expiré.' });
        }

        const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
        await pool.query(
            'UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expiry = NULL WHERE id = $2',
            [passwordHash, user.id]
        );

        res.json({ message: 'Mot de passe mis à jour avec succès.' });
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur.' });
    }
});

module.exports = router;
