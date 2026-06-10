// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  PayTech Payment Integration — Wave, OM, Free Money, CB (Senegal)           ║
// ║  Documentation: https://paytech.sn                                          ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

const crypto = require('crypto');

const PAYTECH_API_URL = 'https://paytech.sn/api/payment/request-payment';

/**
 * Initier un paiement PayTech
 * Retourne le URL de paiement où rediriger le client et le token
 */
async function initPaytechPayment({
  apiKey,
  apiSecret,
  refCommand,
  amount,
  itemName = 'Commande SunuGestion',
  successUrl,
  cancelUrl,
  ipnUrl,
  env = 'test'
}) {
  try {
    const payload = {
      item_name: itemName,
      item_price: Math.round(amount),
      currency: 'XOF',
      ref_command: refCommand,
      command_name: itemName,
      env: env || 'test',
      ipn_url: ipnUrl,
      success_url: successUrl,
      cancel_url: cancelUrl
    };

    const response = await fetch(PAYTECH_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API_KEY': apiKey,
        'API_SECRET': apiSecret
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000)
    });

    const data = await response.json();

    if (response.ok && data && data.success === 1) {
      return {
        success: true,
        redirectUrl: data.redirect_url,
        token: data.token
      };
    }

    console.error('PayTech API Response Failure:', data);

    return {
      success: false,
      error: data?.errors?.[0] || 'Erreur d\'initialisation PayTech'
    };
  } catch (err) {
    console.error('Erreur PayTech initPayment Exception:', err);
    return {
      success: false,
      error: 'Impossible de joindre le service de paiement PayTech.'
    };
  }
}

/**
 * Vérifier la signature IPN de PayTech
 */
function verifyPaytechIpnSignature({ apiKey, apiSecret, body }) {
  if (!body || !body.api_key_sha256 || !body.api_secret_sha256) {
    return false;
  }
  const myKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
  const mySecretHash = crypto.createHash('sha256').update(apiSecret).digest('hex');

  return body.api_key_sha256 === myKeyHash && body.api_secret_sha256 === mySecretHash;
}

module.exports = { initPaytechPayment, verifyPaytechIpnSignature };
