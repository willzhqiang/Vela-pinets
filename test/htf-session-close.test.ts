import { describe, it, expect } from 'vitest';
import { indicatorFor, runPineStatic, preparePine } from '../src/pinets/runtime';
import type { OHLCV } from '@luxalgo/vela/plugin';

/**
 * `request.security(syminfo.tickerid, "D", high)` on an intraday chart of a session market:
 * the LAST intraday bar of a day closes with the daily bar, so (lookahead off) it already
 * reads that day's finished daily value — not the previous day's.
 */

const NY = { timezone: 'America/New_York', session: '0930-1600', session_extended: '0400-2000', ticker: 'SPY', tickerid: 'SPY', prefix: '' };
const nyT = (d: number, h: number, m: number): number => Date.UTC(2026, 0, d, h + 5, m); // Jan 2026: UTC-5

// Two trading days (Jan 12, 13). Daily highs 110 and 120; hourly highs differ so a mix-up is visible.
const hourly: OHLCV[] = [];
for (const [d, base] of [[12, 100], [13, 112]] as const) {
    for (const [h, m] of [[9, 30], [10, 30], [11, 30], [12, 30], [13, 30], [14, 30], [15, 30]] as const) {
        hourly.push({ time: nyT(d, h, m), open: base, high: base + 1, low: base - 1, close: base, volume: 1 });
    }
}
const daily: OHLCV[] = [
    { time: nyT(12, 9, 30), open: 100, high: 110, low: 95, close: 105, volume: 7 },
    { time: nyT(13, 9, 30), open: 112, high: 120, low: 108, close: 118, volume: 7 },
];

const SRC = '//@version=5\nindicator("htf")\nd_high = request.security(syminfo.tickerid, "D", high)\nplot(d_high, "d_high")\n';

async function dHighByBar(symbol: string): Promise<number[]> {
    const prepared = preparePine(SRC, 'htf-1');
    const res = await runPineStatic({
        ind: indicatorFor({}, SRC, {}),
        bars: hourly,
        market: { symbol, timeframe: '60', symbolInfo: NY },
        visibleRange: undefined,
        prepared,
        instanceId: 'htf-1',
        inputs: {},
        fetchSeries: async (_sym: string, tf: string) => (tf === 'D' ? daily : hourly),
    });
    const s = res.model!.series.find((x) => x.title === 'd_high') as { points: Array<{ value: number }> };
    return s.points.map((p) => p.value);
}

describe('request.security on a higher timeframe, session market', () => {
    it('the last bar of each day reads that day\'s finished daily value; earlier bars the previous day\'s', async () => {
        const v = await dHighByBar('SPY');
        // Jan 12: no previous day → NaN until the day closes; its last bar sees 110.
        expect(v[6]).toBe(110);
        // Jan 13: earlier bars still see Jan 12 (110); the last one sees Jan 13 (120).
        expect(v.slice(7, 13).every((x) => x === 110)).toBe(true);
        expect(v[13]).toBe(120);
    });

    it('the same when the chart symbol carries the provider prefix (us:SPY) but the script asks for syminfo.tickerid', async () => {
        const v = await dHighByBar('us:SPY');
        expect(v[13]).toBe(120);
    });
});
