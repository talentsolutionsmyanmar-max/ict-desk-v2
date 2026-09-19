"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Book,
  Candle,
  Interval,
  MarketSnapshot,
  ScanSnapshot,
} from "@/lib/types";

export function useDeskFeed(coin: string, interval: Interval) {
  const [markets, setMarkets] = useState<MarketSnapshot | null>(null);
  const [scan, setScan] = useState<ScanSnapshot | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [mids, setMids] = useState<Record<string, number>>({});
  const [book, setBook] = useState<Book | null>(null);
  const [signalCandle, setSignalCandle] = useState<Candle | null>(null);
  const [status, setStatus] = useState<
    "connecting" | "live" | "reconnecting" | "paused"
  >("connecting");
  const [lastMessage, setLastMessage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [chartError, setChartError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(0);
  const refreshLock = useRef(false);
  const mounted = useRef(true);
  const controllers = useRef(new Set<AbortController>());
  const get = useCallback(async (url: string) => {
    const controller = new AbortController();
    controllers.current.add(controller);
    const timeout = setTimeout(() => controller.abort(), 55_000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Feed request failed.");
      return data;
    } finally {
      clearTimeout(timeout);
      controllers.current.delete(controller);
    }
  }, []);
  const refresh = useCallback(async () => {
    if (refreshLock.current || document.hidden) return;
    refreshLock.current = true;
    setRefreshing(true);
    const results = await Promise.allSettled([
      get("/api/markets").then((data) => {
        if (mounted.current) setMarkets(data);
        return data;
      }),
      get(`/api/scan?bar=${Math.floor(Date.now() / 300_000)}`).then((data) => {
        if (mounted.current) setScan(data);
        return data;
      }),
    ]);
    if (mounted.current) {
      if (results[0].status === "fulfilled") setMarkets(results[0].value);
      if (results[1].status === "fulfilled") setScan(results[1].value);
      const failure = results.find((r) => r.status === "rejected");
      setError(
        failure?.status === "rejected"
          ? String(failure.reason?.message ?? "The live feed is unavailable.")
          : null,
      );
      setRefreshing(false);
    }
    refreshLock.current = false;
  }, [get]);
  useEffect(() => {
    mounted.current = true;
    setNow(Date.now());
    const initialLoad = setTimeout(() => void refresh(), 0);
    let slot = Math.floor(Date.now() / 300_000);
    let boundaryRefresh: ReturnType<typeof setTimeout> | undefined;
    const timer = setInterval(() => {
      const time = Date.now();
      setNow(time);
      const nextSlot = Math.floor(time / 300_000);
      if (slot !== nextSlot) {
        slot = nextSlot;
        boundaryRefresh = setTimeout(() => void refresh(), 2500);
      }
    }, 1000);
    const polling = setInterval(() => void refresh(), 60_000);
    const visible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      mounted.current = false;
      clearTimeout(initialLoad);
      clearTimeout(boundaryRefresh);
      clearInterval(timer);
      clearInterval(polling);
      document.removeEventListener("visibilitychange", visible);
      controllers.current.forEach((c) => c.abort());
    };
  }, [refresh]);
  useEffect(() => {
    let cancelled = false;
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    let loading = false;
    setBook(null);
    setSignalCandle(null);
    setCandles([]);
    setChartError(null);
    setMids({});
    setLastMessage(0);
    const loadCandles = async () => {
      if (loading || document.hidden) return;
      loading = true;
      try {
        const data = await get(
          `/api/candles?coin=${encodeURIComponent(coin)}&interval=${interval}`,
        );
        if (!cancelled) {
          setCandles((current) => {
            const merged = new Map<number, Candle>(
              (data.candles as Candle[]).map((c) => [c.time, c]),
            );
            // Retain a WebSocket update of the forming bar received while REST was in flight.
            const last = current.at(-1);
            if (last && last.closeTime >= Date.now())
              merged.set(last.time, last);
            return [...merged.values()]
              .sort((a, b) => a.time - b.time)
              .slice(-400);
          });
          setChartError(null);
        }
      } catch (e) {
        if (!cancelled)
          setChartError(
            e instanceof Error ? e.message : "Chart data unavailable.",
          );
      } finally {
        loading = false;
      }
    };
    const connect = () => {
      if (cancelled || document.hidden) return;
      setStatus(failures ? "reconnecting" : "connecting");
      socket = new WebSocket("wss://api.hyperliquid.xyz/ws");
      socket.onopen = () => {
        if (!socket || cancelled) return;
        failures = 0;
        for (const subscription of [
          { type: "allMids" },
          { type: "l2Book", coin },
          { type: "candle", coin, interval },
          ...(interval === "5m"
            ? []
            : [{ type: "candle", coin, interval: "5m" }]),
        ])
          socket.send(JSON.stringify({ method: "subscribe", subscription }));
      };
      socket.onmessage = (event) => {
        if (cancelled) return;
        try {
          const message = JSON.parse(event.data);
          const receivedAt = Date.now();
          if (message.channel === "allMids" && message.data?.mids) {
            const next: Record<string, number> = {};
            for (const [name, value] of Object.entries(message.data.mids)) {
              const n = Number(value);
              if (Number.isFinite(n) && n > 0) next[name] = n;
            }
            setMids(next);
            setLastMessage(receivedAt);
            setStatus("live");
          }
          if (message.channel === "l2Book" && message.data?.coin === coin) {
            const data = message.data;
            const bids = data.levels?.[0] as { px: string; sz: string }[];
            const asks = data.levels?.[1] as { px: string; sz: string }[];
            const bid = Number(bids?.[0]?.px);
            const ask = Number(asks?.[0]?.px);
            const time = Number(data.time);
            if (!(bid > 0) || !(ask >= bid) || !Number.isFinite(time)) return;
            const mid = (bid + ask) / 2;
            const bidDepth10bps = bids
              .filter((v) => Number(v.px) >= mid * 0.999)
              .reduce((sum, v) => sum + Number(v.px) * Number(v.sz), 0);
            const askDepth10bps = asks
              .filter((v) => Number(v.px) <= mid * 1.001)
              .reduce((sum, v) => sum + Number(v.px) * Number(v.sz), 0);
            if (![bidDepth10bps, askDepth10bps].every(Number.isFinite)) return;
            setBook({
              coin,
              time,
              receivedAt,
              bid,
              ask,
              spreadBps: ((ask - bid) / mid) * 10_000,
              bidDepth10bps,
              askDepth10bps,
            });
          }
          if (
            message.channel === "candle" &&
            message.data?.s === coin &&
            [interval, "5m"].includes(message.data?.i)
          ) {
            const d = message.data;
            const c: Candle = {
              time: Number(d.t),
              closeTime: Number(d.T),
              open: Number(d.o),
              high: Number(d.h),
              low: Number(d.l),
              close: Number(d.c),
              volume: Number(d.v),
            };
            if (
              !Object.values(c).every(Number.isFinite) ||
              c.low <= 0 ||
              c.high < Math.max(c.open, c.close) ||
              c.low > Math.min(c.open, c.close) ||
              c.volume < 0
            )
              return;
            if (d.i === "5m") setSignalCandle(c);
            if (d.i !== interval) return;
            setCandles((current) => {
              const last = current.at(-1);
              if (!last || c.time > last.time)
                return [...current, c].slice(-400);
              if (c.time === last.time) return [...current.slice(0, -1), c];
              return current;
            });
          }
        } catch {
          /* Malformed venue messages never become market data. */
        }
      };
      socket.onerror = () => socket?.close();
      socket.onclose = () => {
        if (cancelled || document.hidden) return;
        setStatus("reconnecting");
        failures++;
        retry = setTimeout(
          connect,
          Math.min(30_000, 1500 * 2 ** Math.min(failures, 4)),
        );
      };
    };
    const visible = () => {
      clearTimeout(retry);
      if (document.hidden) {
        setStatus("paused");
        socket?.close();
      } else {
        void loadCandles();
        if (!socket || socket.readyState >= WebSocket.CLOSING) connect();
      }
    };
    void loadCandles();
    connect();
    const candlePoll = setInterval(() => void loadCandles(), 60_000);
    const heartbeat = setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify({ method: "ping" }));
    }, 25_000);
    document.addEventListener("visibilitychange", visible);
    return () => {
      cancelled = true;
      clearTimeout(retry);
      clearInterval(candlePoll);
      clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", visible);
      socket?.close();
    };
  }, [coin, interval, get]);
  return {
    markets,
    scan,
    candles,
    mids,
    book,
    signalCandle,
    status:
      status === "live" && now - lastMessage > 15_000
        ? ("reconnecting" as const)
        : status,
    lastMessage,
    error,
    chartError,
    refreshing,
    refresh,
    now,
  };
}
