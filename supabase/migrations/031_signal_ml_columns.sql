-- Add ml_features and source columns to trading_signal_log
-- Required for ML pipeline (Cable 1: store features, Cable 2: train from them)

ALTER TABLE trading_signal_log ADD COLUMN IF NOT EXISTS ml_features JSONB DEFAULT NULL;
ALTER TABLE trading_signal_log ADD COLUMN IF NOT EXISTS source TEXT DEFAULT NULL;
