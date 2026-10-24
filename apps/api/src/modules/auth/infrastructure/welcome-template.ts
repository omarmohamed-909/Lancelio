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
  const existing = message.kind === 'existing';
  const text = ar
    ? {
        subject: existing
          ? 'شغلك في Lancelio، كله في مكان واحد'
          : 'أهلًا بيك في Lancelio — مساحتك جاهزة',
        eyebrow: 'بداية أوضح لشغلك',
        greeting: `أهلًا يا ${message.name} 👋`,
        title: existing
          ? 'مساحتك موجودة. كمّل خطوتك الجاية.'
          : 'مساحتك جاهزة. خلّي أول خطوة بسيطة.',
        body: existing
          ? `مساحة «${message.workspaceName}» في Lancelio جاهزة تكمّل منها شغلك، من أول اتفاق لحد آخر فاتورة.`
          : `أهلًا بيك في Lancelio. مساحة «${message.workspaceName}» بقت جاهزة لشغلك، من أول اتفاق لحد آخر فاتورة.`,
        steps: existing
          ? [
              'اجمع بيانات عملائك ومشاريعك في مكان واحد.',
              'جهّز عروض الأسعار وتابع شغلك بوضوح.',
              'تابع الفواتير ومستحقاتك بسهولة.',
            ]
          : [
              'ضيف أول عميل واحتفظ بتفاصيله في مكان واحد.',
              'جهّز عرض سعر واضح وابدأ مشروعك.',
              'تابع الفواتير ومستحقاتك بسهولة.',
            ],
        cta: 'افتح مساحة العمل',
        note: existing
          ? 'وصلك الإيميل ده لأن عندك حساب في Lancelio. لو مش إنت اللي عملت الحساب، تواصل مع الدعم.'
          : 'وصلك الإيميل ده بعد إنشاء حساب Lancelio بالبريد ده. لو مش إنت اللي عملت الحساب، تواصل مع الدعم.',
        privacy: 'الخصوصية',
        terms: 'شروط الاستخدام',
        support: 'محتاج مساعدة؟ تواصل معانا',
        footer: 'شغلك، بإيقاع أهدى.',
      }
    : {
        subject: existing
          ? 'Your work, together in Lancelio'
          : 'Welcome to Lancelio — your workspace is ready',
        eyebrow: 'A clearer start for your work',
        greeting: `Hi, ${message.name} 👋`,
        title: existing
          ? 'Your workspace is here. Take your next step.'
          : 'Your workspace is ready. Start with one simple step.',
        body: existing
          ? `Your Lancelio workspace, “${message.workspaceName}”, is ready whenever you are, from the first agreement to the final invoice.`
          : `Welcome to Lancelio. Your workspace, “${message.workspaceName}”, is ready to bring your work together, from the first agreement to the final invoice.`,
        steps: existing
          ? [
              'Keep your clients and projects together.',
              'Prepare proposals and follow your work clearly.',
              'Keep track of invoices and outstanding payments.',
            ]
          : [
              'Add your first client and keep their details together.',
              'Create a clear proposal and start your project.',
              'Keep track of invoices and outstanding payments.',
            ],
        cta: 'Open your workspace',
        note: existing
          ? 'You received this email because you have a Lancelio account. If you did not create the account, please contact support.'
          : 'You received this email because a Lancelio account was created with your email address. If you did not create the account, please contact support.',
        privacy: 'Privacy',
        terms: 'Terms of use',
        support: 'Need a hand? Contact us',
        footer: 'Your work, at a calmer pace.',
      };
  const link = `${origin}/dashboard`;
  const direction = ar ? 'rtl' : 'ltr';
  const alignment = ar ? 'right' : 'left';
  // Email clients may remove html/body. Keep direction and typography on the content itself.
  const flow = `direction:${direction};text-align:${alignment};font-family:Tahoma,Arial,sans-serif;`;
  const workspaceTag = `<span dir="auto" style="unicode-bidi:isolate">${escape(message.workspaceName)}</span>`;
  const quotedWorkspace = ar
    ? `«${message.workspaceName}»`
    : `“${message.workspaceName}”`;
  const bodyHtml = escape(text.body).replace(
    escape(quotedWorkspace),
    ar ? `«${workspaceTag}»` : `“${workspaceTag}”`,
  );
  const greetingHtml = `${ar ? 'أهلًا يا' : 'Hi,'} <span dir="auto" style="unicode-bidi:isolate">${escape(message.name)}</span> <span dir="ltr" style="unicode-bidi:isolate">👋</span>`;
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
    html: `<!doctype html>
<html lang="${ar ? 'ar' : 'en'}" dir="${direction}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(text.subject)}</title></head>
<body style="margin:0;background:#f4f6f0">
<div lang="${ar ? 'ar' : 'en'}" dir="${direction}" style="${flow}background:#f4f6f0;color:#203e34">
<div style="display:none;max-height:0;overflow:hidden">${escape(text.title)}</div>
<table role="presentation" dir="${direction}" width="100%" cellpadding="0" cellspacing="0" style="${flow}width:100%">
<tr><td align="center" style="padding:32px 12px">
<table role="presentation" dir="${direction}" width="600" cellpadding="0" cellspacing="0" style="${flow}width:100%;max-width:600px;background:#fff;border:1px solid #dfe7dc;border-radius:24px;overflow:hidden">
<tr><td dir="${direction}" align="${alignment}" style="${flow}background:#153d30;padding:30px 32px;color:#fff">
<span dir="ltr" style="display:inline-block;direction:ltr;unicode-bidi:isolate;font-family:Arial,sans-serif;font-size:30px;font-weight:bold;letter-spacing:-1px">lancelio<span style="color:#ff9638">.</span></span>
<p dir="${direction}" style="${flow}margin:12px 0 0;color:#c6dfbd;font-size:14px">${escape(text.eyebrow)}</p>
</td></tr>
<tr><td dir="${direction}" align="${alignment}" style="${flow}padding:32px">
<p dir="${direction}" style="${flow}margin:0 0 18px;font-size:17px;line-height:1.8">${greetingHtml}</p>
<h1 dir="${direction}" style="${flow}font-size:29px;line-height:1.5;letter-spacing:${ar ? '0' : '-.6px'};margin:0 0 18px">${escape(text.title)}</h1>
<p dir="${direction}" style="${flow}font-size:16px;line-height:1.9;color:#5b6e63;margin:0 0 26px">${bodyHtml}</p>
<table role="presentation" dir="${direction}" width="100%" cellpadding="0" cellspacing="0" style="${flow}background:#f3f6ee;border-radius:16px">
${text.steps.map((step, index) => `<tr><td dir="ltr" align="center" width="42" valign="top" style="direction:ltr;text-align:center;font-family:Arial,sans-serif;padding:16px 14px;color:#39704c;font-weight:bold">0${index + 1}</td><td dir="${direction}" align="${alignment}" style="${flow}padding:16px 14px;font-size:15px;line-height:1.8">${escape(step)}</td></tr>`).join('')}
</table>
<p dir="${direction}" style="${flow}margin:28px 0"><a dir="${direction}" href="${escape(link)}" style="${flow}display:inline-block;background:#245b42;color:#fff;text-decoration:none;padding:17px 26px;border-radius:12px;font-weight:bold;font-size:16px">${escape(text.cta)} <span dir="ltr" style="unicode-bidi:isolate">${ar ? '↖' : '↗'}</span></a></p>
<p dir="${direction}" style="${flow}font-size:14px;line-height:1.8;margin:0;color:#65766b">${escape(text.footer)}</p>
</td></tr>
<tr><td dir="${direction}" align="${alignment}" style="${flow}padding:24px 32px;border-top:1px solid #e5eadf;font-size:12px;line-height:1.9;color:#718075">
<p dir="${direction}" style="${flow}margin:0 0 12px">${escape(text.note)}</p>
<a href="mailto:omar.m.ombark@gmail.com" style="color:#245b42">${escape(text.support)}</a>
<p dir="${direction}" style="${flow}margin:12px 0 0"><a href="${escape(origin)}/privacy" style="color:#245b42">${escape(text.privacy)}</a> · <a href="${escape(origin)}/terms" style="color:#245b42">${escape(text.terms)}</a></p>
</td></tr>
</table>
</td></tr>
</table>
</div></body></html>`,
  };
}
