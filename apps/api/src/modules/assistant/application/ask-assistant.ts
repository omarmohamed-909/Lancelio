import { ApplicationError } from '../../../shared/domain/application-error.js';
import { validateId } from '../../../shared/domain/identifiers.js';
import { isAssistantPlan, isAssistantMessage } from '../domain/assistant.js';
import {
  conversationLocale,
  firstName,
  guidedGreeting,
} from '../domain/conversation.js';
import type {
  AssistantInput,
  AssistantPlan,
  AssistantResult,
  AssistantRecord,
  AssistantFacts,
  AssistantConversationInput,
} from '../domain/assistant.js';

export interface AssistantInterpreter {
  readonly provider?: 'openai' | 'gemini';
  interpret(
    input: AssistantInput,
    signal?: AbortSignal,
  ): Promise<AssistantPlan>;
  respond?(
    input: AssistantConversationInput,
    signal?: AbortSignal,
  ): Promise<string>;
}
export interface AssistantReader {
  overview(scope: string): Promise<{ asOf: string; facts: AssistantFacts }>;
  projects(
    scope: string,
    status: AssistantPlan['status'],
  ): Promise<{ records: AssistantRecord[]; hasMore: boolean }>;
  receivables(
    scope: string,
  ): Promise<{ records: AssistantRecord[]; hasMore: boolean }>;
  search(
    scope: string,
    query: string,
  ): Promise<{ records: AssistantRecord[]; hasMore: boolean }>;
}
export class AskAssistant {
  constructor(
    private readonly reader: AssistantReader,
    private readonly guided: AssistantInterpreter,
    private readonly intelligent: AssistantInterpreter | null = null,
    private readonly now: () => Date = () => new Date(),
  ) {}
  get mode() {
    return this.intelligent
      ? (this.intelligent.provider ?? 'openai')
      : ('guided' as const);
  }
  async execute(
    workspace: string,
    input: AssistantInput,
    signal?: AbortSignal,
    actor?: { displayName: string },
  ): Promise<AssistantResult> {
    const scope = validateId(workspace);
    if (
      !input.message.trim() ||
      input.message.length > 1000 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(input.message) ||
      input.history.length > 6 ||
      input.history.some((m) => !m.trim() || m.length > 1000) ||
      (input.locale !== undefined && !['ar', 'en'].includes(input.locale)) ||
      (input.conversation?.length ?? 0) > 6 ||
      input.conversation?.some(
        (turn) =>
          !turn.question.trim() ||
          turn.question.length > 1000 ||
          !turn.answer.trim() ||
          turn.answer.length > 2000 ||
          /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(
            turn.question + turn.answer,
          ),
      )
    )
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'Invalid assistant question',
      );
    let engine: AssistantResult['engine'] = 'guided',
      degraded = false;
    let plan: AssistantPlan;
    if (this.intelligent) {
      try {
        plan = await this.intelligent.interpret(input, signal);
        if (!isAssistantPlan(plan)) throw new Error('Invalid interpretation');
        engine = this.intelligent.provider ?? 'openai';
      } catch (error) {
        if (signal?.aborted) throw error;
        degraded = true;
        plan = await this.guided.interpret(input, signal);
      }
    } else plan = await this.guided.interpret(input, signal);
    if (!isAssistantPlan(plan)) throw new Error('Invalid assistant plan');
    if (signal?.aborted) throw new Error('Assistant request cancelled');
    const name = firstName(actor?.displayName ?? '');
    let message = plan.intent === 'chat' ? guidedGreeting(input, name) : null;
    if (
      !degraded &&
      this.intelligent?.respond &&
      ['chat', 'help', 'clarify'].includes(plan.intent)
    ) {
      try {
        const generated = await this.intelligent.respond(
          {
            question: input.message,
            previousQuestions: input.history,
            conversation: input.conversation ?? [],
            firstName: name,
            locale: conversationLocale(input),
            plan,
          },
          signal,
        );
        if (!isAssistantMessage(generated))
          throw new Error('Invalid assistant message');
        message = generated.trim();
      } catch (error) {
        if (signal?.aborted) throw error;
        degraded = true;
        engine = 'guided';
      }
    }
    if (signal?.aborted) throw new Error('Assistant request cancelled');
    const result: AssistantResult = {
      message,
      plan,
      engine,
      degraded,
      asOf: null,
      records: [],
      hasMore: false,
      facts: null,
    };
    switch (plan.intent) {
      case 'overview': {
        const overview = await this.reader.overview(scope);
        return { ...result, ...overview };
      }
      case 'projects':
        return {
          ...result,
          ...(await this.reader.projects(scope, plan.status)),
          asOf: this.now().toISOString(),
        };
      case 'receivables':
        return {
          ...result,
          ...(await this.reader.receivables(scope)),
          asOf: this.now().toISOString(),
        };
      case 'search':
        return {
          ...result,
          ...(await this.reader.search(scope, plan.query.trim())),
          asOf: this.now().toISOString(),
        };
      default:
        return result;
    }
  }
}
