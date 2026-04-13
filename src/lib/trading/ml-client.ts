/**
 * ML Client — calls Python engine ML endpoints
 * Cable 1: extract features
 * Cable 2: train model
 * Cable 3: predict signal quality
 */

const ENGINE_URL = process.env.TRADING_ENGINE_URL || "http://localhost:8000";
const ENGINE_KEY = process.env.TRADING_ENGINE_KEY || "dev-secret";

export interface MLFeatures {
  [key: string]: number;
}

export interface MLPrediction {
  take: boolean;
  confidence: number;
  model_available: boolean;
  reason: string;
}

export interface MLTrainResult {
  trained: boolean;
  reason?: string;
  signals_used?: number;
  overall_accuracy?: number;
  filtered_accuracy?: number;
  feature_importance?: Record<string, number>;
}

/** Cable 1: Extract features for a signal */
export async function extractMLFeatures(params: {
  symbol: string;
  side: string;
  entry_price: number;
  confluence_score?: number;
  confluence_grade?: string;
  active_factors?: string[];
  atr?: number;
  volume_ratio?: number;
  swing_high?: number;
  swing_low?: number;
  adx?: number;
  rsi?: number;
  recent_symbol_wr?: number;
  recent_setup_wr?: number;
  setup_type?: string;
}): Promise<MLFeatures | null> {
  try {
    const res = await fetch(`${ENGINE_URL}/ml/features`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": ENGINE_KEY },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.features || null;
  } catch {
    return null;
  }
}

/** Cable 3: Predict if signal should be taken */
export async function predictSignalQuality(features: MLFeatures): Promise<MLPrediction> {
  try {
    const res = await fetch(`${ENGINE_URL}/ml/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": ENGINE_KEY },
      body: JSON.stringify({ features }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      return { take: true, confidence: 0.5, model_available: false, reason: "Engine unavailable" };
    }
    return await res.json();
  } catch {
    return { take: true, confidence: 0.5, model_available: false, reason: "Engine error" };
  }
}

/** Cable 2: Train model with resolved signals */
export async function trainMLModel(resolvedSignals: Array<Record<string, unknown>>): Promise<MLTrainResult> {
  try {
    const res = await fetch(`${ENGINE_URL}/ml/train`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": ENGINE_KEY },
      body: JSON.stringify({ resolved_signals: resolvedSignals }),
      signal: AbortSignal.timeout(120000), // Training can take time
    });
    if (!res.ok) return { trained: false, reason: "Engine unavailable" };
    return await res.json();
  } catch (err) {
    return { trained: false, reason: (err as Error).message };
  }
}

/** Check ML status */
export async function getMLStatus(): Promise<{ model_trained: boolean; xgboost_installed: boolean }> {
  try {
    const res = await fetch(`${ENGINE_URL}/ml/status`, {
      headers: { "X-API-Key": ENGINE_KEY },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { model_trained: false, xgboost_installed: false };
    return await res.json();
  } catch {
    return { model_trained: false, xgboost_installed: false };
  }
}
