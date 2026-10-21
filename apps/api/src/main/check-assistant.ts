import {
  readEnvironment,
  assistantConfiguration,
  EnvironmentConfigurationError,
} from './config.js';
import { createAssistantInterpreter } from './create-assistant-interpreter.js';
import { AssistantProviderError } from '../modules/assistant/infrastructure/interpretation-contract.js';

try {
  const configuration = assistantConfiguration(readEnvironment(process.env));
  const interpreter = createAssistantInterpreter(configuration);
  if (!interpreter) {
    console.info('Assistant: guided mode. No external model configured.');
    if (process.argv.includes('--live')) process.exitCode = 1;
  } else if (!process.argv.includes('--live')) {
    console.info(
      `Assistant: ${configuration!.provider} / ${configuration!.model}. Configuration complete; connection not tested. Use --live for one synthetic question.`,
    );
  } else {
    const conversational = 'reply' in interpreter;
    if (conversational) {
      const turn = await interpreter.reply({
        question: 'What is Lancelio?',
        previousQuestions: [],
        conversation: [],
        firstName: '',
        locale: 'en',
      });
      if (
        turn.plan.intent !== 'help' ||
        turn.plan.topic !== 'product' ||
        !turn.message?.trim()
      )
        throw new Error('Unexpected assistant conversation');
    } else {
      const plan = await interpreter.interpret({
        message: 'What are my open projects?',
        history: [],
      });
      if (plan.intent !== 'projects' || plan.status !== 'open')
        throw new Error('Unexpected interpretation');
    }
    console.info(
      `Assistant: ${configuration!.provider} / ${configuration!.model}. Live connection and ${conversational ? 'single-request conversation' : 'structured interpretation'} passed.`,
    );
  }
} catch (error) {
  console.error(
    error instanceof EnvironmentConfigurationError
      ? error.message
      : error instanceof AssistantProviderError
        ? error.status === 401
          ? 'Assistant authentication rejected (HTTP 401). Copy the full key directly into the server environment and verify its provider access.'
          : `Assistant connection failed (HTTP ${error.status}). Check the provider key, model access and quota.`
        : error instanceof Error && error.name === 'TimeoutError'
          ? 'Assistant connection timed out. The provider did not finish within the configured deadline.'
          : error instanceof SyntaxError ||
              (error instanceof Error && error.name === 'ZodError')
            ? 'Assistant returned incomplete or invalid structured output. Connection check did not pass.'
            : 'Assistant check failed. Check server configuration, network access and model support.',
  );
  process.exitCode = 1;
}
