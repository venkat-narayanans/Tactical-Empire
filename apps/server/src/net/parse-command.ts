import type { CommandType, ParsedCommand } from '@te/shared';
import { commandSchemas, ruleError } from '@te/shared';

/**
 * Wire validation. Anything that is not a known command with a schema-valid
 * payload is rejected here, before it can reach the game engine.
 */
export function parseCommand(
  type: string,
  requestId: string,
  payload: unknown,
): ParsedCommand {
  const schema = (commandSchemas as Record<string, (typeof commandSchemas)[CommandType]>)[type];
  if (!schema) {
    throw ruleError('UNKNOWN_COMMAND', `Unknown command: ${type}`);
  }
  const result = schema.safeParse(payload ?? {});
  if (!result.success) {
    const first = result.error.issues[0];
    throw ruleError('INVALID_MESSAGE', first?.message ?? 'That request was not valid.');
  }
  return {
    type: type as CommandType,
    requestId,
    payload: result.data,
  } as ParsedCommand;
}
