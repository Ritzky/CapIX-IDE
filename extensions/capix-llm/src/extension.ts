/**
 * Capix LLM Extension — entry point.
 *
 * Registers three sidebar tree views (deploys, catalog, hosted) and all
 * commands: deploy, deploy custom, destroy, stop, start, view logs, exec,
 * copy endpoint, copy API key, connect wallet, refresh, open console.
 *
 * The extension talks to capix.network /api/llm/* using the session token
 * from Settings. No local server needed — it's a thin API client.
 */

import * as vscode from "vscode";
import { CapixClient } from "./apiClient";
import { DeploysTreeProvider, CatalogTreeProvider, HostedTreeProvider } from "./treeViews";
import { ProfileViewProvider } from "./profileView";
import type { CatalogModel } from "./types";

let client: CapixClient;
let deploysProvider: DeploysTreeProvider;
let catalogProvider: CatalogTreeProvider;
let hostedProvider: HostedTreeProvider;
let profileProvider: ProfileViewProvider;
let refreshTimer: vscode.Disposable | null = null;

export function activate(context: vscode.ExtensionContext) {
  client = new CapixClient();

  // ── Tree views ────────────────────────────────────────────────────────
  deploysProvider = new DeploysTreeProvider(client);
  catalogProvider = new CatalogTreeProvider(client);
  hostedProvider = new HostedTreeProvider(client);
  profileProvider = new ProfileViewProvider(client, context.extensionUri);

  const deploysView = vscode.window.createTreeView("capix.llm.deploys", { treeDataProvider: deploysProvider });
  const catalogView = vscode.window.createTreeView("capix.llm.catalog", { treeDataProvider: catalogProvider });
  const hostedView = vscode.window.createTreeView("capix.llm.hosted", { treeDataProvider: hostedProvider });

  context.subscriptions.push(deploysView, catalogView, hostedView);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("capix.llm.profile", profileProvider),
  );

  // ── Auto-refresh ───────────────────────────────────────────────────────
  setupAutoRefresh(context);

  // Initial load
  refreshAll();

  // ── Commands ──────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand("capix.deployModel", (model?: CatalogModel) => cmdDeployModel(model)),
    vscode.commands.registerCommand("capix.deployCustomModel", () => cmdDeployCustomModel()),
    vscode.commands.registerCommand("capix.destroyDeploy", (item?: unknown) => cmdDestroyDeploy(item)),
    vscode.commands.registerCommand("capix.stopDeploy", (item?: unknown) => cmdStopDeploy(item)),
    vscode.commands.registerCommand("capix.startDeploy", (item?: unknown) => cmdStartDeploy(item)),
    vscode.commands.registerCommand("capix.viewLogs", (item?: unknown) => cmdViewLogs(item)),
    vscode.commands.registerCommand("capix.execOnInstance", (item?: unknown) => cmdExecOnInstance(item)),
    vscode.commands.registerCommand("capix.copyEndpoint", (item?: unknown) => cmdCopyEndpoint(item)),
    vscode.commands.registerCommand("capix.copyApiKey", (item?: unknown) => cmdCopyApiKey(item)),
    vscode.commands.registerCommand("capix.refreshDeploys", () => { deploysProvider.load(); }),
    vscode.commands.registerCommand("capix.refreshCatalog", () => { catalogProvider.load(); }),
    vscode.commands.registerCommand("capix.openConsole", () => {
      vscode.env.openExternal(vscode.Uri.parse(`${client.getBaseUrl()}/cloud/llm`));
    }),
    vscode.commands.registerCommand("capix.connectWallet", () => cmdConnectWallet()),
    vscode.commands.registerCommand("capix.topUp", () => cmdTopUp()),
    vscode.commands.registerCommand("capix.openBilling", () => {
      vscode.env.openExternal(vscode.Uri.parse(`${client.getBaseUrl()}/cloud/billing`));
    }),
    vscode.commands.registerCommand("capix.refreshProfile", () => { profileProvider.refresh(); }),
  );
}

export function deactivate() {
  refreshTimer?.dispose();
}

// ── Helpers ───────────────────────────────────────────────────────────────
function refreshAll() {
  deploysProvider.load();
  catalogProvider.load();
  hostedProvider.load();
  profileProvider.refresh();
}

