// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  Routes : Dashboard (statistiques et widgets)                              ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const authenticate = require('../middleware/auth');
const trialCheck = require('../middleware/trialCheck');

router.use(authenticate, trialCheck);

// ── GET /api/dashboard ───────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const companyId = req.user.company_id;

    // Total des produits (Nombre)
    const productsCount = await pool.query(
      'SELECT COUNT(*) as count FROM products WHERE company_id = $1',
      [companyId]
    );

    // Valeur totale du stock
    const stockValue = await pool.query(
      'SELECT COALESCE(SUM(price * stock_quantity), 0) as total FROM products WHERE company_id = $1',
      [companyId]
    );

    // Produits en alerte stock bas
    const lowStock = await pool.query(
      'SELECT id, name, stock_quantity, alert_threshold FROM products WHERE company_id = $1 AND stock_quantity <= alert_threshold ORDER BY stock_quantity ASC LIMIT 10',
      [companyId]
    );

    // Nombre de factures
    const invoicesCount = await pool.query(
      'SELECT COUNT(*) as count FROM invoices WHERE company_id = $1',
      [companyId]
    );

    // Valeur d'achat totale du stock
    const stockPurchaseValue = await pool.query(
      'SELECT COALESCE(SUM(purchase_price_exc_tax * stock_quantity), 0) as total FROM products WHERE company_id = $1',
      [companyId]
    );

    // Valeur de vente totale du stock
    const stockSaleValue = await pool.query(
      'SELECT COALESCE(SUM(price * stock_quantity), 0) as total FROM products WHERE company_id = $1',
      [companyId]
    );

    // Chiffre d'affaires total
    const totalRevenue = await pool.query(
      "SELECT COALESCE(SUM(total_amount), 0) as total FROM invoices WHERE company_id = $1",
      [companyId]
    );

    // Ventes du jour
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayRevenue = await pool.query(
      "SELECT COALESCE(SUM(total_amount), 0) as total FROM invoices WHERE company_id = $1 AND created_at >= $2",
      [companyId, todayStart.toISOString()]
    );

    // Marge Brute du jour
    const todayProfit = await pool.query(
      `SELECT COALESCE(SUM(i.quantity * (i.unit_price - COALESCE(p.purchase_price_exc_tax, 0))), 0) as profit 
       FROM invoice_items i 
       JOIN invoices v ON i.invoice_id = v.id 
       LEFT JOIN products p ON i.product_id = p.id
       WHERE v.company_id = $1 AND v.created_at >= $2`,
      [companyId, todayStart.toISOString()]
    );

    // Analyses et Alertes (Ancien Insights AI)
    const analyses = [];
    if (lowStock.rows.length > 0) {
        analyses.push({ type: 'danger', icon: '⚠️', message: `STOCK : ${lowStock.rows.length} produits sont en dessous du seuil d'alerte. Réapprovisionnez vos stocks.` });
    }
    const todayRevVal = parseFloat(todayRevenue.rows[0].total);
    if (todayRevVal > 0) {
        const marginPct = Math.round((todayProfit.rows[0].profit / (todayRevVal || 1)) * 100);
        analyses.push({ type: 'success', icon: '📈', message: `VENTES : ${todayRevVal.toLocaleString('fr-FR')} F CFA générés aujourd'hui (Marge brute : ${marginPct}%).` });
    }
    if (parseInt(invoicesCount.rows[0].count) === 0) {
        analyses.push({ type: 'info', icon: '📝', message: "COMMERCE : Enregistrez vos premières ventes pour voir apparaître vos indicateurs de performance." });
    } else {
        analyses.push({ type: 'info', icon: '📊', message: "ANALYSE : Votre capital est actuellement réparti entre votre trésorerie et la valeur de votre stock." });
    }

    // 5 dernières factures
    const recentInvoices = await pool.query(
      'SELECT id, invoice_number, client_name, total_amount, status, created_at FROM invoices WHERE company_id = $1 ORDER BY created_at DESC LIMIT 5',
      [companyId]
    );

    // Top Produits
    const topProducts = await pool.query(
      `SELECT product_name, SUM(quantity) as total_quantity 
       FROM invoice_items i 
       JOIN invoices v ON i.invoice_id = v.id 
       WHERE v.company_id = $1 
       GROUP BY product_name 
       ORDER BY total_quantity DESC LIMIT 4`,
      [companyId]
    );

    // Historique des 7 derniers jours
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);
    
    const histResult = await pool.query(
      'SELECT total_amount, created_at FROM invoices WHERE company_id = $1 AND created_at >= $2',
      [companyId, sevenDaysAgo.toISOString()]
    );

    const revenue_history = {};
    for (let i = 0; i < 7; i++) {
        const d = new Date(sevenDaysAgo);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];
        revenue_history[dateStr] = 0;
    }

    histResult.rows.forEach(row => {
        const dateStr = row.created_at.substring(0, 10);
        if (revenue_history[dateStr] !== undefined) revenue_history[dateStr] += parseFloat(row.total_amount);
    });

    const revenue_chart = {
        labels: Object.keys(revenue_history).map(d => new Date(d).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })),
        data: Object.values(revenue_history)
    };

    const top_products_chart = {
        labels: topProducts.rows.map(r => r.product_name),
        data: topProducts.rows.map(r => parseInt(r.total_quantity))
    };

    // Stockage et autres infos entreprise
    const storage = await pool.query('SELECT storage_used_bytes, phone FROM companies WHERE id = $1', [companyId]);
    const filesCount = await pool.query('SELECT COUNT(*) as count FROM encrypted_files WHERE company_id = $1', [companyId]);

    res.json({
      company_phone: storage.rows[0].phone,
      products_count: parseInt(productsCount.rows[0].count),
      stock_purchase_value: parseFloat(stockPurchaseValue.rows[0].total),
      stock_sale_value: parseFloat(stockSaleValue.rows[0].total),
      low_stock_products: lowStock.rows,
      invoices_count: parseInt(invoicesCount.rows[0].count),
      total_revenue: parseFloat(totalRevenue.rows[0].total),
      today_revenue: parseFloat(todayRevenue.rows[0].total),
      today_profit: parseFloat(todayProfit.rows[0].profit),
      total_budget: parseFloat(totalRevenue.rows[0].total) + parseFloat(stockPurchaseValue.rows[0].total),
      recent_invoices: recentInvoices.rows,
      storage_used: parseInt(storage.rows[0].storage_used_bytes),
      storage_max: 15 * 1024 * 1024 * 1024,
      files_count: parseInt(filesCount.rows[0].count),
      revenue_chart,
      top_products_chart,
      analyses
    });
  } catch (err) {
    console.error('Erreur dashboard :', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── GET /api/dashboard/visits ────────────────────────────────────────────────
router.get('/visits', async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const result = await pool.query(
      'SELECT id, ip_address, user_agent, referrer, is_private, visited_at FROM shop_visits WHERE company_id = $1 ORDER BY visited_at DESC LIMIT 100',
      [companyId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Erreur récupération visites :', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;
