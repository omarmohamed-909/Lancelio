import type { ClientInvitationMailer } from '../application/ports/client-access-store.js';
import type { ClientAccess } from '../domain/client-access.js';
const escape = (value: string) =>
  value.replace(
    /[&<>"']/gu,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!,
  );
export function clientInvitationTemplate(
  access: ClientAccess,
  token: string,
  locale: 'ar' | 'en',
  origin: string,
) {
  const ar = locale === 'ar',
    direction = ar ? 'rtl' : 'ltr',
    align = ar ? 'right' : 'left';
  const title = ar ? 'دعوة لمتابعة شغلك' : 'An invitation to follow your work';
  const body = ar
    ? `مساحة «${access.workspaceName}» بتدعوك لمتابعة مشاريعك وفواتيرك كعميل على Lancelio.`
    : `${access.workspaceName} invited you to follow your projects and invoices as a client on Lancelio.`;
  const detail = ar
    ? 'افتح الدعوة وسجّل بنفس البريد اللي وصلته الرسالة. هتقدر تراجع الدعوة وتقبلها أو ترفضها. مساحتك الحالية وصلاحياتك فيها هتفضل زي ما هي.'
    : 'Open the invitation and sign in with the email that received this message. Review it, then accept or decline. Your own workspace and its permissions stay separate.';
  const button = ar ? 'مراجعة الدعوة' : 'Review invitation';
  const expiry = ar
    ? 'الدعوة صالحة لمدة ٧ أيام. لو مش متوقعها، تجاهل الرسالة.'
    : 'The invitation expires in 7 days. If unexpected, ignore this message.';
  const url = new URL('/connections', origin).href + '#' + token;
  const styles = `direction:${direction};text-align:${align};font-family:Tahoma,Arial,sans-serif;color:#173f32;line-height:1.9;`;
  return {
    subject: title + ' — Lancelio',
    text: `${title}\n\n${body}\n\n${detail}\n\n${button}: ${url}\n\n${expiry}`,
    html: `<div dir="${direction}" style="${styles}background:#f3f5ee;padding:24px"><table role="presentation" dir="${direction}" width="100%" style="${styles}max-width:600px;margin:auto;background:white;border-radius:20px"><tr><td dir="${direction}" style="${styles}padding:32px"><p dir="ltr" style="font-family:Arial,sans-serif;font-size:28px;color:#173f32;text-align:${align}">lancelio<span style="color:#fa8d2c">.</span></p><h1 style="${styles}font-size:26px">${title}</h1><p style="${styles}">${escape(body)}</p><p style="${styles}">${detail}</p><p style="${styles}margin:30px 0"><a href="${escape(url)}" style="display:inline-block;padding:12px 24px;border-radius:12px;background:#173f32;color:#fff;text-decoration:none">${button}</a></p><p style="${styles}font-size:13px">${expiry}</p></td></tr></table></div>`,
  };
}
export class ResendClientInvitation implements ClientInvitationMailer {
  constructor(
    private readonly key: string,
    private readonly from: string,
    private readonly origin: string,
    private readonly sendRequest: typeof fetch = fetch,
  ) {}
  async send(access: ClientAccess, token: string, locale: 'ar' | 'en') {
    const response = await this.sendRequest('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: `Bearer ${this.key}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `client-invitation/${access.id}/${access.version}`,
      },
      body: JSON.stringify({
        from: `Lancelio <${this.from}>`,
        to: [access.email],
        reply_to: 'omar.m.ombark@gmail.com',
        ...clientInvitationTemplate(access, token, locale, this.origin),
      }),
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error('Invitation delivery not confirmed');
  }
}
