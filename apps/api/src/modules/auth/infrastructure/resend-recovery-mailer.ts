import type { RecoveryMailer } from '../application/ports/password-recovery.js';
// Provider contract: https://resend.com/docs/api-reference/emails/send-email
export class ResendRecoveryMailer implements RecoveryMailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly webOrigin: string,
    private readonly sendRequest: typeof fetch = fetch,
  ) {}
  async send(email: string, token: string, deliveryId: string) {
    const link = this.webOrigin + '/reset-password#token=' + token;
    const response = await this.sendRequest('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: 'Bearer ' + this.apiKey,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'password-recovery/' + deliveryId,
      },
      body: JSON.stringify({
        from: this.from,
        to: [email],
        subject: 'استرجاع كلمة المرور — Lancelio',
        text:
          'لتعيين كلمة مرور جديدة، افتح الرابط التالي خلال ٣٠ دقيقة:\n' +
          link +
          '\nالرابط يُستخدم مرة واحدة. لو لم تطلب الاسترجاع، تجاهل هذه الرسالة.',
      }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('Recovery delivery failed');
    }
    await response.body?.cancel();
  }
}
