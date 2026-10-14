export function parseStaticServerOptions(args) {
  let port = 3500;
  let portSeen = false;
  let help = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg !== '--port' && !arg.startsWith('--port=')) throw new StaticServerOptionError('cli.unsupportedArgument', { argument: arg });
    if (portSeen) throw new StaticServerOptionError('cli.duplicatePort');
    portSeen = true;
    const value = arg === '--port' ? args[++index] : arg.slice('--port='.length);
    if (typeof value !== 'string' || !/^[0-9]+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > 65535) {
      throw new StaticServerOptionError('cli.invalidPort');
    }
    port = Number(value);
  }
  return { port, help };
}
import { createCliTranslation } from './cli-locale.mjs';

export class StaticServerOptionError extends Error {
  constructor(messageKey, messageParams) {
    super(createCliTranslation('zh-CN')(messageKey, messageParams));
    this.messageKey = messageKey; this.messageParams = messageParams;
  }
}

export const STATIC_SERVER_HELP = createCliTranslation()('cli.help');
