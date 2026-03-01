'use client'

import { createContext, useContext, useState, useRef, useCallback } from 'react'

type ScrollDirectionContextValue = {
  topBarVisible: boolean
}

const ScrollDirectionContext = createContext<ScrollDirectionContextValue | null>(null)

export function useScrollDirection() {
  return useContext(ScrollDirectionContext)
}

const SCROLL_TOP_THRESHOLD = 10
const MIN_DELTA = 5

export function ScrollDirectionProvider({
  children,
}: {
  children: (scrollProps: { ref: (el: HTMLDivElement | null) => void; onScroll: (e: React.UIEvent<HTMLDivElement>) => void }) => React.ReactNode
}) {
  const [topBarVisible, setTopBarVisible] = useState(true)
  const lastScrollTop = useRef(0)
  const ticking = useRef(false)

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.target as HTMLDivElement
    const scrollTop = el.scrollTop
    if (scrollTop <= SCROLL_TOP_THRESHOLD) {
      setTopBarVisible(true)
      lastScrollTop.current = scrollTop
      return
    }
    if (ticking.current) return
    ticking.current = true
    requestAnimationFrame(() => {
      const delta = scrollTop - lastScrollTop.current
      if (Math.abs(delta) >= MIN_DELTA) {
        setTopBarVisible(delta <= 0)
      }
      lastScrollTop.current = scrollTop
      ticking.current = false
    })
  }, [])

  const scrollRef = useCallback((el: HTMLDivElement | null) => {
    if (el) lastScrollTop.current = el.scrollTop
  }, [])

  return (
    <ScrollDirectionContext.Provider value={{ topBarVisible }}>
      {children({ ref: scrollRef, onScroll })}
    </ScrollDirectionContext.Provider>
  )
}
