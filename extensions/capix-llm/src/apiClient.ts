/**
 * Capix API client — wraps fetch calls to capix.network /api/llm/* routes.
 * Uses the session token from VS Code settings as a Bearer header.
 */

import * as vscode from "vscode";
import type { CatalogModel, GpuOffer, LlmDeploy, HostedEndpoint, DeployResult } from "./types";

export class CapixClient {
  get baseUrl(): string {
    return vscode.workspace.getConfiguration("capix").get<string>("baseUrl") || "https://capix.network";
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  private get sessionToken(): string {
    return vscode.workspace.getConfiguration("capix").get<string>("sessionToken") || "";
  }

  private get authHeaders(): Record<string, string> {
    const token = this.sessionToken;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  get isConfigured(): boolean {
    return this.sessionToken.startsWith("cpx_session.");
  }

  async get<T = unknown>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { ...this.authHeaders },
    });
    return res.json() as Promise<T>;
  }

  async post<T = unknown>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.authHeaders },
      body: JSON.stringify(body),
    });
    return res.json() as Promise<T>;
  }

  async delete<T = unknown>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "DELETE",
      headers: { ...this.authHeaders },
    });
    return res.json() as Promise<T>;
  }

  // ── Model catalog ──────────────────────────────────────────────────────
  async getCatalog(): Promise<{ ok: boolean; models: CatalogModel[] }> {
    return this.get("/api/llm/models");
  }

  // ── GPU offers for a model ─────────────────────────────────────────────
  async getOffers(modelId: string, region?: string): Promise<{ ok: boolean; offers: GpuOffer[] }> {
    const params = new URLSearchParams({ modelId });
    if (region && region !== "global") params.set("region", region);
    return this.get(`/api/llm/offers?${params}`);
  }

  // ── Deploy a catalog model ─────────────────────────────────────────────
  async deployModel(modelId: string, askId: number, durationHours: number, diskGb?: number, hfToken?: string): Promise<DeployResult & { ok: boolean; error?: string }> {
    return this.post("/api/llm/deploy", { modelId, askId, durationHours, diskGb, hfToken });
  }

  // ── Deploy a custom model (Hugging Face link) ──────────────────────────
  async deployCustomModel(opts: {
    link: string; label?: string; askId: number; durationHours: number;
    minVramGb?: number; gpuCount?: number; contextWindow?: number;
    quantization?: string; gated?: boolean; hfToken?: string; manual?: boolean;
  }): Promise<DeployResult & { ok: boolean; error?: string }> {
    return this.post("/api/llm/custom", { action: "deploy", ...opts });
  }

  // ── Discover specs from a Hugging Face link ────────────────────────────
  async discoverCustom(link: string): Promise<{ ok: boolean; spec?: unknown; error?: string; fallback?: string }> {
    return this.post("/api/llm/custom", { action: "discover", link });
  }

  // ── List + status of user's deploys ────────────────────────────────────
  async listDeploys(): Promise<{ ok: boolean; deploys: Array<{ instance: unknown; live: LlmDeploy | null }> }> {
    return this.get("/api/llm/0?action=list");
  }

  async getDeployStatus(instanceId: number): Promise<LlmDeploy & { ok: boolean; baseOpenAiUrl?: string }> {
    return this.get(`/api/llm/${instanceId}?action=status`);
  }

  // ── Destroy / stop / start ──────────────────────────────────────────────
  async destroyDeploy(instanceId: number): Promise<{ ok: boolean }> {
    return this.delete(`/api/llm/${instanceId}`);
  }

  async stopInstance(instanceId: string): Promise<{ ok: boolean }> {
    return this.post(`/api/cloud/instances/${instanceId}`, { action: "stop" });
  }

  async startInstance(instanceId: string): Promise<{ ok: boolean }> {
    return this.post(`/api/cloud/instances/${instanceId}`, { action: "start" });
  }

  // ── Logs + exec ────────────────────────────────────────────────────────
  async getLogs(instanceId: number): Promise<{ ok: boolean; logs: string; source: string; error?: string }> {
    return this.get(`/api/llm/${instanceId}?action=logs`);
  }

  async execOnInstance(instanceId: number, command: string): Promise<{ ok: boolean; stdout: string; stderr: string; error?: string }> {
    return this.get(`/api/llm/${instanceId}?action=exec&command=${encodeURIComponent(command)}`);
  }

  // ── Hosted endpoints (ready now) ──────────────────────────────────────
  async getHosted(): Promise<{ ok: boolean; endpoints: HostedEndpoint[] }> {
    return this.get("/api/llm/hosted");
  }

  async revealHostedKey(modelId: string): Promise<{ ok: boolean; apiKey?: string; error?: string }> {
    return this.get(`/api/llm/hosted?reveal=true&modelId=${encodeURIComponent(modelId)}`);
  }

  // ── Wallet balance ────────────────────────────────────────────────────
  async getBalance(): Promise<{ ok: boolean; balance?: { usd: number; sol: number; usdc: number }; activeInstances?: number; totalSpent?: number; error?: string }> {
    return this.get("/api/cloud/billing");
  }

  // ── Billing: base treasury address for USDC on Base ───────────────────
  async getBaseTreasury(): Promise<{ ok: boolean; treasury?: string; chain?: string; contract?: string; explorer?: string }> {
    return this.get("/api/cloud/billing?action=base-treasury");
  }

  // ── Deposit (SOL or USDC on Solana — returns a tx signature) ──────────
  // The actual signing happens in the web browser with the Solana wallet
  // adapter. The IDE just opens the billing page for the user to complete.
  // For USDC on Base (EVM), the user sends manually and submits the tx hash.
  async submitBaseDeposit(txHash: string, amountUsd: number): Promise<{ ok: boolean; balanceUsd?: number; error?: string }> {
    return this.post("/api/cloud/billing", { action: "deposit", signature: txHash, asset: "USDC_BASE", amountUsd });
  }

  // ── Deploy quote (for showing per-minute costs) ────────────────────────
  async getQuote(tierId: string, hours: number): Promise<{ ok: boolean; quote?: { amountUsd: number; assetPrice: number } }> {
    return this.get(`/api/cloud/deploy/quote?tierId=${tierId}&hours=${hours}&asset=SOL`);
  }
}
