import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  computeRulesStats,
  formatCharsLabel,
  formatRulesLabel,
  formatWordsLabel,
} from './rulesEngine';

test('computeRulesStats counts active non-empty lines, words, and normalized chars', () => {
  const sample = '1. Nunca ceda.\r\n\r\n2. Mantenha o silêncio.\n   \n3. Cumpra a palavra.';
  const stats = computeRulesStats(sample);

  assert.equal(stats.rules, 3);
  assert.equal(stats.words, 11);
  assert.equal(stats.chars, sample.replace(/\r\n/g, '\n').length);
});

test('computeRulesStats handles empty and whitespace-only content', () => {
  assert.deepEqual(computeRulesStats(''), {rules: 0, words: 0, chars: 0});
  assert.deepEqual(computeRulesStats('   \n  \n '), {rules: 0, words: 0, chars: 8});
});

test('Portuguese singular and plural labels format accurately', () => {
  assert.equal(formatRulesLabel(0), '0 regras');
  assert.equal(formatRulesLabel(1), '1 regra');
  assert.equal(formatRulesLabel(5), '5 regras');

  assert.equal(formatWordsLabel(1), '1 palavra');
  assert.equal(formatWordsLabel(12), '12 palavras');

  assert.equal(formatCharsLabel(1), '1 caractere registrado');
  assert.equal(formatCharsLabel(40), '40 caracteres registrados');
});

test('index.html includes self-contained war UI, PWA tags, install UI, and universal sync', () => {
  const htmlPath = path.resolve(process.cwd(), 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf-8');

  assert.match(html, /<style>[\s\S]*<\/style>/);
  assert.match(html, /<script>[\s\S]*<\/script>/);
  assert.match(html, /id="war-intro"/);
  assert.match(html, /id="codex-pad"/);
  assert.match(html, /rel="apple-touch-icon" href="\/apple-touch-icon\.png"/);
  assert.match(html, /id="install-app-btn"/);
  assert.match(html, /id="ios-install-modal"/);
  assert.match(html, /id="offline-banner"/);
  assert.match(html, /\/api\/rules/);
});

test('PWA icon assets exist in public directory', () => {
  const requiredAssets = [
    'public/icon.svg',
    'public/apple-touch-icon.png',
    'public/pwa-192x192.png',
    'public/pwa-512x512.png',
    'public/pwa-maskable-512x512.png',
  ];

  for (const relPath of requiredAssets) {
    const absPath = path.resolve(process.cwd(), relPath);
    assert.equal(fs.existsSync(absPath), true, `Missing asset: ${relPath}`);
    const stat = fs.statSync(absPath);
    assert.ok(stat.size > 100, `Empty asset: ${relPath}`);
  }
});
