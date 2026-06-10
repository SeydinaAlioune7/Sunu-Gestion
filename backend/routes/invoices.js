// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  Routes : Factures (CRUD + génération PDF)                                 ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const pool = require('../db/pool');
const { sendOrderConfirmedEmail } = require('../utils/mailer');
const authenticate = require('../middleware/auth');
const trialCheck = require('../middleware/trialCheck');
const PDFDocument = require('pdfkit');

router.use(authenticate, trialCheck);

/**
 * Génère un numéro de facture unique : ABD-2026-00042
 */
async function generateInvoiceNumber() {
  const year = new Date().getFullYear();
  const result = await pool.query(
    "SELECT invoice_number FROM invoices WHERE invoice_number LIKE $1 ORDER BY id DESC LIMIT 1",
    [`ABD-${year}-%`]
  );
  let num = 1;
  if (result.rows.length > 0) {
    const lastNumber = result.rows[0].invoice_number;
    const parts = lastNumber.split('-');
    if (parts.length === 3) {
      num = parseInt(parts[2], 10) + 1;
    }
  }
  return `ABD-${year}-${String(num).padStart(5, '0')}`;
}

// ── GET /api/invoices ────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM invoices WHERE company_id = $1 ORDER BY created_at DESC',
      [req.user.company_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── GET /api/invoices/:id ────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const invoice = await pool.query(
      'SELECT * FROM invoices WHERE id = $1 AND company_id = $2',
      [req.params.id, req.user.company_id]
    );
    if (invoice.rows.length === 0) return res.status(404).json({ error: 'Facture introuvable.' });

    const items = await pool.query(
      'SELECT * FROM invoice_items WHERE invoice_id = $1',
      [req.params.id]
    );

    res.json({ ...invoice.rows[0], items: items.rows });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── POST /api/invoices ───────────────────────────────────────────────────────
router.post('/',
  [
    body('client_name').trim().notEmpty().withMessage('Le nom du client est requis.'),
    body('items').isArray({ min: 1 }).withMessage('Au moins un article est requis.'),
    body('items.*.product_id').isInt(),
    body('items.*.quantity').isInt({ min: 1 }),
  ],
  async (req, res) => {
    const client = await pool.connect();
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { client_name, client_address, items } = req.body;
      const invoiceNumber = await generateInvoiceNumber();

      await client.query('BEGIN');

      // Créer la facture
      const invoiceResult = await client.query(
        `INSERT INTO invoices (company_id, invoice_number, client_name, client_address, total_amount, status)
         VALUES ($1, $2, $3, $4, 0, 'draft') RETURNING *`,
        [req.user.company_id, invoiceNumber, client_name, client_address || '']
      );
      const invoiceId = invoiceResult.rows[0].id;

      let totalAmount = 0;

        // Ajouter les lignes
        for (const item of items) {
          const product = await client.query(
            'SELECT name, price, purchase_price_exc_tax, stock_quantity FROM products WHERE id = $1 AND company_id = $2',
            [item.product_id, req.user.company_id]
          );
          if (product.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `Produit ID ${item.product_id} introuvable.` });
          }

          const unitPrice = parseFloat(product.rows[0].price);
          const purchasePrice = parseFloat(product.rows[0].purchase_price_exc_tax || 0);
          const lineTotal = unitPrice * item.quantity;
          totalAmount += lineTotal;

          // Insérer l'item avec son prix d'achat à l'instant T
          await client.query(
            `INSERT INTO invoice_items (invoice_id, product_id, product_name, quantity, unit_price, purchase_price)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [invoiceId, item.product_id, product.rows[0].name, item.quantity, unitPrice, purchasePrice]
          );

          // Décrémenter le stock
          await client.query(
            'UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2',
            [item.quantity, item.product_id]
          );

          // Log mouvement de stock
          await client.query(
            'INSERT INTO stock_movements (product_id, company_id, type, quantity, note) VALUES ($1, $2, $3, $4, $5)',
            [item.product_id, req.user.company_id, 'exit', item.quantity, `Vente (Facture ${invoiceNumber})`]
          );
        }

        // Mettre à jour le total
        await client.query(
          'UPDATE invoices SET total_amount = $1 WHERE id = $2',
          [totalAmount, invoiceId]
        );

        await client.query('COMMIT');

      // Log
      await pool.query(
        'INSERT INTO activity_logs (company_id, user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5, $6)',
        [req.user.company_id, req.user.id, 'CREATE_INVOICE', 'invoice', invoiceId, `Facture ${invoiceNumber} créée`]
      );

      const fullInvoice = await pool.query('SELECT * FROM invoices WHERE id = $1', [invoiceId]);
      const fullItems = await pool.query('SELECT * FROM invoice_items WHERE invoice_id = $1', [invoiceId]);

      res.status(201).json({ ...fullInvoice.rows[0], items: fullItems.rows });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Erreur création facture :', err);
      res.status(500).json({ error: 'Erreur serveur.' });
    } finally {
      client.release();
    }
  }
);

// ── GET /api/invoices/:id/pdf ────────────────────────────────────────────────
router.get('/:id/pdf', async (req, res) => {
  try {
    const invoice = await pool.query(
      'SELECT * FROM invoices WHERE id = $1 AND company_id = $2',
      [req.params.id, req.user.company_id]
    );
    if (invoice.rows.length === 0) return res.status(404).json({ error: 'Facture introuvable.' });

    const items = await pool.query(
      'SELECT * FROM invoice_items WHERE invoice_id = $1',
      [req.params.id]
    );

    const companyInfo = await pool.query(
      'SELECT name, email, phone, website FROM companies WHERE id = $1',
      [req.user.company_id]
    );

    const inv = invoice.rows[0];
    const company = companyInfo.rows[0] || { name: 'SUNU GESTION' };
    const sellerName = company.name.toUpperCase();

    // Construire le PDF
    const doc = new PDFDocument({ size: 'A4', margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="facture_${inv.invoice_number}.pdf"`);
    doc.pipe(res);

    // Fond léger pour l'en-tête
    doc.rect(0, 0, 595, 120).fill('#F8FAFC');

    // Filigrane discret
    doc.save();
    doc.opacity(0.05);
    doc.fontSize(60).font('Helvetica-Bold').fillColor('#000000').rotate(-45, { origin: [300, 400] }).text('SOUVERAINETÉ DIGITALE', 50, 400);
    doc.restore();

    // En-tête
    doc.fillColor('#4F46E5').fontSize(24).font('Helvetica-Bold').text(sellerName, 50, 40);
    
    let contactText = 'Facture commerciale officielle';
    const parts = [];
    if (company.phone) parts.push(`Tél: ${company.phone}`);
    if (company.email) parts.push(`Email: ${company.email}`);
    if (parts.length > 0) contactText += ` | ${parts.join(' - ')}`;
    
    doc.fontSize(9).font('Helvetica').fillColor('#64748B').text(contactText, 50, 70);

    doc.fillColor('#1E293B').fontSize(22).font('Helvetica-Bold').text('FACTURE', 400, 40, { align: 'right' });
    doc.fontSize(10).font('Helvetica').fillColor('#475569').text(inv.invoice_number, 400, 70, { align: 'right' });

    doc.moveDown(4);

    // Infos client et Facture
    const startY = 150;
    doc.fillColor('#64748B').fontSize(9).font('Helvetica-Bold').text('DESTINATAIRE', 50, startY);
    doc.fillColor('#1E293B').fontSize(12).font('Helvetica-Bold').text(inv.client_name, 50, startY + 15);
    if (inv.client_address) {
        doc.fillColor('#475569').fontSize(10).font('Helvetica').text(inv.client_address, 50, startY + 32, { width: 200 });
    }

    doc.fillColor('#64748B').fontSize(9).font('Helvetica-Bold').text('DÉTAILS', 350, startY);
    doc.fillColor('#1E293B').fontSize(10).font('Helvetica').text(`Date d'émission : ${new Date(inv.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`, 350, startY + 15);
    
    // Libellés de statut élégants en français
    const statusLabels = {
      'draft': 'Brouillon',
      'pending': 'En attente',
      'pending_payment': 'Paiement en attente',
      'paid': 'Payé',
      'confirmed': 'Confirmé',
      'delivered': 'Livré',
      'cancelled': 'Annulé'
    };
    const statusText = statusLabels[inv.status] || inv.status.toUpperCase();
    doc.text(`Statut : ${statusText}`, 350, startY + 30);

    doc.moveDown(3);

    // Tableau – en-tête
    const tableTop = doc.y + 20;
    doc.rect(50, tableTop, 495, 30).fill('#4F46E5');
    doc.fillColor('#FFFFFF').fontSize(10).font('Helvetica-Bold');
    doc.text('Désignation des Articles', 65, tableTop + 10);
    doc.text('Qté', 280, tableTop + 10, { width: 50, align: 'center' });
    doc.text('Prix Unitaire', 340, tableTop + 10, { width: 90, align: 'right' });
    doc.text('Total (CFA)', 440, tableTop + 10, { width: 95, align: 'right' });

    // Fonction de formatage sécurisée (évite les caractères invisibles de toLocaleString qui buggent le PDF)
    const formatMontant = (num) => Math.round(Number(num) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

    // Tableau – lignes
    let y = tableTop + 30;
    doc.fontSize(10).font('Helvetica');
    for (const item of items.rows) {
        const isEven = items.rows.indexOf(item) % 2 === 0;
        if (isEven) doc.rect(50, y, 495, 25).fill('#F1F5F9');
        
        doc.fillColor('#1E293B');
        doc.text(item.product_name, 65, y + 8);
        doc.text(item.quantity.toString(), 280, y + 8, { width: 50, align: 'center' });
        doc.text(`${formatMontant(item.unit_price)} F`, 340, y + 8, { width: 90, align: 'right' });
        doc.font('Helvetica-Bold').text(`${formatMontant(parseFloat(item.unit_price) * parseFloat(item.quantity))} F`, 440, y + 8, { width: 95, align: 'right' });
        doc.font('Helvetica');
        y += 25;
    }

    // Bloc Total
    y += 20;
    const isPaid = (inv.status === 'paid' || inv.status === 'confirmed' || inv.status === 'delivered');
    const colorBlock = isPaid ? '#10B981' : '#4F46E5'; // Vert si payé, Bleu si à payer
    
    doc.rect(340, y, 205, 40).fill(colorBlock);
    doc.fillColor('#FFFFFF').fontSize(14).font('Helvetica-Bold');
    doc.text(isPaid ? 'NET PAYÉ' : 'NET À PAYER', 350, y + 13);
    doc.text(`${formatMontant(inv.total_amount)} F`, 440, y + 13, { width: 95, align: 'right' });

    if (isPaid) {
        doc.fillColor('#10B981').fontSize(14).font('Helvetica-Bold');
        doc.text(`PAYÉ LE : ${inv.paid_at ? new Date(inv.paid_at).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR')}`, 50, y + 13);
    }

    // Pied de page
    doc.rect(0, 780, 595, 62).fill('#1E293B');
    doc.fillColor('#94A3B8').fontSize(8).font('Helvetica');
    doc.text('Cette facture est un document officiel généré électroniquement.', 0, 800, { align: 'center' });
    doc.fillColor('#FFFFFF').text(`Propriété de ${sellerName} — Technologie Sunu Gestion`, 0, 815, { align: 'center' });

    doc.end();
  } catch (err) {
    console.error('Erreur génération PDF :', err);
    res.status(500).json({ error: 'Erreur lors de la génération du PDF.' });
  }
});


