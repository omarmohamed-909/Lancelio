import type { AssistantInterpreter } from '../application/ask-assistant.js';
import type { AssistantInput, AssistantPlan } from '../domain/assistant.js';

export class GuidedInterpreter implements AssistantInterpreter {
  async interpret({
    message,
    history,
  }: AssistantInput): Promise<AssistantPlan> {
    const text = message
      .trim()
      .toLowerCase()
      .normalize('NFKC')
      .replace(/[أإآ]/gu, 'ا')
      .replace(/[\u064b-\u065f\u0640]/gu, '')
      .replace(/\s+/gu, ' ');
    const plan: AssistantPlan = {
      intent: 'clarify',
      topic: 'navigation',
      status: 'open',
      query: '',
    };
    const search =
      /^(?:ابحث(?: عن)?|دور(?: على)?|find|search(?: for)?)\s+(.+)$/iu.exec(
        message.trim(),
      );
    if (
      search &&
      search[1]!.trim().length >= 2 &&
      search[1]!.trim().length <= 100
    )
      return { ...plan, intent: 'search', query: search[1]!.trim() };
    if (/احذف|حذف|امسح|عدل|تعديل|\b(?:delete|remove|update|edit)\b/u.test(text))
      return plan;
    const productSubject =
      '(?:lancelio|لانسيليو|المشروع(?: بتاعنا)?|مشروعنا|الموقع(?: ده| بتاعنا)?|موقعنا|المنص[هة]|التطبيق)';
    const aboutProduct =
      new RegExp(
        `^(?:(?:ممكن|لو سمحت|عايزك|عاوزك)\\s+)?(?:ت?كلمني|كلمنا|احكيلي|احكي لي|قولي|قول لي|اشرحلي|اشرح لي|اشرح|عرفني|انت تعرف ايه|تعرف ايه)\\s+(?:(?:عن|ع|علي)\\s+)?${productSubject}[؟?!.]*$`,
        'u',
      ).test(text) ||
      new RegExp(
        `^(?:(?:ايه هو|ما هو|مميزات|امكانيات|فكرة|فكره)\\s+${productSubject}|${productSubject}\\s+(?:بيعمل ايه|بيفيدني بايه|بيقدم ايه|ايه مميزاته|ده ايه)|(?:lancelio|لانسيليو))[؟?!.]*$`,
        'u',
      ).test(text) ||
      /^(?:(?:tell me about|explain|describe|introduce) (?:lancelio|our project|this (?:project|site|website|app|platform))|what is (?:lancelio|our project|this (?:project|site|website|app|platform))|what (?:does (?:lancelio|this (?:site|website|app|platform)) do|can lancelio do)|(?:lancelio|this (?:site|app|platform))(?:'s)? (?:features|capabilities))[?!.]*$/u.test(
        text,
      );
    if (aboutProduct) return { ...plan, intent: 'help', topic: 'product' };
    if (
      /^(?:و?ايه مميزاته|و?بيعمل ايه|و?بيفيدني بايه|مين بيستخدمه|what are its features|who is it for|how does it work)[؟?!.]*$/u.test(
        text,
      ) &&
      history.length > 0
    ) {
      const previous = await this.interpret({
        message: history.at(-1)!,
        history: history.slice(0, -1),
      });
      if (previous.intent === 'help' && previous.topic === 'product')
        return { ...plan, intent: 'help', topic: 'product' };
    }
    const help =
      /ازاي|كيف|اعمل|انشئ|اضيف|اضافه|اضافة|how\b|create\b|add\b|share\b|change\b/u.test(
        text,
      );
    const topic: AssistantPlan['topic'] = /مشارك|رابط|بواب|shar|portal/u.test(
      text,
    )
      ? 'sharing'
      : /دفع|دفعه|دفعة|سداد|payment/u.test(text)
        ? 'payments'
        : /فاتور|فواتير|invoice/u.test(text)
          ? 'invoices'
          : /عرض|عروض|proposal|quote/u.test(text)
            ? 'proposals'
            : /عميل|عملاء|client|customer/u.test(text)
              ? 'clients'
              : /مشروع|مشاريع|project/u.test(text)
                ? 'projects'
                : /اعداد|لغ[هة]|مظهر|password|setting|language|theme/u.test(
                      text,
                    )
                  ? 'settings'
                  : 'navigation';
    const followUp =
      /^(?:(?:و|طب|طيب|وطيب|والـ)\s*|(?:and|what about|how about)\s+)?(?:ال)?(?:متوقف[هة]?|مكتمل[هة]?|ملغي[هة]?|ملغى|نشط[هة]?|شغال[هة]?|مفتوح[هة]?|كلهم|كلها|on hold|paused|completed|finished|cancelled|canceled|active|open|all(?: of them)?)[؟?!.]*$/u.test(
        text,
      );
    if (followUp && history.length > 0) {
      const previous = await this.interpret({
        message: history.at(-1)!,
        history: history.slice(0, -1),
      });
      if (previous.intent === 'projects') {
        return this.interpret({
          message: `projects ${text.replace(/^(?:and|what about|how about)\s+/u, '')}`,
          history: [],
        });
      }
    }
    if (help || /مساعد|مساعدة|تقدر تعمل ايه|help\b|what can you/u.test(text))
      return { ...plan, intent: 'help', topic };
    if (
      /مستحق|متبقي|متبقى|فلوس|غير\s*مدفوع|outstanding|receivable|unpaid|owed|owes?\b/u.test(
        text,
      )
    )
      return { ...plan, intent: 'receivables' };
    if (topic === 'projects') {
      const status: AssistantPlan['status'] = /متوقف|on.hold|paused/u.test(text)
        ? 'on_hold'
        : /مكتمل|خلص|completed|finished/u.test(text)
          ? 'completed'
          : /ملغي|ملغى|cancelled|canceled/u.test(text)
            ? 'cancelled'
            : /نشط|شغال|\bactive\b/u.test(text)
              ? 'active'
              : /كل|all\b/u.test(text)
                ? 'all'
                : 'open';
      return { ...plan, intent: 'projects', status };
    }
    if (
      /ملخص|نظرة|ارقام|شغلي|شغلى|overview|summary|dashboard|my work/u.test(text)
    )
      return { ...plan, intent: 'overview' };
    if (
      /^(?:اهلا|اهلين|هلا|هاي|ازيك|ازيكم|عامل ايه|اخبارك ايه|السلام عليكم|صباح الخير|مساء الخير|شكرا?|تسلم|متشكر|hi|hello|hey|thanks|thank you|how are you)[؟?!.\s]*$/u.test(
        text,
      )
    )
      return { ...plan, intent: 'chat' };
    return plan;
  }
}
