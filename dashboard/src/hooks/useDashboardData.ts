/**
 * useDashboardData — Data fetching hook for the Growth Dashboard.
 *
 * Manages: leads data, cross-data, loading/error state, client-side cache,
 * request cancellation via AbortController, and day selection.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import type { CrossDataRow, LeadsData } from '../types'
import { fetchApi } from '../api'
import { isoDate } from '../helpers'

interface DashboardDataState {
  data: LeadsData | null
  crossData: CrossDataRow[]
  loading: boolean
  error: string | null
  selectedDate: string | null
  setSelectedDate: (date: string | null) => void
  fetchData: (from: string, to: string, previousFrom?: string, previousTo?: string) => void
}

export function useDashboardData(): DashboardDataState {
  const [data, setData] = useState<LeadsData | null>(null)
  const [crossData, setCrossData] = useState<CrossDataRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  // Client-side cache + abort controller for request cancellation
  const clientCache = useRef(new Map<string, { data: LeadsData; crossData?: CrossDataRow[]; ts: number }>())
  const abortRef = useRef<AbortController | null>(null)

  // Cleanup on unmount — cancel in-flight request
  useEffect(() => {
    return () => { abortRef.current?.abort() }
  }, [])

  const fetchData = useCallback(async (from: string, to: string, previousFrom?: string, previousTo?: string) => {
    // Cancel any in-flight request
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    const key = `${from}|${to}`
    const cached = clientCache.current.get(key)
    const today = isoDate(new Date())
    const isHistorical = to < today
    const STALE_MS = isHistorical ? 30 * 60_000 : 2 * 60_000 // 30min historic, 2min active

    // Serve cache immediately if fresh enough
    if (cached && Date.now() - cached.ts < STALE_MS) {
      setData(cached.data)
      setCrossData(cached.crossData || [])
      setLoading(false)
      setError(null)
      return
    }

    // Show stale data while revalidating (no spinner if we have stale data)
    if (cached) {
      setData(cached.data)
      setCrossData(cached.crossData || [])
    } else {
      setLoading(true)
    }

    setError(null)
    setSelectedDate(null) // Reset day selection when fetching new period
    try {
      const signal = abortRef.current.signal

      // Build leads URL — include previous period dates when available (vigencia mode)
      let leadsUrl = `/leads?from=${from}&to=${to}`
      if (previousFrom && previousTo) {
        leadsUrl += `&previousFrom=${previousFrom}&previousTo=${previousTo}`
      }

      // Fetch leads + cross-data in parallel for instant full render
      const [result, crossResult] = await Promise.all([
        fetchApi<LeadsData>(leadsUrl, signal),
        fetchApi<CrossDataRow[]>(`/cross-data?from=${from}&to=${to}`, signal)
          .catch((err: unknown) => {
            if (err instanceof DOMException && err.name === 'AbortError') throw err
            console.warn('CrossData fetch failed:', err)
            return [] as CrossDataRow[]
          }),
      ])

      clientCache.current.set(key, { data: result, crossData: crossResult, ts: Date.now() })
      // Evict oldest if cache exceeds 20 entries
      if (clientCache.current.size > 20) {
        let oldestKey = '', oldestTs = Infinity
        clientCache.current.forEach((v, k) => {
          if (v.ts < oldestTs) { oldestTs = v.ts; oldestKey = k }
        })
        if (oldestKey) clientCache.current.delete(oldestKey)
      }
      setData(result)
      setCrossData(crossResult)
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

  return { data, crossData, loading, error, selectedDate, setSelectedDate, fetchData }
}
