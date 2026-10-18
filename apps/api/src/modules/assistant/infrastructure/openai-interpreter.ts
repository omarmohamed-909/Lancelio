import { z } from 'zod';
import { isAssistantPlan, isAssistantMessage } from '../domain/assistant.js';
import type {
  AssistantInput,
  AssistantPlan,
  AssistantConversationInput,
} from '../domain/assistant.js';
import type { AssistantInterpreter } from '../application/ask-assistant.js';

import {
  AssistantProviderError,
  interpretationInstructions,
  interpretationSchema,
  conversationInstructions,
  conversationSchema,
} from './interpretation-contract.js';

export class OpenAIInterpreter implements AssistantInterpreter {
  readonly provider = 'openai' as const;
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly transport: typeof fetch = fetch,
  ) {}
  async interpret(
    input: AssistantInput,
    signal?: AbortSignal,
  ): Promise<AssistantPlan> {
    const plan = await this.request(
      interpretationInstructions,
      interpretationSchema,
      'lancelio_question',
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
      'lancelio_reply',
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
    name: string,
    input: object,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const timeout = AbortSignal.timeout(8000);
    const response = await this.transport(
      'https://api.openai.com/v1/responses',
      {
        method: 'POST',
        signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          store: false,
          max_output_tokens: 800,
          instructions,
          input: [
            {
              role: 'user',
              content: JSON.stringify(input),
            },
          ],
          text: {
            format: {
              type: 'json_schema',
              name,
              strict: true,
              schema,
            },
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
        output: z.array(
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
    const output = parsed.output
      .filter((item) => item.type === 'message')
      .flatMap((item) => item.content ?? [])
      .filter((item) => item.type === 'output_text')
      .map((item) => item.text ?? '')
      .join('');
    return JSON.parse(output) as unknown;
  }
}
