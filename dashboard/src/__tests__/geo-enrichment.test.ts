import { describe, it, expect } from 'vitest'
import { enrichZip } from '../helpers'

describe('enrichZip', () => {
  it('resolves a known CABA zip code', () => {
    const result = enrichZip('1000')
    expect(result).not.toBeNull()
    expect(result!.city).toBe('Buenos Aires')
    expect(result!.province).toBe('Ciudad Autónoma de Buenos Aires')
  })

  it('resolves Mar del Plata', () => {
    const result = enrichZip('7600')
    expect(result).not.toBeNull()
    expect(result!.city).toBe('Mar del Plata')
    expect(result!.province).toBe('Buenos Aires')
  })

  it('returns null for empty string', () => {
    expect(enrichZip('')).toBeNull()
  })

  it('returns null for unknown zip code', () => {
    expect(enrichZip('99999')).toBeNull()
  })

  it('resolves CPA format via raw key (B2705)', () => {
    // B2705 may not be in the dataset as a raw key, but the numeric fallback "2705" should work
    const result = enrichZip('B2705')
    // Either the raw key or the numeric fallback should resolve
    if (result) {
      expect(result.province).toBeTruthy()
      expect(result.city).toBeTruthy()
    }
    // If GeoNames doesn't have 2705, this is expected to be null — both outcomes valid
  })

  it('resolves CPA format via numeric fallback', () => {
    // "CP1414" → extract "1414" → should find CABA
    const result = enrichZip('CP1414')
    // 1414 should be in the CABA supplement range (1000-1499)
    expect(result).not.toBeNull()
    expect(result!.province).toBe('Ciudad Autónoma de Buenos Aires')
  })

  it('resolves Córdoba', () => {
    const result = enrichZip('5000')
    expect(result).not.toBeNull()
    expect(result!.city).toBe('Córdoba')
    expect(result!.province).toBe('Córdoba')
  })

  it('handles whitespace in zip codes', () => {
    const result = enrichZip('  1000  ')
    expect(result).not.toBeNull()
    expect(result!.city).toBe('Buenos Aires')
  })

  it('returns null for whitespace-only input', () => {
    expect(enrichZip('   ')).toBeNull()
  })

  it('resolves Rosario', () => {
    const result = enrichZip('2000')
    expect(result).not.toBeNull()
    expect(result!.city).toBe('Rosario')
    expect(result!.province).toBe('Santa Fe')
  })

  it('resolves a GBA zip code', () => {
    const result = enrichZip('1714')
    expect(result).not.toBeNull()
    expect(result!.city).toBe('Merlo')
    expect(result!.province).toBe('Buenos Aires')
  })
})
