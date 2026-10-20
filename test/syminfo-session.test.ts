import { describe, it, expect } from 'vitest';
import { indicatorFor, runPineStatic, preparePine } from '../src/pinets/runtime';
import type { OHLCV } from '@luxalgo/vela/plugin';

/**
 * Pine's `syminfo.session` is the chart's session TYPE (`session.regular` | `session.extended`);
 * Vela's symbol info puts the regular HOURS in `session` ("0930-1600"). The engine hands the
 * script the chart session from `ExecutionMarket.session`, and keeps the hours as
 * `syminfo.session_regular` (PineTS's session flags read them there).
 */

const NY = { timezone: 'America/New_York', session: '0930-1600', session_extended: '0400-2000', ticker: 'SPY', tickerid: 'SPY', prefix: '' };
const t0 = Date.UTC(2026, 0, 12, 14, 30); // 09:30 New York
const bars: OHLCV[] = Array.from({ length: 5 }, (_, i) => ({ time: t0 + i * 900_000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 1 }));

const SRC = `//@version=6
indicator("session type")
plot(syminfo.session == session.extended ? 1 : 0, "ext")
plot(syminfo.session == session.regular ? 1 : 0, "reg")
plot(syminfo.session_regular == "0930-1600" ? 1 : 0, "hours")
`;

async function run(session: string | undefined): Promise<Record<string, number>> {
    const prepared = preparePine(SRC, 'si-1');
    const res = await runPineStatic({
        ind: indicatorFor({}, SRC, {}),
        bars,
        market: { symbol: 'us:SPY', timeframe: '15', symbolInfo: NY, ...(session ? { session } : {}) },
        visibleRange: undefined,
        prepared,
        instanceId: 'si-1',
        inputs: {},
        fetchSeries: undefined,
    });
    const last = (title: string) => (res.model!.series.find((x) => x.title === title) as { points: Array<{ value: number }> }).points.at(-1)!.value;
    return { ext: last('ext'), reg: last('reg'), hours: last('hours') };
}

describe('syminfo.session on a session market', () => {
    it('is session.extended on an extended-hours chart, with the regular hours kept', async () => {
        expect(await run('extended')).toEqual({ ext: 1, reg: 0, hours: 1 });
    });

    it('is session.regular on a regular-hours chart and when the host does not say', async () => {
        expect(await run('regular')).toEqual({ ext: 0, reg: 1, hours: 1 });
        expect(await run(undefined)).toEqual({ ext: 0, reg: 1, hours: 1 });
    });
});
