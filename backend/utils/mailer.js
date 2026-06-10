const nodemailer = require('nodemailer');

const smtpPort = parseInt(process.env.SMTP_PORT || '587');
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
    port: smtpPort,
    secure: smtpPort === 465, // false pour 587 (STARTTLS), true pour 465 (SSL)
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

/**
 * Envoie un email de réinitialisation de mot de passe
 */
const sendResetEmail = async (email, link) => {
    console.log(`\n==================================================`);
    console.log(`✉️ TENTATIVE D'ENVOI DE MAIL DE RÉINITIALISATION`);
    console.log(`Destinataire : ${email}`);
    console.log(`Lien de réinitialisation : ${link}`);
    console.log(`==================================================\n`);

    const mailOptions = {
        from: `"Pro Gestion" <${process.env.SMTP_USER || 'noreply@progestion.sn'}>`,
        to: email,
        subject: 'Réinitialisation de votre mot de passe — Pro Gestion',
        html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #4f46e5;">Bonjour,</h2>
                <p>Vous avez demandé la réinitialisation de votre mot de passe sur la plateforme <strong>Pro Gestion</strong>.</p>
                <p>Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe (valable 1 heure) :</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${link}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Réinitialiser mon mot de passe</a>
                </div>
                <p style="color: #666; font-size: 12px;">Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email.</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="font-size: 10px; color: #999; text-align: center;">© 2026 Pro Gestion — Système ERP Souverain</p>
            </div>
        `,
    };

    try {
        if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
            throw new Error("SMTP non configuré dans le fichier .env");
        }
        const result = await transporter.sendMail(mailOptions);
        console.log(`✅ Mail envoyé avec succès à ${email}`);
        return result;
    } catch (err) {
        console.error(`❌ Échec de l'envoi SMTP (Erreur: ${err.message})`);
        console.log(`👉 SOLUTION : Utilisez ce lien généré en console pour réinitialiser : ${link}`);
        // Retourner un succès fictif pour ne pas faire planter l'application frontend
        return { messageId: 'fallback-simulated-id-' + Date.now(), accepted: [email], simulated: true };
    }
};

const sendOrderReceivedEmail = async (email, name, invoiceNumber, total, companyName, paymentMethod) => {
    console.log(`\n==================================================`);
    console.log(`✉️ 🛒 SIMULATION : EMAIL COMMANDE REÇUE`);
    console.log(`Destinataire : ${email}`);
    console.log(`Client : ${name}`);
    console.log(`Commande : ${invoiceNumber}`);
    console.log(`Montant : ${total} F CFA`);
    console.log(`Boutique : ${companyName}`);
    console.log(`Paiement : ${paymentMethod}`);
    console.log(`==================================================\n`);

    const paymentLabel = paymentMethod === 'wave' ? 'Wave' : (paymentMethod === 'orange_money' ? 'Orange Money' : (paymentMethod === 'cash' ? 'Espèces' : 'Carte Bancaire'));
    const statusNote = (paymentMethod === 'wave' || paymentMethod === 'orange_money') 
        ? "Votre paiement est en cours de validation par le vendeur." 
        : "Votre commande est enregistrée.";

    const mailOptions = {
        from: `"${companyName}" <${process.env.SMTP_USER || 'noreply@abdgestion.sn'}>`,
        to: email,
        subject: `Commande Reçue ${invoiceNumber} — ${companyName}`,
        html: `
            <div style="font-family: 'Outfit', sans-serif; max-width: 600px; margin: auto; padding: 30px; background-color: #0f172a; color: #f8fafc; border: 1px solid #1e293b; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.55);">
                <div style="text-align: center; margin-bottom: 24px;">
                    <h2 style="color: #6366f1; margin: 0; font-size: 24px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">${companyName}</h2>
                    <p style="color: #94a3b8; font-size: 13px; margin-top: 4px;">Merci pour votre commande !</p>
                </div>
                <hr style="border: none; border-top: 1px solid #334155; margin: 20px 0;">
                <p style="font-size: 15px; line-height: 1.6; color: #e2e8f0;">Bonjour <strong>${name}</strong>,</p>
                <p style="font-size: 14px; line-height: 1.6; color: #94a3b8;">Votre commande <strong>${invoiceNumber}</strong> a bien été enregistrée avec succès auprès de notre boutique.</p>
                
                <div style="background-color: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 20px; margin: 24px 0;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                        <tr>
                            <td style="color: #94a3b8; padding: 6px 0;">Référence :</td>
                            <td style="color: #ffffff; text-align: right; font-weight: bold; padding: 6px 0;">${invoiceNumber}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 6px 0;">Montant total :</td>
                            <td style="color: #10b981; text-align: right; font-weight: bold; font-size: 16px; padding: 6px 0;">${Number(total).toLocaleString('fr-FR')} F CFA</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 6px 0;">Mode de paiement :</td>
                            <td style="color: #ffffff; text-align: right; padding: 6px 0;">${paymentLabel}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 6px 0;">Statut :</td>
                            <td style="color: #f59e0b; text-align: right; font-weight: bold; padding: 6px 0;">${statusNote}</td>
                        </tr>
                    </table>
                </div>

                <p style="font-size: 13px; line-height: 1.6; color: #94a3b8; text-align: center; margin-top: 24px;">
                    Un email de confirmation vous sera envoyé dès que le vendeur aura validé votre commande.
                </p>
                <hr style="border: none; border-top: 1px solid #334155; margin: 20px 0;">
                <p style="font-size: 10px; color: #64748b; text-align: center; margin: 0;">Propulsé par ABD GESTION — Plateforme ERP Souveraine</p>
            </div>
        `,
    };

    try {
        if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
            return { messageId: 'simulated-id-' + Date.now(), accepted: [email], simulated: true };
        }
        return await transporter.sendMail(mailOptions);
    } catch (err) {
        console.error(`❌ Échec envoi SMTP reçu (Erreur: ${err.message})`);
        return { simulated: true };
    }
};

