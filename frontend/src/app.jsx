import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { ArrowUpRight, ArrowRight, Check, ChevronDown, Copy, Layers, LogOut, Moon, Sun, RefreshCw, Search, ShieldCheck, TrendingUp, Wallet, X } from 'lucide-preact'
import { useAuth } from './auth.jsx'
import { loadHistory, loadPoint, request } from './api.js'
import Chart, { formatBalance, formatTime } from './chart.jsx'
import DemoDialog from './dialog.jsx'

const presets = [
  { symbol: 'USDC', name: 'USD Coin', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', color: '#2775ca', mark: '$' },
  { symbol: 'wSOL', name: 'Wrapped SOL', address: 'So11111111111111111111111111111111111111112', color: '#8b5cf6', mark: '◎' }
]
const ranges = ['1D', '7D', '1M', '3M', '1Y', 'ALL']
const short = address => address ? `${address.slice(0, 6)}…${address.slice(-6)}` : 'Loading…'

export default function App ({ theme, toggleTheme }) {
  const auth = useAuth()
  const [config, setConfig] = useState(null)
  const [session, setSession] = useState(null)
  const [address, setAddress] = useState('')
  const [token, setToken] = useState(presets[0])
  const [customMint, setCustomMint] = useState('')
  const [customOpen, setCustomOpen] = useState(false)
  const [range, setRange] = useState('1M')
  const [history, setHistory] = useState(null)
  const [selected, setSelected] = useState(null)
  const [slot, setSlot] = useState('')
  const [loading, setLoading] = useState(false)
  const [changing, setChanging] = useState(false)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [dialog, setDialog] = useState(false)
  const [copied, setCopied] = useState(false)
  const [reload, setReload] = useState(0)
  const activeRequest = useRef(0)
  const wallet = session?.address || config?.exampleAddress || ''

  useEffect(() => {
    const controller = new AbortController()
    request('config', { signal: controller.signal }).then(setConfig).catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setSession(null)
    if (auth.authenticated) {
      setChanging(true)
      auth.getAccessToken().then(token => request('session', { token, signal: controller.signal })).then(setSession).catch(error => { if (!controller.signal.aborted) setActionError(error.message) }).finally(() => { if (!controller.signal.aborted) setChanging(false) })
    } else setChanging(false)
    return () => controller.abort()
  }, [auth.authenticated, auth.user?.id])

  useLayoutEffect(() => { setAddress(wallet) }, [wallet])

  useEffect(() => {
    activeRequest.current++
    if (!wallet || (auth.authenticated && !session)) return
    const controller = new AbortController()
    setLoading(true)
    setError('')
    setActionError('')
    setHistory(null)
    setSelected(null)
    setSlot('')
    async function load () {
      try {
        const accessToken = auth.authenticated ? await auth.getAccessToken() : null
        const data = await loadHistory(wallet, token.address, range, {
          token: accessToken,
          signal: controller.signal,
          onProgress: data => {
            if (controller.signal.aborted) return
            setHistory(data)
            const point = data.points.find(point => point.balance !== null)
            if (point) { setSelected(current => current || point); setSlot(current => current || String(point.slot)) }
          }
        })
        if (!controller.signal.aborted) { setHistory(data); setSelected(current => current || data.points.at(-1)); setSlot(current => current || String(data.points.at(-1).slot)) }
      } catch (error) { if (!controller.signal.aborted) setError(error.message) } finally { if (!controller.signal.aborted) setLoading(false) }
    }
    load()
    return () => controller.abort()
  }, [wallet, token.address, range, reload, auth.authenticated, session?.address])

  function selectPoint (point) { setSelected(point); setSlot(String(point.slot)) }

  async function changeAddress (event) {
    event.preventDefault()
    setActionError('')
    if (!auth.authenticated) {
      if (auth.configured) auth.login()
      else setActionError('Configure VITE_PRIVY_APP_ID to sign in and change the address.')
      return
    }
    if (address.trim() === wallet) return
    if (session?.changed) { setDialog(true); return }
    setChanging(true)
    try {
      const accessToken = await auth.getAccessToken()
      const data = await request('session/address', { token: accessToken, body: { address: address.trim() } })
      setSession(data)
    } catch (error) {
      if (error.code === 'DEMO_LIMIT') setDialog(true)
      else setActionError(error.message)
    } finally { setChanging(false) }
  }

  async function lookup (event) {
    event.preventDefault()
    const generation = activeRequest.current
    setActionError('')
    setChanging(true)
    try {
      const accessToken = auth.authenticated ? await auth.getAccessToken() : null
      const point = await loadPoint(wallet, token.address, Number(slot), { token: accessToken })
      if (generation === activeRequest.current) selectPoint(point)
    } catch (error) { if (generation === activeRequest.current) setActionError(error.message) } finally { setChanging(false) }
  }

  async function copyAddress () {
    try { await navigator.clipboard.writeText(wallet); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { setActionError('Clipboard unavailable. Copy the address from the input.') }
  }

  const points = history?.points || []
  const valid = points.filter(point => point.balance !== null)
  const latest = points.at(-1)
  const change = valid.length > 1 ? Number(valid.at(-1).balance) - Number(valid[0].balance) : null
  const missing = points.filter(point => point.balance === null && !point.pending).length
  const sliderIndex = Math.max(0, points.findIndex(p => p.slot === selected?.slot))
  const changes = points.slice(1).map((p, i) => ({ ...p, delta: p.balance !== null && points[i].balance !== null ? Number(p.balance) - Number(points[i].balance) : null }))
  const maxDelta = Math.max(1, ...changes.map(p => Math.abs(p.delta || 0)))

  return (
    <>
      <header className='top-bar'><a className='brand' href='https://solanaindex.top' target='_blank' rel='noreferrer'><img src='/icon.png' alt='' /><strong>Solana Index</strong><span className='brand-divider' /><span className='brand-section'>Token history</span></a><nav aria-label='Main navigation'><a href='https://solanaindex.top/api-reference' target='_blank' rel='noreferrer'>API reference <ArrowUpRight size={14} /></a><button className='icon-button' onClick={toggleTheme} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}>{theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}</button>{auth.authenticated ? <button className='button secondary login-button' onClick={() => auth.logout()}><LogOut size={16} /> Sign out</button> : <button className='button secondary login-button' disabled={!auth.ready || !auth.configured} onClick={() => auth.login()}><Wallet size={16} /> Sign in</button>}</nav></header>
      <main className='shell'>
        <div className='page-heading'><div><div className='eyebrow'><span className='status-dot' /> SOLANA MAINNET · API SHOWCASE</div><h1>Every balance has a history<span>.</span></h1><p>Explore a wallet’s token balance, one Solana slot at a time.</p></div><a className='button primary' href='https://solanaindex.top/pricing' target='_blank' rel='noreferrer'>Build with Solana Index <ArrowUpRight size={17} /></a></div>
        <section className='card wallet-card' aria-labelledby='wallet-heading'><div className='wallet-intro'><div className='soft-icon'><Wallet size={23} /></div><div><h2 id='wallet-heading'>Wallet to explore</h2><p>{wallet === config?.exampleAddress ? config?.exampleLabel || 'Loading example wallet…' : 'Your selected wallet'}</p></div><span className='badge'>DEMO</span></div><form className='address-form' onSubmit={changeAddress}><label className='input-shell'><Search size={18} /><input aria-label='Solana wallet address' value={address} onInput={event => setAddress(event.target.value)} placeholder='Enter a Solana wallet address' maxLength={44} required minLength={32} spellCheck={false} /></label><button className='icon-button copy-button' type='button' onClick={copyAddress} disabled={!wallet} aria-label='Copy active wallet address'>{copied ? <Check size={18} /> : <Copy size={18} />}</button><button className='button primary' disabled={changing || loading || !auth.ready} type='submit'>{changing ? 'Please wait…' : 'Explore wallet'}<ArrowRight size={17} /></button></form><div className='wallet-footnote'><span><ShieldCheck size={14} /> {auth.authenticated ? session?.changed ? 'Address change used for this session' : 'One address change available in this session' : 'Sign in with Privy to explore one additional wallet'}</span><a href={`https://solscan.io/account/${wallet}`} target='_blank' rel='noreferrer'>{short(wallet)} <ArrowUpRight size={13} /></a></div></section>
        {actionError && <div className='error-message' role='alert'>{actionError}<button className='icon-button' onClick={() => setActionError('')} aria-label='Dismiss error'><X size={16} /></button></div>}
        <section className='metrics' aria-label='Balance summary'><article className='card metric'><span><Layers size={16} /> Current sampled balance</span><strong>{latest?.balance != null ? formatBalance(latest.balance) : '—'}<small>{token.symbol}</small></strong><p>{latest ? `Slot ${latest.slot.toLocaleString()}` : 'Awaiting production data'}</p></article><article className='card metric'><span><TrendingUp size={16} /> Change across available samples</span><strong className={change !== null && change < 0 ? 'negative' : 'positive'}>{change === null ? '—' : `${change > 0 ? '+' : ''}${formatBalance(change)}`}<small>{token.symbol}</small></strong><p>{range === 'ALL' ? 'Across sampled history' : `Selected ${range.toLowerCase()} window`}</p></article><article className='card metric'><span><ShieldCheck size={16} /> History resolution</span><strong>{valid.length || '—'}<small>exact slot samples</small></strong><p>Production Solana Index API</p></article></section>
        <section className='card history-card' aria-labelledby='history-heading'><div className='section-heading'><div><span className='eyebrow'>THE BIG PICTURE</span><h2 id='history-heading'>Token balance history</h2></div><button className='button secondary small' disabled={loading || changing} onClick={() => setReload(value => value + 1)}><RefreshCw size={15} className={loading ? 'spinning' : ''} /> Refresh</button></div><div className='chart-toolbar'><div className='tokens' role='group' aria-label='Select token'>{presets.map(preset => <button key={preset.address} aria-label={preset.symbol} aria-pressed={preset.address === token.address} className={`token-chip ${preset.address === token.address ? 'active' : ''}`} disabled={changing} onClick={() => { setToken(preset); setCustomOpen(false) }}><span className='token-icon' style={{ background: preset.color }}>{preset.mark}</span>{preset.symbol}</button>)}<button className={`token-chip ${!presets.some(p => p.address === token.address) ? 'active' : ''}`} onClick={() => setCustomOpen(value => !value)} disabled={changing}>{!presets.some(p => p.address === token.address) ? short(token.address) : 'Custom token'} <ChevronDown size={14} /></button></div><div className='range-buttons' role='group' aria-label='Time range'>{ranges.map(value => <button key={value} className={value === range ? 'active' : ''} onClick={() => setRange(value)} disabled={changing} aria-pressed={value === range}>{value}</button>)}</div></div>
          {customOpen && <form className='custom-form' onSubmit={event => { event.preventDefault(); setToken({ address: customMint.trim(), symbol: 'TOKEN', name: 'Custom SPL token' }); setCustomOpen(false) }}><input aria-label='SPL token mint address' placeholder='SPL token mint address' value={customMint} onInput={event => setCustomMint(event.target.value)} required minLength={32} maxLength={44} /><button className='button secondary'>Use token</button></form>}
          <div className='chart-title'><span className='token-icon' style={{ background: token.color || 'var(--primary)' }}>{token.mark || '◈'}</span><strong>{token.symbol}</strong><span>{token.name}</span><span className='chart-unit'>BALANCE IN {token.symbol}</span></div>
          {loading && <div className='load-progress' role='status'><span>{history?.loaded || 0} / {history?.total || 10} slots loaded</span><progress aria-label='History loading progress' value={history?.loaded || 0} max={history?.total || 10} /></div>}
          {loading && !valid.length ? <div className='chart-state' role='status'><div className='loading-line' /><RefreshCw className='spinning' size={23} /><h3>Tracing this wallet’s history</h3><p>Loading balances and block timestamps from Solana Index…</p></div> : error ? <div className='chart-state' role='alert'><div className='soft-icon'><Layers size={25} /></div><h3>History is not available yet</h3><p>{error}</p><button className='button secondary' onClick={() => { if (!config) request('config').then(setConfig).catch(error => setError(error.message)); else setReload(value => value + 1) }}>Try again <RefreshCw size={15} /></button></div> : points.length ? <Chart points={points} selected={selected} onSelect={selectPoint} symbol={token.symbol} /> : <div className='chart-state' role='status'><h3>Preparing your history</h3><p>{auth.authenticated && !session ? 'Loading your session…' : 'Connecting to the history service…'}</p></div>}
          <div className='chart-caption'><span><span className='legend-dot' /> {token.symbol} balance · hover to inspect, click to lock</span><span>{missing ? `${missing} samples unavailable · gaps shown` : '10 samples · resolved block timestamps'}</span></div>
        </section>
        <div className='detail-grid'><section className='card slot-card' aria-labelledby='slot-heading'><div className='section-heading'><div><span className='eyebrow'>ZOOM INTO A MOMENT</span><h2 id='slot-heading'>Inspect a slot</h2></div><Layers size={20} /></div><form className='slot-form' onSubmit={lookup}><label htmlFor='slot-input'>Solana slot</label><div><input id='slot-input' type='number' min='1' max={history?.currentSlot} step='1' value={slot} onInput={event => setSlot(event.target.value)} placeholder='Enter a slot number' required /><button className='button primary' disabled={!history || changing || loading}>Go <ArrowRight size={16} /></button></div></form>{points.length > 1 && <div className='slot-slider'><input aria-label='Select sampled slot' type='range' min='0' max={points.length - 1} value={sliderIndex} onInput={event => selectPoint(points[Number(event.target.value)])} /><div><span>{points[0].slot.toLocaleString()}</span><span>{points.at(-1).slot.toLocaleString()}</span></div></div>}<dl className='slot-details'><div><dt>Selected slot</dt><dd>{selected?.slot.toLocaleString() || '—'}</dd></div><div><dt>Time (UTC)</dt><dd>{selected ? formatTime(selected.timestamp) : '—'}</dd></div>{selected?.resolution === 'previous-block' && <div><dt>Timestamp resolution</dt><dd><a href={`https://solscan.io/block/${selected.timestampSlot}`} target='_blank' rel='noreferrer'>Previous block · slot {selected.timestampSlot.toLocaleString()}</a></dd></div>}<div><dt>Exact balance</dt><dd className='exact-balance'>{selected?.balance != null ? `${selected.balance} ${token.symbol}` : '—'}</dd></div><div><dt>Source</dt><dd>{selected?.source || 'Solana Index'}</dd></div></dl></section><section className='card changes-card' aria-labelledby='changes-heading'><div className='section-heading'><div><span className='eyebrow'>BETWEEN THE SAMPLES</span><h2 id='changes-heading'>Balance changes</h2></div><div className='changes-legend'><span><i /> Increase</span><span><i /> Decrease</span></div></div>{changes.length ? <><div className='bars' aria-label='Net changes between consecutive slot samples'>{changes.map(p => <div key={p.slot} className='bar-column' title={`Slot ${p.slot}: ${p.delta === null ? 'Unavailable' : formatBalance(p.delta)} ${token.symbol}`}><div className='bar-half'>{p.delta > 0 && <span style={{ height: `${Math.max(2, p.delta / maxDelta * 100)}%` }} />}</div><div className='bar-half bottom'>{p.delta < 0 && <span style={{ height: `${Math.max(2, Math.abs(p.delta) / maxDelta * 100)}%` }} />}</div></div>)}</div><div className='bar-axis'><span>Earlier</span><span>Selected window</span><span>Latest</span></div></> : <div className='empty-changes'>Balance changes appear when history loads.</div>}<p className='muted-note'>Net differences between sampled balances. These do not represent individual transfers.</p></section></div>
        <section className='card samples-card' aria-labelledby='samples-heading'><div className='section-heading'><div><span className='eyebrow'>THE UNDERLYING DATA</span><h2 id='samples-heading'>Slot samples</h2></div><span className='subtle'>{valid.length} available / {points.length || 10} samples</span></div><div className='table-scroll'><table><thead><tr><th>Slot</th><th>Timestamp (UTC)</th><th className='numeric'>Balance ({token.symbol})</th><th /></tr></thead><tbody>{points.length ? points.slice().reverse().map(p => <tr key={p.slot} className={p.slot === selected?.slot ? 'selected-row' : ''}><td className='mono'>{p.slot.toLocaleString()}</td><td>{p.pending ? 'Loading…' : formatTime(p.timestamp)}{p.resolution === 'previous-block' && <small> · Previous block {p.timestampSlot.toLocaleString()}</small>}</td><td className='numeric mono'>{p.pending ? 'Loading…' : p.balance ?? 'Unavailable'}</td><td><button className='icon-button' aria-label={`Inspect slot ${p.slot}`} onClick={() => selectPoint(p)}><ArrowUpRight size={16} /></button></td></tr>) : <tr><td colSpan='4' className='empty-table'>No samples loaded. Connect the production API to explore historical balances.</td></tr>}</tbody></table></div></section>
        <div className='sampling-note'><ShieldCheck size={16} /><p>{history?.sampling || 'The curve uses up to 10 exact slot balances. Time range boundaries are estimated at 400 ms per slot.'} SPL tokens only; wSOL represents wrapped SOL, not native SOL or stake accounts.</p></div>
        <footer><a className='brand' href='https://solanaindex.top' target='_blank' rel='noreferrer'><img src='/icon.png' alt='' /><strong>Solana Index</strong></a><span>A clearer view of your on-chain history.</span><a href='https://solanaindex.top/api-reference' target='_blank' rel='noreferrer'>Made for builders <ArrowUpRight size={14} /></a></footer>
      </main>
      {dialog && <DemoDialog onClose={() => setDialog(false)} />}
    </>
  )
}
