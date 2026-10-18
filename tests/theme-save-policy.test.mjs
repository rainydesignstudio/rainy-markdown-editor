import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_FORMAT_BUNDLE, validateFormatBundle } from '../src/lib/article-format/config.ts';
import { contentFormatBlockingIssues } from '../src/lib/contentValidation.ts';
import { activateFormatBundle } from '../src/lib/article-format/runtime.ts';
import { inspectThemeCss } from '../src/lib/themeValidation.ts';

const resource = { kind: 'element', name: 'image', source: 'themes/preview.md', tier: 'danger', message: 'failed', domain: 'product', resourceSource: '/unavailable.png', resourceDependency: true, line: 49 };
const dependent = { kind: 'engine', name: 'layout', source: 'themes/preview.md', tier: 'unknown', message: 'incomplete', ruleId: 'width', resourceDependency: true };
const violation = { kind: 'element', name: 'layout', source: 'theme CSS', tier: 'error', message: 'actual overflow', ruleId: 'width' };
const engineFailure = { kind: 'engine', name: 'compiler', source: 'theme CSS', tier: 'unknown', message: 'unavailable' };

test('theme sample policy accepts only its declared enum and leaves legacy configuration unchanged', () => {
  const old = structuredClone(DEFAULT_FORMAT_BUNDLE);
  const original = JSON.stringify(old);
  validateFormatBundle(old);
  assert.equal(JSON.stringify(old), original);
  for (const sampleResources of ['block', 'review']) {
    const raw = structuredClone(old);
    raw.validator.product.theme.savePolicy = { sampleResources };
    assert.equal(validateFormatBundle(raw).validator.product.theme.savePolicy.sampleResources, sampleResources);
  }
  for (const savePolicy of [{ sampleResources: 'ignore' }, { sampleResources: false }, {}, { sampleResources: 'review', safety: 'off' }]) {
    const raw = structuredClone(old);
    raw.validator.product.theme.savePolicy = savePolicy;
    assert.throws(() => validateFormatBundle(raw));
  }
});

test('review permits only theme sample resource dependencies while preserving the complete original diagnostics', () => {
  const issues = [resource, dependent, violation, engineFailure];
  const before = structuredClone(issues);
  assert.deepEqual(contentFormatBlockingIssues(issues, { purpose: 'theme', sampleResources: 'review' }), [violation, engineFailure]);
  assert.deepEqual(issues, before);
  assert.equal(issues[0].tier, 'danger');
  assert.equal(issues[1].tier, 'unknown');
});

test('a resource policy never relaxes ordinary content checks, the absent policy, or an explicit block', () => {
  for (const options of [{}, { sampleResources: 'review' }, { purpose: 'theme' }, { purpose: 'theme', sampleResources: 'block' }]) {
    assert.deepEqual(contentFormatBlockingIssues([resource, dependent, violation], options), [resource, dependent, violation]);
  }
  assert.deepEqual(contentFormatBlockingIssues([violation, engineFailure], { purpose: 'theme', sampleResources: 'review' }), [violation, engineFailure]);
});

test('the requested CSS constructs remain valid without widening theme syntax or safety rules', () => {
  const raw = structuredClone(DEFAULT_FORMAT_BUNDLE);
  raw.validator.product.theme.savePolicy = { sampleResources: 'review' };
  activateFormatBundle(raw, 'theme-policy-test');
  assert.deepEqual(inspectThemeCss('.article-preview .article-body { max-width:42rem; margin:0 auto; padding:28px 20px 44px; }\n.article-preview .article-body u {}\n.article-preview .article-body pre { overflow-x:auto ; }\n.article-preview .article-body pre code { white-space:nowrap; }\n.article-preview .article-body th { font-weight:700; font-weight:bold; }'), []);
  assert.ok(inspectThemeCss('.article-preview .article-body { background:url(https://example.invalid/a.png); }').length);
  assert.ok(inspectThemeCss('body { display:none; }').length);
  activateFormatBundle(structuredClone(DEFAULT_FORMAT_BUNDLE), null, 'built-in');
});
