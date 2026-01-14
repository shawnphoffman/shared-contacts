import { Link } from '@tanstack/react-router'
import { NotebookTabs, Users, Upload, Link as LinkIcon, Info } from 'lucide-react'

import { ThemeToggle } from './ThemeToggle'

// import { useState } from 'react'
// import { Menu, X, Contact } from 'lucide-react'

export default function Header() {
  // const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <header className="p-4 flex items-center justify-between bg-background border-b border-border shadow-lg">
        {/* Hamburger menu button - commented out for now */}
        {/* <button
          onClick={() => setIsOpen(true)}
          className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          aria-label="Open menu"
        >
          <Menu size={24} />
        </button> */}
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Link to="/" className="text-foreground flex items-center gap-2">
            <NotebookTabs className="w-5 h-5" />
            <span className="hidden sm:inline">Shared Contacts</span>
          </Link>
        </h1>
        <nav className="flex items-center gap-4">
          <Link
            to="/import"
            className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors"
            activeProps={{
              className:
                'flex items-center gap-2 px-3 py-2 rounded-lg bg-accent text-accent-foreground',
            }}
          >
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Import</span>
          </Link>
          <Link
            to="/radicale-users"
            className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors"
            activeProps={{
              className:
                'flex items-center gap-2 px-3 py-2 rounded-lg bg-accent text-accent-foreground',
            }}
          >
            <Users className="w-4 h-4" />
            <span className="hidden sm:inline">Users</span>
          </Link>
          <Link
            to="/carddav-connection"
            className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors"
            activeProps={{
              className:
                'flex items-center gap-2 px-3 py-2 rounded-lg bg-accent text-accent-foreground',
            }}
          >
            <LinkIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Connection</span>
          </Link>
          <Link
            to="/about"
            className="flex items-center justify-center p-2 rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors"
            activeProps={{
              className:
                'flex items-center justify-center p-2 rounded-lg bg-accent text-accent-foreground',
            }}
            aria-label="About"
          >
            <Info className="w-5 h-5" />
          </Link>
          <ThemeToggle />
        </nav>
      </header>

      {/* Expanding sidebar menu - commented out for now */}
      {/* <aside
        className={`fixed top-0 left-0 h-full w-80 bg-gray-900 text-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold">Navigation</h2>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            aria-label="Close menu"
          >
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          <Link
            to="/"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
            activeProps={{
              className:
                'flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2',
            }}
          >
            <Contact size={20} />
            <span className="font-medium">Contacts</span>
          </Link>
        </nav>
      </aside> */}
    </>
  )
}
