import type { AssistantInput } from './assistant.js';

export function conversationLocale(input: AssistantInput): 'ar' | 'en' {
  return (
    input.locale ??
    (/\p{Script=Arabic}/u.test(input.message)
      ? 'ar'
      : /[a-z]/iu.test(input.message)
        ? 'en'
        : 'ar')
  );
}

export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/u)[0]?.slice(0, 80) ?? '';
}

export function guidedGreeting(
  input: AssistantInput,
  name: string,
): string | null {
  if (
    !/^(?:أ?هلا|اهلين|هلا|هاي|إ?زيك|ازيك|ازيكم|عامل ايه|اخبارك ايه|السلام عليكم|صباح الخير|مساء الخير|شكرا?|شكرًا|تسلم|متشكر|hi|hello|hey|thanks|thank you|how are you)[؟?!.\s]*$/iu.test(
      input.message.trim(),
    )
  )
    return null;
  const suffix = name
    ? conversationLocale(input) === 'ar'
      ? ` يا ${name}`
      : `, ${name}`
    : '';
  if (conversationLocale(input) === 'ar') {
    if (/شكر|تسلم|متشكر/u.test(input.message))
      return `العفو${suffix}! أنا معاك، محتاج مساعدة في إيه؟`;
    return `أهلًا${suffix}! إزيك؟ احكيلي محتاج إيه، أو اسألني عن شغلك في Lancelio.`;
  }
  if (/thank/iu.test(input.message))
    return `You're welcome${suffix}! What would you like help with?`;
  return `Hi${suffix}! How are you? Tell me what you need, or ask about your work in Lancelio.`;
}
