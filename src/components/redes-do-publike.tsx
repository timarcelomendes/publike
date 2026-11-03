import { REDES_DO_PUBLIKE } from "@/lib/config";

// As páginas do Publike no Instagram e no Facebook (o rodapé). Os desenhos são as marcas das redes, simples, na
// cor do texto (o lucide não tem mais as marcas).

function IconeInstagram({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className={className}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconeFacebook({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.6-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H8v3h2.5V21h3Z" />
    </svg>
  );
}

const REDES = [
  { nome: "Instagram", href: REDES_DO_PUBLIKE.instagram, Icone: IconeInstagram },
  { nome: "Facebook", href: REDES_DO_PUBLIKE.facebook, Icone: IconeFacebook },
] as const;

/** "Siga o Publike" com os dois ícones (o rodapé grande); `curto`: só os ícones (o rodapé de uma linha). */
export function RedesDoPublike({ curto = false }: { curto?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      {!curto && <span className="text-body-sm text-ink">Siga o Publike</span>}
      <ul className="flex items-center gap-1">
        {REDES.map(({ nome, href, Icone }) => (
          <li key={nome}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer me"
              aria-label={`O Publike no ${nome} (abre em outra aba)`}
              title={`Publike no ${nome}`}
              className="flex size-10 items-center justify-center rounded-pill text-ink-muted hover:bg-surface-300 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <Icone className="size-5" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
