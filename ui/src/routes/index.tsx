import { createFileRoute, Link } from '@tanstack/react-router'
import { Contact } from 'lucide-react'
import { Button } from '../components/ui/button'

export const Route = createFileRoute('/')({ component: App })

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      <section className="relative py-20 px-6 text-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-purple-500/10"></div>
        <div className="relative max-w-5xl mx-auto">
          <div className="flex items-center justify-center gap-6 mb-6">
            <Contact className="w-24 h-24 md:w-32 md:h-32 text-cyan-400" />
            <h1 className="text-6xl md:text-7xl font-black text-white [letter-spacing:-0.08em]">
              <span className="text-gray-300">SHARED</span>{' '}
              <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                CONTACTS
              </span>
            </h1>
          </div>
          <p className="text-2xl md:text-3xl text-gray-300 mb-4 font-light">
            Self-hosted CardDAV contact management
          </p>
          <p className="text-lg text-gray-400 max-w-3xl mx-auto mb-8">
            Manage your contacts with a beautiful web interface. Sync with CardDAV
            clients and keep your address book in sync across all your devices.
          </p>
          <div className="flex flex-col items-center gap-4">
            <Link to="/contacts">
              <Button size="lg" className="px-8 py-3 text-lg">
                <Contact className="w-5 h-5 mr-2" />
                View Contacts
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
