// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  Service : Paiement Stripe                                                 ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

/**
 * Crée une session de paiement Stripe Checkout pour un abonnement.
 */
async function createCheckoutSession(companyId, email) {
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    customer_email: email,
    line_items: [
      {
        price: process.env.STRIPE_PRICE_ID,
        quantity: 1,
      },
    ],
    metadata: { company_id: companyId.toString() },
    success_url: `${process.env.FRONTEND_URL}/index.html?payment=success`,
    cancel_url: `${process.env.FRONTEND_URL}/pricing.html?payment=cancelled`,
  });

  return session;
}

/**
 * Vérifie et construit un événement webhook Stripe.
 */
function constructWebhookEvent(rawBody, signature) {
  return stripe.webhooks.constructEvent(
    rawBody,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET
  );
}

module.exports = {
  createCheckoutSession,
  constructWebhookEvent,
};
