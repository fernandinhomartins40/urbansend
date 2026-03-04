import { describe, expect, it } from '@jest/globals';
import { buildHtmlFromText, buildTextFromHtml, normalizeOptionalEmailContent } from '../../../utils/email';

describe('email content utilities', () => {
  it('normalizes blank optional content to undefined', () => {
    expect(normalizeOptionalEmailContent('   ')).toBeUndefined();
    expect(normalizeOptionalEmailContent('\n\t')).toBeUndefined();
  });

  it('builds trackable HTML from plain text while preserving links and line breaks', () => {
    const html = buildHtmlFromText('Linha 1\nhttps://ultrazend.com.br/docs');

    expect(html).toContain('<html');
    expect(html).toContain('Linha 1<br />');
    expect(html).toContain('<a href="https://ultrazend.com.br/docs"');
  });

  it('builds plain text from HTML when only HTML is available', () => {
    const text = buildTextFromHtml('<div>Ola<br />Mundo</div><p><strong>Teste</strong></p>');

    expect(text).toContain('Ola');
    expect(text).toContain('Mundo');
    expect(text).toContain('Teste');
  });
});
