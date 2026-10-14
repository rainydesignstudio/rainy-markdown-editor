import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createUII18n } from '../src/lib/i18n/runtime.ts';
import { ProductError, productCause, productMessage, productLabel, productText, productErrorLabel, productErrorMessage, productReference, productJoin, formatProductMessage } from '../src/lib/i18n/productMessages.ts';
import { cliLocale, createCliTranslation } from '../scripts/cli-locale.mjs';
import { parseStaticServerOptions } from '../scripts/static-server-options.mjs';
import { articleFormatMessage, articleFormatMessageReference } from '../src/lib/articleFormat.ts';
import { formatDiagnosticMessage } from '../src/lib/i18n/productMessages.ts';
import { groupSourceLineIssues, sourceLineMessages } from '../src/lib/sourceLineDiagnostics.ts';

test('product messages retain their canonical value and translate an existing record without regeneration', () => {
  const original = productMessage('runtime.formatChanged');
  const bytes = JSON.stringify(original);
  assert.equal(original.message, '资料库格式配置已变化，旧任务已取消。');
  const en = createUII18n('en-US').getFixedT('en-US', 'messages');
  const zh = createUII18n('zh-CN').getFixedT('zh-CN', 'messages');
  assert.equal(formatProductMessage(original, en), 'Library format configuration changed. The previous task was cancelled.');
  assert.equal(formatProductMessage(original, zh), original.message);
  assert.equal(JSON.stringify(original), bytes);
  assert.equal(productText('runtime.formatChanged'), original.message);
  const notice = productLabel('runtime.darkTimeout');
  assert.equal(notice.label, '深色转换超时。');
  assert.equal(formatProductMessage(notice, en), 'Dark-mode conversion timed out.');
});

test('structured product causes translate while arbitrary user parameters remain unchanged', () => {
  const en = createUII18n('en-US').getFixedT('en-US', 'messages');
  const cause = new ProductError('runtime.darkCancelled');
  const record = productMessage('cli.invalidOptions', { error: productCause(cause) });
  assert.equal(formatProductMessage(record, en), 'Invalid startup options: Dark-mode conversion was cancelled.');
  const userText = '资料库格式配置已变化，旧任务已取消。';
  const parameter = productMessage('cli.unsupportedArgument', { argument: userText });
  assert.ok(formatProductMessage(parameter, en).includes(userText));
  assert.equal(productCause(new Error(userText)), userText);
});

test('old product records translate through full-message matching and unknown text remains original', () => {
  const en = createUII18n('en-US').getFixedT('en-US', 'messages');
  assert.equal(formatProductMessage({ message: '深色转换已取消。' }, en), 'Dark-mode conversion was cancelled.');
  assert.equal(formatProductMessage('不支持的参数：--custom。使用 --help 查看启动方法。', en), 'Unsupported argument: --custom. Use --help for startup instructions.');
  assert.equal(formatProductMessage('我的文章标题与任意规则内容', en), '我的文章标题与任意规则内容');
  assert.equal(formatProductMessage('前缀：深色转换已取消。', en), '前缀：深色转换已取消。');
});

test('CLI locale selection uses locale precedence and unsupported languages fall back to Chinese', () => {
  assert.equal(cliLocale({ LC_ALL: 'zh_CN.UTF-8', LANG: 'en_US.UTF-8' }), 'zh-CN');
  assert.equal(cliLocale({ LC_MESSAGES: 'en_GB.UTF-8', LANG: 'zh_CN.UTF-8' }), 'en-US');
  assert.equal(cliLocale({ LANG: 'en' }), 'en-US');
  assert.equal(cliLocale({ LANG: 'fr_FR.UTF-8' }), 'zh-CN');
  assert.equal(cliLocale({}), 'zh-CN');
});

test('CLI errors retain stable IDs and parameters with unchanged option and exit behavior', () => {
  assert.deepEqual(parseStaticServerOptions(['--port', '3501']), { port: 3501, help: false });
  let captured;
  try { parseStaticServerOptions(['--unknown']); } catch (error) { captured = error; }
  assert.equal(captured.messageKey, 'cli.unsupportedArgument');
  assert.deepEqual(captured.messageParams, { argument: '--unknown' });
  assert.match(createCliTranslation('en-US')(captured.messageKey, captured.messageParams), /Unsupported argument: --unknown/);
  for (const [language, help, error] of [['zh_CN.UTF-8', '用法：', '启动参数错误：'], ['en_US.UTF-8', 'Usage:', 'Invalid startup options:']]) {
    const env = { ...process.env, LC_ALL: language, LANG: language };
    const helpResult = spawnSync(process.execPath, ['scripts/start-static.mjs', '--help'], { cwd: new URL('..', import.meta.url), env, encoding: 'utf8' });
    assert.equal(helpResult.status, 0); assert.ok(helpResult.stdout.startsWith(help));
    const invalid = spawnSync(process.execPath, ['scripts/start-static.mjs', '--port', '0'], { cwd: new URL('..', import.meta.url), env, encoding: 'utf8' });
    assert.equal(invalid.status, 1); assert.ok(invalid.stderr.startsWith(error));
    assert.equal(invalid.stdout, '');
  }
});

test('summary references retain canonical text and update headings and locations with the UI locale', () => {
  const issues = [
    { kind: 'element', name: 'th', source: '正文', tier: 'error', line: 27, message: '问题', domain: 'product' },
    { kind: 'style', name: '作者的规则名', source: '正文', tier: 'warning', line: 35, message: '自定义内容', domain: 'standard' },
  ];
  const info = articleFormatMessageReference(issues);
  const en = createUII18n('en-US').getFixedT('en-US', 'messages'), zh = createUII18n('zh-CN').getFixedT('zh-CN', 'messages');
  assert.equal(formatProductMessage(info, zh), articleFormatMessage(issues));
  assert.equal(formatProductMessage(info, en), 'Needs attention: Line 27: th; Review recommended: Line 35: 作者的规则名.');
  assert.equal(formatProductMessage(articleFormatMessageReference(issues, 1), zh), articleFormatMessage(issues, 1));
  assert.equal(formatProductMessage(articleFormatMessageReference([]), en), '');
});

test('custom standards text identical to a product notice is preserved in reports and source tooltips', () => {
  const en = createUII18n('en-US').getFixedT('en-US', 'messages');
  const rule = { kind: 'style', name: '作者规则', source: '正文', tier: 'warning', line: 1, domain: 'standard', message: '深色转换已取消。' };
  assert.equal(formatDiagnosticMessage(rule, en), rule.message);
  const concern = groupSourceLineIssues([rule], 1).get(1);
  assert.deepEqual(sourceLineMessages(concern, en), ['作者规则：深色转换已取消。']);
  assert.equal(concern.messages[0], '作者规则：深色转换已取消。');
});

test('error labels and reports retain nested message identity and raw user parameters', () => {
  const en = createUII18n('en-US').getFixedT('en-US', 'messages');
  const error = new ProductError('shared.compose', { parts: productJoin([productReference('styles.libraryStylesAreUnavailable'), productCause(new ProductError('runtime.darkTimeout'))]) });
  const label = productErrorLabel(error), report = productErrorMessage(error);
  assert.equal(label.label, error.message);
  assert.equal(report.message, error.message);
  assert.equal(formatProductMessage(label, en), formatProductMessage(error, en));
  assert.equal(formatProductMessage(report, en), formatProductMessage(error, en));
  assert.ok(!/[\p{Script=Han}]/u.test(formatProductMessage(report, en)));
  assert.equal(productErrorLabel(new Error('用户原因')).label, '用户原因');
});