const sendOrderConfirmedEmail = async (email, name, invoiceNumber, total, companyName) => {
    console.log(`\n==================================================`);
    console.log(`✉️ 📦 SIMULATION : EMAIL COMMANDE VALIDÉE PAR LE VENDEUR`);
    console.log(`Destinataire : ${email}`);
    console.log(`Client : ${name}`);
    console.log(`Commande : ${invoiceNumber}`);
    console.log(`Montant : ${total} F CFA`);
    console.log(`Boutique : ${companyName}`);
    console.log(`==================================================\n`);

    const mailOptions = {
        from: `"${companyName}" <${process.env.SMTP_USER || 'noreply@abdgestion.sn'}>`,
        to: email,
        subject: `Commande Confirmée ! ${invoiceNumber} — ${companyName}`,
        html: `
            <div style="font-family: 'Outfit', sans-serif; max-width: 600px; margin: auto; padding: 30px; background-color: #0f172a; color: #f8fafc; border: 1px solid #1e293b; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.55);">
                <div style="text-align: center; margin-bottom: 24px;">
                    <div style="display: inline-block; background-color: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 50%; padding: 12px; margin-bottom: 12px;">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </div>
                    <h2 style="color: #10b981; margin: 0; font-size: 24px; font-weight: 800;">COMMANDE VALIDÉE</h2>
                    <p style="color: #94a3b8; font-size: 13px; margin-top: 4px;">Votre commande est maintenant confirmée par le vendeur.</p>
                </div>
                <hr style="border: none; border-top: 1px solid #334155; margin: 20px 0;">
                <p style="font-size: 15px; line-height: 1.6; color: #e2e8f0;">Bonjour <strong>${name}</strong>,</p>
                <p style="font-size: 14px; line-height: 1.6; color: #94a3b8;">Bonne nouvelle ! Le vendeur <strong>${companyName}</strong> vient de valider le paiement et de confirmer votre commande <strong>${invoiceNumber}</strong>.</p>
                
                <div style="background-color: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 20px; margin: 24px 0;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                        <tr>
                            <td style="color: #94a3b8; padding: 6px 0;">Référence :</td>
                            <td style="color: #ffffff; text-align: right; font-weight: bold; padding: 6px 0;">${invoiceNumber}</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 6px 0;">Montant réglé :</td>
                            <td style="color: #10b981; text-align: right; font-weight: bold; font-size: 16px; padding: 6px 0;">${Number(total).toLocaleString('fr-FR')} F CFA</td>
                        </tr>
                        <tr>
                            <td style="color: #94a3b8; padding: 6px 0;">Statut final :</td>
                            <td style="color: #10b981; text-align: right; font-weight: bold; padding: 6px 0;">Confirmé / Payé</td>
                        </tr>
                    </table>
                </div>

                <p style="font-size: 14px; line-height: 1.6; color: #e2e8f0; text-align: center; background-color: rgba(99,102,241,0.1); border: 1px dashed rgba(99,102,241,0.3); border-radius: 8px; padding: 12px;">
                    🚚 Votre colis est en cours de préparation pour la livraison. Merci de votre confiance !
                </p>
                <hr style="border: none; border-top: 1px solid #334155; margin: 20px 0;">
                <p style="font-size: 10px; color: #64748b; text-align: center; margin: 0;">Propulsé par ABD GESTION — Plateforme ERP Souveraine</p>
            </div>
        `,
    };

    try {
        if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
            return { messageId: 'simulated-id-' + Date.now(), accepted: [email], simulated: true };
        }
        return await transporter.sendMail(mailOptions);
    } catch (err) {
        console.error(`❌ Échec envoi SMTP validé (Erreur: ${err.message})`);
        return { simulated: true };
    }
};