function setupAutoRefresh(context: vscode.ExtensionContext) {
  refreshTimer?.dispose();

  const checkConfig = () => {
    const interval = vscode.workspace.getConfiguration("capix").get<number>("autoRefreshSeconds") || 30;
    if (interval <= 0) { refreshTimer = null; return; }

    const handle = setInterval(() => {
      deploysProvider.load();
      hostedProvider.load();
      profileProvider.refresh();
    }, interval * 1000);
    refreshTimer = new vscode.Disposable(() => clearInterval(handle));
  };

  checkConfig();
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("capix.autoRefreshSeconds")) checkConfig();
  }));
}

function checkConfigured(): boolean {
  if (!client.isConfigured) {
    vscode.window.showWarningMessage(
      "Capix LLM: Not connected. Set your session token in Settings to deploy and manage LLMs.",
      "Connect now",
    ).then((action) => {
      if (action === "Connect now") vscode.commands.executeCommand("capix.connectWallet");
    });
    return false;
  }
  return true;
}

// Get the deploy data from a tree item (arg) or prompt the user to pick.
function getDeployFromItem(item: unknown): { instanceId: number; modelLabel: string; instanceRecordId: string } | null {
  const deploy = (item as { _deploy?: { instanceId: number; modelLabel: string; instanceRecordId: string } })?._deploy;
  if (deploy && deploy.instanceId > 0) return deploy;
  // If no item or destroyed, prompt to pick from deploys list
  const deploys = deploysProvider.deploys.filter((d) => d.instanceId > 0);
  if (deploys.length === 0) {
    vscode.window.showInformationMessage("No active deploys.");
    return null;
  }
  const pick = vscode.window.showQuickPick(
    deploys.map((d) => ({ label: d.modelLabel, description: `${d.state} · ${d.location}`, instanceId: d.instanceId, modelLabel: d.modelLabel, instanceRecordId: d.instanceRecordId })),
    { placeHolder: "Select a deploy" },
  );
  return pick.then((p) => p || null) as unknown as { instanceId: number; modelLabel: string; instanceRecordId: string } | null;
}

// ── Commands ──────────────────────────────────────────────────────────────

// Deploy a model: model → region → GPU offer → duration → confirm
async function cmdDeployModel(model?: CatalogModel) {
  if (!checkConfigured()) return;

  // Pick model if not passed from the catalog click
  if (!model) {
    const catalog = await client.getCatalog();
    if (!catalog.ok || !catalog.models?.length) {
      vscode.window.showErrorMessage("Failed to load model catalog.");
      return;
    }
    const picked = await vscode.window.showQuickPick(
      catalog.models.map((m) => ({ label: m.label, description: `${m.paramB}B · ${m.minVramGb}GB VRAM`, detail: m.tagline, model: m })),
      { placeHolder: "Select a model to deploy" },
    );
    if (!picked) return;
    model = picked.model;
  }

  // Pick region
  const regionPick = await vscode.window.showQuickPick(
    [
      { label: "Global (auto)", value: "global" },
      { label: "Europe", value: "eu" },
      { label: "North America", value: "us" },
      { label: "Asia-Pacific", value: "asia" },
    ],
    { placeHolder: "Select a GPU region" },
  );
  if (!regionPick) return;

  // Fetch offers + pick one
  const offersRes = await client.getOffers(model.id, regionPick.value);
  if (!offersRes.ok || !offersRes.offers?.length) {
    vscode.window.showErrorMessage(`No live GPUs fit ${model.label} right now. Try another region or check back shortly.`);
    return;
  }
  const offerPick = await vscode.window.showQuickPick(
    offersRes.offers.map((o) => ({ label: `${o.numGpus > 1 ? `${o.numGpus}× ` : ""}${o.gpu}`, description: `$${o.roundedPricePerHr.toFixed(2)}/hr`, detail: `${o.totalVramGb}GB VRAM · ${o.location} · ${(o.reliability * 100).toFixed(0)}% reliability`, offer: o })),
    { placeHolder: "Select a GPU offer" },
  );
  if (!offerPick) return;

  // Pick duration
  const durPick = await vscode.window.showQuickPick(
    [
      { label: "1 hour", value: 1 },
      { label: "6 hours", value: 6 },
      { label: "1 day", value: 24 },
      { label: "1 week", value: 168 },
    ],
    { placeHolder: "Select duration" },
  );
  if (!durPick) return;

  const cost = offerPick.offer.roundedPricePerHr * durPick.value;

  // HF token for gated models
  let hfToken: string | undefined;
  if (model.gated) {
    hfToken = await vscode.window.showInputBox({
      prompt: "This model is gated on Hugging Face. Enter your HF token (hf_...).",
      password: true,
      placeHolder: "hf_...",
      ignoreFocusOut: true,
    });
    if (!hfToken) return;
  }

  // Confirm + deploy
  const confirm = await vscode.window.showWarningMessage(
    `Deploy ${model.label} on ${offerPick.label} in ${offerPick.offer.location} for ${durPick.label}?\n\nCost: $${cost.toFixed(2)} (billed from your wallet balance)`,
    { modal: true },
    "Deploy",
  );
  if (confirm !== "Deploy") return;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Deploying ${model.label}…`, cancellable: false },
    async (progress) => {
      progress.report({ message: "Renting GPU + booting vLLM…" });
      const res = await client.deployModel(model!.id, offerPick.offer.askId, durPick.value, undefined, hfToken);
      if (res.ok) {
        vscode.window.showInformationMessage(
          `✓ ${model!.label} is provisioning (instance #${res.instanceId}).\nEndpoint will be ready in 2–10 min — check "My Deploys" for status.`,
          "Copy API key now",
        ).then((action) => {
          if (action === "Copy API key now") {
            vscode.env.clipboard.writeText(res.apiKey);
            vscode.window.showInformationMessage("API key copied to clipboard.");
          }
        });
        deploysProvider.load();
      } else {
        vscode.window.showErrorMessage(res.error || "Deploy failed.");
      }
    },
  );
}

