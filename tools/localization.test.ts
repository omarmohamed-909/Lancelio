import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import {
  negotiateLanguage,
  languagePreference,
  resolveLanguage,
} from '../apps/web/src/i18n/locale.ts';
import { translate } from '../apps/web/src/i18n/translate.ts';
import { ar } from '../apps/web/src/i18n/messages/ar.ts';
import { en } from '../apps/web/src/i18n/messages/en.ts';
import {
  formatMoney,
  decimalPrice,
  parsePrice,
} from '../apps/web/src/shared/money.ts';
import { formatOverviewMoney } from '../apps/web/src/features/dashboard/utils/format-overview-money.ts';
import { formatCount } from '../apps/web/src/i18n/counts.ts';
import { answerLanguage } from '../apps/web/src/features/assistant/answer-language.ts';
import {
  assistantHelp,
  assistantSuggestions,
} from '../apps/web/src/features/assistant/help.ts';

test('language negotiation respects quality, regional tags and unsupported preferences', () => {
  assert.equal(negotiateLanguage('fr-FR, en-GB;q=0.8,ar-EG;q=0.5'), 'en');
  assert.equal(negotiateLanguage('en;q=0.3,ar;q=0.9'), 'ar');
  assert.equal(negotiateLanguage('en;q=0,ar;q=1'), 'ar');
  assert.equal(negotiateLanguage('fr,de'), 'ar');
  assert.equal(negotiateLanguage('en;q=broken,ar;q=0.5'), 'ar');
  assert.equal(negotiateLanguage(null), 'ar');
  assert.equal(languagePreference('injected'), 'auto');
  assert.equal(resolveLanguage('ar', 'en-US'), 'ar');
  assert.equal(resolveLanguage('en', 'ar-EG'), 'en');
});

test('catalogs have matching keys, complete English copy and matching placeholders', () => {
  assert.deepEqual(Object.keys(ar).sort(), Object.keys(en).sort());
  for (const key of Object.keys(ar) as (keyof typeof ar)[]) {
    assert.ok(en[key].trim(), key);
    assert.equal(/[\u0600-\u06ff]/u.test(en[key]), false, key);
    assert.deepEqual(en[key].match(/\{\d+\}/gu), key.match(/\{\d+\}/gu), key);
  }
  assert.equal(translate('en', 'العملاء'), 'Clients');
  assert.equal(translate('ar', 'العملاء'), 'العملاء');
  assert.equal(
    translate('en', 'الملف الشخصي: {0}', ['اسم العميل']),
    'Profile: اسم العميل',
  );
  assert.equal(translate('en', ' غير مقروء'), ' unread');
  assert.equal(
    translate('en', 'Unexpected custom message'),
    'Unexpected custom message',
  );
});

test('locale affects formatting without changing exact amounts or currency', () => {
  assert.equal(formatMoney(12345, 'USD', 'en-US'), '$123.45');
  assert.ok(/[١٢٣٤٥]/u.test(formatMoney(12345, 'USD', 'ar-EG')));
  assert.equal(
    formatOverviewMoney('123456789012345678901', 'USD', 'en-US'),
    '$1,234,567,890,123,456,789.01',
  );
  assert.equal(decimalPrice(12345), '123.45');
  assert.equal(parsePrice('123.45'), 12345n);
});

test('counts use the locale plural rules', () => {
  assert.equal(formatCount('en', 'clients', 1), '1 client');
  assert.equal(formatCount('en', 'clients', 0), '0 clients');
  assert.equal(formatCount('en', 'items', 2), '2 items');
  assert.equal(formatCount('ar', 'clients', 2), 'عميلان');
  assert.equal(formatCount('ar', 'tasks', 3), '٣ مهام');
  assert.equal(formatCount('ar', 'clients', 11), '١١ عميلًا');
});

test('assistant reply language follows the question independently of site language and record names', () => {
  for (const [question, fallback, expected] of [
    ['إزاي أعمل فاتورة؟', 'en', 'ar'],
    ['عايز أعمل invoice للعميل', 'en', 'ar'],
    ['chat bot ليه بيرد إنجليزي؟', 'en', 'ar'],
    ['والمتوقفة؟', 'en', 'ar'],
    ['ابحث عن English Studio', 'en', 'ar'],
    ['How do I create an invoice?', 'ar', 'en'],
    ['find محمد', 'ar', 'en'],
    ['What about مشروع أ?', 'ar', 'en'],
    ['and on hold?', 'ar', 'en'],
    ['رد بالإنجليزي عن المشاريع', 'ar', 'en'],
    ['رد بالعربي عن projects', 'en', 'ar'],
    ['١٢٣؟', 'en', 'en'],
    ['123?', 'ar', 'ar'],
  ] as const)
    assert.equal(answerLanguage(question, fallback), expected, question);
});

test('static translation calls are covered by the catalogs', () => {
  const root = resolve(import.meta.dirname, '../apps/web/src');
  const missing: string[] = [];
  for (const file of readdirSync(root, { recursive: true }) as string[]) {
    if (!/\.tsx?$/u.test(file)) continue;
    const source = ts.createSourceFile(
      file,
      readFileSync(resolve(root, file), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        ['t', 'translate'].includes(node.expression.text)
      ) {
        const message = node.arguments[node.expression.text === 't' ? 0 : 1];
        if (
          message &&
          ts.isStringLiteralLike(message) &&
          /[\u0600-\u06ff]/u.test(message.text)
        ) {
          const key = message.text.trim().replace(/\s+/gu, ' ');
          if (!(key in ar)) missing.push(file + ': ' + key);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  assert.deepEqual(missing, []);
});

test('assistant instructions and suggestions have reviewed translations', () => {
  const messages = [
    ...assistantSuggestions.flatMap((suggestion) => [
      suggestion.label,
      suggestion.shortLabel,
    ]),
    ...Object.values(assistantHelp).flatMap((topic) => [
      topic.title,
      topic.action,
      ...topic.steps,
    ]),
  ];
  for (const message of messages) {
    assert.ok(message in ar && message in en, message);
    assert.notEqual(translate('en', message), message, message);
  }
});
