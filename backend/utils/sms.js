/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  SMS SERVICE — Gestion des alertes SMS (Simulé / Twilio / Africa's Talking)   ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */
const pool = require('../db/pool');

/**
 * Envoie un SMS à un destinataire spécifique.
 * @param {string} to - Numéro de téléphone du destinataire (format international ex: +22177xxxxxxx)
 * @param {string} message - Contenu du message SMS
 */
async function sendSMS(to, message) {
  try {
    if (!to) {
      console.log("[SMS SERVICE] Erreur : Aucun numéro de destinataire fourni.");
      return false;
    }

    // Formatter le numéro au cas où
    let formattedTo = to.trim();
    if (!formattedTo.startsWith('+')) {
      // Hypothèse par défaut Sénégal (+221) si pas de code pays
      if (formattedTo.startsWith('77') || formattedTo.startsWith('78') || formattedTo.startsWith('76') || formattedTo.startsWith('70')) {
        formattedTo = '+221' + formattedTo;
      }
    }

    console.log("\n╔═══════════════════════════════════════════════════════════════════════╗");
    console.log("║ 📱 SMS DÉPART INSTANTANÉ (SIMULATION PREMIUM ACTIVE)                  ║");
    console.log("╠═══════════════════════════════════════════════════════════════════════╣");
    console.log(`║ À : ${formattedTo.padEnd(65)} ║`);
    console.log(`║ MESSAGE : ${message.substring(0, 58).padEnd(58)}... ║`);
    console.log("╠═══════════════════════════════════════════════════════════════════════╣");
    console.log("║ 💡 INTEGRATION API : Twilio / Africa's Talking prête à l'activation. ║");
    console.log("╚═══════════════════════════════════════════════════════════════════════╝\n");

    // --- INTEGRATION TWILIO OPTIONNELLE ---
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      try {
        const twilio = require('twilio');
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        await client.messages.create({
          body: message,
          from: process.env.TWILIO_PHONE_NUMBER || '+1234567890',
          to: formattedTo
        });
        console.log(`[SMS INTEGRATION] Twilio envoyé avec succès à : ${formattedTo}`);
      } catch (err) {
        console.error('[SMS INTEGRATION] Échec de l\'envoi via Twilio :', err.message);
      }
    }

    // --- INTEGRATION AFRICA'S TALKING OPTIONNELLE ---
    if (process.env.AT_API_KEY && process.env.AT_USERNAME) {
      try {
        const AfricasTalking = require('africastalking')({
          apiKey: process.env.AT_API_KEY,
          username: process.env.AT_USERNAME
        });
        const sms = AfricasTalking.SMS;
        await sms.send({
          to: [formattedTo],
          message: message
        });
        console.log(`[SMS INTEGRATION] Africa's Talking envoyé avec succès à : ${formattedTo}`);
      } catch (err) {
        console.error('[SMS INTEGRATION] Échec de l\'envoi via Africa\'s Talking :', err.message);
      }
    }

    return true;
  } catch (err) {
    console.error("[SMS SERVICE] Erreur critique :", err);
    return false;
  }
}

/**
 * Envoie une notification SMS automatique lors de la validation d'une entreprise
 * @param {number} companyId - ID de l'entreprise validée
 * @param {string} status - Nouveau statut ('active', etc.)
 */
async function sendCompanyStatusSMS(companyId, status) {
  try {
    const res = await pool.query("SELECT name, phone FROM companies WHERE id = $1", [companyId]);
    if (res.rows.length === 0) return;
    const company = res.rows[0];

    if (!company.phone) {
      console.log(`[SMS SERVICE] Pas de numéro de téléphone enregistré pour l'entreprise "${company.name}"`);
      return;
    }

    let msg = "";
    if (status === 'active') {
      msg = `🇸🇳 Sunu Gestion : Félicitations ! Votre abonnement pour "${company.name}" a été activé par l'administrateur. Vous avez désormais un accès illimité à votre tableau de bord et votre vitrine !`;
    } else if (status === 'blocked') {
      msg = `🇸🇳 Sunu Gestion : Votre compte "${company.name}" a été temporairement bloqué. Contactez le service client pour régulariser votre situation.`;
    } else if (status === 'maintenance') {
      msg = `🚧 Sunu Gestion : Votre compte "${company.name}" a été placé en maintenance par l'administrateur. Les services seront rétablis sous peu.`;
    }

    if (msg) {
      await sendSMS(company.phone, msg);
    }
  } catch (e) {
    console.error("[SMS SERVICE] Erreur lors de l'envoi de notification d'entreprise :", e);
  }
}

/**
 * SMS : Rappel 24h avant expiration trial
 */
async function sendTrialReminderSMS(company) {
  const phone = company.phone || company.alternate_phone;
  if (!phone) return;
  const msg = `SunuGestion : Bonjour ${company.name}, votre periode d'essai expire demain. Abonnez-vous maintenant pour continuer a gerer vos ventes sans interruption : sunugestion.sn/billing.html`;
  await sendSMS(phone, msg);
}

/**
 * SMS : Compte bloque (trial ou abonnement expire)
 */
async function sendExpiredSMS(company) {
  const phone = company.phone || company.alternate_phone;
  if (!phone) return;
  const msg = `SunuGestion : Votre acces pour "${company.name}" est suspendu. Regularisez votre abonnement pour retrouver l'acces complet : sunugestion.sn/billing.html`;
  await sendSMS(phone, msg);
}

module.exports = {
  sendSMS,
  sendCompanyStatusSMS,
  sendTrialReminderSMS,
  sendExpiredSMS,
};
