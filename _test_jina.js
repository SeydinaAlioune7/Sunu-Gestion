// Test jina.ai reader (contourne Cloudflare)
const urls = [
  'https://www.jumia.sn/samsung-galaxy-a15-6-5-pouces-4gb-128gb-dual-sim-bleu-mpg58918090.html',
  'https://fr.aliexpress.com/item/1005006900539085.html',
];

for (const url of urls) {
  console.log('\n--- TEST:', url.substring(0, 70));
  try {
    const jinaUrl = 'https://r.jina.ai/' + url;
    const res = await fetch(jinaUrl, {
      headers: { 'Accept': 'application/json', 'X-Return-Format': 'markdown' },
      signal: AbortSignal.timeout(15000),
    });
    console.log('Jina status:', res.status);
    const text = await res.text();
    console.log('Size:', text.length);
    console.log('Preview:', text.substring(0, 400));
  } catch(e) { console.log('ERROR:', e.message); }
}
