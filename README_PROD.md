# Guide de Déploiement Production — ABD Gestion

Ce document explique comment mettre l'application en ligne sur un serveur (VPS).

## 1. Prérequis (Sur le serveur)
- Node.js (v18+)
- NPM
- PM2 (`npm install -g pm2`)
- Nginx (pour le HTTPS et le nom de domaine)

## 2. Installation
1. Copiez tous les fichiers du projet sur le serveur.
2. Allez dans le dossier `backend` et lancez `npm install`.
3. Configurez le fichier `.env` avec vos secrets (JWT, SMTP, etc.).

## 3. Lancement avec PM2
Depuis la racine du projet :
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## 4. Configuration Nginx (Exemple)
Créez un fichier de config Nginx pour rediriger le trafic vers le port 3000 :
```nginx
server {
    listen 80;
    server_name abd-gestion.sn;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 5. Maintenance
- Voir les logs : `pm2 logs`
- Redémarrer : `pm2 restart abd-gestion-backend`

---
© 2026 Alioune Badara Ibn Abu Talib Diene — Propriété Exclusive.
