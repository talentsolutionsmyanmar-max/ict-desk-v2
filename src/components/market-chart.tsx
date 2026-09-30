"use client";
import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  IChartApi,
  ISeriesApi,
  LineStyle,
  UTCTimestamp,
} from "lightweight-charts";
import {
  Expand,
  LocateFixed,
  LoaderCircle,
  Radio,
  TriangleAlert,
} from "lucide-react";
import { Candle, Interval, Plan, VolumeProfile } from "@/lib/types";
import { price } from "@/lib/format";

export function MarketChart({
  coin,
  candles,
  interval,
  onInterval,
  plan,
  volumeProfile,
  error,
}: {
  coin: string;
  candles: Candle[];
  interval: Interval;
  onInterval: (i: Interval) => void;
  plan: Plan | null;
  volumeProfile: VolumeProfile | null;
  error: string | null;
}) {
  const host = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volume = useRef<ISeriesApi<"Histogram"> | null>(null);
  const initialized = useRef(false);
  const [hover, setHover] = useState<{
    open: number;
    high: number;
    low: number;
    close: number;
  } | null>(null);
  useEffect(() => {
    if (!host.current) return;
    const api = createChart(host.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#111715" },
        textColor: "#7c8c83",
        fontFamily: "ui-monospace, SFMono-Regular, monospace",
        fontSize: 10,
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: "#1b252010" },
        horzLines: { color: "#25342b60" },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.1, bottom: 0.24 },
      },
      timeScale: {
        borderColor: "#25302b",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 8,
        barSpacing: 7,
      },
      crosshair: {
        vertLine: { color: "#748d6a", labelBackgroundColor: "#33452f" },
        horzLine: { color: "#748d6a", labelBackgroundColor: "#33452f" },
      },
      localization: { priceFormatter: (n: number) => price(n) },
      handleScroll: { vertTouchDrag: false },
    });
    const cs = api.addSeries(CandlestickSeries, {
      upColor: "#91bd82",
      downColor: "#cd8077",
      borderVisible: false,
      wickUpColor: "#91bd82",
      wickDownColor: "#cd8077",
      priceLineColor: "#b6de88",
      priceLineStyle: LineStyle.Dashed,
      lastValueVisible: true,
    });
    const vs = api.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    api
      .priceScale("volume")
      .applyOptions({ scaleMargins: { top: 0.84, bottom: 0 }, visible: false });
    api.subscribeCrosshairMove((param) => {
      const data = param.seriesData.get(cs);
      if (data && "open" in data)
        setHover({
          open: data.open,
          high: data.high,
          low: data.low,
          close: data.close,
        });
      else setHover(null);
    });
    chart.current = api;
    series.current = cs;
    volume.current = vs;
    return () => {
      api.remove();
      chart.current = null;
      series.current = null;
      volume.current = null;
    };
  }, []);
  useEffect(() => {
    initialized.current = false;
    setHover(null);
  }, [coin, interval]);
  useEffect(() => {
    if (!series.current || !volume.current) return;
    series.current.setData(
      candles.map((c) => ({
        time: Math.floor(c.time / 1000) as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );
    volume.current.setData(
      candles.map((c) => ({
        time: Math.floor(c.time / 1000) as UTCTimestamp,
        value: c.volume,
        color: c.close >= c.open ? "#91bd8228" : "#cd807728",
      })),
    );
    if (candles.length > 5 && !initialized.current) {
      chart.current?.timeScale().setVisibleLogicalRange({
        from: Math.max(0, candles.length - 90),
        to: candles.length + 5,
      });
      initialized.current = true;
    }
  }, [candles]);
  useEffect(() => {
    if (!series.current || !plan) return;
    const current = series.current;
    const lines = [
      current.createPriceLine({
        price: plan.entry,
        color: "#d7d6c6",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "ENTRY · research",
      }),
      current.createPriceLine({
        price: plan.stop,
        color: "#da8b80",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "INVALIDATION",
      }),
      current.createPriceLine({
        price: plan.target,
        color: "#c0e58b",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "3R TARGET",
      }),
    ];
    return () => lines.forEach((line) => current.removePriceLine(line));
  }, [plan]);
  useEffect(() => {
    if (!series.current || !volumeProfile) return;
    const current = series.current;
    const lines = [
      current.createPriceLine({
        price: volumeProfile.poc,
        color: "#d5b36c",
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: "POC",
      }),
      current.createPriceLine({
        price: volumeProfile.vah,
        color: "#a88bd4",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "VAH",
      }),
      current.createPriceLine({
        price: volumeProfile.val,
        color: "#a88bd4",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "VAL",
      }),
    ];
    return () => lines.forEach((line) => current.removePriceLine(line));
  }, [volumeProfile]);
  const candle = hover ?? candles.at(-1);
  return (
    <div className="chart-area" ref={panel}>
      <div className="chart-toolbar">
        <div className="timeframes" role="group" aria-label="Chart timeframe">
          {(["5m", "15m", "1h", "4h"] as Interval[]).map((i) => (
            <button
              key={i}
              onClick={() => onInterval(i)}
              className={i === interval ? "active" : ""}
              aria-pressed={i === interval}
            >
              {i}
            </button>
          ))}
        </div>
        <span className="chart-type">
          Candles <span>·</span> Volume <span>·</span> Value profile
        </span>
        <div className="chart-actions">
          <button
            className="icon-button"
            aria-label="Reset chart view"
            title="Reset chart view"
            onClick={() => chart.current?.timeScale().fitContent()}
          >
            <LocateFixed size={15} />
          </button>
          <button
            className="icon-button"
            aria-label="Expand chart"
            title="Expand chart"
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else void panel.current?.requestFullscreen?.();
            }}
          >
            <Expand size={15} />
          </button>
        </div>
      </div>
      <div className="ohlc" aria-live="off">
        <span>
          {coin} / USD <b>{interval}</b>
        </span>
        {candle && (
          <div>
            <span>
              O <em>{price(candle.open)}</em>
            </span>
            <span>
              H <em>{price(candle.high)}</em>
            </span>
            <span>
              L <em>{price(candle.low)}</em>
            </span>
            <span>
              C{" "}
              <em
                className={
                  candle.close >= candle.open ? "positive" : "negative"
                }
              >
                {price(candle.close)}
              </em>
            </span>
          </div>
        )}
      </div>
      <div
        ref={host}
        className="chart-canvas"
        role="img"
        aria-label={`${coin} ${interval} candlestick price chart with volume and session value profile POC VAH VAL. Candle data is available below.`}
      />
      {volumeProfile && (
        <div className="chart-profile-legend" aria-label="Session volume profile levels">
          <span className="profile-poc">POC {price(volumeProfile.poc)}</span>
          <span className="profile-value">VAH {price(volumeProfile.vah)}</span>
          <span className="profile-value">VAL {price(volumeProfile.val)}</span>
          <span className="profile-location">{volumeProfile.location.replace("-", " ")}</span>
        </div>
      )}
      {candles.length === 0 && (
        <div className="chart-overlay">
          {error ? (
            <>
              <TriangleAlert size={24} />
              <strong>Chart feed unavailable</strong>
              <span>{error}</span>
            </>
          ) : (
            <>
              <LoaderCircle className="spin" size={24} />
              <strong>Connecting to the market</strong>
              <span>Loading venue-native candles. No simulated data.</span>
            </>
          )}
        </div>
      )}
      <div className="chart-caption">
        <span>
          <Radio size={11} /> Hyperliquid · UTC · forming candle included
        </span>
        <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">
          Charts by TradingView ↗
        </a>
      </div>
      {error && candles.length > 0 && (
        <p className="inline-warning">
          <TriangleAlert size={13} /> Candle refresh delayed. Last received bars
          remain visible.
        </p>
      )}
      <details className="candle-data">
        <summary>View recent candle data</summary>
        <div className="table-scroll">
          <table>
            <caption className="sr-only">Last eight venue candles</caption>
            <thead>
              <tr>
                <th>UTC</th>
                <th>Open</th>
                <th>High</th>
                <th>Low</th>
                <th>Close</th>
              </tr>
            </thead>
            <tbody>
              {candles.slice(-8).map((c) => (
                <tr key={c.time}>
                  <td>{new Date(c.time).toISOString().slice(11, 16)}</td>
                  <td>{price(c.open)}</td>
                  <td>{price(c.high)}</td>
                  <td>{price(c.low)}</td>
                  <td>{price(c.close)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
