import { describe, it, expect } from 'vitest';
import { indicatorFor, runPineStatic, preparePine } from '../src/pinets/runtime';
import { seriesInScale } from '@luxalgo/vela/plugin';
import type { OHLCV, IndicatorModel } from '@luxalgo/vela/plugin';

/**
 * `indicator(..., scale = scale.none)` puts the script on NO price scale: its plots must
 * never stretch the pane's autoscale (an overlay plot of 158 beside prices near 6 once
 * squashed the candles flat) — while their values still read in the legend / data window.
 */

const bars: OHLCV[] = Array.from({ length: 30 }, (_, i) => ({ time: 1_700_000_000_000 + i * 60_000, open: 100 + i, high: 102 + i, low: 98 + i, close: 101 + i, volume: 1 }));

async function runModel(source: string): Promise<IndicatorModel> {
    const prepared = preparePine(source, 'sn-1');
    const res = await runPineStatic({ ind: indicatorFor({}, source, {}), bars, market: { symbol: 'TEST', timeframe: '60' }, visibleRange: undefined, prepared, instanceId: 'sn-1', inputs: {}, fetchSeries: undefined });
    return res.model!;
}

describe('indicator scale = scale.none', () => {
    it('keeps every plot off the price scale, but not off the legend or the data window', async () => {
        const model = await runModel('//@version=5\nindicator("N", overlay=true, scale=scale.none)\nplot(close * 100, "big", color=color.red)\nplot(close * 200, "na_colored", color=na)\n');
        expect(model.series.length).toBe(2);
        for (const s of model.series) {
            expect(s.display?.priceScale).toBe(false);
            expect(s.display?.legend).not.toBe(false);
            expect(s.display?.dataWindow).not.toBe(false);
        }
        // the colored one is still painted, so it still takes part in autoscale — only the na one drops out
        const inScale = model.series.filter((s) => seriesInScale(s)).map((s) => s.title);
        expect(inScale).toEqual(['big']);
    });

    it('a script on the default scale keeps its plots on the price scale', async () => {
        const model = await runModel('//@version=5\nindicator("D", overlay=true)\nplot(close, "p", color=color.red)\nplot(close, "q", color=na)\n');
        expect(model.series.every((s) => s.display?.priceScale !== false)).toBe(true);
    });
});
