/**
 * Terminal Manager — opens native VS Code terminals connected to deployed
 * instances via SSH.
 *
 * When a user clicks "Open Terminal" on any instance/agent/job in the tree,
 * we open a real VS Code integrated terminal running `ssh -p {port} root@{host}`
 * — the same command they'd type manually, but pre-configured with the
 * instance's SSH details.
 *
 * The terminal is persistent in the VS Code session — the user can open
 * multiple terminals for different instances and run commands freely.
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

  /** Close all managed SSH terminals. */
  disposeAll(): void {
    for (const [, terminal] of this.terminals) {
      terminal.dispose();
    }
    this.terminals.clear();
  }
}
