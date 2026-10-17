import { Logo } from './Logo'
import { TetherDemo } from './TetherDemo'
import { factoryAddress } from '../contracts/addresses'
import { shortAddr } from '../lib/format'
import { useAccount } from 'wagmi'

interface LandingProps {
  onOpenApp: () => void
}

const TESTNET_CHAIN_ID = 5042002
const TESTNET_FACTORY = factoryAddress(TESTNET_CHAIN_ID)

export function Landing({ onOpenApp }: LandingProps) {
  const { chainId } = useAccount()
  const displayFactory = factoryAddress(chainId ?? TESTNET_CHAIN_ID) || TESTNET_FACTORY
  const chainName = chainId === 5042 ? 'Arc mainnet' : 'Arc testnet'
  const explorerBase = chainId === 5042 ? 'https://explorer.arc.io' : 'https://explorer.testnet.arc.io'

  return (
    <div className="bg-plate min-h-dvh">
      {/* Nav */}
      <div className="max-w-[1120px] mx-auto px-[clamp(16px,4vw,40px)]">
        <nav className="flex items-center gap-5 justify-between py-[18px] border-b border-steel2" aria-label="Site">
          <a href="/" className="flex items-center gap-[10px] no-underline" aria-label="Leash home">
            <Logo size={34} />
          </a>
          <div className="hidden md:flex gap-[22px] text-[14px] font-medium mx-auto">
            <a href="#how" className="text-ink2 no-underline hover:text-ink hover:underline">How it works</a>
            <a href="#safety" className="text-ink2 no-underline hover:text-ink hover:underline">Safety</a>
            <a href="#contract" className="text-ink2 no-underline hover:text-ink hover:underline">Contract</a>
          </div>
          <button
            onClick={onOpenApp}
            className="text-[13px] font-semibold px-3 py-[9px] border border-ink rounded bg-plate hover:bg-ink hover:text-white transition-colors"
          >
            Open app
          </button>
        </nav>
      </div>

      {/* Hero */}
      <header
        className="border-b border-ink"
        style={{
          backgroundImage: 'linear-gradient(var(--steel2) 1px, transparent 1px), linear-gradient(90deg, var(--steel2) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          backgroundColor: 'var(--paper)',
        }}
      >
        <div className="max-w-[1120px] mx-auto px-[clamp(16px,4vw,40px)] grid md:grid-cols-2 gap-10 items-center py-[clamp(32px,6vw,72px)]">
          <div className="grid gap-[22px] justify-items-start">
            <span className="inline-flex items-center gap-[6px] font-mono text-[11px] font-medium tracking-[0.07em] uppercase px-[9px] py-[5px] rounded-full border text-rope-deep bg-rope-wash border-rope-deep">
              <span className="w-[7px] h-[7px] rounded-full bg-current" style={{ animation: 'blink 2s infinite' }} />
              Built for Arc
            </span>
            <h1
              className="text-[clamp(2.3rem,5.6vw,4.4rem)] leading-[0.96] tracking-[-0.025em] text-balance"
              style={{ fontFamily: "'Archivo', system-ui, sans-serif", fontWeight: 900, fontStretch: '118%' }}
            >
              Give your agent a wallet. Keep hold of the{' '}
              <u className="wavy-leash" style={{ textDecorationColor: 'var(--rope)' }}>leash</u>.
            </h1>
            <p className="text-[clamp(16px,1.6vw,19px)] text-ink2 max-w-[46ch]">
              Leash is a USDC vault for AI agents. Set what each agent can spend and who it can pay. Anything outside the lines waits for your yes.
            </p>
            <div className="flex flex-wrap gap-[14px]">
              <button
                onClick={onOpenApp}
                className="inline-flex items-center gap-2 font-body font-semibold text-[14px] px-[18px] py-[13px] rounded border border-ink bg-rope text-white cursor-pointer transition-[transform,box-shadow] hover:-translate-x-px hover:-translate-y-px active:translate-x-[3px] active:translate-y-[3px]"
                style={{ boxShadow: '4px 4px 0 var(--ink)' }}
              >
                Create a vault
              </button>
              <a href="#contract" className="inline-flex items-center gap-2 font-body font-semibold text-[14px] px-[18px] py-[13px] rounded border border-ink bg-plate text-ink no-underline hover:bg-ink hover:text-white transition-colors">
                Read the contract
              </a>
            </div>
            <ul className="flex flex-wrap gap-[10px] p-0 list-none">
              {['No admin keys', 'Not upgradeable', 'You can always withdraw'].map((t) => (
                <li key={t} className="border border-ink bg-plate rounded px-[11px] py-2 font-mono text-[12px] uppercase tracking-[0.05em]">{t}</li>
              ))}
            </ul>
          </div>
          <div>
            <TetherDemo />
          </div>
        </div>
      </header>

      {/* Four things */}
      <section className="border-b border-steel2 py-[clamp(40px,6vw,76px)]" id="safety">
        <div className="max-w-[1120px] mx-auto px-[clamp(16px,4vw,40px)] grid md:grid-cols-[0.8fr_1.2fr] gap-9 items-start">
          <h2
            className="text-[clamp(1.7rem,3.6vw,2.7rem)] leading-[1] tracking-[-0.02em] text-balance max-w-[16ch]"
            style={{ fontFamily: "'Archivo', system-ui, sans-serif", fontWeight: 800, fontStretch: '112%' }}
          >
            Four things your agent can never do.
          </h2>
          <div>
            <ul className="border-t-2 border-ink p-0 list-none">
              {[
                'Pay a new address without your say-so.',
                'Send more than its per-payment cap.',
                'Spend past its daily cap.',
                'Withdraw, change limits or edit the allowlist. Only you can.',
              ].map((text, i) => (
                <li key={i} className="grid grid-cols-[auto_1fr] gap-4 items-baseline py-4 border-b border-steel font-body font-semibold text-[clamp(16px,2vw,20px)] leading-[1.3]">
                  <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-white bg-stop px-[7px] py-1 rounded-[3px]">Never</span>
                  {text}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-ink2 max-w-[60ch] text-[14px]">
              Not even we can touch the funds. There is no admin key, no upgrade path and no fee switch. Each vault belongs to one owner.
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-b border-steel2 py-[clamp(40px,6vw,76px)]" id="how">
        <div className="max-w-[1120px] mx-auto px-[clamp(16px,4vw,40px)] grid gap-7">
          <h2
            className="text-[clamp(1.7rem,3.6vw,2.7rem)] leading-[1] tracking-[-0.02em] text-balance"
            style={{ fontFamily: "'Archivo', system-ui, sans-serif", fontWeight: 800, fontStretch: '112%' }}
          >
            How the leash works.
          </h2>
          <div className="border border-ink rounded overflow-hidden grid md:grid-cols-3">
            {[
              {
                n: 'STEP 1', title: 'Fund the vault',
                body: 'Send USDC to your own vault contract. Only you can take it back out.',
              },
              {
                n: 'STEP 2', title: 'Set the leash',
                body: 'Give each agent a per-payment cap, a daily cap and a list of payees it may pay.',
              },
              {
                n: 'STEP 3', title: 'Let it work',
                body: 'Allowed payments go through at once. Anything else is held, with the money reserved, until you approve or cancel.',
              },
            ].map((step, i) => (
              <article
                key={i}
                className="p-5 grid gap-3 content-start bg-plate border-r border-ink last:border-r-0 max-md:border-r-0 max-md:border-b max-md:last:border-b-0"
              >
                <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink3">{step.n}</span>
                <h3
                  className="text-[20px] leading-tight"
                  style={{ fontFamily: "'Archivo', system-ui, sans-serif", fontWeight: 800, fontStretch: '112%' }}
                >
                  {step.title}
                </h3>
                <p className="text-ink2 text-[14.5px]">{step.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Contract plate */}
      <section className="border-b border-steel2 py-[clamp(40px,6vw,76px)]" id="contract">
        <div className="max-w-[1120px] mx-auto px-[clamp(16px,4vw,40px)] grid md:grid-cols-2 gap-9 items-start">
          <div className="grid gap-4">
            <h2
              className="text-[clamp(1.7rem,3.6vw,2.7rem)] leading-[1] tracking-[-0.02em] text-balance"
              style={{ fontFamily: "'Archivo', system-ui, sans-serif", fontWeight: 800, fontStretch: '112%' }}
            >
              Built to be checked.
            </h2>
            <p className="text-[clamp(16px,1.6vw,19px)] text-ink2">
              The contract is short, open and has no hidden controls. Read it before you fund it, and start with an amount you can afford to lose. This is new software and it has not been audited.
            </p>
            {displayFactory && (
              <a
                href={`${explorerBase}/address/${displayFactory}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 font-body font-semibold text-[14px] px-[18px] py-[13px] rounded border border-ink bg-plate text-ink no-underline hover:bg-ink hover:text-white transition-colors w-fit"
              >
                View on explorer
              </a>
            )}
          </div>
          <div className="border-2 border-ink rounded overflow-hidden bg-paper">
            <h3 className="bg-ink text-white font-mono text-[11px] uppercase tracking-[0.12em] px-[14px] py-[9px]">
              Contract plate
            </h3>
            <dl className="grid">
              {[
                { dt: 'Contract', dd: 'LeashFactory' },
                { dt: 'Network', dd: chainName },
                { dt: 'Address', dd: displayFactory ? shortAddr(displayFactory) : 'Not deployed' },
                { dt: 'Upgradeable', dd: 'No' },
                { dt: 'Admin keys', dd: 'None' },
                { dt: 'Token', dd: 'USDC only' },
                { dt: 'Audit', dd: 'None yet' },
              ].map(({ dt, dd }) => (
                <div key={dt} className="flex flex-wrap justify-between gap-1 px-[14px] py-[10px] border-b border-steel last:border-b-0 font-mono text-[13px]">
                  <dt className="text-ink3">{dt}</dt>
                  <dd className="text-right">{dd}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className="bg-ink text-white py-[clamp(40px,7vw,84px)]">
        <div className="max-w-[1120px] mx-auto px-[clamp(16px,4vw,40px)] flex flex-wrap gap-6 items-center justify-between">
          <h2
            className="text-[clamp(2.2rem,6vw,4.6rem)] leading-[0.95] tracking-[-0.02em]"
            style={{ fontFamily: "'Archivo', system-ui, sans-serif", fontWeight: 900, fontStretch: '125%' }}
          >
            Hold the other end.
          </h2>
          <button
            onClick={onOpenApp}
            className="inline-flex items-center gap-2 font-body font-semibold text-[14px] px-[18px] py-[13px] rounded border border-white bg-rope text-white cursor-pointer transition-[transform,box-shadow] hover:-translate-x-px hover:-translate-y-px active:translate-x-[3px] active:translate-y-[3px]"
            style={{ boxShadow: '4px 4px 0 var(--tension)' }}
          >
            Create a vault
          </button>
        </div>
      </section>

      {/* Footer */}
      <div className="max-w-[1120px] mx-auto px-[clamp(16px,4vw,40px)]">
        <div className="flex flex-wrap gap-2 justify-between py-[18px] font-mono text-[12px] text-ink3">
          <span>Built with Arc Studio. Runs on Arc.</span>
          <span>Unaudited software. Start with small amounts.</span>
        </div>
      </div>
    </div>
  )
}
