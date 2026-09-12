import { toDeliveryEmailData } from '../../../services/smtpDelivery';

describe('toDeliveryEmailData', () => {
  it('maps the persisted emails columns used by the delivery worker', () => {
    expect(toDeliveryEmailData({
      from_email: 'sender@example.com',
      to_email: 'recipient@example.com',
      subject: 'Pedido confirmado',
      html_content: '<p>Confirmado</p>',
      text_content: 'Confirmado',
      user_id: 42,
    })).toEqual({
      from: 'sender@example.com',
      to: 'recipient@example.com',
      subject: 'Pedido confirmado',
      html: '<p>Confirmado</p>',
      text: 'Confirmado',
      accountUserId: 42,
    });
  });
});
