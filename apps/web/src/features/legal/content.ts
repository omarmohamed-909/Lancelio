import type { Locale } from '../../i18n/locale';

export const legalOperator = {
  name: 'عمر محمد',
  email: 'omar.m.ombark@gmail.com',
  updated: '2026-10-24',
} as const;

export const legalDocumentIds = ['privacy', 'terms', 'cookies'] as const;
export type LegalDocumentId = (typeof legalDocumentIds)[number];

export interface LegalSection {
  id: string;
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  table?: {
    columns: [string, string, string];
    rows: [string, string, string][];
  };
  sources?: { label: string; href: string }[];
}
export interface LegalDocument {
  title: string;
  description: string;
  summary: string;
  sections: LegalSection[];
}

const providerSources = [
  { label: 'Vercel', href: 'https://vercel.com/legal/privacy-notice' },
  {
    label: 'MongoDB',
    href: 'https://www.mongodb.com/legal/privacy/privacy-policy',
  },
  { label: 'Google Gemini', href: 'https://ai.google.dev/gemini-api/terms' },
  { label: 'Google', href: 'https://policies.google.com/privacy' },
  { label: 'Resend', href: 'https://resend.com/legal/privacy-policy' },
  { label: 'OpenAI', href: 'https://openai.com/enterprise-privacy/' },
];

export const legalContent: Record<
  Locale,
  Record<LegalDocumentId, LegalDocument>
