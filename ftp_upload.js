const ftp = require("basic-ftp");
const path = require("path");

async function uploadFiles() {
    const client = new ftp.Client();
    client.ftp.verbose = true;
    try {
        console.log("Connecting to FTP...");
        // Essayer avec Sabiatd1998 puis avec Sabiatd1998; si ça échoue
        await client.access({
            host: "ftp.cluster129.hosting.ovh.net",
            user: "sunugev",
            password: "Sabiatd1998",
            secure: false
        });
        console.log("Connected to FTP successfully!");

        // Lister le répertoire principal pour voir si c'est www ou /
        const list = await client.list();
        const hasWww = list.some(f => f.name === "www");
        if(hasWww) {
            await client.cd("www");
            console.log("Entered /www directory.");
        } else {
            console.log("No /www directory found. Staying in root.");
        }

        // Vérifier si le dossier frontend existe sur le serveur
        const wwwList = await client.list();
        const hasFrontend = wwwList.some(f => f.name === "frontend");
        if(hasFrontend) {
            console.log("Found frontend directory on server.");
        }

        console.log("Uploading modified frontend files...");
        // On transfère tout le dossier frontend local vers le dossier frontend distant
        await client.ensureDir("frontend");
        await client.uploadFromDir(path.join(__dirname, "frontend"));
        await client.cd("..");

        console.log("Uploading backend files...");
        await client.ensureDir("backend");
        await client.ensureDir("routes");
        await client.uploadFrom(path.join(__dirname, "backend/routes/billing.js"), "billing.js");
        await client.cd("../..");

        console.log("Upload completed successfully!");
    }
    catch(err) {
        console.error("FTP Error: ", err);
    }
    client.close();
}
uploadFiles();
