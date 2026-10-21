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

export function unavailableConversation(
  input: AssistantInput,
  configured: boolean,
  failure?: unknown,
): string {
  const rateLimited =
    typeof failure === 'object' &&
    failure !== null &&
    'status' in failure &&
    failure.status === 429;
  if (conversationLocale(input) === 'ar') {
    if (!configured)
      return 'الدردشة الذكية مش مفعّلة حاليًا، فمش هقدر أجاوب السؤال ده بإجابة عامة. أقدر أساعدك بإرشادات الموقع والاستعلامات المحددة عن شغلك.';
    return rateLimited
      ? 'وصلنا لحدّ طلبات خدمة الذكاء الاصطناعي مؤقتًا، فمش قادر أكمل الرد على سؤالك دلوقتي. جرّب مرة تانية بعد شوية.'
      : 'مش قادر أوصل لخدمة الذكاء الاصطناعي دلوقتي، فمش هقدر أكمّل الرد على سؤالك. جرّب مرة تانية بعد شوية.';
  }
  if (!configured)
    return 'AI conversation is not enabled right now, so I cannot answer this as a general question. Reviewed product guidance and specific workspace lookups are still available.';
  return rateLimited
    ? 'The AI service has temporarily reached its request limit, so I cannot finish answering your question right now. Please try again later.'
    : 'I cannot reach the AI service right now, so I cannot finish answering your question. Please try again later.';
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
