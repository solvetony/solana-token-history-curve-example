import { useEffect, useRef } from 'preact/hooks'
import { ArrowUpRight, X, Sparkles } from 'lucide-preact'

export default function DemoDialog ({ onClose }) {
  const ref = useRef()
  useEffect(() => {
    const previous = document.activeElement
    ref.current.showModal()
    return () => previous?.focus()
  }, [])
  return (
    <dialog ref={ref} className='demo-dialog' onCancel={onClose} onClick={event => { if (event.target === ref.current) onClose() }} aria-labelledby='demo-title'>
      <button className='icon-button close-dialog' onClick={onClose} aria-label='Close dialog'><X size={20} /></button>
      <div className='dialog-icon'><Sparkles size={28} /></div>
      <span className='eyebrow'>A LITTLE TASTE OF SOLANA INDEX</span>
      <h2 id='demo-title'>More wallets. More possibilities.</h2>
      <p>This showcase is for demonstration purposes. You can change the example address once per session, and you’ve used that change.</p>
      <p>Get a Solana Index subscription to query more wallets and build your own historical token insights.</p>
      <a className='button primary' href='https://solanaindex.top/pricing' target='_blank' rel='noreferrer'>Explore subscriptions <ArrowUpRight size={18} /></a>
      <button className='button secondary' onClick={onClose}>Keep exploring this wallet</button>
      <small>Your current wallet and chart are still available.</small>
    </dialog>
  )
}
