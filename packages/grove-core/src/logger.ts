/**
 * Grove Logger Module
 *
 * Centralized logging for all Grove components.
 * Provides a shared LogOutputChannel for general logging
 * and a shared OutputChannel for test results.
 */

import * as vscode from "vscode";

let _logChannel: vscode.LogOutputChannel | undefined;
let _testChannel: vscode.OutputChannel | undefined;

/**
 * Initialize the logging channels. Call once during extension activation.
 */
export function initLogger(context: vscode.ExtensionContext): void {
  _logChannel = vscode.window.createOutputChannel("Grove", { log: true });
  context.subscriptions.push(_logChannel);

  _testChannel = vscode.window.createOutputChannel("Grove Tests");
  context.subscriptions.push(_testChannel);
}

/**
 * The shared Grove log output channel.
 * Use log.info(), log.warn(), log.error(), log.debug().
 */
export function getLogChannel(): vscode.LogOutputChannel {
  if (!_logChannel) {
    throw new Error("Logger not initialized. Call initLogger() first.");
  }
  return _logChannel;
}

/**
 * Check if the logger has been initialized.
 * Useful for optional logging in code that may run before activation or in tests.
 */
export function isLoggerInitialized(): boolean {
  return _logChannel !== undefined;
}

/**
 * The shared "Grove Tests" output channel for test results.
 */
export function getTestOutputChannel(): vscode.OutputChannel {
  if (!_testChannel) {
    throw new Error("Logger not initialized. Call initLogger() first.");
  }
  return _testChannel;
}
