import { singleSendEmailSchema } from '../../../middleware/validation';

describe('singleSendEmailSchema', () => {
  it('accepts an HTML-only transactional email', () => {
    const payload = singleSendEmailSchema.parse({
      to: 'recipient@example.com',
      subject: 'Confirmação de pedido',
      html: '<p>Pedido confirmado</p>',
    });

    expect(payload.html).toBe('<p>Pedido confirmado</p>');
    expect(payload.text).toBeUndefined();
  });

  it('requires at least one content source', () => {
    expect(() => singleSendEmailSchema.parse({
      to: 'recipient@example.com',
      subject: 'Sem conteúdo',
    })).toThrow();
  });
});
