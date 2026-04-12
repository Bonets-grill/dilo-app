# DILO TRADER — Blueprint para 70%+ Win Rate

## Arquitectura: 4 Agentes Especializados

### Agent 1: ESTRATEGA (Pre-Market)
**Cron:** `0 7 * * 1-5` (7:00 UTC)
**Endpoint:** `POST /api/strategy`

Tareas:
1. Analizar D1/W1 de cada símbolo (HTF bias)
2. Detectar BOS/CHoCH en H4 para determinar tendencia
3. Calcular Premium/Discount zones (equilibrium = 50% del rango)
4. Marcar Order Blocks y FVGs sin mitigar en HTF
5. Consultar calendario económico (evitar NFP, FOMC, CPI)
6. Detectar régimen de mercado (trending/ranging/volatile)
7. Guardar "plan del día" en DB: bias, niveles clave, zonas, eventos

Output en DB (tabla `daily_strategy`):
```
{
  symbol: "AAPL",
  date: "2026-04-14",
  htf_bias: "bullish",
  regime: "trending",
  premium_zone: [262.50, 270.00],
  discount_zone: [250.00, 257.50],
  equilibrium: 260.00,
  key_obs: [{top: 255, bottom: 253, type: "bullish"}],
  key_fvgs: [{top: 258, bottom: 256, type: "bullish", mitigated: false}],
  swing_high: 270.00,
  swing_low: 250.00,
  news_events: ["14:30 CPI"],
  trade_direction: "LONG_ONLY",
  no_trade_windows: ["14:00-15:00"]
}
```

### Agent 2: FRANCOTIRADOR (Kill Zones)
**Cron:** `*/15 8-10,14-16 * * 1-5` (cada 15min en kill zones)
**Endpoint:** `POST /api/sniper`

Secuencia de 5 pasos (TODOS deben pasar):
1. ¿Estamos en kill zone? → Si no, SKIP
2. ¿El plan del día permite operar este símbolo? → Si no, SKIP
3. ¿Hubo liquidity sweep reciente en LTF (15m)? → Si no, SKIP
4. ¿Hay OB/FVG alineado con HTF bias en zona discount/premium? → Si no, SKIP
5. ¿Confluence score >= 8/15? → Si no, SKIP

Sistema de puntuación:
| Factor | Pts | Cómo verificar |
|--------|-----|----------------|
| HTF bias alineado | +2 | plan del día |
| Kill zone activa | +1 | hora actual |
| Order Block presente | +2 | SMC en 15m |
| FVG sin mitigar | +1 | SMC en 15m |
| Liquidity sweep | +2 | detección en 15m |
| BOS/CHoCH en LTF | +2 | SMC en 15m |
| Volumen >120% avg | +1 | volume vs MA20 |
| Sin noticias en 30min | +1 | calendario |
| ADX >25 | +1 | trending filter |
| Precio en discount/premium | +2 | vs equilibrium |
| **Mínimo** | **8** | |

Entry rules:
- NO entrar a precio de cierre actual
- Entry = nivel del OB (bottom para BUY, top para SELL)
- O entry = nivel del FVG (bottom para BUY, top para SELL)
- Limit order, no market order

SL rules:
- SL detrás del swing structure + buffer (0.2 ATR)
- Para BUY: SL = swing low - (0.2 × ATR)
- Para SELL: SL = swing high + (0.2 × ATR)
- NUNCA SL fijo en ATR

TP rules:
- TP1 = próximo nivel de liquidez opuesto (equal highs/lows)
- TP2 = swing high/low opuesto
- Mínimo 1:2 R:R, idealmente 1:3

### Agent 3: RISK MANAGER (Inline)
**Endpoint:** `POST /api/validate`
**Se llama:** Cuando el francotirador genera una señal

Validaciones (9 reglas actuales + 6 nuevas):
1-9. Reglas actuales del risk_engine.py (mantener)
10. Correlación: ¿hay posiciones abiertas en activos correlacionados?
11. News filter: ¿hay evento de alto impacto en los próximos 30 min?
12. Equity curve filter: ¿equity está por encima de su MA de 20 trades?
13. Portfolio heat: ¿riesgo total abierto < 5% del equity?
14. Time-based filter: no operar en los últimos 30min de sesión
15. Drawdown scaling: reducir size según nivel de drawdown

Drawdown scaling:
| Drawdown | Acción |
|----------|--------|
| 0-3% | Tamaño normal |
| 3-5% | Reducir 25% |
| 5-8% | Reducir 50%, solo A+ setups |
| >8% | STOP total |

Position sizing: Quarter Kelly
```
Kelly% = (WinRate × AvgWin/AvgLoss - LossRate) / (AvgWin/AvgLoss)
Size = Kelly% × 0.25  # Quarter Kelly
```

