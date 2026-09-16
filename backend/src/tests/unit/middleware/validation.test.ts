import { IncomingMessage } from 'http';
import { Socket } from 'net';
import type { Request, Response, NextFunction } from 'express';
import {
  paginationSchema,
  singleSendEmailSchema,
  validateRequest
} from '../../../middleware/validation';

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

describe('validateRequest', () => {
  /**
   * O bug que este bloco cobre so aparece numa request REAL. O teste
   * anterior montava `{ query: {...} }` como objeto literal, onde a
   * atribuicao funciona, entao o CI passava enquanto producao respondia
   * 500 em toda rota com query validada.
   *
   * Aqui a request herda de IncomingMessage e `query` e um getter do
   * prototype, exatamente como no Express 5.
   */
  const buildRequest = (query: Record<string, unknown>): Request => {
    const req = new IncomingMessage(new Socket());
    Object.defineProperty(Object.getPrototypeOf(req), 'query', {
      get() { return query; },
      configurable: true
    });
    return req as unknown as Request;
  };

  it('valida query sem quebrar no getter read-only do Express 5', () => {
    const req = buildRequest({ page: '2', limit: '20', order: 'desc' });
    const next = jest.fn() as unknown as NextFunction;

    validateRequest({ query: paginationSchema })(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    // Zod transforma para number; as rotas fazem `(page - 1) * limit`.
    expect(req.query.page).toBe(2);
    expect(req.query.limit).toBe(20);
  });

  it('encaminha erro de validacao para o next', () => {
    const req = buildRequest({ order: 'sideways' });
    const next = jest.fn() as unknown as NextFunction;

    validateRequest({ query: paginationSchema })(req, {} as Response, next);

    expect((next as jest.Mock).mock.calls[0][0]).toBeDefined();
  });
});
