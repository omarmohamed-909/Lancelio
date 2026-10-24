import type { WelcomeMessage } from '../application/ports/welcome-email.js';
const escape = (value: string) =>
  value.replace(
    /[&<>"']/gu,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ]!,
  );

export function welcomeTemplate(message: WelcomeMessage, origin: string) {
  const ar = message.language === 'ar';
  const text = ar
    ? {
        subject: 'أهلًا بيك في Lancelio — مساحتك جاهزة',
        eyebrow: 'بداية أوضح لشغلك',
        greeting: `أهلًا يا ${message.name} 👋`,
        title: 'مساحتك جاهزة. خلّي أول خطوة بسيطة.',
        body: `أهلًا بيك في Lancelio. مساحة «${message.workspaceName}» بقت جاهزة لشغلك، من أول اتفاق لحد آخر فاتورة.`,
        steps: [
          'ضيف أول عميل واحتفظ بتفاصيله في مكان واحد.',
          'جهّز عرض سعر واضح وابدأ مشروعك.',
          'تابع الفواتير ومستحقاتك بسهولة.',
        ],
        cta: 'افتح مساحة العمل',
        note: 'وصلك الإيميل ده بعد إنشاء حساب Lancelio بالبريد ده. لو مش إنت اللي عملت الحساب، تواصل مع الدعم.',
        privacy: 'الخصوصية',
        terms: 'شروط الاستخدام',
        support: 'محتاج مساعدة؟ تواصل معانا',
        footer: 'شغلك، بإيقاع أهدى.',
      }
    : {
        subject: 'Welcome to Lancelio — your workspace is ready',
        eyebrow: 'A clearer start for your work',
        greeting: `Hi, ${message.name} 👋`,
        title: 'Your workspace is ready. Start with one simple step.',
        body: `Welcome to Lancelio. Your workspace, “${message.workspaceName}”, is ready to bring your work together, from the first agreement to the final invoice.`,
        steps: [
          'Add your first client and keep their details together.',
          'Create a clear proposal and start your project.',
          'Keep track of invoices and outstanding payments.',
        ],
        cta: 'Open your workspace',
        note: 'You received this email because a Lancelio account was created with your email address. If you did not create the account, please contact support.',
        privacy: 'Privacy',
        terms: 'Terms of use',
        support: 'Need a hand? Contact us',
        footer: 'Your work, at a calmer pace.',
      };
  const link = `${origin}/dashboard`;
  return {
    subject: text.subject,
    text: [
      text.greeting,
      '',
      text.title,
      text.body,
      '',
      ...text.steps.map((step, index) => `${index + 1}. ${step}`),
      '',
      `${text.cta}: ${link}`,
      '',
      text.note,
      `${text.support}: omar.m.ombark@gmail.com`,
      `${text.privacy}: ${origin}/privacy`,
      `${text.terms}: ${origin}/terms`,
    ].join('\n'),
    html: `<!doctype html><html lang="${ar ? 'ar' : 'en'}" dir="${ar ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(text.subject)}</title></head><body style="margin:0;background:#f4f6f0;color:#203e34;font-family:Arial,Tahoma,sans-serif"><div style="display:none;max-height:0;overflow:hidden">${escape(text.title)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 12px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#fff;border:1px solid #dfe7dc;border-radius:24px;overflow:hidden"><tr><td style="background:#153d30;padding:30px 32px;color:#fff"><span dir="ltr" style="display:inline-block;font-size:30px;font-weight:bold;letter-spacing:-1px">lancelio<span style="color:#ff9638">.</span></span><p style="margin:12px 0 0;color:#c6dfbd;font-size:14px">${escape(text.eyebrow)}</p></td></tr><tr><td style="padding:32px"><p style="margin:0 0 18px;font-size:17px">${escape(text.greeting)}</p><h1 style="font-size:29px;line-height:1.45;letter-spacing:-.6px;margin:0 0 18px">${escape(text.title)}</h1><p style="font-size:16px;line-height:1.9;color:#5b6e63;margin:0 0 26px">${escape(text.body)}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6ee;border-radius:16px">${text.steps.map((step, index) => `<tr><td width="42" valign="top" style="padding:16px 14px;color:#39704c;font-weight:bold">0${index + 1}</td><td style="padding:16px 14px;font-size:15px;line-height:1.7">${escape(step)}</td></tr>`).join('')}</table><p style="margin:28px 0"><a href="${escape(link)}" style="display:inline-block;background:#245b42;color:#fff;text-decoration:none;padding:17px 26px;border-radius:12px;font-weight:bold;font-size:16px">${escape(text.cta)} ↗</a></p><p style="font-size:14px;line-height:1.8;margin:0;color:#65766b">${escape(text.footer)}</p></td></tr><tr><td style="padding:24px 32px;border-top:1px solid #e5eadf;font-size:12px;line-height:1.9;color:#718075"><p style="margin:0 0 12px">${escape(text.note)}</p><a href="mailto:omar.m.ombark@gmail.com" style="color:#245b42">${escape(text.support)}</a><p style="margin:12px 0 0"><a href="${escape(origin)}/privacy" style="color:#245b42">${escape(text.privacy)}</a> · <a href="${escape(origin)}/terms" style="color:#245b42">${escape(text.terms)}</a></p></td></tr></table></td></tr></table></body></html>`,
  };
}
