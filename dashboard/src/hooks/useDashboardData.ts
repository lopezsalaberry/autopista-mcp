/**
 * useDashboardData — Data fetching hook for the Growth Dashboard.
 *
 * Uses the unified /data endpoint (single HTTP roundtrip) which returns
 * leads KPIs, cross-data, venta online, and response metadata.
 *
 * Manages: data state, client-side cache, request cancellation via
 * AbortController, stale-while-revalidate UX, and day selection.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import type { CrossDataRow, LeadsData } from '../types'
import { fetchApi } from '../api'
import { isoDate } from '../helpers'

/** Unified response shape from GET /api/dashboard/data */
interface UnifiedResponse extends LeadsData {
  crossData: CrossDataRow[]
  ventaOnline: number
  _meta: {
    fetchedAt: string
    version: string
    stale?: boolean
    staleSince?: string | null
  }
}

interface DashboardDataState {
  data: LeadsData | null
  crossData: CrossDataRow[]
  ventaOnline: number
  loading: boolean
  error: string | null
  selectedDate: string | null
  staleInfo: { stale: boolean; fetchedAt: string | null }
  setSelectedDate: (date: string | null) => void
  fetchData: (from: string, to: string, previousFrom?: string, previousTo?: string) => void
}

export function useDashboardData(): DashboardDataState {
  const [data, setData] = useState<LeadsData | null>(null)
  const [crossData, setCrossData] = useState<CrossDataRow[]>([])
  const [ventaOnline, setVentaOnline] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [staleInfo, setStaleInfo] = useState<{ stale: boolean; fetchedAt: string | null }>({ stale: false, fetchedAt: null })

  // Client-side cache + abort controller for request cancellation
  const clientCache = useRef(new Map<string, { data: LeadsData; crossData: CrossDataRow[]; ventaOnline: number; ts: number }>())
  const abortRef = useRef<AbortController | null>(null)

  // Cleanup on unmount — cancel in-flight request
  useEffect(() => {
    return () => { abortRef.current?.abort() }
  }, [])

  const fetchData = useCallback(async (from: string, to: string, previousFrom?: string, previousTo?: string) => {
    // Cancel any in-flight request
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    const key = `${from}|${to}|${previousFrom ?? ''}|${previousTo ?? ''}`
    const cached = clientCache.current.get(key)
    const today = isoDate(new Date())
    const isHistorical = to < today
    const STALE_MS = isHistorical ? 30 * 60_000 : 2 * 60_000 // 30min historic, 2min active

    // Serve cache immediately if fresh enough
    if (cached && Date.now() - cached.ts < STALE_MS) {
      setData(cached.data)
      setCrossData(cached.crossData)
      setVentaOnline(cached.ventaOnline)
      setLoading(false)
      setError(null)
      setStaleInfo({ stale: false, fetchedAt: null })
      return
    }

    // Show stale data while revalidating (no spinner if we have stale data)
    if (cached) {
      setData(cached.data)
      setCrossData(cached.crossData)
      setVentaOnline(cached.ventaOnline)
    } else {
      // Clear previous period's data to avoid showing misleading stale data
      setData(null)
      setCrossData([])
      setVentaOnline(0)
      setLoading(true)
    }

    setError(null)
    setStaleInfo({ stale: false, fetchedAt: null })
    setSelectedDate(null) // Reset day selection when fetching new period
    try {
      const signal = abortRef.current.signal

      // Build unified URL
      let url = `/data?from=${from}&to=${to}`
      if (previousFrom && previousTo) {
        url += `&previousFrom=${previousFrom}&previousTo=${previousTo}`
      }

      // Single request replaces 3 separate fetches
      const result = await fetchApi<UnifiedResponse>(url, signal)

      // Extract LeadsData shape (everything except crossData, ventaOnline, _meta)
      const { crossData: cd, ventaOnline: vo, _meta, ...leadsData } = result

      clientCache.current.set(key, { data: leadsData, crossData: cd, ventaOnline: vo, ts: Date.now() })
      // Evict oldest if cache exceeds 20 entries
      if (clientCache.current.size > 20) {
        let oldestKey = '', oldestTs = Infinity
        clientCache.current.forEach((v, k) => {
          if (v.ts < oldestTs) { oldestTs = v.ts; oldestKey = k }
        })
        if (oldestKey) clientCache.current.delete(oldestKey)
      }
      setData(leadsData)
      setCrossData(cd)
      setVentaOnline(vo)

      // Surface stale data metadata from server
      if (_meta?.stale) {
        setStaleInfo({ stale: true, fetchedAt: _meta.staleSince ?? _meta.fetchedAt })
      } else {
        setStaleInfo({ stale: false, fetchedAt: null })
      }
    } catch (err: unknown) {
      // Silently ignore aborted requests
      if (err instanceof DOMException && err.name === 'AbortError') return
      // Only show error if we have no cached fallback
      if (!cached) {
        setError(err instanceof Error ? err.message : 'Error desconocido')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  return { data, crossData, ventaOnline, loading, error, selectedDate, staleInfo, setSelectedDate, fetchData }
}
