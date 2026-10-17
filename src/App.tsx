import { useState } from 'react'
import { Landing } from './components/Landing'
import { AppPage } from './components/AppPage'

type Page = 'landing' | 'app'

export default function App() {
  const [page, setPage] = useState<Page>(() => {
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/app')) return 'app'
    return 'landing'
  })

  if (page === 'app') {
    return <AppPage onHome={() => setPage('landing')} />
  }

  return <Landing onOpenApp={() => setPage('app')} />
}