### Agent 4: AUDITOR (Post-Market)
**Cron:** `0 22 * * 1-5` (22:00 UTC)
**Endpoint:** `POST /api/learn`

Tareas:
1. Resolver señales pendientes (hit TP/SL/expired)
2. Calcular MFE/MAE de cada señal resuelta
3. Analizar patrones:
   - ¿Qué símbolos tienen mejor win rate?
   - ¿Qué horas producen mejores resultados?
   - ¿Qué confluences son más predictivas?
   - ¿Qué régimen de mercado funciona mejor?
4. Actualizar parámetros del francotirador:
   - Ajustar pesos del confluence scoring
   - Ajustar confidence threshold
   - Actualizar kill zone preferences por símbolo
5. Actualizar learning score con fórmula mejorada

Learning score mejorado:
```
dataScore = min(20, totalKnowledge / 20)           # Max 20
signalScore = min(30, winRate * 0.5)               # Max 30 (necesita wins)
patternScore = min(15, unique_patterns / 2)         # Max 15
consistencyScore = min(10, markets >= 5 ? 10 : m*2) # Max 10
maeScore = min(15, mae_optimization_trades / 5)     # Max 15
adaptScore = min(10, parameter_adjustments)          # Max 10
```

## Kill Zones (hora UTC)

| Kill Zone | UTC | Canarias | Operar |
|-----------|-----|----------|--------|
| Asian | 00:00-02:00 | 01:00-03:00 | Solo marcar rango |
| London | 07:00-10:00 | 08:00-11:00 | Forex + Indices EU |
| NY Open | 13:30-16:00 | 14:30-17:00 | Acciones US + Forex |
| London Close | 15:00-17:00 | 16:00-18:00 | Reversals |

## Filtros anti false-signal

1. **Volume filter**: solo operar si volumen > 120% de MA(20)
2. **ADX filter**: solo trend-following si ADX > 25
3. **News filter**: no operar 30min antes/después de eventos high-impact
4. **Regime filter**: adaptar estrategia al régimen (trending/ranging)
5. **Retest filter**: esperar retesteo de nivel roto antes de entrar
6. **Time filter**: no operar en últimos 30min de sesión
7. **Correlation filter**: no abrir trades en activos altamente correlacionados

## Gestión de posición durante el trade

1. En +1R: cerrar 50% + mover SL a breakeven
2. En +2R: cerrar 25% + trail SL a +1R
3. Último 25%: trailing con Chandelier Exit (22 periodos, 3× ATR)
4. Time stop: cerrar si no hay progreso en 4h (day trade) o 5 días (swing)

## ML Layer (Fase 2 — después de 100+ señales)

Meta-labeling con XGBoost:
1. Señal SMC genera BUY/SELL
2. Extraer features en el momento de la señal:
   - ADX, RSI, ATR percentile, volume ratio
   - Regime label, distance from key levels
   - Hora del día, día de la semana
   - Win rate reciente de señales similares
3. XGBoost decide: TAKE o SKIP (confidence > 60%)
4. Walk-forward validation: train 1 año, test 3 meses
5. Retrain semanal

## Conceptos SMC avanzados a implementar (nuevos archivos Python)

NO tocar `smc_analyzer.py` (locked). Crear módulos nuevos que lo envuelvan:

### Nuevos archivos del Python Engine:
```
app/analysis/smc_confluence.py    — Scoring ponderado (no solo count)
app/analysis/smc_sessions.py      — Kill zones, Silver Bullet, Judas Swing
app/analysis/smc_zones.py         — Premium/Discount, OTE (Fib 0.62-0.79)
app/analysis/smc_displacement.py  — Detección de velas de desplazamiento
app/analysis/smc_advanced.py      — Breaker Blocks, IFVG, Unicorn Model, PO3
app/analysis/smc_mtf.py           — Orquestador multi-timeframe
app/analysis/smc_meta.py          — ML meta-labeling (Fase 5)
```

### Order Block Quality Scoring (5 estrellas)
- +1: Displacement sigue (body > ATR)
- +1: Volume spike (>1.5x avg)
- +1: En zona Premium/Discount correcta
- +1: Alineado con HTF bias
- +1: Cerca de origen de liquidity sweep
- Solo operar OBs de 3+ estrellas

### Premium/Discount + OTE (Optimal Trade Entry)
```python
equilibrium = (swing_high + swing_low) / 2
ote_start = swing_low + range * 0.62   # Zona OTE
ote_end = swing_low + range * 0.79
ote_optimal = swing_low + range * 0.705  # Punto óptimo

# REGLA: NUNCA comprar en premium, NUNCA vender en discount
```

### Displacement Candle Detection
- Body > 1.0x ATR
- Close near extreme: (close-low)/(high-low) > 0.8 para bullish
- Wick mínima en lado de cierre: < 20% del rango total
- Score >= 5/10 para ser válida

