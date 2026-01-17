'use client'

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { Note } from '@/types/note'
import { Portfolio } from '@/types/portfolio'

interface CachedItem<T> {
  data: T
  timestamp: number
  accessTime: number
}

interface PortfolioData {
  ownerPortfolio: Portfolio | null
  assignedProjects: Portfolio[]
}

interface DataCacheContextType {
  // Notes cache
  getCachedNote: (noteId: string) => Note | null
  setCachedNote: (noteId: string, note: Note) => void
  clearCachedNote: (noteId: string) => void
  
  // Portfolios cache
  getCachedPortfolio: (portfolioId: string) => Portfolio | null
  setCachedPortfolio: (portfolioId: string, portfolio: Portfolio) => void
  clearCachedPortfolio: (portfolioId: string) => void
  
  // Portfolio data cache (for note cards)
  getCachedPortfolioData: (noteId: string) => PortfolioData | null
  setCachedPortfolioData: (noteId: string, data: PortfolioData) => void
  clearCachedPortfolioData: (noteId: string) => void
  
  // Clear all caches
  clearAll: () => void
}

const DataCacheContext = createContext<DataCacheContextType | undefined>(undefined)

// Cache configuration
const NOTE_TTL = 5 * 60 * 1000 // 5 minutes
const PORTFOLIO_TTL = 10 * 60 * 1000 // 10 minutes
const PORTFOLIO_DATA_TTL = 5 * 60 * 1000 // 5 minutes
const MAX_NOTES = 100
const MAX_PORTFOLIOS = 50
const MAX_PORTFOLIO_DATA = 100

