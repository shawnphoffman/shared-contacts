import * as React from 'react'
import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const pageContainerVariants = cva('mx-auto w-full px-4 py-6 sm:px-6 lg:px-8', {
	variants: {
		width: {
			narrow: 'max-w-2xl',
			standard: 'max-w-5xl',
			wide: 'max-w-6xl',
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
