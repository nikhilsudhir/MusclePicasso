import * as React from 'react'
import { cn } from '../../lib/utils'

const Slider = React.forwardRef(({ className, min = 0, max = 100, value, onValueChange, ...props }, ref) => (
  <input
    ref={ref}
    type="range"
    min={min}
    max={max}
    value={value?.[0] ?? 50}
    onChange={(e) => onValueChange?.([Number(e.target.value)])}
    className={cn('w-full cursor-pointer', className)}
    style={{ accentColor: 'hsl(var(--primary))' }}
    {...props}
  />
))
Slider.displayName = 'Slider'

export { Slider }
