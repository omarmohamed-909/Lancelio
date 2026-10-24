import { WelcomeDeliveryError } from '../application/ports/welcome-email.js';
import type {
  WelcomeMailer,
  WelcomeMessage,
} from '../application/ports/welcome-email.js';
import { welcomeTemplate } from './welcome-template.js';

export class ResendWelcomeMailer implements WelcomeMailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly origin: string,
    private readonly sendRequest: typeof fetch = fetch,
  ) {}
  async send(message: WelcomeMessage, deliveryId: string) {
    const content = welcomeTemplate(message, this.origin);
    const response = await this.sendRequest('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': deliveryId,
      },
      body: JSON.stringify({
        from: `Lancelio <${this.from}>`,
        to: [message.email],
        reply_to: 'omar.m.ombark@gmail.com',
        ...content,
      }),
    });
    await response.body?.cancel();
    if (!response.ok)
      throw new WelcomeDeliveryError(
        response.status >= 500 || [408, 409, 429].includes(response.status),
      );
  }
}
