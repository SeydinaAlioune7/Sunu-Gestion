// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  Middleware : Rate Limiter                                                 ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

const rateLimit = require('express-rate-limit');

// Limiteur général : 100 requêtes par minute par IP
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  message: { error: 'Trop de requêtes. Réessayez dans une minute.' },
});

// Limiteur strict pour l'authentification : 10 tentatives par 15 min
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  message: { error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' },
});

module.exports = { generalLimiter, authLimiter };
