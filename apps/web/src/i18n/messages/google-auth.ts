export const googleAuthEn = {
  'Google مش بيؤكد ملكية البريد ده حاليًا. استخدم طريقة الدخول الأصلية أو حساب Gmail أو Google Workspace.':
    'Google cannot confirm current ownership of this email. Use your original sign-in method or a Gmail or Google Workspace account.',
  'كمّل باستخدام Google. لتفعيل الدخول بكلمة المرور، عيّن كلمة مرور جديدة من إعدادات الأمان أو استرجاع البريد.':
    'Continue with Google. To enable password sign-in, set a new password in security settings or through email recovery.',
  'حاول مرة تانية': 'Try again',
  'استرجاع كلمة المرور': 'Password recovery',
  'لو بتدخل بحساب Google ولسه معندكش كلمة مرور، تقدر تنشئها بعد تأكيد بريدك من صفحة استرجاع كلمة المرور، لما خدمة البريد تكون متاحة.':
    'If you use Google and have no password yet, you can create one by verifying your email through password recovery when email delivery is available.',
  'المتابعة باستخدام Google': 'Continue with Google',
  'جاري تجهيز Google…': 'Preparing Google…',
  'تعذّر تجهيز زر Google. حاول مرة تانية أو استخدم البريد وكلمة المرور.':
    'Google sign-in could not start. Try again or use your email and password.',
  'تعذّر تحميل Google. تقدر تكمل بالبريد وكلمة المرور.':
    'Google could not load. You can continue using your email and password.',
  'اختيار حساب Google انتهت صلاحيته. اختار حسابك من جديد.':
    'Your Google sign-in expired. Choose your account again.',
  'تعذّر ربط حساب Google. استخدم طريقة الدخول المرتبطة بحسابك، أو اختار حسابك من جديد.':
    'Google could not be linked. Use your existing sign-in method, or choose your account again.',
  'الدخول بحساب Google مش متاح دلوقتي. تقدر تستخدم البريد وكلمة المرور.':
    'Google sign-in is unavailable right now. You can use your email and password.',
  'حسابك بيستخدم Google. لإنشاء كلمة مرور، استخدم «نسيت كلمة المرور؟» لتأكيد بريدك أولًا.':
    'Your account uses Google. To create a password, use “Forgot password?” to verify your email first.',
  'خطوة أخيرة لمساحتك': 'One last step for your workspace',
  'اسم مساحة العمل': 'Workspace name',
  'إنشاء مساحتي والمتابعة': 'Create my workspace and continue',
  'اختيار حساب Google آخر': 'Choose another Google account',
  'أو باستخدام البريد الإلكتروني': 'Or use your email',
  'اكتب اسمك واسم مساحة العمل، من حرفين إلى ١٠٠ حرف.':
    'Enter your name and workspace name, each between 2 and 100 characters.',
} as const;
export const googleAuthAr = Object.fromEntries(
  Object.keys(googleAuthEn).map((key) => [key, key]),
) as Record<keyof typeof googleAuthEn, string>;
