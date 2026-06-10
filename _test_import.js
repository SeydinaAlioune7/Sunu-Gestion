const urls = [
  'https://www.jumia.sn/samsung-galaxy-a15-6-5-pouces-4gb-128gb-dual-sim-bleu-mpg58918090.html',
  'https://fr.aliexpress.com/item/1005006900539085.html',
];

async function test(url) {
  console.log('\n--- TEST:', url.substring(0, 60) + '...');
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9',
      },
      signal: AbortSignal.timeout(12000),
    });
    console.log('HTTP Status:', res.status);
    const html = await res.text();
    console.log('HTML size:', html.length, 'chars');

    const getMeta = (...keys) => {
      for (const key of keys) {
        const p = [
          new RegExp(`<meta[^>]+property=["']${key}["'][^>]+content=["']([^"'<>]+)["']`, 'i'),
          new RegExp(`<meta[^>]+content=["']([^"'<>]+)["'][^>]+property=["']${key}["']`, 'i'),
          new RegExp(`<meta[^>]+name=["']${key}["'][^>]+content=["']([^"'<>]+)["']`, 'i'),
        ];
        for (const rx of p) { const m = html.match(rx); if (m?.[1]) return m[1]; }
      }
      return null;
    };

    console.log('og:title   :', getMeta('og:title'));
    console.log('og:image   :', getMeta('og:image')?.substring(0, 80));
    console.log('og:price   :', getMeta('product:price:amount', 'og:price:amount'));
    console.log('description:', getMeta('og:description')?.substring(0, 80));

    // Check if it's a redirect or blocking page
    if (html.includes('Just a moment') || html.includes('Cloudflare') || html.includes('captcha')) {
      console.log('⚠ BLOQUÉ PAR CLOUDFLARE / CAPTCHA');
    }
  } catch(e) {
    console.log('ERREUR:', e.message);
  }
}

for (const url of urls) await test(url);