export function DataCacheProvider({ children }: { children: React.ReactNode }) {
  // Use refs to store cache data (avoids re-renders on cache updates)
  const notesCacheRef = useRef<Map<string, CachedItem<Note>>>(new Map())
  const portfoliosCacheRef = useRef<Map<string, CachedItem<Portfolio>>>(new Map())
  const portfolioDataCacheRef = useRef<Map<string, CachedItem<PortfolioData>>>(new Map())
  
  // Force update state (only used when we need to trigger re-render)
  const [, setUpdateCounter] = useState(0)
  
  // LRU eviction helper
  const evictLRU = useCallback(<T,>(
    cache: Map<string, CachedItem<T>>,
    maxSize: number
  ) => {
    if (cache.size < maxSize) return
    
    // Sort by access time and remove oldest
    const entries = Array.from(cache.entries())
    entries.sort((a, b) => a[1].accessTime - b[1].accessTime)
    
    // Remove oldest 10% of entries
    const toRemove = Math.max(1, Math.floor(entries.length * 0.1))
    for (let i = 0; i < toRemove; i++) {
      cache.delete(entries[i][0])
    }
  }, [])
  
  // Clean expired items
  const cleanExpired = useCallback(() => {
    const now = Date.now()
    let cleaned = false
    
    // Clean notes
    for (const [key, item] of notesCacheRef.current.entries()) {
      if (now - item.timestamp > NOTE_TTL) {
        notesCacheRef.current.delete(key)
        cleaned = true
      }
    }
    
    // Clean portfolios
    for (const [key, item] of portfoliosCacheRef.current.entries()) {
      if (now - item.timestamp > PORTFOLIO_TTL) {
        portfoliosCacheRef.current.delete(key)
        cleaned = true
      }
    }
    
    // Clean portfolio data
    for (const [key, item] of portfolioDataCacheRef.current.entries()) {
      if (now - item.timestamp > PORTFOLIO_DATA_TTL) {
        portfolioDataCacheRef.current.delete(key)
        cleaned = true
      }
    }
    
    return cleaned
  }, [])
  
  // Periodic cleanup (every minute)
  useEffect(() => {
    const interval = setInterval(() => {
      cleanExpired()
    }, 60 * 1000)
    
    return () => clearInterval(interval)
  }, [cleanExpired])
  
  // Notes cache methods
  const getCachedNote = useCallback((noteId: string): Note | null => {
    cleanExpired()
    const item = notesCacheRef.current.get(noteId)
    if (!item) return null
    
    // Check if expired
    if (Date.now() - item.timestamp > NOTE_TTL) {
      notesCacheRef.current.delete(noteId)
      return null
    }
    
    // Update access time for LRU
    item.accessTime = Date.now()
    return item.data
  }, [cleanExpired])
  
  const setCachedNote = useCallback((noteId: string, note: Note) => {
    evictLRU(notesCacheRef.current, MAX_NOTES)
    
    notesCacheRef.current.set(noteId, {
      data: note,
      timestamp: Date.now(),
      accessTime: Date.now(),
    })
  }, [evictLRU])
  
  const clearCachedNote = useCallback((noteId: string) => {
    notesCacheRef.current.delete(noteId)
  }, [])
  
  // Portfolios cache methods
  const getCachedPortfolio = useCallback((portfolioId: string): Portfolio | null => {
    cleanExpired()
    const item = portfoliosCacheRef.current.get(portfolioId)
    if (!item) return null
    
    // Check if expired
    if (Date.now() - item.timestamp > PORTFOLIO_TTL) {
      portfoliosCacheRef.current.delete(portfolioId)
      return null
    }
    
    // Update access time for LRU
    item.accessTime = Date.now()
    return item.data
  }, [cleanExpired])
  
  const setCachedPortfolio = useCallback((portfolioId: string, portfolio: Portfolio) => {
    evictLRU(portfoliosCacheRef.current, MAX_PORTFOLIOS)
    
    portfoliosCacheRef.current.set(portfolioId, {
      data: portfolio,
      timestamp: Date.now(),
      accessTime: Date.now(),
    })
  }, [evictLRU])
  
  const clearCachedPortfolio = useCallback((portfolioId: string) => {
    portfoliosCacheRef.current.delete(portfolioId)
  }, [])
  
  // Portfolio data cache methods
  const getCachedPortfolioData = useCallback((noteId: string): PortfolioData | null => {
    cleanExpired()
    const item = portfolioDataCacheRef.current.get(noteId)
    if (!item) return null
    
    // Check if expired
    if (Date.now() - item.timestamp > PORTFOLIO_DATA_TTL) {
      portfolioDataCacheRef.current.delete(noteId)
      return null
    }
    
    // Update access time for LRU
    item.accessTime = Date.now()
    return item.data
  }, [cleanExpired])
  
  const setCachedPortfolioData = useCallback((noteId: string, data: PortfolioData) => {
    evictLRU(portfolioDataCacheRef.current, MAX_PORTFOLIO_DATA)
    
    portfolioDataCacheRef.current.set(noteId, {
      data,
      timestamp: Date.now(),
      accessTime: Date.now(),
    })
  }, [evictLRU])
  
  const clearCachedPortfolioData = useCallback((noteId: string) => {
    portfolioDataCacheRef.current.delete(noteId)
  }, [])
  
  // Clear all caches
  const clearAll = useCallback(() => {
    notesCacheRef.current.clear()
    portfoliosCacheRef.current.clear()
    portfolioDataCacheRef.current.clear()
    setUpdateCounter(prev => prev + 1)
  }, [])
  
  const value: DataCacheContextType = {
    getCachedNote,
    setCachedNote,
    clearCachedNote,
    getCachedPortfolio,
    setCachedPortfolio,
    clearCachedPortfolio,
    getCachedPortfolioData,
    setCachedPortfolioData,
    clearCachedPortfolioData,
    clearAll,
  }
  
  return (
    <DataCacheContext.Provider value={value}>
      {children}
    </DataCacheContext.Provider>
  )
}

export function useDataCache() {
  const context = useContext(DataCacheContext)
  if (context === undefined) {
    throw new Error('useDataCache must be used within a DataCacheProvider')
  }
  return context
}

