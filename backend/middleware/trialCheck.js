// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  Middleware : Vérification essai 7 jours                                   ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

/**
 * Bloque l'accès si l'essai est expiré et que l'abonnement n'est pas actif.
 * Doit être utilisé APRÈS le middleware authenticate.
 */
const trialCheck = (req, res, next) => {
  const { subscription_status, trial_end_date, email } = req.user;

  // 🔐 Propriétaire du système → accès illimité permanent (bypass total)
  const OWNER_EMAILS = ['alioune@diene.sn', 'aliounebadaraibnabutalibdiene@gmail.com'];
  if (OWNER_EMAILS.includes(email)) {
    return next();
  }

  // Abonnement actif → accès autorisé
  if (subscription_status === 'active') {
    return next();
  }

  // Maintenance spécifique pour cette entreprise
  if (subscription_status === 'maintenance') {
    return res.status(503).json({
      error: 'Boutique en maintenance',
      code: 'MAINTENANCE',
      message: 'Le système est actuellement en maintenance. Veuillez patienter.'
    });
  }

  // Compte en attente d'approbation admin → aucun accès
  if (subscription_status === 'pending_approval') {
    return res.status(403).json({
      error: 'Votre inscription est en cours de validation.',
      code: 'PENDING_APPROVAL',
      message: 'L\'administrateur doit valider votre compte avant que vous puissiez accéder à la plateforme. Vous recevrez un accès très bientôt.',
    });
  }

  // Paiement en attente → bloquer l'accès avec un code spécifique
  if (subscription_status === 'pending_payment') {
    return res.status(403).json({
      error: 'Paiement en cours de validation.',
      code: 'PENDING_PAYMENT',
      message: 'Votre justificatif de paiement est en cours de vérification par le propriétaire.',
    });
  }

  // En période d'essai → vérifier la date
  if (subscription_status === 'trial') {
    const now = new Date();
    const trialEnd = new Date(trial_end_date);

    if (now > trialEnd) {
      return res.status(403).json({
        error: 'Votre période d\'essai de 7 jours est terminée.',
        code: 'TRIAL_EXPIRED',
        message: 'Souscrivez un abonnement à 10 000 F CFA/mois pour continuer à utiliser la plateforme.',
      });
    }
    return next();
  }

  // Compte suspect — accès limité à 1 jour
  if (subscription_status === 'suspect_trial') {
    const now = new Date();
    const trialEnd = new Date(trial_end_date);

    if (now > trialEnd) {
      return res.status(403).json({
        error: 'Accès suspendu — identifiants non conformes.',
        code: 'SUSPECT_TRIAL_EXPIRED',
        message: 'Votre compte a été détecté comme suspect (email ou nom fictif). Fournissez vos vrais identifiants (nom réel, numéro de téléphone valide) pour accéder à la plateforme.',
      });
    }
    // Accès accordé mais l'API retourne un avertissement dans le header
    res.set('X-Account-Warning', 'SUSPECT_IDENTIFIERS');
    return next();
  }

  // Bloqué manuellement par le créateur
  if (subscription_status === 'blocked') {
    return res.status(403).json({
      error: 'Accès suspendu.',
      code: 'ACCOUNT_BLOCKED',
      message: 'Votre accès a été suspendu par l\'administrateur système. Veuillez contacter le support pour plus d\'informations.',
    });
  }

  // Statut expiré ou inconnu
  return res.status(403).json({
    error: 'Votre abonnement est expiré.',
    code: 'SUBSCRIPTION_EXPIRED',
    message: 'Renouvelez votre abonnement pour retrouver l\'accès.',
  });
};

module.exports = trialCheck;
