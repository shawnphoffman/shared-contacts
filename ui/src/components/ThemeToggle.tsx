import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

import { Button } from './ui/button'

export function ThemeToggle() {
	const { theme, setTheme } = useTheme()
	const [mounted, setMounted] = useState(false)

	// useEffect only runs on the client, so now we can safely show the UI
	useEffect(() => {
		setMounted(true)
	}, [])

	if (!mounted) {
		return (
			<Button variant="ghost" size="icon" disabled aria-label="Toggle theme">
				<Sun className="size-4" />
				<span className="sr-only">Toggle theme</span>
			</Button>
		)
	}

	return (
		<Button variant="ghost" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme">
			{theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
			<span className="sr-only">Toggle theme</span>
		</Button>
	)
}
