export const legalEn = {
  'المعلومات القانونية': 'Legal information',
  'السياسات والوثائق': 'Policies and documents',
  'وضوح في الشغل. ووضوح في التفاصيل.': 'Clear work. Clear terms.',
  'اعرف كيف تعمل الخدمة، وكيف نتعامل مع بياناتك وتفضيلاتك. كل التفاصيل هنا، في مكان واحد.':
    'Understand how the service works and how we handle your data and preferences. All the details, in one place.',
  'سياسة الخصوصية': 'Privacy policy',
  'شروط الاستخدام': 'Terms of use',
  'ملفات الارتباط والتفضيلات': 'Cookies and preferences',
  'العودة للرئيسية': 'Back to home',
  'آخر تحديث': 'Last updated',
  'في هذه الصفحة': 'On this page',
  'الفكرة باختصار': 'At a glance',
  'قراءة التفاصيل': 'Read the details',
  'طباعة الصفحة': 'Print this page',
  'تواصل بخصوص بياناتك أو الخدمة': 'Questions about your data or the service?',
  'المسؤول عن Lancelio': 'Lancelio operator',
  'عمر محمد': 'Omar Mohamed',
  'يشغّل Lancelio بصفته فردًا.': 'Operates Lancelio as an individual.',
  'راسلنا لطلبات الخصوصية أو الاستفسارات عن الخدمة. لا ترسل كلمات مرور أو مفاتيح سرية.':
    'Email us about privacy requests or the service. Please leave out passwords and secret keys.',
  'تواصل معنا': 'Contact us',
  'للقراءة أيضًا': 'Also worth reading',
  'سياسات الخدمات المرتبطة': 'Related service policies',
  'العودة لأعلى الصفحة': 'Back to top',
} as const;

export const legalAr = Object.fromEntries(
  Object.keys(legalEn).map((key) => [key, key]),
) as { [K in keyof typeof legalEn]: K };
