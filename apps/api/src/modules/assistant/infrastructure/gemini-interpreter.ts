import { z } from 'zod';
import type { AssistantInterpreter } from '../application/ask-assistant.js';
import type {
  AssistantInput,
  AssistantPlan,
  AssistantConversationInput,
  AssistantTurn,
  AssistantTurnInput,
} from '../domain/assistant.js';
import {
  isAssistantPlan,
  isAssistantMessage,
  isAssistantTurn,
} from '../domain/assistant.js';
import {
  AssistantProviderError,
  interpretationInstructions,
  interpretationSchema,
  conversationInstructions,
  conversationSchema,
  turnInstructions,
  turnSchema,
} from './interpretation-contract.js';

export class GeminiInterpreter implements AssistantInterpreter {
  readonly provider = 'gemini' as const;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly transport: typeof fetch = fetch,
  ) {}

  async reply(
    input: AssistantTurnInput,
    signal?: AbortSignal,
  ): Promise<AssistantTurn> {
    const result = await this.request(
      turnInstructions,
      turnSchema,
      input,
      signal,
      1200,
    );
    if (!isAssistantTurn(result)) throw new Error('Invalid assistant turn');
    return result;
  }

  async interpret(
    input: AssistantInput,
    signal?: AbortSignal,
  ): Promise<AssistantPlan> {
    const plan = await this.request(
      interpretationInstructions,
      interpretationSchema,
      {
        previousQuestions: input.history,
        question: input.message,
        ...(input.conversation?.length
          ? { conversation: input.conversation }
          : {}),
      },
      signal,
    );
    if (!isAssistantPlan(plan))
      throw new Error('Invalid assistant interpretation');
    return plan;
  }

  async respond(
    input: AssistantConversationInput,
    signal?: AbortSignal,
  ): Promise<string> {
    const reply = await this.request(
      conversationInstructions,
      conversationSchema,
      input,
      signal,
    );
    if (
      !reply ||
      typeof reply !== 'object' ||
      !isAssistantMessage((reply as Record<string, unknown>).message)
    )
      throw new Error('Invalid assistant reply');
    return (reply as { message: string }).message;
  }

  private async request(
    instructions: string,
    schema: object,
    input: object,
    signal?: AbortSignal,
    maxOutputTokens = 800,
  ): Promise<unknown> {
    const timeout = AbortSignal.timeout(15000);
    const response = await this.transport(
      'https://generativelanguage.googleapis.com/v1beta/interactions',
      {
        method: 'POST',
        signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
        headers: {
          'x-goog-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          store: false,
          stream: false,
          system_instruction: instructions,
          input: JSON.stringify(input),
          generation_config: {
            max_output_tokens: maxOutputTokens,
            thinking_level:
              this.model === 'gemini-3.1-flash-lite' ||
              this.model === 'gemini-3.5-flash-lite'
                ? 'minimal'
                : 'low',
          },
          response_format: {
            type: 'text',
            mime_type: 'application/json',
            schema,
          },
        }),
      },
    );
    if (!response.ok) throw new AssistantProviderError(response.status);
    if (Number(response.headers.get('content-length')) > 64000)
      throw new Error('Oversized assistant response');
    const raw = await response.text();
    if (raw.length > 64000) throw new Error('Oversized assistant response');
    const parsed = z
      .object({
        status: z.literal('completed'),
        steps: z.array(
          z.object({
            type: z.string(),
            content: z
              .array(
                z.object({ type: z.string(), text: z.string().optional() }),
              )
              .optional(),
          }),
        ),
      })
      .parse(JSON.parse(raw));
    const output = parsed.steps
      .filter((step) => step.type === 'model_output')
      .flatMap((step) => step.content ?? [])
      .filter((part) => part.type === 'text')
      .map((part) => part.text ?? '')
      .join('');
    return JSON.parse(output) as unknown;
  }
}
