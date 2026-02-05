import fs from 'fs';
import path from 'path';

const MODELS = [
  { id: 'gpt-5.2', url: 'https://platform.openai.com/docs/models/gpt-5.2' },
  { id: 'gpt-5.2-pro', url: 'https://platform.openai.com/docs/models/gpt-5.2-pro' },
  { id: 'gpt-5.2-codex', url: 'https://platform.openai.com/docs/models/gpt-5.2' },
  { id: 'gpt-5-mini', url: 'https://platform.openai.com/docs/models' },
  { id: 'gpt-5-codex-mini', url: 'https://developers.openai.com/codex/changelog' },
];

function extractNumber(text) {
  if (!text) return null;
  const m = text.match(/\$?([0-9]+(?:\.[0-9]+)?)/);
  return m ? Number(m[1]) : null;
}

function parsePricing(html) {
  // Try common patterns: "Input $X" and "Output $Y" within a pricing block
  const inputMatch = html.match(/Input\s*\$\s*([0-9]+(?:\.[0-9]+)?)/i);
  const outputMatch = html.match(/Output\s*\$\s*([0-9]+(?:\.[0-9]+)?)/i);
  const input = inputMatch ? Number(inputMatch[1]) : null;
  const output = outputMatch ? Number(outputMatch[1]) : null;

  // Context window / max output tokens
  const contextMatch = html.match(/([0-9][0-9,]+)\s*context window/i);
  const maxOutputMatch = html.match(/([0-9][0-9,]+)\s*max output/i);
  const contextWindow = contextMatch ? Number(contextMatch[1].replace(/,/g, '')) : null;
  const maxOutput = maxOutputMatch ? Number(maxOutputMatch[1].replace(/,/g, '')) : null;

  return { input, output, contextWindow, maxOutput };
}

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'spacecode-pricing-bot/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

async function main() {
  const results = [];
  for (const m of MODELS) {
    try {
      // Low-rate, single request per model
      const html = await fetchHtml(m.url);
      const parsed = parsePricing(html);
      results.push({ id: m.id, url: m.url, ...parsed });
    } catch (err) {
      results.push({ id: m.id, url: m.url, error: String(err) });
    }
    // Random delay 300-800ms
    await new Promise(r => setTimeout(r, 300 + Math.floor(Math.random() * 500)));
  }

  const outDir = path.join(process.cwd(), 'scripts', 'pricing');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'gpt-pricing-scan.json');
  fs.writeFileSync(outPath, JSON.stringify({ scannedAt: new Date().toISOString(), results }, null, 2));

  // Also output a human-readable report
  const reportLines = results.map(r => {
    if (r.error) return `${r.id}: ERROR ${r.error}`;
    return `${r.id}: input=$${r.input ?? 'n/a'} output=$${r.output ?? 'n/a'} ctx=${r.contextWindow ?? 'n/a'} maxOut=${r.maxOutput ?? 'n/a'}`;
  });
  const reportPath = path.join(outDir, 'gpt-pricing-scan.txt');
  fs.writeFileSync(reportPath, reportLines.join('\n'));

  console.log(`Wrote ${outPath}`);
  console.log(`Wrote ${reportPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