// Deploy a custom model: paste HF link → discover specs → region → GPU → deploy
async function cmdDeployCustomModel() {
  if (!checkConfigured()) return;

  const link = await vscode.window.showInputBox({
    prompt: "Enter a Hugging Face model repo or URL",
    placeHolder: "e.g. Qwen/Qwen2.5-7B-Instruct",
    ignoreFocusOut: true,
  });
  if (!link) return;

  // Discover specs
  const discovered = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Detecting model specs…" },
    async () => client.discoverCustom(link),
  );

  let minVramGb: number;
  let gpuCount: number;
  let quantization = "none";
  let gated = false;

  if (discovered.ok && discovered.spec) {
    const spec = discovered.spec as { label: string; minVramGb: number; gpuCount: number; quantization: string; gated: boolean; paramB: number | null; autoDiscovered: boolean };
    vscode.window.showInformationMessage(`✓ Detected: ${spec.label} · ${spec.paramB ? `${spec.paramB}B params` : "unknown size"} · ${spec.minVramGb}GB VRAM required`);
    minVramGb = spec.minVramGb;
    gpuCount = spec.gpuCount;
    quantization = spec.quantization;
    gated = spec.gated;
  } else if (discovered.fallback === "manual") {
    vscode.window.showWarningMessage("Couldn't auto-detect specs. Enter them manually.");
    const vramPick = await vscode.window.showQuickPick(
      ["8", "12", "16", "24", "40", "48", "80", "160"].map((v) => ({ label: `${v} GB`, value: Number(v) })),
      { placeHolder: "Minimum VRAM required" },
    );
    if (!vramPick) return;
    minVramGb = vramPick.value;
    gpuCount = minVramGb > 80 ? 2 : 1;
  } else {
    vscode.window.showErrorMessage(discovered.error || "Discovery failed.");
    return;
  }

  // Region
  const regionPick = await vscode.window.showQuickPick(
    [{ label: "Global", value: "global" }, { label: "Europe", value: "eu" }, { label: "North America", value: "us" }, { label: "Asia-Pacific", value: "asia" }],
    { placeHolder: "Select a GPU region" },
  );
  if (!regionPick) return;

  // Offers
  const offersRes = await client.getOffers("qwen2.5-3b", regionPick.value);
  if (!offersRes.ok || !offersRes.offers?.length) {
    vscode.window.showErrorMessage("No live GPUs fit this model right now.");
    return;
  }
  const filtered = offersRes.offers.filter((o) => o.totalVramGb >= minVramGb && o.numGpus >= gpuCount);
  if (filtered.length === 0) {
    vscode.window.showErrorMessage(`No GPUs with ≥${minVramGb}GB VRAM available right now.`);
    return;
  }
  const offerPick = await vscode.window.showQuickPick(
    filtered.map((o) => ({ label: `${o.numGpus > 1 ? `${o.numGpus}× ` : ""}${o.gpu}`, description: `$${o.roundedPricePerHr.toFixed(2)}/hr`, detail: `${o.totalVramGb}GB VRAM · ${o.location}`, offer: o })),
    { placeHolder: "Select a GPU offer" },
  );
  if (!offerPick) return;

  // Duration
  const durPick = await vscode.window.showQuickPick(
    [{ label: "1 hour", value: 1 }, { label: "6 hours", value: 6 }, { label: "1 day", value: 24 }, { label: "1 week", value: 168 }],
    { placeHolder: "Select duration" },
  );
  if (!durPick) return;

  // HF token if gated
  let hfToken: string | undefined;
  if (gated) {
    hfToken = await vscode.window.showInputBox({ prompt: "Gated model — enter HF token", password: true, placeHolder: "hf_...", ignoreFocusOut: true });
    if (!hfToken) return;
  }

  const cost = offerPick.offer.roundedPricePerHr * durPick.value;
  const confirm = await vscode.window.showWarningMessage(
    `Deploy custom model from ${link}?\n\nGPU: ${offerPick.label} · Duration: ${durPick.label} · Cost: $${cost.toFixed(2)}`,
    { modal: true },
    "Deploy",
  );
  if (confirm !== "Deploy") return;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Deploying custom model…" },
    async () => {
      const res = await client.deployCustomModel({
        link, askId: offerPick.offer.askId, durationHours: durPick.value,
        minVramGb, gpuCount, quantization, gated, hfToken,
        manual: !discovered.ok,
      });
      if (res.ok) {
        vscode.window.showInformationMessage(`✓ Custom model provisioning (instance #${res.instanceId}). Check "My Deploys" for status.`);
        vscode.env.clipboard.writeText(res.apiKey);
        vscode.window.showInformationMessage("API key copied to clipboard.");
        deploysProvider.load();
      } else {
        vscode.window.showErrorMessage(res.error || "Deploy failed.");
      }
    },
  );
}

