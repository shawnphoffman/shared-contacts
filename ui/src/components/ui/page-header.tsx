import * as React from 'react'

import { cn } from '@/lib/utils'

function PageHeader({
	className,
	title,
	description,
	icon,
	actions,
	children,
	...props
}: Omit<React.ComponentProps<'div'>, 'title'> & {
	title: React.ReactNode
	description?: React.ReactNode
	icon?: React.ReactNode
	actions?: React.ReactNode
}) {
	return (
		<div data-slot="page-header" className={cn('flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between', className)} {...props}>
			<div className="min-w-0">
				<div className="flex items-center gap-2">
					{icon && (
						<span data-slot="page-header-icon" className="text-muted-foreground [&_svg]:size-6 sm:[&_svg]:size-7">
							{icon}
						</span>
					)}
					<h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
				</div>
				{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
			</div>
			{(actions ?? children) && <div className="flex shrink-0 items-center gap-2">{actions ?? children}</div>}
		</div>
	)
}

export { PageHeader }
