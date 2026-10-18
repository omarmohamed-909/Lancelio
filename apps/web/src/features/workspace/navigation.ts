import { Users, FileText, FolderKanban, Wallet } from 'lucide-react';
export const upcoming = [
  {
    label: 'العملاء',
    href: '/clients',
    icon: Users,
    description: 'أسماء عملائك وطرق التواصل معاهم.',
    stage: 'متاح الآن',
  },
  {
    label: 'عروض الأسعار',
    href: '/proposals',
    icon: FileText,
    description: 'مسودات نطاق الشغل والسعر وشروط الاتفاق.',
    stage: 'متاح الآن',
  },
  {
    label: 'المشاريع',
    href: '/projects',
    icon: FolderKanban,
    description: 'الشغل المتفق عليه وعميله وحالته الحالية.',
    stage: 'متاح الآن',
  },
  {
    label: 'الفواتير',
    href: '/invoices',
    icon: Wallet,
    description: 'مسودات مرقمة ببنود وأسعار دقيقة.',
    stage: 'متاح الآن',
  },
];
