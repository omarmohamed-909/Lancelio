import { describe, it, expect, vi } from 'vitest';
import { AskAssistant } from '../src/modules/assistant/application/ask-assistant.js';
import type { AssistantReader } from '../src/modules/assistant/application/ask-assistant.js';
import { GuidedInterpreter } from '../src/modules/assistant/infrastructure/guided-interpreter.js';
import { OpenAIInterpreter } from '../src/modules/assistant/infrastructure/openai-interpreter.js';
import { readEnvironment } from '../src/main/config.js';
import { GeminiInterpreter } from '../src/modules/assistant/infrastructure/gemini-interpreter.js';
import { createAssistantInterpreter } from '../src/main/create-assistant-interpreter.js';

const guided = new GuidedInterpreter();
const scope = '111111111111111111111111';
const plan = {
  intent: 'projects',
  topic: 'navigation',
  status: 'open',
  query: '',
} as const;
function reader() {
  return {
    overview: vi.fn(async () => ({
      asOf: '2026-10-17T12:00:00.000Z',
      facts: { clients: 1, projects: 2, tasks: 3, finances: [] },
    })),
    projects: vi.fn(async () => ({ records: [], hasMore: false })),
    receivables: vi.fn(async () => ({ records: [], hasMore: false })),
    search: vi.fn(async () => ({ records: [], hasMore: false })),
  } satisfies AssistantReader;
}
describe('Guided assistant and trusted reads', () => {
  it.each([
    'كلمني ع المشروع بتاعنا',
    'كلمني عن المشروع بتاعنا',
    'اشرحلي المشروع',
    'ممكن تكلمني عن المشروع بتاعنا',
    'الموقع ده بيعمل ايه؟',
    'مميزات الموقع',
    'إيه هو Lancelio؟',
    'tell me about our project',
    'What is Lancelio?',
    'What does this platform do?',
    'Lancelio features',
  ])(
    'explains the product without reading client projects: %s',
    async (message) => {
      const reads = reader();
      const result = await new AskAssistant(reads, guided).execute(scope, {
        message,
        history: ['open projects'],
      });
      expect(result).toMatchObject({
        plan: { intent: 'help', topic: 'product', query: '' },
        records: [],
        facts: null,
        asOf: null,
      });
      for (const fn of Object.values(reads)) expect(fn).not.toHaveBeenCalled();
    },
  );
  it('keeps product follow-ups separate from workspace data and named searches', async () => {
    expect(
      await guided.interpret({
        message: 'وايه مميزاته؟',
        history: ['كلمني ع المشروع بتاعنا'],
      }),
    ).toMatchObject({ intent: 'help', topic: 'product' });
    expect(
      await guided.interpret({
        message: 'how does it work?',
        history: ['What is Lancelio?', 'who is it for?'],
      }),
    ).toMatchObject({ intent: 'help', topic: 'product' });
    for (const history of [
      [],
      ['open projects'],
      ['What is Lancelio?', 'unpaid invoices'],
    ])
      expect(
        (await guided.interpret({ message: 'وايه مميزاته؟', history })).intent,
      ).toBe('clarify');
    for (const message of ['ابحث عن Lancelio', 'find Lancelio'])
      expect(await guided.interpret({ message, history: [] })).toMatchObject({
        intent: 'search',
        query: 'Lancelio',
      });
    expect(
      await guided.interpret({ message: 'إزاي أعمل مشروع؟', history: [] }),
    ).toMatchObject({ intent: 'help', topic: 'projects' });
    expect(
      await guided.interpret({
        message: 'المشاريع المفتوحة',
        history: ['كلمني ع المشروع بتاعنا'],
      }),
    ).toMatchObject({ intent: 'projects', status: 'open' });
    expect(
      (await guided.interpret({ message: 'احذف المشروع بتاعنا', history: [] }))
        .intent,
    ).toBe('clarify');
  });
  it('serves reviewed product help for intelligent and degraded interpretation without data reads', async () => {
    const reads = reader();
    const interpret = vi
      .fn()
      .mockResolvedValueOnce({ ...plan, intent: 'help', topic: 'product' })
      .mockRejectedValueOnce(new Error('Provider unavailable'));
    const service = new AskAssistant(reads, guided, {
      provider: 'gemini',
      interpret,
    });
    for (const degraded of [false, true]) {
      const result = await service.execute(scope, {
        message: 'كلمني ع المشروع بتاعنا',
        history: [],
      });
      expect(result).toMatchObject({
        plan: { intent: 'help', topic: 'product' },
        degraded,
      });
    }
    for (const fn of Object.values(reads)) expect(fn).not.toHaveBeenCalled();
  });
  it.each([
    ['والمتوقفة؟', 'on_hold'],
    ['طب المكتملة؟', 'completed'],
    ['and on hold?', 'on_hold'],
    ['what about cancelled?', 'cancelled'],
    ['how about completed?', 'completed'],
    ['كلهم؟', 'all'],
  ])('resolves the short project follow-up %s', async (message, status) => {
    const result = await guided.interpret({
      message,
      history: ['open projects'],
    });
    expect(result).toMatchObject({ intent: 'projects', status });
  });
  it('keeps chained follow-ups but never crosses a topic change or a write request', async () => {
    expect(
      await guided.interpret({
        message: 'والمكتملة؟',
        history: ['مشاريع مفتوحة', 'والمتوقفة؟'],
      }),
    ).toMatchObject({ intent: 'projects', status: 'completed' });
    for (const history of [
      [],
      ['open projects', 'unpaid invoices'],
      ['How do I create a project?'],
      ['open projects', 'tell me a joke'],
    ]) {
      expect(
        (await guided.interpret({ message: 'and completed?', history })).intent,
      ).toBe('clarify');
    }
    expect(
      (
        await guided.interpret({
          message: 'delete completed projects',
          history: ['open projects'],
        })
      ).intent,
    ).toBe('clarify');
  });
  it.each([
    ['إزاي أعمل فاتورة؟', 'help', 'invoices'],
    ['How do I create an invoice?', 'help', 'invoices'],
    ['إيه المشاريع المفتوحة؟', 'projects', 'navigation'],
    ['What are my open projects?', 'projects', 'navigation'],
    ['مين العملاء اللي عليهم مستحقات؟', 'receivables', 'navigation'],
    ['Which clients have outstanding payments?', 'receivables', 'navigation'],
    ['ملخص شغلي', 'overview', 'navigation'],
    ['My work summary', 'overview', 'navigation'],
    ['ابحث عن INV-١٢٣', 'search', 'navigation'],
    ['find Alex', 'search', 'navigation'],
    ['احذف كل المشاريع', 'clarify', 'navigation'],
    ['delete all projects', 'clarify', 'navigation'],
    ['Tell me a joke', 'clarify', 'navigation'],
    ['How do I delete a project?', 'clarify', 'navigation'],
    ['إزاي أحذف عميل؟', 'clarify', 'navigation'],
    ['الفواتير المدفوعة', 'clarify', 'navigation'],
  ])('interprets %s as %s', async (message, intent, topic) => {
    const result = await guided.interpret({ message, history: [] });
    expect(result.intent).toBe(intent);
    expect(result.topic).toBe(topic);
  });
  it('passes only the authenticated workspace to the selected reader', async () => {
    const reads = reader();
    const answer = await new AskAssistant(reads, guided).execute(scope, {
      message: 'مشاريع مفتوحة',
      history: [],
    });
    expect(answer.engine).toBe('guided');
    expect(reads.projects).toHaveBeenCalledExactlyOnceWith(scope, 'open');
    expect(reads.receivables).not.toHaveBeenCalled();
    expect(reads.overview).not.toHaveBeenCalled();
    expect(reads.search).not.toHaveBeenCalled();
  });
  it.each([
    ['active projects', 'active'],
    ['المشاريع الشغالة', 'active'],
    ['projects on hold', 'on_hold'],
    ['completed projects', 'completed'],
    ['cancelled projects', 'cancelled'],
    ['all projects', 'all'],
  ])('keeps the explicit project status for %s', async (message, status) => {
    expect((await guided.interpret({ message, history: [] })).status).toBe(
      status,
    );
  });
  it('does not read records for help or unknown requests', async () => {
    const reads = reader();
    const service = new AskAssistant(reads, guided);
    await service.execute(scope, { message: 'إزاي أعمل فاتورة؟', history: [] });
    await service.execute(scope, { message: 'delete projects', history: [] });
    for (const fn of Object.values(reads)) expect(fn).not.toHaveBeenCalled();
  });
  it('fails invalid input before interpretation or reading, including scope overrides', async () => {
    const interpret = vi.fn(async () => plan),
      reads = reader();
    const service = new AskAssistant(reads, { interpret });
    await expect(
      service.execute('foreign', { message: 'hello', history: [] }),
    ).rejects.toThrow();
    for (const input of [
      { message: '', history: [] },
      { message: 'a'.repeat(1001), history: [] },
      { message: '\u0000text', history: [] },
      { message: 'hello', history: Array(7).fill('hello') as string[] },
    ])
      await expect(service.execute(scope, input)).rejects.toThrow();
    expect(interpret).not.toHaveBeenCalled();
  });
  it('validates intelligent output and honestly degrades on provider errors without inventing data', async () => {
    const reads = reader();
    const interpret = vi
      .fn()
      .mockRejectedValueOnce(new Error('Private provider error'))
      .mockResolvedValueOnce({ ...plan, query: '', workspace: 'foreign' });
    const service = new AskAssistant(reads, guided, { interpret });
    for (let i = 0; i < 2; i++) {
      const result = await service.execute(scope, {
        message: 'My work summary',
        history: [],
      });
      expect(result).toMatchObject({
        engine: 'guided',
        degraded: true,
        facts: { clients: 1, projects: 2, tasks: 3 },
      });
      expect(JSON.stringify(result)).not.toContain('Private');
    }
    expect(reads.overview).toHaveBeenCalledTimes(2);
  });
  it('uses validated intelligent plans and never treats provider output as data', async () => {
    const reads = reader();
    const service = new AskAssistant(reads, guided, {
      interpret: async () => plan,
    });
    expect(
      await service.execute(scope, {
        message: 'show ongoing assignments',
        history: [],
      }),
    ).toMatchObject({ engine: 'openai', degraded: false, records: [] });
    expect(reads.projects).toHaveBeenCalledExactlyOnceWith(scope, 'open');
  });
  it('does not turn a database failure into a successful empty answer', async () => {
    const reads = reader();
    reads.projects.mockRejectedValueOnce(new Error('Database unavailable'));
    await expect(
      new AskAssistant(reads, guided).execute(scope, {
        message: 'open projects',
        history: [],
      }),
    ).rejects.toThrow('Database unavailable');
  });
});

