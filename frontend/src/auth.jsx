import { createContext } from 'preact'
import { useContext } from 'preact/hooks'
import { PrivyProvider, usePrivy } from '@privy-io/react-auth'
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana'

const AuthContext = createContext({ ready: true, authenticated: false, configured: false, login () {}, logout () {}, async getAccessToken () { return null } })
export const useAuth = () => useContext(AuthContext)

function Bridge ({ children }) {
  const auth = usePrivy()
  return <AuthContext.Provider value={{ ...auth, configured: true }}>{children}</AuthContext.Provider>
}

export default function AuthProvider ({ theme, children }) {
  if (!import.meta.env.VITE_PRIVY_APP_ID) return <AuthContext.Provider value={{ ready: true, authenticated: false, configured: false }}>{children}</AuthContext.Provider>
  return (
    <PrivyProvider
      appId={import.meta.env.VITE_PRIVY_APP_ID}
      config={{
        loginMethods: ['wallet'],
        appearance: { theme, accentColor: '#00647c', walletChainType: 'solana-only' },
        externalWallets: { solana: { connectors: toSolanaWalletConnectors() } },
        embeddedWallets: { solana: { createOnLogin: 'off' } },
        loginMessage: 'Sign in to explore one additional wallet per session.'
      }}
    ><Bridge>{children}</Bridge>
    </PrivyProvider>
  )
}
