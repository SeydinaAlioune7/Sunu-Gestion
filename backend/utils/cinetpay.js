// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  CinetPay Payment Integration — Wave, Orange Money, Carte Bancaire         ║
// ║  Documentation: https://docs.cinetpay.com                                  ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

const axios = require('axios');

const CINETPAY_API_URL = 'https://api-checkout.cinetpay.com/v2/payment';
const CINETPAY_CHECK_URL = 'https://api-checkout.cinetpay.com/v2/payment/check';

/**
 * Initier un paiement CinetPay
 * Retourne le URL de paiement où rediriger le client
 */
async function initPayment({ 
  apiKey, 
  siteId, 
  transactionId, 
  amount, 
  currency = 'XOF',
  description,
  returnUrl,
  notifyUrl,
  customerName,
  customerEmail,
  customerPhone
}) {
  try {
    const payload = {
      apikey: apiKey,
      site_id: siteId,
      transaction_id: transactionId,
      amount: Math.round(amount),
      currency,
      description: description || 'Commande Sunu Gestion',
      return_url: returnUrl,
      notify_url: notifyUrl,
      customer_name: customerName || 'Client',
      customer_email: customerEmail || '',
      customer_phone_number: customerPhone || '',
      channels: 'ALL', // Wave, Orange Money, MTN, Carte Bancaire...
      lang: 'fr',
      metadata: transactionId
    };

    const response = await axios.post(CINETPAY_API_URL, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000
    });

    if (response.data?.code === '201' && response.data?.data?.payment_url) {
      return {
        success: true,
        paymentUrl: response.data.data.payment_url,
        paymentToken: response.data.data.payment_token
      };
    }

    return {
      success: false,
      error: response.data?.message || 'Erreur CinetPay'
    };

  } catch (err) {
    console.error('Erreur CinetPay initPayment:', err.message);
    return {
      success: false,
      error: 'Impossible de joindre le service de paiement.'
    };
  }
}

/**
 * Vérifier le statut d'un paiement CinetPay
 */
async function checkPayment({ apiKey, siteId, transactionId }) {
  try {
    const response = await axios.post(CINETPAY_CHECK_URL, {
      apikey: apiKey,
      site_id: siteId,
      transaction_id: transactionId
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000
    });

    const data = response.data?.data;
    return {
      success: true,
      status: data?.status, // 'ACCEPTED' | 'REFUSED' | 'PENDING'
      amount: data?.amount,
      paymentMethod: data?.payment_method,
      data
    };
  } catch (err) {
    console.error('Erreur CinetPay checkPayment:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { initPayment, checkPayment };