### Silver Bullet Windows (mayor probabilidad)
- London SB: 03:00-04:00 EST (08:00-09:00 Canarias)
- NY AM SB: 10:00-11:00 EST (15:00-16:00 Canarias)
- NY PM SB: 14:00-15:00 EST (19:00-20:00 Canarias)

### Conceptos avanzados ICT:
- **Breaker Block**: OB fallido que cambia polaridad
- **IFVG**: FVG violado que cambia polaridad
- **Unicorn Model**: FVG dentro de Breaker Block (setup más preciso)
- **Power of Three**: Acumulación → Manipulación → Distribución
- **Judas Swing**: Falso breakout en London open (03:00 EST)

### Confluence scoring ponderado (reemplaza simple count):
| Factor | Pts |
|--------|-----|
| HTF bias alignment | +3 |
| Liquidity sweep | +3 |
| CHoCH (reversal) | +3 |
| Unmitigated OB | +2 |
| Unmitigated FVG | +2 |
| BOS (continuation) | +2 |
| En discount/premium correcto | +2 |
| En zona OTE (0.62-0.79) | +2 |
| Silver Bullet window | +2 |
| Breaker Block | +2 |
| Kill zone activa | +1 |
| Displacement candle | +1 |
| IFVG | +1 |
| **Mín para operar**: **8pts** | |

### ML Meta-Labeling (Fase 5 — después de 100+ señales)

Arquitectura de 4 capas:
```
Capa 1: Señal SMC (BUY/SELL) — tu engine actual
    ↓
Capa 2: Feature extraction en el momento de la señal
    - ADX, RSI, ATR percentile, volume ratio
    - Regime label (K-Means o HMM)
    - Distancia a niveles clave
    - Hora, día de la semana
    - Win rate reciente de señales similares
    ↓
Capa 3: XGBoost meta-model
    - Entrenado con walk-forward (1 año train, 3 meses test)
    - Output: probabilidad calibrada (Platt Scaling)
    - Solo operar si confidence > 60%
    ↓
Capa 4: Position sizing proporcional a confidence
```

Resultados documentados con esta arquitectura:
- 82.68% accuracy en trades ejecutados
- Elimina ~30% de falsos positivos
- Retrain semanal para evitar concept drift

### Estadísticas reales de backtesting SMC:
| Métrica | Valor | Fuente |
|---------|-------|--------|
| SMC con confluencia correcta | 61% WR, 2.17 profit factor | 2,600 trades backtest |
| SMC + ML híbrido | 70.32% WR, 65 profit factor | 7 años XAUUSD |
| FVG fill rate (30m) | ~31-32% same session | Edgeful |
| FVG zones revisited | ~70% del tiempo | TrendSpider |
| OB + FVG + Sweep combo | ~70%+ | ICT community |

## Implementación por fases

### Fase 1 (Semana 1): Fundamentos
- [ ] Crear tabla `daily_strategy` en Supabase
- [ ] Nuevo endpoint `/api/strategy` en Python engine
- [ ] Implementar HTF bias con multi-timeframe (D1 + H4)
- [ ] Implementar Premium/Discount zones
- [ ] Nuevo cron `trading-strategy` a las 7:00

### Fase 2 (Semana 2): Francotirador
- [ ] Nuevo endpoint `/api/sniper` en Python engine
- [ ] Implementar kill zone detection
- [ ] Implementar confluence scoring (8/15 mínimo)
- [ ] Entry en OB/FVG level (no at close)
- [ ] SL en structure (no ATR fijo)
- [ ] Nuevo cron cada 15min en kill zones

### Fase 3 (Semana 3): Risk Manager mejorado
- [ ] Añadir correlation check
- [ ] Añadir news filter (API calendario económico)
- [ ] Implementar drawdown scaling
- [ ] Implementar partial profit taking (50% at 1R)
- [ ] Equity curve filter

### Fase 4 (Semana 4): Auditor inteligente
- [ ] MFE/MAE tracking completo
- [ ] Análisis de patrones por símbolo/hora/día
- [ ] Ajuste automático de parámetros
- [ ] Learning score mejorado
- [ ] Dashboard de learning mejorado

### Fase 5 (Mes 2): ML Layer
- [ ] Recopilar 100+ señales con resultados
- [ ] Feature engineering
- [ ] Entrenar XGBoost meta-model
- [ ] Walk-forward validation
- [ ] Integrar como filtro de confianza

## Fuentes de datos necesarias

| Dato | API | Coste |
|------|-----|-------|
| Precios acciones US | Finnhub (actual) | Gratis |
| Precios forex/gold | IG Markets (actual) | Gratis |
| Calendario económico | Finnhub economic calendar | Gratis |
| Sentiment | Finnhub news sentiment (actual) | Gratis |
| Datos OHLCV intradía | Alpaca market data | Gratis (paper) |
| Volumen | Finnhub/Alpaca | Gratis |
