/**
 * Terminal Manager — opens native VS Code terminals connected to deployed
 * instances via SSH, and launches capix-code (the Capix CLI coding assistant)
 * pre-configured with the user's Capix endpoint + API key.
 *
 * Capix Code integration:
 *   When a user deploys an LLM (in the IDE or on the web), the auto-connect
 *   manager writes the base URL + API key to SecretStorage. This terminal
 *   manager reads those values and sets CAPIX_BASE_URL + CAPIX_API_KEY env
 *   vars before launching `capix-code` — so the CLI assistant is
 *   auto-configured with zero manual setup.
 *
 * SSH terminals:
 *   "Open Terminal" on any instance/agent/job in the tree opens a real VS
 *   Code integrated terminal running `ssh -p {port} root@{host}`.
 */

import * as vscode from "vscode";
import { Terminal, window } from "vscode";

interface SshTarget {
  host: string;
  port: number;
  user?: string;
  label: string;
}

export class TerminalManager {
  private terminals = new Map<string, Terminal>();

  /**
   * Launch capix-code (the Capix CLI coding assistant) in a new terminal,
   * pre-configured with the user's Capix endpoint + API key from
   * SecretStorage. If no endpoint is configured, launches with the global
   * gateway as the default.
   */
  async openCapixCode(capixBaseUrl: string, capixApiKey: string, capixModel?: string): Promise<void> {
    const env: Record<string, string> = {
      CAPIX_BASE_URL: capixBaseUrl,
      CAPIX_API_KEY: capixApiKey,
    };
    if (capixModel) env.CAPIX_MODEL = capixModel;

    const terminal = vscode.window.createTerminal({
      name: "Capix Code",
      env,
      iconPath: new vscode.ThemeIcon("comment-discussion"),
    });
    terminal.show();
    // Send the launch command after a brief delay (terminal needs to init).
    setTimeout(() => {
      terminal.sendText("capix-code");
    }, 500);
  }

  /** Open (or focus) an SSH terminal for a deployed instance. */
  openSshSession(target: SshTarget): void {
    const key = `${target.user || "root"}@${target.host}:${target.port}`;

    // Reuse an existing terminal if one is already open for this host.
    const existing = this.terminals.get(key);
    if (existing && existing.exitStatus === undefined) {
      existing.show();
      return;
    }

    const user = target.user || "root";
    const terminal = window.createTerminal({
      name: `SSH: ${target.label}`,
      shellPath: "ssh",
      shellArgs: [
        "-o", "StrictHostKeyChecking=accept-new",
        "-o", "UserKnownHostsFile=" + (process.env.CAPIX_SSH_KNOWN_HOSTS || "/dev/null"),
        "-o", "ConnectTimeout=10",
        "-o", "LogLevel=ERROR",
        "-p", String(target.port),
        `${user}@${target.host}`,
      ],
      iconPath: new vscode.ThemeIcon("terminal"),
    });

    this.terminals.set(key, terminal);
    terminal.show();

    // Clean up closed terminals from the map.
    window.onDidCloseTerminal((t) => {
      for (const [k, v] of this.terminals) {
        if (v === t) { this.terminals.delete(k); break; }
      }
    });
  }

  /** Open a remote exec terminal that runs a single command (read-only output). */
  async runRemoteCommand(target: SshTarget, command: string): Promise<void> {
    const terminal = window.createTerminal({
      name: `${target.label}: ${command.slice(0, 30)}`,
      shellPath: "ssh",
      shellArgs: [
        "-o", "StrictHostKeyChecking=accept-new",
        "-o", "UserKnownHostsFile=" + (process.env.CAPIX_SSH_KNOWN_HOSTS || "/dev/null"),
        "-o", "ConnectTimeout=10",
        "-o", "LogLevel=ERROR",
        "-p", String(target.port),
        `${target.user || "root"}@${target.host}`,
        command,
      ],
      iconPath: new vscode.ThemeIcon("terminal"),
    });
    terminal.show();
  }

  /** Close all managed terminals. */
  disposeAll(): void {
    for (const [, terminal] of this.terminals) {
      terminal.dispose();
    }
    this.terminals.clear();
  }
}
