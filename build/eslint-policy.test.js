// @vitest-environment node
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

describe('production JSX security and correctness lint coverage', () => {
  it('rejects conditional hooks, unknown variables and direct logging in production JSX', async () => {
    const eslint = new ESLint();
    const [result] = await eslint.lintText("import { useState } from 'react'; export default function Example({ ready }) { if (!ready) return null; useState(0); console.log(secret); return <img />; }", { filePath: 'src/components/Example.jsx' });
    const rules = result.messages.map(message => message.ruleId);
    expect(rules).toContain('react-hooks/rules-of-hooks');
    expect(rules).toContain('no-undef');
    expect(rules).toContain('no-console');
    expect(rules).toContain('jsx-a11y/alt-text');
  });
  it('reserves test globals for tests and explicit logging for the safe logger', async () => {
    const eslint = new ESLint();
    const [source] = await eslint.lintText('vi.fn();', { filePath: 'src/components/Example.jsx' });
    const [test] = await eslint.lintText('vi.fn();', { filePath: 'src/components/Example.test.jsx' });
    const [logger] = await eslint.lintText('console.log("sanitized");', { filePath: 'src/infrastructure/observability/safeLogger.js' });
    expect(source.messages.map(m => m.ruleId)).toContain('no-undef');
    expect(test.errorCount).toBe(0);
    expect(logger.messages.map(m => m.ruleId)).not.toContain('no-console');
  });
});
