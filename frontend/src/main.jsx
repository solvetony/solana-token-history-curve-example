import { render } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import AuthProvider from './auth.jsx'
import App from './app.jsx'
import './style.css'

function Root () {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('solana-history-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') } catch { return 'light' }
  })
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('solana-history-theme', theme) } catch {}
  }, [theme])
  return <AuthProvider theme={theme}><App theme={theme} toggleTheme={() => setTheme(value => value === 'light' ? 'dark' : 'light')} /></AuthProvider>
}

render(<Root />, document.getElementById('app'))
