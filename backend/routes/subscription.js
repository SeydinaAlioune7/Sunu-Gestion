// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  Routes : Abonnements & Paiement Stripe                                    ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const authenticate = require('../middleware/auth');

// ── POST /api/subscriptions/create-checkout ──────────────────────────────────
router.post('/create-checkout', authenticate, async (req, res) => {
  try {
    const { method, currency } = req.body || { method: 'stripe', currency: 'eur' };
    
    // CAS 1 : MOBILE MONEY (F CFA) - Simulation Wave / Orange Money
    if (method === 'mobile_money') {
      // Dans la réalité, on appellerait l'API PayDunya ou FedaPay ici
      // Pour la démo, on active directement l'abonnement
      await pool.query(
        "UPDATE companies SET subscription_status = 'active', trial_end_date = NULL WHERE id = $1",
        [req.user.company_id]
      );
      
      const subId = `sub_mm_${Date.now()}`;
      
      const updateResult = await pool.query(
        "UPDATE subscriptions SET stripe_subscription_id = $1, status = 'active', plan = 'enterprise_cfa' WHERE company_id = $2",
        [subId, req.user.company_id]
      );
      
      if (updateResult.rowCount === 0) {
        await pool.query(
          `INSERT INTO subscriptions (company_id, stripe_customer_id, stripe_subscription_id, plan, status)
           VALUES ($1, $2, $3, 'enterprise_cfa', 'active')`,
          [req.user.company_id, `cus_mm_${req.user.id}`, subId]
        );
      }
      
      return res.json({ success: true, message: 'Paiement Mobile Money validé avec succès.' });
    }

    // CAS 2 : STRIPE (Euro / USD)
    if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.startsWith('sk_test_VOTRE')) {
      return res.status(503).json({
        error: 'Le paiement Stripe n\'est pas encore configuré.',
        message: 'Utilisez le paiement Mobile Money ou contactez l\'administrateur.',
      });
    }

    const { createCheckoutSession } = require('../services/paymentService');
    const session = await createCheckoutSession(req.user.company_id, req.user.email);
    res.json({ url: session.url });
  } catch (err) {
    console.error('Erreur Checkout :', err);
    res.status(500).json({ error: 'Erreur lors de l\'initialisation du paiement.' });
  }
});

// ── POST /api/subscriptions/webhook (Stripe Webhook) ─────────────────────────
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    if (!process.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET.startsWith('whsec_VOTRE')) {
      return res.status(200).send();
    }

    const { constructWebhookEvent } = require('../services/paymentService');
    const sig = req.headers['stripe-signature'];
    const event = constructWebhookEvent(req.body, sig);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const companyId = session.metadata.company_id;
        const stripeSubId = session.subscription;

        await pool.query(
          "UPDATE companies SET subscription_status = 'active', trial_end_date = NULL WHERE id = $1",
          [companyId]
        );
        
        const updateResult = await pool.query(
          "UPDATE subscriptions SET stripe_subscription_id = $1, status = 'active' WHERE company_id = $2",
          [stripeSubId, companyId]
        );

        if (updateResult.rowCount === 0) {
          await pool.query(
            `INSERT INTO subscriptions (company_id, stripe_customer_id, stripe_subscription_id, status)
             VALUES ($1, $2, $3, 'active')`,
            [companyId, session.customer, stripeSubId]
          );
        }
        console.log(`✅ Abonnement activé pour l'entreprise ${companyId}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await pool.query(
          "UPDATE subscriptions SET status = 'cancelled' WHERE stripe_subscription_id = $1",
          [sub.id]
        );
        // Trouver et marquer l'entreprise comme expirée
        const result = await pool.query(
          'SELECT company_id FROM subscriptions WHERE stripe_subscription_id = $1',
          [sub.id]
        );
        if (result.rows.length > 0) {
          await pool.query(
            "UPDATE companies SET subscription_status = 'expired' WHERE id = $1",
            [result.rows[0].company_id]
          );
        }
        break;
      }
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Erreur webhook :', err);
    res.status(400).json({ error: 'Webhook invalide.' });
  }
});

// ── GET /api/subscriptions/status ────────────────────────────────────────────
router.get('/status', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.subscription_status, c.trial_end_date, s.stripe_subscription_id, s.status as stripe_status, s.current_period_end
       FROM companies c
       LEFT JOIN subscriptions s ON c.id = s.company_id
       WHERE c.id = $1`,
      [req.user.company_id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Entreprise introuvable.' });

    const data = result.rows[0];
    let daysRemaining = null;
    if (data.subscription_status === 'trial' && data.trial_end_date) {
      daysRemaining = Math.max(0, Math.ceil((new Date(data.trial_end_date) - new Date()) / (1000 * 60 * 60 * 24)));
    }

    res.json({
      status: data.subscription_status,
      trial_end_date: data.trial_end_date,
      days_remaining: daysRemaining,
      stripe_status: data.stripe_status,
      current_period_end: data.current_period_end,
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;
