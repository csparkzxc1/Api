// Mirrors openapi.yaml. Keep them in sync — the backend depends on these names.
export type Provider = 'anthropic' | 'openai';

export type DevicePlatform = 'ios' | 'android' | 'watchos' | 'wearos' | 'desktop';

export type UsageWindow = 'hour' | 'day' | 'week' | 'month' | 'reset_window';
export type UsageBucket = 'hour' | 'day';
export type UsageUnit = 'usd' | 'tokens' | 'requests';
export type AlertScope = 'provider_day' | 'provider_month' | 'claude_code_reset_window';
export type AccountStatus = 'pending' | 'active' | 'error';
export type AgentSource = 'claude_code' | 'codex_cli';

export interface Health {
  status: 'ok';
  version: string;
  time: string;
}

export interface DeviceEnrollRequest {
  platform: DevicePlatform;
  public_key: string;
  pairing_code?: string;
  device_name?: string;
}

export interface Pairing {
  code: string;
  expires_at: string;
}

export interface Session {
  device_id: string;
  token: string;
  expires_at: string;
}

export interface WrappingKey {
  kid: string;
  public_key: string;
  alg: 'X25519-HKDF-SHA256-AES256GCM';
}

export interface AccountCreate {
  provider: Provider;
  label: string;
  wrapped_key: string;
  kid: string;
  org_id?: string;
}

export interface AccountLimits {
  daily_cap_usd?: number | null;
  monthly_cap_usd?: number | null;
  daily_cap_tokens?: number | null;
  reset_window_cap_tokens?: number | null;
  reset_window_seconds?: number;
}

export interface Account {
  id: string;
  provider: Provider;
  label: string;
  org_id?: string;
  created_at: string;
  last_polled_at: string | null;
  status: AccountStatus;
  error_message: string | null;
}

export interface ProviderSummary {
  provider: Provider;
  label?: string;
  used: number;
  limit: number | null;
  unit: UsageUnit;
  percent: number | null;
  resets_at: string | null;
  projected_exhaustion_at: string | null;
}

export interface UsageSummary {
  generated_at: string;
  window: UsageWindow;
  providers: ProviderSummary[];
}

export interface UsagePoint {
  t: string;
  value: number;
  group?: string;
  unit?: UsageUnit;
}

export interface UsageSeries {
  bucket: UsageBucket;
  points: UsagePoint[];
}

export interface AlertThresholdInput {
  scope: AlertScope;
  provider?: Provider;
  percent: number;
  haptic?: boolean;
}

export interface AlertThreshold extends AlertThresholdInput {
  id: string;
  created_at: string;
  last_fired_at: string | null;
}

export type PushPlatform = 'ios' | 'watchos' | 'android' | 'wearos';
export type PushEnvironment = 'sandbox' | 'production';

export interface PushTokenInput {
  platform: PushPlatform;
  apns_token?: string;
  apns_environment?: PushEnvironment;
  fcm_token?: string;
}

export interface AgentIngestSample {
  t: string;
  source: AgentSource;
  model?: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  cost_usd?: number;
}

export interface AgentIngest {
  agent_id: string;
  samples: AgentIngestSample[];
}


// --- generated mirror of openapi.yaml --------------------------------------
// Refresh with `pnpm openapi:gen`. CI fails on drift between this and the
// spec via `pnpm openapi:check`.
export type * as schema from "./generated.js";