// Destroy a deploy (with confirmation)
async function cmdDestroyDeploy(item?: unknown) {
  if (!checkConfigured()) return;
  const deploy = getDeployFromItem(item);
  // Handle async quickPick
  const resolved = await Promise.resolve(deploy);
  if (!resolved) return;

  const confirm = await vscode.window.showWarningMessage(
    `Destroy "${resolved.modelLabel}"?\n\nThis terminates the GPU instance and stops billing immediately. The endpoint and API key will stop working.`,
    { modal: true },
    "Destroy",
  );
  if (confirm !== "Destroy") return;

  const res = await client.destroyDeploy(resolved.instanceId);
  if (res.ok) {
    vscode.window.showInformationMessage(`✓ Destroyed ${resolved.modelLabel} — billing stopped.`);
    deploysProvider.load();
  } else {
    vscode.window.showErrorMessage("Destroy failed.");
  }
}

// Stop a deploy (pause without destroying)
async function cmdStopDeploy(item?: unknown) {
  if (!checkConfigured()) return;
  const deploy = await Promise.resolve(getDeployFromItem(item));
  if (!deploy) return;
  const res = await client.stopInstance(deploy.instanceRecordId);
  if (res.ok) {
    vscode.window.showInformationMessage(`⏸ Stopped ${deploy.modelLabel}.`);
    deploysProvider.load();
  } else {
    vscode.window.showErrorMessage("Stop failed.");
  }
}

// Start a stopped deploy
async function cmdStartDeploy(item?: unknown) {
  if (!checkConfigured()) return;
  const deploy = await Promise.resolve(getDeployFromItem(item));
  if (!deploy) return;
  const res = await client.startInstance(deploy.instanceRecordId);
  if (res.ok) {
    vscode.window.showInformationMessage(`▶ Started ${deploy.modelLabel}.`);
    deploysProvider.load();
  } else {
    vscode.window.showErrorMessage("Start failed.");
  }
}

