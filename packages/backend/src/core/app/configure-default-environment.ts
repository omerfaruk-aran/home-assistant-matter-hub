import { Environment, VariableService } from "@matter/main";
import { LoggerService } from "./logger.js";
import { mdns } from "./mdns.js";
import type { Options } from "./options.js";
import { storage } from "./storage.js";

export function configureDefaultEnvironment(options: Options) {
  const env = Environment.default;
  env.runtime;
  new VariableService(env);

  // Prevent matter.js from registering its own SIGINT/SIGTERM handlers.
  // The HA Add-on lifecycle and our own error handlers manage shutdown;
  // matter.js signal handlers would conflict (e.g. double-shutdown, premature exit).
  env.vars.set("runtime.signals", false);
  env.vars.set("runtime.exitcode", false);

  env.set(LoggerService, new LoggerService(options.logging));

  mdns(env, options.mdns);
  storage(env, options.storage);
  return env;
}