describe('Gemini interpreter adapter', () => {
  it.each(['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'])(
    'uses minimal thinking for lightweight classifier %s',
    async (model) => {
      const transport = vi.fn<typeof fetch>(
        async () =>
          new Response(
            JSON.stringify({
              status: 'completed',
              steps: [
                {
                  type: 'model_output',
                  content: [{ type: 'text', text: JSON.stringify(plan) }],
                },
              ],
            }),
          ),
      );
      await new GeminiInterpreter('test-key', model, transport).interpret({
        message: 'projects',
        history: [],
      });
      expect(
        JSON.parse(String(transport.mock.calls[0]![1]?.body)).generation_config
          .thinking_level,
      ).toBe('minimal');
    },
  );
  const completed = (text: string = JSON.stringify(plan)) => ({
    status: 'completed',
    steps: [
      {
        type: 'user_input',
        content: [{ type: 'text', text: 'untrusted input' }],
      },
      { type: 'model_output', content: [{ type: 'text', text }] },
    ],
  });
  it('authenticates only to the official endpoint and requests a stateless structured plan', async () => {
    const transport = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify(completed())),
    );
    const interpreter = new GeminiInterpreter(
      'private-test-key',
      'configured-model',
      transport,
    );
    expect(
      await interpreter.interpret({
        message: 'show projects',
        history: ['my work'],
      }),
    ).toEqual(plan);
    const [url, init] = transport.mock.calls[0]!;
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/interactions',
    );
    expect(init?.headers).toMatchObject({
      'x-goog-api-key': 'private-test-key',
    });
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      model: 'configured-model',
      store: false,
      stream: false,
      generation_config: { max_output_tokens: 800, thinking_level: 'low' },
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: { additionalProperties: false },
      },
    });
    expect(JSON.parse(body.input)).toEqual({
      previousQuestions: ['my work'],
      question: 'show projects',
    });
    expect(body.tools).toBeUndefined();
    expect(body.previous_interaction_id).toBeUndefined();
    expect(String(init?.body)).not.toContain('private-test-key');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
  it.each([
    { status: 'incomplete', steps: [] },
    {
      status: 'completed',
      steps: [{ type: 'model_output', content: [{ type: 'refusal' }] }],
    },
    completed('invalid json'),
    completed(JSON.stringify({ ...plan, workspace: scope })),
    completed(JSON.stringify({ ...plan, intent: 'delete' })),
    completed(JSON.stringify({ ...plan, query: '\u0000secret' })),
  ])('rejects incomplete, refused and invalid plans', async (body) => {
    await expect(
      new GeminiInterpreter(
        'test-key',
        'model',
        async () => new Response(JSON.stringify(body)),
      ).interpret({ message: 'projects', history: [] }),
    ).rejects.toThrow();
  });
  it('propagates cancellation, rejects oversized responses and hides provider error bodies', async () => {
    const controller = new AbortController();
    controller.abort();
    const transport = vi.fn<typeof fetch>(async (_url, init) => {
      init?.signal?.throwIfAborted();
      return new Response(JSON.stringify(completed()));
    });
    await expect(
      new GeminiInterpreter('test', 'model', transport).interpret(
        { message: 'projects', history: [] },
        controller.signal,
      ),
    ).rejects.toThrow();
    await expect(
      new GeminiInterpreter(
        'test',
        'model',
        async () => new Response('private-provider-details', { status: 401 }),
      ).interpret({ message: 'projects', history: [] }),
    ).rejects.toThrow('Assistant interpreter unavailable');
    for (const response of [
      new Response('x'.repeat(64001)),
      new Response('{}', { headers: { 'content-length': '64001' } }),
    ]) {
      await expect(
        new GeminiInterpreter('test', 'model', async () => response).interpret({
          message: 'projects',
          history: [],
        }),
      ).rejects.toThrow('Oversized');
    }
  });
  it('reports Gemini mode and scopes its validated plan to the authenticated workspace', async () => {
    const reads = reader();
    const service = new AskAssistant(
      reads,
      guided,
      new GeminiInterpreter(
        'test',
        'model',
        async () =>
          new Response(
            JSON.stringify(completed(JSON.stringify({ plan, message: null }))),
          ),
      ),
    );
    expect(service.mode).toBe('gemini');
    expect(
      await service.execute(scope, {
        message: 'show ongoing work',
        history: [],
      }),
    ).toMatchObject({ engine: 'gemini', degraded: false });
    expect(reads.projects).toHaveBeenCalledExactlyOnceWith(scope, 'open');
    const failing = new AskAssistant(
      reads,
      guided,
      new GeminiInterpreter(
        'test',
        'model',
        async () => new Response('private', { status: 401 }),
      ),
    );
    expect(
      await failing.execute(scope, { message: 'ملخص شغلي', history: [] }),
    ).toMatchObject({ engine: 'guided', degraded: true });
  });
  it('requires Gemini key and model only when selected, and composes the selected adapter', () => {
    const environment = {
      MONGODB_URI: 'mongodb://localhost/test',
      JWT_ACCESS_SECRET: 'test-secret-that-is-at-least-32-characters',
      ASSISTANT_PROVIDER: 'gemini',
    };
    expect(() => readEnvironment(environment)).toThrow('GEMINI_API_KEY');
    expect(() =>
      readEnvironment({ ...environment, GEMINI_API_KEY: 'private-key' }),
    ).toThrow('GEMINI_MODEL');
    expect(
      readEnvironment({
        ...environment,
        GEMINI_API_KEY: 'private-key',
        GEMINI_MODEL: 'configured-model',
      }).ASSISTANT_PROVIDER,
    ).toBe('gemini');
    expect(
      createAssistantInterpreter({
        provider: 'gemini',
        apiKey: 'test',
        model: 'model',
      }),
    ).toBeInstanceOf(GeminiInterpreter);
    expect(
      createAssistantInterpreter({ apiKey: 'test', model: 'model' }),
    ).toBeInstanceOf(OpenAIInterpreter);
    expect(createAssistantInterpreter(null)).toBeNull();
  });
});
describe('OpenAI interpreter adapter', () => {
  it('uses the official Responses API, bounded question-only input, strict schema and no response storage', async () => {
    const transport = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            status: 'completed',
            output: [
              { type: 'reasoning' },
              {
                type: 'message',
                content: [{ type: 'output_text', text: JSON.stringify(plan) }],
              },
            ],
          }),
        ),
    );
    const result = await new OpenAIInterpreter(
      'test-key',
      'configured-model',
      transport,
    ).interpret({
      message: 'show ongoing assignments',
      history: ['what can you do?'],
    });
    expect(result).toEqual(plan);
    const [url, init] = transport.mock.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/responses');
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      store: false,
      model: 'configured-model',
      max_output_tokens: 800,
      text: {
        format: {
          type: 'json_schema',
          strict: true,
          schema: { additionalProperties: false },
        },
      },
    });
    expect(body.tools).toBeUndefined();
    expect(JSON.parse(body.input[0].content)).toEqual({
      previousQuestions: ['what can you do?'],
      question: 'show ongoing assignments',
    });
  });
  it.each([
    { status: 'incomplete', output: [] },
    {
      status: 'completed',
      output: [
        { type: 'message', content: [{ type: 'refusal', refusal: 'No' }] },
      ],
    },
    {
      status: 'completed',
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: JSON.stringify({ ...plan, intent: 'delete' }),
            },
          ],
        },
      ],
    },
    {
      status: 'completed',
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: 'invalid json' }],
        },
      ],
    },
  ])('rejects incomplete, refused or invalid replies', async (body) => {
    await expect(
      new OpenAIInterpreter(
        'test',
        'model',
        async () => new Response(JSON.stringify(body)),
      ).interpret({ message: 'question', history: [] }),
    ).rejects.toThrow();
  });
  it('never exposes provider error details', async () => {
    await expect(
      new OpenAIInterpreter(
        'test',
        'model',
        async () => new Response('PRIVATE KEY DETAILS', { status: 401 }),
      ).interpret({ message: 'question', history: [] }),
    ).rejects.toThrow('Assistant interpreter unavailable');
  });
  it('requires explicit provider activation and complete server configuration without leaking values', () => {
    const environment = {
      MONGODB_URI: 'mongodb://localhost/test',
      JWT_ACCESS_SECRET: 'test-secret-that-is-at-least-32-characters',
    };
    expect(readEnvironment(environment).ASSISTANT_PROVIDER).toBe('guided');
    expect(() =>
      readEnvironment({
        ...environment,
        ASSISTANT_PROVIDER: 'openai',
        OPENAI_API_KEY: 'private-test-key',
      }),
    ).toThrow('OPENAI_MODEL');
    expect(() =>
      readEnvironment({ ...environment, ASSISTANT_PROVIDER: 'openai' }),
    ).toThrow('OPENAI_API_KEY');
    expect(
      readEnvironment({
        ...environment,
        ASSISTANT_PROVIDER: 'openai',
        OPENAI_API_KEY: 'test-key',
        OPENAI_MODEL: 'configured-model',
      }).ASSISTANT_PROVIDER,
    ).toBe('openai');
  });
});