const sendVerificationEmail = async (email, code) => {
    const mailOptions = {
        from: `"Sunu Gestion" <${process.env.SMTP_USER}>`,
        to: email,
        subject: `${code} — Votre code de vérification Sunu Gestion`,
        html: `
            <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;background:#0f172a;border:1px solid #1e293b;border-radius:16px;color:#f8fafc">
                <h2 style="color:#6366f1;margin:0 0 8px">Sunu Gestion</h2>
                <p style="color:#94a3b8;font-size:13px;margin:0 0 24px">Vérification de votre adresse email</p>
                <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
                    <p style="color:#94a3b8;font-size:12px;margin:0 0 12px;text-transform:uppercase;letter-spacing:.1em">Votre code de vérification</p>
                    <div style="font-size:40px;font-weight:900;letter-spacing:.25em;color:#6366f1">${code}</div>
                    <p style="color:#64748b;font-size:11px;margin:12px 0 0">Valide pendant <strong style="color:#f59e0b">10 minutes</strong></p>
                </div>
                <p style="color:#64748b;font-size:12px;line-height:1.6">Si vous n'êtes pas à l'origine de cette demande, ignorez cet email. Ne partagez jamais ce code.</p>
                <hr style="border:none;border-top:1px solid #1e293b;margin:20px 0">
                <p style="font-size:10px;color:#475569;text-align:center;margin:0">© 2026 Sunu Gestion — sunugestion.sn</p>
            </div>
        `,
    };
    try {
        if (!process.env.SMTP_USER || !process.env.SMTP_PASS) throw new Error('SMTP non configuré');
        await transporter.sendMail(mailOptions);
        console.log(`[OTP EMAIL] ✅ Code envoyé à ${email}`);
        return true;
    } catch (err) {
        // Si erreur App Password Gmail → message clair dans les logs
        if (err.message.includes('Application-specific password') || err.message.includes('InvalidSecondFactor')) {
            console.error(`[OTP EMAIL] ❌ Gmail exige un MOT DE PASSE D'APPLICATION.`);
            console.error(`[OTP EMAIL]    → Va sur https://myaccount.google.com/apppasswords`);
            console.error(`[OTP EMAIL]    → Crée un App Password pour "Mail" et mets-le dans SMTP_PASS du .env`);
        } else {
            console.error(`[OTP EMAIL] ❌ Échec SMTP: ${err.message}`);
        }
        console.log(`[OTP EMAIL] 🔑 CODE SECOURS POUR ADMIN — ${email} : ${code}`);
        return false;
    }
};

module.exports = { sendResetEmail, sendOrderReceivedEmail, sendOrderConfirmedEmail, sendVerificationEmail };