> = {
  ar: {
    privacy: {
      title: 'سياسة الخصوصية',
      description:
        'ما البيانات التي نستخدمها، ولماذا، وكيف يمكنك إدارة معلوماتك في Lancelio.',
      summary:
        'نستخدم بيانات الحساب ومساحة العمل لتشغيل الخدمة. أنت تختار ما تشاركه مع عملائك، ويمكنك التواصل معنا للاستفسار عن بياناتك أو طلب مراجعتها.',
      sections: [
        {
          id: 'operator',
          title: 'من المسؤول عن الموقع؟',
          paragraphs: [
            'Lancelio مساحة لإدارة عمل المستقلين، يشغّلها عمر محمد بصفته فردًا. تنطبق هذه السياسة على الموقع وخدماته، بما فيها الحسابات ومساحات العمل وروابط المشاركة والمساعد. بيانات التواصل مع المشغّل موجودة في هذه الصفحة.',
          ],
        },
        {
          id: 'information',
          title: 'البيانات التي نتعامل معها',
          bullets: [
            'بيانات الحساب، مثل الاسم والبريد الإلكتروني وبيانات مساحة العمل. تُحفظ كلمات المرور في صورة تجزئة، ولا تُعرض كنص قابل للقراءة.',
            'عند إتاحة الدخول بحساب Google واختيارك استخدامه، نتلقى معرّف حساب Google والبريد الإلكتروني وحالة التحقق منه والاسم. نستخدم المعرّف لربط الدخول بحساب Lancelio؛ ولا نطلب الوصول لرسائل Gmail أو جهات الاتصال. قد يحمّل المتصفح أدوات Google على صفحات الدخول عند تفعيل الميزة.',
            'ما تضيفه إلى مساحتك: بيانات العملاء، وعروض الأسعار، والمشاريع والمهام، والفواتير والدفعات المسجّلة.',
            'الرسائل التي تكتبها للمساعد وسياق المحادثة الذي ترسله معه، عند استخدام هذه الميزة.',
            'بيانات تقنية مرتبطة بالطلبات والجلسات والأمان، وقد تشمل عنوان الشبكة ومعلومات المتصفح وسجلات الأخطاء لدى خدمات الاستضافة.',
          ],
        },
        {
          id: 'purposes',
          title: 'لماذا نستخدم هذه البيانات؟',
          paragraphs: [
            'لتسجيل الدخول وحماية الحساب، وتشغيل الأدوات التي تختار استخدامها، وإظهار سجلات مساحة العمل وفق صلاحيات المستخدم. نستخدم بيانات الطلبات أيضًا لتشخيص الأعطال والحد من إساءة الاستخدام.',
          ],
          bullets: [
            'إنشاء المستندات والروابط التي تطلب مشاركتها، وعرض التقدم والمستحقات.',
            'حفظ تفضيلات الواجهة، مثل اللغة والمظهر وطريقة عرض القوائم.',
            'التعامل مع رسائل الدعم وطلبات الخصوصية واستعادة الوصول إلى الحساب، وإرسال رسالة ترحيب واحدة للحساب الجديد عند تفعيل خدمة البريد.',
          ],
        },
        {
          id: 'sharing',
          title: 'المشاركة والخدمات الخارجية',
          paragraphs: [
            'تكون سجلات مساحة العمل متاحة للمستخدمين المخوّلين داخلها. إذا أنشأت رابط مشاركة، فقد يتمكن أي شخص يحصل عليه من مشاهدة المعلومات التي أتاحها الرابط. راجع المحتوى وصلاحية المشاركة قبل إرساله، وألغِ الرابط عندما لا تعود بحاجة إليه.',
            'تعتمد الاستضافة على Vercel، وتُحفظ بيانات التطبيق في MongoDB Atlas. وقد نستخدم Resend عند تفعيل البريد لإرسال رسائل الترحيب واسترجاع الحساب. يتلقى مزوّد البريد عنوان المستلم ومحتوى الرسالة؛ وقد يتضمن المحتوى اسمك واسم مساحة العمل. قد تُعالج البيانات خارج بلدك بحسب مواقع تشغيل هذه الخدمات وإعداداتها. تختلف سياسات المزوّدين عن هذه السياسة؛ الروابط التالية تتيح مراجعتها.',
          ],
          sources: providerSources,
        },
        {
          id: 'assistant',
          title: 'الخصوصية عند استخدام المساعد',
          paragraphs: [
            'عند تشغيل مزوّد ذكاء اصطناعي خارجي، يمكن إرسال سؤالك ومقتطفات المحادثة واسمك الأول إليه لفهم السؤال وصياغة الرد. استعلامات السجلات تُنفّذ داخل الخدمة وفق صلاحيات مساحة العمل؛ ولا يمنح المساعد وصولًا إلى مساحات المستخدمين الآخرين.',
            'قد تسمح شروط بعض الخدمات المجانية، ومنها بعض استخدامات Gemini، باستخدام المدخلات والردود لتحسين خدمات المزوّد أو مراجعتها بشريًا. تختلف المعالجة بحسب المزوّد والخطة والمنطقة. تجنّب إدخال أسرار أو بيانات حساسة غير لازمة، وراجع شروط المزوّد المرتبطة أعلاه.',
          ],
        },
        {
          id: 'retention',
          title: 'الاحتفاظ بالبيانات وإدارتها',
          paragraphs: [
            'تُحفظ السجلات لتشغيل الحساب ومساحة العمل ومتابعة المستندات والأمان. لا توجد حاليًا مدة حذف تلقائي موحّدة لكل أنواع السجلات، وأرشفة سجل داخل التطبيق لا تعني حذفه نهائيًا.',
            'يمكنك تعديل بيانات الحساب وما تتيحه أدوات المساحة من سجلات. لطلب الوصول إلى بياناتك أو تصحيحها أو حذفها، تواصل مع المشغّل. قد نحتاج للتحقق من هويتك وصلاحياتك، ومراعاة حقوق الآخرين أو أي متطلبات احتفاظ واجبة التطبيق.',
          ],
        },
        {
          id: 'security',
          title: 'الأمان ومسؤولية الوصول',
          paragraphs: [
            'تستخدم الخدمة وسائل لحماية الجلسات وفصل الوصول بين مساحات العمل. لا توجد وسيلة تضمن الحماية المطلقة؛ حافظ على كلمة مرورك، ولا ترسلها عبر البريد أو المحادثة، وسجّل الخروج من الأجهزة المشتركة.',
            'إذا اشتبهت في وصول غير مصرح به أو في كشف رابط مشاركة، غيّر كلمة المرور أو ألغِ المشاركة المتأثرة، وتواصل معنا مع وصف المشكلة دون إرسال كلمات مرور أو مفاتيح سرية.',
          ],
        },
        {
          id: 'requests',
          title: 'الطلبات وتحديث هذه السياسة',
          paragraphs: [
            'يمكن إرسال استفسارات الخصوصية وطلبات البيانات إلى البريد الموضّح في بطاقة التواصل. اذكر البريد المرتبط بحسابك وطبيعة الطلب، دون إرفاق بيانات عملاء لا يحتاجها الطلب.',
            'قد نحدّث هذه السياسة عند تغيير الخدمة أو طرق معالجة البيانات. يوضّح تاريخ آخر تحديث النسخة المعروضة؛ ولا تنتقص هذه السياسة من الحقوق التي يمنحها لك القانون الواجب التطبيق.',
          ],
        },
      ],
    },
    terms: {
      title: 'شروط الاستخدام',
      description:
        'القواعد التي تنظّم استخدام Lancelio وحسابك والمحتوى الذي تضيفه إلى مساحتك.',
      summary:
        'استخدم المساحة لأعمالك المشروعة، واحمِ حسابك وحقوق عملائك، وراجع المستندات والردود قبل الاعتماد عليها. تظل بيانات شغلك ومحتواك ملكًا لك أو لأصحاب الحقوق فيها.',
      sections: [
        {
          id: 'service',
          title: 'الخدمة ونطاق هذه الشروط',
          paragraphs: [
            'يشغّل عمر محمد خدمة Lancelio لتنظيم العملاء وعروض الأسعار والمشاريع والمهام والفواتير والدفعات المسجّلة. تتناول هذه الشروط استخدام الموقع والحسابات وروابط المشاركة والمساعد.',
            'باستخدام الخدمة، يُفترض أن تكون مخوّلًا بإدارة الحساب والبيانات التي تُدخلها، وأن تلتزم بهذه الشروط وبالقوانين الواجبة التطبيق. إذا كنت تتصرف نيابة عن جهة أخرى، يلزم أن تكون لديك صلاحية القيام بذلك.',
          ],
        },
        {
          id: 'account',
          title: 'الحساب وصلاحيات مساحة العمل',
          paragraphs: [
            'قدّم بيانات حساب صحيحة، واحمِ كلمة مرورك، ولا تمنح الآخرين وصولًا غير مصرح به. يتحمل مستخدم الحساب مسؤولية ما يجري من خلال وصوله، مع مراعاة أي حقوق أو التزامات قانونية لا يجوز استبعادها.',
            'تُدار سجلات العمل داخل المساحة بحسب الصلاحيات المتاحة. لا تحاول الوصول إلى مساحات أخرى أو تجاوز حدود الصلاحيات أو آليات حماية الجلسة.',
          ],
        },
        {
          id: 'content',
          title: 'محتواك وبيانات عملائك',
          paragraphs: [
            'لا ينقل إدخال محتواك إلى Lancelio ملكيته إلى المشغّل. تحتفظ أنت أو أصحاب الحقوق بملكية البيانات والمستندات التي تضيفها، وتسمح بمعالجتها بالقدر اللازم لتقديم الميزات التي تستخدمها.',
            'أدخل فقط المعلومات التي يحق لك معالجتها أو مشاركتها. أنت مسؤول عن مراجعة بيانات عملائك ونطاق العمل والأسعار والضرائب والعملات ومحتوى المستندات، والحصول على الأذونات اللازمة عند الحاجة.',
          ],
        },
        {
          id: 'acceptable-use',
          title: 'الاستخدام المقبول',
          bullets: [
            'لا تستخدم الخدمة للاحتيال أو انتحال الهوية أو انتهاك حقوق الآخرين أو نشر محتوى غير مشروع.',
            'لا تختبر الحسابات أو الأنظمة دون إذن، ولا تحاول استخراج بيانات مستخدمين آخرين أو تعطيل الخدمة.',
            'لا تشارك كلمات المرور أو مفاتيح الوصول أو بيانات حساسة غير لازمة في المستندات أو رسائل المساعد.',
            'لا تستخدم روابط المشاركة لتوزيع محتوى لا تملك حق مشاركته.',
          ],
        },
        {
          id: 'documents',
          title: 'المستندات والمشاركة والمدفوعات',
          paragraphs: [
            'الفواتير والدفعات داخل Lancelio سجلات لأعمالك؛ لا تعني أن المنصة حصّلت المال أو ضمنت دفع العميل. يتم تحويل الأموال خارج المنصة بالطريقة المتفق عليها بينك وبين عميلك.',
            'راجع كل عرض سعر أو فاتورة قبل إصدارها أو مشاركتها. لا يحسم إنشاء مستند أو قبول عرضه داخل المنصة وحده كل المسائل التعاقدية أو الضريبية في علاقتك بعميلك.',
            'أنت تختار الروابط التي تشاركها والمعلومات الظاهرة فيها. قد يصل الرابط لمن يُعاد إرساله إليه؛ ألغِ المشاركة عندما يلزم ذلك.',
          ],
        },
        {
          id: 'assistant',
          title: 'المساعد ودقة المخرجات',
          paragraphs: [
            'المساعد أداة مساعدة للشرح والمحادثة وقراءة معلومات متاحة ضمن صلاحياتك. قد يخطئ أو يقدم معلومات غير مكتملة؛ راجع الردود والأرقام والمصادر قبل اتخاذ قرار أو استخدامها في عملك.',
            'لا تُعد المخرجات مشورة قانونية أو ضريبية أو ضمانًا لنتيجة معينة. يخضع استخدام المساعد أيضًا لمعالجة البيانات الموضّحة في سياسة الخصوصية.',
          ],
        },
        {
          id: 'availability',
          title: 'التوافر والتغييرات وإساءة الاستخدام',
          paragraphs: [
            'قد تتوقف الخدمة أو بعض ميزاتها بسبب الصيانة أو أعطال الشبكات أو المزوّدين الخارجيين. احتفظ بنسخ من المستندات المهمة المتاحة لك، ولا تعتمد على التوافر المستمر دون انقطاع.',
            'يجوز تقييد وصول مخالف أو مسيء بالقدر اللازم لحماية الخدمة والمستخدمين. قد تتطور الميزات وهذه الشروط، ويظهر تاريخ تحديثها في هذه الصفحة. لا تُستبعد بموجب هذه الشروط حقوق أو التزامات لا يسمح القانون باستبعادها.',
          ],
        },
        {
          id: 'contact',
          title: 'الاستفسارات والمشكلات',
          paragraphs: [
            'يمكن التواصل مع المشغّل على البريد المنشور في هذه الصفحة بشأن الحساب أو المحتوى أو هذه الشروط. اشرح المشكلة واذكر معلومات الحساب اللازمة للتحقق، دون إرسال كلمة مرورك أو بيانات لا صلة لها بالطلب.',
          ],
        },
      ],
    },
    cookies: {
      title: 'ملفات الارتباط والتفضيلات',
      description:
        'شرح واضح لما يحفظه Lancelio في متصفحك، وسبب الحفظ، وكيف يمكنك التحكم فيه.',
      summary:
        'نستخدم ملف جلسة لتسجيل الدخول، وملفًا لحفظ اللغة، وتخزينًا محليًا للمظهر وتفضيلات القوائم. لا تتضمن النسخة الحالية أدوات تتبع إعلاني داخل التطبيق.',
      sections: [
        {
          id: 'cookies',
          title: 'ملفات الارتباط المستخدمة',
          paragraphs: [
            'ملف الارتباط معلومة يحفظها المتصفح ويرسلها مع الطلبات المناسبة. تختلف ملفات تسجيل الدخول عن تفضيلات الواجهة في الغرض وطريقة الوصول.',
          ],
          table: {
            columns: ['الملف', 'الغرض', 'مدة البقاء'],
            rows: [
              [
                'جلسة الدخول: __Host-lancelio_refresh أو lancelio_refresh',
                'استعادة جلسة الحساب والتحقق منها. ملف HttpOnly لا يقرأه كود الصفحة مباشرة.',
                'حتى انتهاء الجلسة أو إلغائها أو حذف ملفات الموقع؛ ويمكن تجديده أثناء الاستخدام.',
              ],
              [
                'تأمين دخول Google: __Host-lancelio_google أو lancelio_google',
                'ربط طلب الدخول بالمتصفح ومنع إعادة استخدامه، عند تفعيل Google. ملف HttpOnly.',
                '١٠ دقائق، أو حتى اكتمال الدخول.',
              ],
              [
                'لغة الموقع: lancelio_language',
                'تذكّر اختيارك للعربية أو الإنجليزية. تبدأ الواجهة باللغة المدعومة من تفضيلات جهازك إذا لم تختر لغة.',
                'عام من وقت حفظ الاختيار، أو حتى حذفه.',
              ],
            ],
          },
        },
        {
          id: 'local-storage',
          title: 'ما يُحفظ محليًا على الجهاز',
          paragraphs: [
            'يستخدم المتصفح أيضًا التخزين المحلي، وهو مختلف عن ملفات الارتباط ولا يُرسل تلقائيًا مع كل طلب.',
            'تستخدم نسخة التطبيق أيضًا ذاكرة المتصفح لحفظ شاشة انقطاع الاتصال والأيقونات العامة فقط. لا يخزّن عامل تشغيل التطبيق صفحات الحساب أو سجلات العملاء والفواتير أو استجابات API، ولا يحتفظ بطابور تعديلات لإرساله لاحقًا.',
          ],
          table: {
            columns: ['التفضيل', 'الغرض', 'مدة البقاء'],
            rows: [
              [
                'المظهر',
                'تذكّر اختيار الوضع الفاتح أو الداكن.',
                'حتى تغييره أو حذف بيانات الموقع.',
              ],
              [
                'تفضيلات القوائم',
                'تذكّر إعدادات العرض والفرز المتاحة لبعض قوائم مساحة العمل.',
                'حتى تغييرها أو حذف بيانات الموقع.',
              ],
            ],
          },
          bullets: [
            'لا تُحفظ كلمة مرورك أو رموز الوصول للحساب في التخزين المحلي أو تخزين الجلسة.',
            'محو تفضيلات الواجهة لا يحذف سجلات حسابك من قاعدة بيانات الخدمة.',
          ],
        },
        {
          id: 'manage',
          title: 'كيف تتحكم في الحفظ؟',
          paragraphs: [
            'يمكنك تغيير اللغة والمظهر من الأدوات الموجودة في أعلى الموقع. ويمكن حذف ملفات الارتباط والتخزين المحلي من إعدادات بيانات المواقع في متصفحك.',
            'حذف ملف جلسة الدخول قد يتطلب تسجيل الدخول من جديد، وحذف التفضيلات يعيد الواجهة لاختياراتها الافتراضية. إذا كنت تريد إنهاء الجلسة، استخدم تسجيل الخروج قبل ترك جهاز مشترك.',
          ],
        },
        {
          id: 'third-parties',
          title: 'التتبع والخدمات الخارجية',
          paragraphs: [
            'لا تتضمن واجهة التطبيق الحالية أدوات إعلانات أو تتبع إعلاني. قد تحتفظ خدمات الاستضافة بسجلات تقنية لتشغيل الخدمة وأمانها؛ يختلف ذلك عن ملفات تفضيلات الواجهة.',
            'إذا فتحت رابطًا لموقع خارجي، تسري على ذلك الموقع سياساته الخاصة. راجع سياسة الخصوصية لمعرفة تفاصيل المزوّدين ومعالجة رسائل المساعد. نحدّث هذه الصفحة عندما تتغير أدوات الحفظ المستخدمة.',
          ],
        },
      ],
    },
  },
  en: {
    privacy: {
      title: 'Privacy policy',
      description:
        'What information Lancelio uses, why it is needed, and how you can manage your data.',
      summary:
        'Account and workspace information is used to provide the service. You choose what to share with clients, and you can contact the operator about your information or a data request.',
      sections: [
        {
          id: 'operator',
          title: 'Who operates the service?',
          paragraphs: [
            'Lancelio is a workspace for freelance work, operated by Omar Mohamed (عمر محمد) as an individual. This policy covers the website and its services, including accounts, workspaces, shared links, and the assistant. The operator’s contact details are provided on this page.',
          ],
        },
        {
          id: 'information',
          title: 'Information we handle',
          bullets: [
            'Account details such as your name, email address, and workspace information. Passwords are stored as hashes rather than readable text.',
            'When Google sign-in is available and you choose it, we receive your Google account identifier, email address, verification status, and name. The identifier links sign-in to your Lancelio account; we do not request access to Gmail messages or contacts. Your browser may load Google tools on sign-in pages when the feature is enabled.',
            'Information you add to your workspace: clients, proposals, projects, tasks, invoices, and recorded payments.',
            'Messages you send to the assistant and the conversation context submitted with them when you use that feature.',
            'Technical information associated with requests, sessions, and security, which may include network addresses, browser information, and error logs held by hosting services.',
          ],
        },
        {
          id: 'purposes',
          title: 'Why information is used',
          paragraphs: [
            'To sign you in, protect accounts, provide the tools you choose to use, and show workspace records according to user permissions. Request information also helps diagnose failures and limit misuse.',
          ],
          bullets: [
            'Creating documents and links you choose to share, and displaying progress and outstanding payments.',
            'Remembering interface preferences such as language, appearance, and list settings.',
            'Handling support messages, privacy requests, account recovery, and a single welcome message for new accounts when email delivery is enabled.',
          ],
        },
        {
          id: 'sharing',
          title: 'Sharing and external services',
          paragraphs: [
            'Workspace records are available to authorized users in that workspace. If you create a sharing link, anyone who obtains it may be able to view the information it exposes. Review the content and sharing permissions before sending it, and revoke the link when it is no longer needed.',
            'Hosting uses Vercel, and application data is stored in MongoDB Atlas. Resend may be used for welcome and recovery messages when email delivery is enabled. The email provider receives the recipient address and message content, which may include your name and workspace name. Information may be processed outside your country depending on provider locations and settings. Provider policies differ from this policy; they can be reviewed using the links below.',
          ],
          sources: providerSources,
        },
        {
          id: 'assistant',
          title: 'Privacy when using the assistant',
          paragraphs: [
            'When an external AI provider is enabled, your question, conversation excerpts, and first name may be sent to that provider to interpret the question and compose a response. Record queries run within the service using workspace permissions; the assistant does not grant access to other users’ workspaces.',
            'The terms of some unpaid services, including some uses of Gemini, may permit provider improvement and human review of inputs and outputs. Treatment varies by provider, plan, and region. Avoid submitting unnecessary secrets or sensitive information, and review the provider terms linked above.',
          ],
        },
        {
          id: 'retention',
          title: 'Retention and your controls',
          paragraphs: [
            'Records are retained to operate accounts and workspaces, maintain documents, and support security. There is currently no single automatic deletion period for every record type. Archiving an item inside the application does not permanently delete it.',
            'You can edit account details and records supported by the workspace tools. Contact the operator to request access, correction, or deletion. We may need to verify your identity and authority and consider other people’s rights or applicable retention requirements.',
          ],
        },
        {
          id: 'security',
          title: 'Security and access',
          paragraphs: [
            'The service uses measures to protect sessions and separate workspace access. No method guarantees absolute protection. Keep your password secure, do not send it by email or chat, and sign out on shared devices.',
            'If you suspect unauthorized access or exposure of a sharing link, change your password or revoke the affected link and contact us with a description of the issue, without sending passwords or secret keys.',
          ],
        },
        {
          id: 'requests',
          title: 'Requests and policy updates',
          paragraphs: [
            'Send privacy questions and data requests to the email address in the contact card. Include your account email and the nature of your request without attaching unrelated client information.',
            'This policy may be updated when the service or its data practices change. The updated date identifies the version shown here. This policy does not reduce rights provided by applicable law.',
          ],
        },
      ],
    },
    terms: {
      title: 'Terms of use',
      description:
        'The ground rules for using Lancelio, your account, and the information you add to your workspace.',
      summary:
        'Use the workspace for lawful work, protect your account and your clients’ rights, and review documents and assistant responses before relying on them. Your work and content remain yours or their respective rights holders’.',
      sections: [
        {
          id: 'service',
          title: 'The service and these terms',
          paragraphs: [
            'Omar Mohamed (عمر محمد) operates Lancelio to organize clients, proposals, projects, tasks, invoices, and recorded payments. These terms cover the website, accounts, sharing links, and the assistant.',
            'You must be authorized to manage your account and the information you provide and comply with these terms and applicable law. If you act for another organization, you must have authority to do so.',
          ],
        },
        {
          id: 'account',
          title: 'Accounts and workspace permissions',
          paragraphs: [
            'Provide accurate account details, protect your password, and do not grant unauthorized access. Account users are responsible for activity through their access, subject to rights and responsibilities that cannot lawfully be excluded.',
            'Workspace records are managed according to available permissions. Do not attempt to access other workspaces or bypass permission boundaries or session protections.',
          ],
        },
        {
          id: 'content',
          title: 'Your content and client information',
          paragraphs: [
            'Adding content to Lancelio does not transfer its ownership to the operator. You or the relevant rights holders retain ownership of the information and documents you provide and permit processing as needed to deliver the features you use.',
            'Only provide information you are entitled to process or share. You are responsible for reviewing client details, scope, pricing, taxes, currencies, and document content and obtaining permissions where necessary.',
          ],
        },
        {
          id: 'acceptable-use',
          title: 'Acceptable use',
          bullets: [
            'Do not use the service for fraud, impersonation, unlawful content, or infringement of others’ rights.',
            'Do not test accounts or systems without permission, extract other users’ data, or disrupt the service.',
            'Do not place passwords, access keys, or unnecessary sensitive information in documents or assistant messages.',
            'Do not distribute content through sharing links unless you have the right to share it.',
          ],
        },
        {
          id: 'documents',
          title: 'Documents, sharing, and payments',
          paragraphs: [
            'Invoices and payments in Lancelio are records of your work. They do not mean the platform collected funds or guaranteed client payment. Money is transferred outside the platform using the method agreed between you and your client.',
            'Review proposals and invoices before issuing or sharing them. Creating a document or accepting a proposal through the platform does not, by itself, resolve every contractual or tax question in your client relationship.',
            'You choose which links to share and the information visible through them. A forwarded link may reach other people; revoke sharing when appropriate.',
          ],
        },
        {
          id: 'assistant',
          title: 'The assistant and accuracy',
          paragraphs: [
            'The assistant helps with explanations, conversation, and reading information available within your permissions. It can make mistakes or provide incomplete answers. Review responses, amounts, and sources before making decisions or using them in your work.',
            'Responses are not legal or tax advice or a guarantee of an outcome. Assistant use also involves the data processing described in the privacy policy.',
          ],
        },
        {
          id: 'availability',
          title: 'Availability, changes, and misuse',
          paragraphs: [
            'The service or individual features may be unavailable because of maintenance, network failures, or external providers. Keep copies of important documents available to you and do not assume uninterrupted availability.',
            'Misuse or unauthorized access may be restricted as needed to protect the service and its users. Features and these terms may evolve; the date of the current version appears on this page. These terms do not exclude rights or responsibilities that applicable law does not allow to be excluded.',
          ],
        },
        {
          id: 'contact',
          title: 'Questions and problems',
          paragraphs: [
            'Contact the operator using the email published on this page about your account, content, or these terms. Explain the issue and provide account details necessary for verification without sending your password or unrelated information.',
          ],
        },
      ],
    },
    cookies: {
      title: 'Cookies and preferences',
      description:
        'A clear explanation of what Lancelio saves in your browser, why, and how you can control it.',
      summary:
        'A session cookie supports sign-in, another cookie remembers your language, and local storage keeps appearance and list preferences. The current application does not include advertising trackers.',
      sections: [
        {
          id: 'cookies',
          title: 'Cookies in use',
          paragraphs: [
            'A cookie is a small piece of information the browser stores and sends with matching requests. Sign-in cookies and interface preferences have different purposes and access controls.',
          ],
          table: {
            columns: ['Item', 'Purpose', 'Duration'],
            rows: [
              [
                'Sign-in: __Host-lancelio_refresh or lancelio_refresh',
                'Restore and verify the account session. This HttpOnly cookie is not directly readable by page scripts.',
                'Until session expiry, revocation, or deletion of site cookies; it may be renewed during use.',
              ],
              [
                'Google sign-in protection: __Host-lancelio_google or lancelio_google',
                'Bind sign-in to your browser and prevent reuse when Google is enabled. An HttpOnly cookie.',
                '10 minutes, or until sign-in completes.',
              ],
              [
                'Site language: lancelio_language',
                'Remember Arabic or English. Without an explicit selection, the interface starts in a supported language from your device preferences.',
                'One year after saving your selection, or until deleted.',
              ],
            ],
          },
        },
        {
          id: 'local-storage',
          title: 'Information stored on the device',
          paragraphs: [
            'The browser also uses local storage. Unlike cookies, its contents are not automatically sent with every request.',
            'The app also uses browser cache storage for the public offline screen and icons only. Its service worker does not cache account pages, client or invoice records, or API responses, and does not queue changes for later delivery.',
          ],
          table: {
            columns: ['Preference', 'Purpose', 'Duration'],
            rows: [
              [
                'Appearance',
                'Remember a light or dark appearance selection.',
                'Until changed or site data is deleted.',
              ],
              [
                'List preferences',
                'Remember available display and sorting settings for some workspace lists.',
                'Until changed or site data is deleted.',
              ],
            ],
          },
          bullets: [
            'Your password and account access tokens are not saved in local storage or session storage.',
            'Clearing interface preferences does not delete account records from the service database.',
          ],
        },
        {
          id: 'manage',
          title: 'Managing browser storage',
          paragraphs: [
            'Change language and appearance using the controls at the top of the site. Cookies and local storage can be removed using your browser’s site-data settings.',
            'Deleting a session cookie may require signing in again. Clearing preferences restores default interface choices. Use sign-out before leaving a shared device if you want to end the session.',
          ],
        },
        {
          id: 'third-parties',
          title: 'Tracking and external services',
          paragraphs: [
            'The current application interface does not include advertising or advertising trackers. Hosting services may retain technical logs to operate and secure the service; these are different from interface preference cookies.',
            'External sites you open have their own policies. See the privacy policy for details about service providers and assistant messages. This page is updated when the storage tools in use change.',
          ],
        },
      ],
    },
  },
};
