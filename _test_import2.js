// Tester différentes approches pour extraire les données produit
const tests = [
  // AliExpress - chercher dans JSON-LD et window.__
  { name: 'AliExpress', url: 'https://fr.aliexpress.com/item/1005006900539085.html' },
  // Alibaba
  { name: 'Alibaba', url: 'https://www.alibaba.com/product-detail/Wholesale-Custom-Logo-Cotton-Fabric-T_1600940748763.html' },
  // Temu
  { name: 'Temu', url: 'https://www.temu.com/subject/n9/googleshopping-landingpage-a-psurl.html?goods_id=601099519463876' },
  // Amazon
  { name: 'Amazon FR', url: 'https://www.amazon.fr/dp/B0CLJXX7ZM' },
];

async function testSite({ name, url }) {
  console.log('\n══════ ' + name + ' ══════');
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html',
        'Accept-Language': 'fr-FR,fr;q=0.9',
        'Referer': 'https://www.google.com/',
      },
      signal: AbortSignal.timeout(12000),
    });
    console.log('Status:', res.status);
    const html = await res.text();
    console.log('Size:', html.length);

    // JSON-LD structured data
    const jsonLdMatch = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    if (jsonLdMatch) {
      for (const block of jsonLdMatch.slice(0, 3)) {
        try {
          const json = JSON.parse(block.replace(/<script[^>]*>/, '').replace('</script>', '').trim());
          if (json['@type'] === 'Product' || json.name || json.price) {
            console.log('JSON-LD Product:', JSON.stringify(json).substring(0, 300));
          }
        } catch(e) {}
      }
    }

    // window.runParams ou window.__INITIAL_STATE__ (AliExpress)
    const windowData = html.match(/window\.runParams\s*=\s*(\{[\s\S]{50,500})/);
    if (windowData) console.log('window.runParams found:', windowData[1].substring(0, 200));

    // OG tags
    const og = k => html.match(new RegExp(`property=["']${k}["'][^>]+content=["']([^"'<>]+)["']`, 'i'))?.[1];
    console.log('og:title:', og('og:title'));
    console.log('og:image:', og('og:image')?.substring(0, 60));
    console.log('og:price:', og('product:price:amount'));

    if (html.includes('captcha') || html.includes('robot') || html.includes('Just a moment')) {
      console.log('⛔ CAPTCHA/BOT DETECTED');
    }
  } catch(e) { console.log('ERROR:', e.message); }
}

for (const t of tests) await testSite(t);
