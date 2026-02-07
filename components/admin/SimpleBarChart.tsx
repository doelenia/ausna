'use client'

import { UIText } from '@/components/ui'

interface ChartData {
  label: string
  value: number
}

interface SimpleBarChartProps {
  data: ChartData[]
  maxValue?: number
}

export function SimpleBarChart({ data, maxValue }: SimpleBarChartProps) {
  if (data.length === 0) {
    return (
      <div className="text-gray-500 text-center py-8">
        <UIText>No data available</UIText>
      </div>
    )
  }

  // Calculate max value if not provided
  const calculatedMax = maxValue || Math.max(...data.map((d) => d.value), 1)

  return (
    <div className="space-y-3">
      {data.map((item, index) => {
        const percentage = (item.value / calculatedMax) * 100
        return (
          <div key={index} className="space-y-1">
            <div className="flex items-center justify-between">
              <UIText className="text-sm font-medium text-gray-700 truncate flex-1 mr-2">
                {item.label}
              </UIText>
              <UIText className="text-sm text-gray-600 font-mono">
                {item.value}
              </UIText>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-6 overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300 flex items-center justify-end pr-2"
                style={{ width: `${percentage}%` }}
              >
                {percentage > 10 && (
                  <UIText className="text-xs text-white font-medium">
                    {item.value}
                  </UIText>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}


