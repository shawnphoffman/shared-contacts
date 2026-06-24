import * as React from 'react'
import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

// Terminal: pages are full-width always (no max-width cap). The `width` prop is
// retained for API compatibility but no longer constrains the content width.
const pageContainerVariants = cva('w-full px-4 py-6 sm:px-6 lg:px-8', {
	variants: {
		width: {
			narrow: '',
			standard: '',
			wide: '',
		},
	},
	defaultVariants: {
		width: 'standard',
	},
})

function PageContainer({
	className,
	width = 'standard',
	...props
}: React.ComponentProps<'div'> & VariantProps<typeof pageContainerVariants>) {
	return <div data-slot="page-container" className={cn(pageContainerVariants({ width }), className)} {...props} />
}

export { PageContainer, pageContainerVariants }
