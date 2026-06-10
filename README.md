# Alioune Badara Diene Gestion

Plateforme SaaS de gestion d'entreprise avec cryptage AES-256 niveau militaire.

## 🚀 Démarrage rapide (local sans Docker)

```bash
cd backend
npm install
node server.js
```

Le serveur démarre sur `http://localhost:3000`

## 🐳 Démarrage avec Docker

```bash
docker-compose up --build
```

## 📋 Fonctionnalités

- **Authentification** : JWT avec refresh token, bcrypt
- **Essai 7 jours** : Période d'essai automatique avec blocage à expiration
- **Produits** : CRUD complet avec gestion de stock et alertes
- **Factures** : Création, génération PDF professionnelle
- **Fichiers cryptés** : Upload/download avec AES-256-GCM, 15 Go par entreprise
- **Dashboard** : Ventes du jour, stock bas, dernières factures
- **Abonnement** : Intégration Stripe pour paiement mensuel

## ⚙️ Configuration

Copiez `.env` et remplissez vos clés :

| Variable | Description |
|---|---|
| `DATABASE_URL` | URL de connexion PostgreSQL |
| `JWT_SECRET` | Clé secrète pour les tokens JWT |
| `MASTER_ENCRYPTION_KEY` | Clé AES-256 (64 caractères hex) |
| `STRIPE_SECRET_KEY` | Clé secrète Stripe |

## 💰 Tarif

10 000 F CFA / mois – Tout inclus, utilisateurs et sites illimités.

## 🔐 Sécurité

- HTTPS/TLS 1.3
- Mots de passe : bcrypt (coût 12)
- Fichiers : AES-256-GCM avec clé unique par fichier
- Rate limiting : 100 req/min (API), 10 req/15min (auth)

## 📁 Structure

```
alioune-gestion/
├── backend/
│   ├── server.js
│   ├── routes/ (auth, products, invoices, files, subscription, dashboard)
│   ├── middleware/ (auth, trialCheck, rateLimiter)
│   ├── services/ (crypto, storage, payment)
│   └── db/ (pool, init.sql)
├── frontend/
│   ├── index.html (dashboard)
│   ├── login.html, register.html
│   ├── products.html, invoices.html, files.html, pricing.html
│   └── assets/js/api.js
├── docker-compose.yml
└── Dockerfile
```

---
© 2026 Alioune Badara Diene. Tous droits réservés.
