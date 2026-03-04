'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, UIText } from '@/components/ui'
import type { ActivityLocationValue } from '@/lib/location'
import { getOnlineLocationDisplayName } from '@/lib/location'
import { Country, State } from 'country-state-city'

interface ActivityLocationPickerProps {
  portfolioTitle: string
  initialValue?: ActivityLocationValue | null
  onChange: (value: ActivityLocationValue | null) => void
}

export function ActivityLocationPicker({
  initialValue,
  onChange,
}: ActivityLocationPickerProps) {
  const [value, setValue] = useState<ActivityLocationValue | null>(initialValue || null)

  useEffect(() => {
    setValue(initialValue || null)
  }, [initialValue])

  const handleChange = (next: ActivityLocationValue | null) => {
    setValue(next)
    onChange(next)
  }

  const line1 = value?.line1 ?? ''
  const city = value?.city ?? ''
  const state = value?.state ?? ''
  const country = value?.country ?? ''
  const isExactLocationPrivate = value?.isExactLocationPrivate ?? false
  const isOnlineLocationPrivate = value?.isOnlineLocationPrivate ?? false

  const countries = useMemo(() => Country.getAllCountries(), [])

  const selectedCountryIso =
    value?.countryCode ||
    (value?.country
      ? countries.find((c) => c.name === value.country)?.isoCode || ''
      : '')

  const states = useMemo(
    () => (selectedCountryIso ? State.getStatesOfCountry(selectedCountryIso) : []),
    [selectedCountryIso]
  )

  const [countryInput, setCountryInput] = useState(country)
  const [stateInput, setStateInput] = useState(state)
  const [isCountryOpen, setIsCountryOpen] = useState(false)
  const [isStateOpen, setIsStateOpen] = useState(false)

  useEffect(() => {
    setCountryInput(country)
    setStateInput(state)
  }, [country, state])

  const filteredCountries = useMemo(() => {
    const query = countryInput.trim().toLowerCase()
    if (!query) return countries.slice(0, 10)
    return countries
      .filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          c.isoCode.toLowerCase().includes(query)
      )
      .slice(0, 10)
  }, [countries, countryInput])

  const filteredStates = useMemo(() => {
    const query = stateInput.trim().toLowerCase()
    if (!selectedCountryIso || states.length === 0) return []
    if (!query) return states.slice(0, 10)
    return states
      .filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.isoCode.toLowerCase().includes(query)
      )
      .slice(0, 10)
  }, [states, stateInput, selectedCountryIso])

  const isOnline = value?.online ?? false
  const onlineUrl = value?.onlineUrl ?? ''

  return (
    <Card variant="subtle">
      <div className="space-y-4">
        <div>
          <UIText as="p" className="mb-2">
            Set a location for this activity. Choose online or a physical place.
          </UIText>
        </div>

        {/* Online vs Physical */}
        <div className="flex gap-4">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="location-type"
              checked={!isOnline}
              onChange={() => {
                if (isOnline) handleChange(null)
              }}
              className="h-4 w-4 text-blue-600 border-gray-300"
            />
            <UIText as="span">Physical location</UIText>
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="location-type"
              checked={isOnline}
              onChange={() => {
                if (!isOnline) handleChange({ online: true })
              }}
              className="h-4 w-4 text-blue-600 border-gray-300"
            />
            <UIText as="span">Online</UIText>
          </label>
        </div>

        {isOnline && (
          <div className="space-y-2">
            <div>
              <UIText as="label" className="block mb-1">
                Meeting URL <span className="text-gray-500">(optional)</span>
              </UIText>
              <input
                type="url"
                value={onlineUrl}
                onChange={(e) => {
                  const url = e.target.value.trim()
                  handleChange({
                    online: true,
                    onlineUrl: url || undefined,
                    isOnlineLocationPrivate,
                  })
                }}
                placeholder="https://zoom.us/j/... or https://meet.google.com/..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              />
              {onlineUrl && (
                <UIText as="p" className="mt-1 text-gray-500 text-sm">
                  Will display as: {getOnlineLocationDisplayName(onlineUrl)}
                </UIText>
              )}
            </div>
            <div className="flex items-center justify-between">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={isOnlineLocationPrivate}
                  onChange={(e) => {
                    const nextPrivate = e.target.checked
                    handleChange({
                      ...(value || { online: true }),
                      online: true,
                      onlineUrl: onlineUrl || undefined,
                      isOnlineLocationPrivate: nextPrivate,
                    })
                  }}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
                <UIText as="span">Hide meeting link from visitors</UIText>
              </label>
            </div>
          </div>
        )}

        {!isOnline && (
        <div className="space-y-3">
          {/* Country (top level, always visible) */}
          <div>
            <UIText as="label" className="block mb-1">
              Country
            </UIText>
            <div className="relative">
              <input
                type="text"
                value={countryInput}
                onChange={(e) => {
                  setCountryInput(e.target.value)
                  setIsCountryOpen(true)
                }}
                onFocus={() => setIsCountryOpen(true)}
                onBlur={() => {
                  // Allow time for option click (onMouseDown) to fire
                  setTimeout(() => setIsCountryOpen(false), 150)
                }}
                placeholder="Start typing country"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              />
              {isCountryOpen && filteredCountries.length > 0 && (
                <div className="absolute z-20 mt-1 w-full max-h-56 overflow-auto bg-white border border-gray-200 rounded-md shadow-lg">
                  {filteredCountries.map((c) => (
                    <button
                      key={c.isoCode}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        setCountryInput(c.name)
                        setStateInput('')
                        const next: ActivityLocationValue = {
                          ...(value || {}),
                          country: c.name,
                          countryCode: c.isoCode,
                          // clearing more specific levels when country changes
                          state: undefined,
                          stateCode: undefined,
                          city: undefined,
                          line1: undefined,
                        }
                        handleChange(next)
                        setIsCountryOpen(false)
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-gray-50"
                    >
                      <UIText as="span">
                        {c.name} ({c.isoCode})
                      </UIText>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* State / Region (visible only once a country is set) */}
          {selectedCountryIso && (
            <div>
              <UIText as="label" className="block mb-1">
                State / Region
              </UIText>
              <div className="relative">
                <input
                  type="text"
                  value={stateInput}
                  onChange={(e) => {
                    setStateInput(e.target.value)
                    setIsStateOpen(true)
                  }}
                  onFocus={() => {
                    if (states.length > 0) {
                      setIsStateOpen(true)
                    }
                  }}
                  onBlur={() => {
                    // Allow time for option click (onMouseDown) to fire
                    setTimeout(() => setIsStateOpen(false), 150)
                  }}
                  placeholder={states.length ? 'Start typing state/region' : 'No regions for this country'}
                  disabled={states.length === 0}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white disabled:bg-gray-100"
                />
                {isStateOpen && filteredStates.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full max-h-56 overflow-auto bg-white border border-gray-200 rounded-md shadow-lg">
                    {filteredStates.map((s) => (
                      <button
                        key={s.isoCode}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault()
                          setStateInput(s.name)
                          const next: ActivityLocationValue = {
                            ...(value || {}),
                            state: s.name,
                            stateCode: s.isoCode,
                            // clearing more specific levels when state changes
                            city: undefined,
                            line1: undefined,
                          }
                          handleChange(next)
                          setIsStateOpen(false)
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-gray-50"
                      >
                        <UIText as="span">
                          {s.name} ({s.isoCode})
                        </UIText>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* City (visible only once a state/region is set, or when country has no states but we still want a city) */}
          {(value?.state || value?.stateCode || (selectedCountryIso && states.length === 0)) && (
            <div>
              <UIText as="label" className="block mb-1">
                City
              </UIText>
              <input
                type="text"
                value={city}
                onChange={(e) => {
                  const nextCity = e.target.value
                  if (!nextCity) {
                    const hasHigherLevel =
                      !!line1 || !!state || !!country || isExactLocationPrivate
                    // clearing more specific level (street) when city is cleared
                    if (!hasHigherLevel) {
                      handleChange(null)
                      return
                    }
                    const next: ActivityLocationValue = {
                      ...(value || {}),
                      city: undefined,
                      line1: undefined,
                    }
                    handleChange(next)
                    return
                  }
                  const next: ActivityLocationValue = {
                    ...(value || {}),
                    city: nextCity,
                  }
                  handleChange(next)
                }}
                placeholder="City"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          )}

          {/* Street / place name (visible only once a city is set) */}
          {city && (
            <div>
              <UIText as="label" className="block mb-1">
                Street / place name
              </UIText>
              <input
                type="text"
                value={line1}
                onChange={(e) => {
                  const nextLine1 = e.target.value
                  if (!nextLine1) {
                    const hasHigherLevel =
                      !!city || !!state || !!country || isExactLocationPrivate
                    if (!hasHigherLevel) {
                      handleChange(null)
                      return
                    }
                    const next: ActivityLocationValue = {
                      ...(value || {}),
                      line1: undefined,
                    }
                    handleChange(next)
                    return
                  }
                  const next: ActivityLocationValue = {
                    ...(value || {}),
                    line1: nextLine1,
                  }
                  handleChange(next)
                }}
                placeholder="e.g. 123 Main St or Building Name"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          )}
          <div className="flex items-center justify-between">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={isExactLocationPrivate}
                onChange={(e) => {
                  const nextPrivate = e.target.checked
                  if (!nextPrivate && !line1 && !city && !state && !country) {
                    handleChange(null)
                    return
                  }
                  handleChange({
                    ...value,
                    isExactLocationPrivate: nextPrivate,
                  })
                }}
                className="h-4 w-4 text-blue-600 border-gray-300 rounded"
              />
              <UIText as="span">Hide exact address from visitors</UIText>
            </label>
          </div>
        </div>
        )}
      </div>
    </Card>
  )
}