// View vLLM boot/server logs
async function cmdViewLogs(item?: unknown) {
  if (!checkConfigured()) return;
  const deploy = await Promise.resolve(getDeployFromItem(item));
  if (!deploy) return;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Fetching logs for ${deploy.modelLabel}…` },
    async () => {
      const res = await client.getLogs(deploy.instanceId);
      if (res.ok && res.logs) {
        // Show in an output channel
        const channel = vscode.window.createOutputChannel(`Capix LLM: ${deploy.modelLabel} Logs`, "log");
        channel.clear();
        channel.appendLine(`# Logs for ${deploy.modelLabel} (instance #${deploy.instanceId})`);
        channel.appendLine(`# Source: ${res.source}`);
        channel.appendLine("");
        channel.append(res.logs);
        channel.show();
      } else {
        vscode.window.showWarningMessage(res.error || "No logs available yet — the instance may still be booting.");
      }
    },
  );
}

// Run a debug command on the GPU instance
async function cmdExecOnInstance(item?: unknown) {
  if (!checkConfigured()) return;
  const deploy = await Promise.resolve(getDeployFromItem(item));
  if (!deploy) return;

  // Quick presets + custom
  const presets = [
    { label: "nvidia-smi", detail: "GPU utilization + memory" },
    { label: "docker ps", detail: "Running containers" },
    { label: "docker logs vllm --tail 100", detail: "vLLM container logs" },
    { label: "ps aux | head -20", detail: "Top processes" },
    { label: "df -h", detail: "Disk usage" },
    { label: "free -h", detail: "Memory usage" },
    { label: "$(custom)", detail: "Enter a custom command" },
  ];
  const pick = await vscode.window.showQuickPick(presets, { placeHolder: `Run a command on ${deploy.modelLabel}` });
  if (!pick) return;

  let command = pick.label;
  if (pick.label === "$(custom)") {
    command = await vscode.window.showInputBox({ prompt: "Enter a shell command", placeHolder: "nvidia-smi", ignoreFocusOut: true }) || "";
    if (!command) return;
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Running: ${command}` },
    async () => {
      const res = await client.execOnInstance(deploy.instanceId, command);
      const channel = vscode.window.createOutputChannel(`Capix LLM: ${deploy.modelLabel} Shell`, "shell");
      channel.clear();
      channel.appendLine(`$ ${command}`);
      if (res.ok) {
        channel.append(res.stdout);
        if (res.stderr) channel.append(`\n[stderr]\n${res.stderr}`);
      } else {
        channel.append(`[error] ${res.error || "Command failed"}`);
      }
      channel.show();
    },
  );
}

// Copy the OpenAI base URL to clipboard
async function cmdCopyEndpoint(item?: unknown) {
  const deploy = await Promise.resolve(getDeployFromItem(item));
  if (!deploy) return;
  const status = await client.getDeployStatus(deploy.instanceId);
  if (status.ok && status.baseOpenAiUrl) {
    vscode.env.clipboard.writeText(status.baseOpenAiUrl);
    vscode.window.showInformationMessage(`Endpoint copied: ${status.baseOpenAiUrl}`);
  } else if (status.ok && status.endpoint) {
    vscode.env.clipboard.writeText(`${status.endpoint}/v1`);
    vscode.window.showInformationMessage(`Endpoint copied: ${status.endpoint}/v1`);
  } else {
    vscode.window.showWarningMessage("Endpoint not ready yet — the model is still provisioning.");
  }
}

// Copy the API key
async function cmdCopyApiKey(modelId?: string | unknown) {
  // If called from a hosted endpoint item, modelId is a string
  if (typeof modelId === "string") {
    const res = await client.revealHostedKey(modelId);
    if (res.ok && res.apiKey) {
      vscode.env.clipboard.writeText(res.apiKey);
      vscode.window.showInformationMessage("Hosted endpoint API key copied.");
    } else {
      vscode.window.showErrorMessage(res.error || "Failed to reveal key.");
    }
    return;
  }

  // Otherwise it's a deploy item — get the key from status
  const deploy = await Promise.resolve(getDeployFromItem(modelId));
  if (!deploy) return;
  const status = await client.getDeployStatus(deploy.instanceId);
  if (status.ok && status.apiKey) {
    vscode.env.clipboard.writeText(status.apiKey);
    vscode.window.showInformationMessage("API key copied to clipboard.");
  } else {
    vscode.window.showWarningMessage("No API key available for this deploy.");
  }
}

// Connect wallet / set session token
async function cmdConnectWallet() {
  const token = await vscode.window.showInputBox({
    prompt: "Paste your Capix session token (cpx_session.…)",
    password: true,
    placeHolder: "cpx_session.eyJ...",
    ignoreFocusOut: true,
    validateInput: (v) => v.startsWith("cpx_session.") ? null : "Token must start with 'cpx_session.'",
  });
  if (!token) return;

  await vscode.workspace.getConfiguration("capix").update("sessionToken", token, vscode.ConfigurationTarget.Global);
  vscode.window.showInformationMessage("✓ Capix session token saved. Loading your deploys…");
  refreshAll();
}

// Top up wallet balance — shows three deposit options (SOL, USDC, USDC on Base)
async function cmdTopUp() {
  if (!checkConfigured()) return;

  const pick = await vscode.window.showQuickPick(
    [
      { label: "SOL (Solana)", description: "Deposit with your Solana wallet", value: "sol" },
      { label: "USDC (Solana)", description: "Stablecoin on Solana", value: "usdc" },
      { label: "USDC on Base", description: "SuperGemma's chain — send from any EVM wallet", value: "usdc_base" },
    ],
    { placeHolder: "Select a deposit method" },
  );
  if (!pick) return;

  if (pick.value === "usdc_base") {
    // USDC on Base — show treasury address + let user submit tx hash
    const treasuryRes = await client.getBaseTreasury().catch(() => ({ ok: false }) as { ok: boolean });
    if (!treasuryRes.ok || !(treasuryRes as { treasury?: string }).treasury) {
      vscode.window.showErrorMessage("Base deposits not configured yet. Use SOL or USDC instead, or top up at the web billing page.");
      return;
    }
    const treasury = (treasuryRes as { treasury: string }).treasury;

    const amount = await vscode.window.showInputBox({
      prompt: "Amount in USD",
      placeHolder: "10",
      ignoreFocusOut: true,
      validateInput: (v) => Number(v) > 0 ? null : "Enter a positive number",
    });
    if (!amount) return;

    // Show the treasury address + instructions
    const copied = await vscode.window.showInformationMessage(
      `Send ${amount} USDC on Base to:\n${treasury}\n\nThen submit the transaction hash.`,
      "Copy address",
      "Open Billing Page",
    );
    if (copied === "Copy address") {
      vscode.env.clipboard.writeText(treasury);
      vscode.window.showInformationMessage("Treasury address copied. Send your USDC, then come back to submit the tx hash.");
    }

    // Get the tx hash from the user
    const txHash = await vscode.window.showInputBox({
      prompt: "Paste your Base transaction hash (0x...)",
      placeHolder: "0x...",
      ignoreFocusOut: true,
      validateInput: (v) => v.startsWith("0x") && v.length > 20 ? null : "Must be a 0x transaction hash",
    });
    if (!txHash) return;

    // Submit for verification
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "Verifying Base transaction…" },
      async () => {
        const res = await client.submitBaseDeposit(txHash, Number(amount));
        if (res.ok) {
          vscode.window.showInformationMessage(`✓ Deposited $${Number(amount).toFixed(2)} — new balance $${(res.balanceUsd || 0).toFixed(2)}.`);
          profileProvider.refresh();
        } else {
          vscode.window.showErrorMessage(res.error || "Verification failed. Check the tx hash and try again.");
        }
      },
    );
  } else {
    // SOL / USDC — needs the Solana wallet adapter (browser-based)
    vscode.window.showInformationMessage(
      `To deposit ${pick.label}, open the Capix billing page and confirm in your Solana wallet.`,
      "Open Billing Page",
    ).then((action) => {
      if (action === "Open Billing Page") {
        vscode.env.openExternal(vscode.Uri.parse(`${client.getBaseUrl()}/cloud/billing`));
      }
    });
  }
}
