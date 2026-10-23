export const offlineScript = String.raw`
(() => {
  const root = document.documentElement;
  const saved = document.cookie.match(/(?:^|;\s*)lancelio_language=(ar|en)(?:;|$)/)?.[1];
  const preferred = (navigator.languages || [navigator.language]).map(tag => tag.split('-')[0]).find(tag => tag === 'ar' || tag === 'en');
  root.lang = saved || preferred || 'ar';
  root.dir = root.lang === 'ar' ? 'rtl' : 'ltr';
  let theme = 'system';
  try { theme = localStorage.getItem('lancelio:theme:v1') || 'system'; } catch {}
  root.dataset.theme = theme === 'dark' || (theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  document.title = root.lang === 'ar' ? 'تعذّر الاتصال | Lancelio' : 'Connection unavailable | Lancelio';
  document.addEventListener('DOMContentLoaded', () => {
    const update = () => { root.dataset.online = navigator.onLine ? 'true' : 'false'; };
    update();
    addEventListener('online', update);
    addEventListener('offline', update);
    document.getElementById('retry').addEventListener('click', () => location.reload());
  });
})();
`;

export const offlineDocument = `<!doctype html>
<html lang="ar" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#173d30"><meta name="robots" content="noindex,nofollow">
<title>تعذّر الاتصال | Lancelio</title>
<script>${offlineScript}</script>
<style>
*{box-sizing:border-box}html{color-scheme:light;--paper:#f5f7f2;--surface:#fff;--ink:#243b33;--muted:#5b6b61;--line:#e1e8df;--green:#24634d}
html[data-theme=dark]{color-scheme:dark;--paper:#101b15;--surface:#19271f;--ink:#e3eee5;--muted:#b0bfb3;--line:#35493e;--green:#a8d3b2}
body{margin:0;min-height:100svh;display:grid;place-items:center;padding:24px;background:var(--paper);color:var(--ink);font:15px/1.9 Tahoma,Arial,sans-serif}
main{width:100%;max-width:480px;background:var(--surface);border:1px solid var(--line);border-radius:24px;padding:clamp(24px,6vw,44px)}
.brand{display:flex;gap:10px;align-items:center;direction:ltr;width:max-content;font-size:25px;font-weight:bold;letter-spacing:-1px}img{border-radius:10px}
.signal{display:grid;place-items:center;width:64px;height:64px;border:1px solid var(--line);border-radius:20px;color:var(--green);margin-block:36px 24px}h1{font-size:28px;line-height:1.6;margin:0 0 14px;text-wrap:balance}p{margin:0 0 20px;color:var(--muted)}
.actions{display:flex;flex-wrap:wrap;align-items:center;gap:12px 22px;margin-top:28px}button{background:#24634d;color:white;border:0;border-radius:10px;padding:13px 24px;font:inherit;cursor:pointer}a{color:var(--green);text-underline-offset:4px}button:focus-visible,a:focus-visible{outline:3px solid var(--green);outline-offset:4px}
.notice{font-size:12px;border-top:1px solid var(--line);padding-top:20px;margin-top:28px;margin-bottom:0}.online{display:none;color:var(--green);font-size:12px}html[data-online=true] .online{display:block}html[lang=ar] [lang=en],html[lang=en] [lang=ar]{display:none}
</style></head><body><main>
<div class="brand"><img src="/pwa/icon-192.png" alt="" width="38" height="38">lancelio.</div>
<div class="signal" aria-hidden="true"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="m3 3 18 18M2 8a16 16 0 0 1 2.5-1.6M8.5 4.4A16 16 0 0 1 22 8M5 12a11 11 0 0 1 3-1.8M13 9.1a11 11 0 0 1 6 2.9M8.5 15.5a5 5 0 0 1 7 0M12 19h.01"/></svg></div>
<h1><span lang="ar">شغلك مستنيك. نرجع الاتصال الأول.</span><span lang="en">Your work is here. Let’s reconnect.</span></h1>
<p><span lang="ar">تعذّر الوصول للموقع دلوقتي. بيانات مساحة العمل محتاجة اتصال بالإنترنت؛ حاول تاني لما الشبكة ترجع.</span><span lang="en">We cannot reach the site right now. Your workspace needs an internet connection. Try again when you are connected.</span></p>
<p class="online" role="status"><span lang="ar">الجهاز متصل بشبكة. تقدر تحاول الوصول للموقع تاني.</span><span lang="en">Your device is connected to a network. You can try reaching the site again.</span></p>
<div class="actions"><button id="retry" type="button"><span lang="ar">حاول مرة تانية</span><span lang="en">Try again</span></button><a href="/"><span lang="ar">الصفحة الرئيسية</span><span lang="en">Home page</span></a></div>
<p class="notice"><span lang="ar">شاشة انقطاع الاتصال لا تعرض بيانات حسابك، ولا ترسل تعديلات تلقائيًا.</span><span lang="en">This offline screen does not display account data or automatically send changes.</span></p>
</main></body></html>`;