// ── PUT /api/invoices/:id/status ─────────────────────────────────────────────
router.put('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Le statut est requis.' });

    let query = 'UPDATE invoices SET status = $1 WHERE id = $2 AND company_id = $3 RETURNING *';
    let params = [status, req.params.id, req.user.company_id];

    if (status === 'paid' || status === 'confirmed' || status === 'delivered') {
        query = "UPDATE invoices SET status = $1, paid_at = datetime('now') WHERE id = $2 AND company_id = $3 RETURNING *";
    }

    const result = await pool.query(query, params);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Facture introuvable.' });

    const invoice = result.rows[0];

    // Log the action
    await pool.query(
      'INSERT INTO activity_logs (company_id, user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.user.company_id, req.user.id, 'UPDATE_INVOICE_STATUS', 'invoice', req.params.id, `Facture ${invoice.invoice_number} passée en ${status}`]
    );

    // ✉️ Si le statut passe à "paid", "confirmed" ou "delivered", envoyer les notifications à l'acheteur
    if (status === 'paid' || status === 'confirmed' || status === 'delivered') {
      const address = invoice.client_address || '';
      const emailMatch = address.match(/Email:\s*([^|]+)/i);
      const phoneMatch = address.match(/Tél:\s*([^|]+)/i);
      const clientEmail = emailMatch ? emailMatch[1].trim() : null;
      const clientPhone = phoneMatch ? phoneMatch[1].trim() : null;

      // Récupérer le nom de l'entreprise
      const companyRes = await pool.query('SELECT name FROM companies WHERE id = $1', [req.user.company_id]);
      const companyName = companyRes.rows.length > 0 ? companyRes.rows[0].name : 'Notre Boutique';

      // ✉️ Envoi de l'email
      if (clientEmail && clientEmail.includes('@') && clientEmail !== 'N/A') {
        sendOrderConfirmedEmail(clientEmail, invoice.client_name, invoice.invoice_number, invoice.total_amount, companyName)
          .catch(err => console.error('Erreur tâche d\'envoi email validé :', err));
      }

      // 📱 Simulation de l'envoi du SMS
      if (clientPhone && clientPhone !== 'N/A') {
        console.log(`\n==================================================`);
        console.log(`📱 [SMS SIMULATION] Envoyé au ${clientPhone}`);
        console.log(`Boutique : ${companyName}`);
        console.log(`Message : Bonjour ${invoice.client_name}, votre commande ${invoice.invoice_number} a bien été VALIDÉE et CONFIRMÉE par le vendeur ! Elle est en cours de préparation pour la livraison.`);
        console.log(`==================================================\n`);
      }
    }

    res.json({ message: 'Statut mis à jour.', invoice: result.rows[0] });
  } catch (err) {
    console.error('Erreur mise à jour statut facture :', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── DELETE /api/invoices/:id ─────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM invoices WHERE id = $1 AND company_id = $2 RETURNING invoice_number',
      [req.params.id, req.user.company_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Facture introuvable.' });
    res.json({ message: 'Facture supprimée.' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;
