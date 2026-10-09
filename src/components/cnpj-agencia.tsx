import { ExternalLink } from "lucide-react";
import { formatarCnpj, linkReceita } from "@/lib/cnpj";

/** CNPJ do perfil (agência, comércio ou empresa), com o link para conferir na Receita Federal. */
export function CnpjDoPerfil({
  cnpj,
  verificada,
  className = "",
}: {
  cnpj: string;
  /** agência com o CNPJ conferido pela equipe */
  verificada: boolean;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-0.5 text-body-sm ${className}`}>
      <p className="text-ink-muted">
        CNPJ <span className="font-mono text-ink">{formatarCnpj(cnpj)}</span>
        {verificada && " · conferido pela equipe do Publike"}
      </p>
      <a
        href={linkReceita(cnpj)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-9 items-center gap-1 self-start text-label text-terra-text underline-offset-2 hover:underline"
      >
        Conferir na Receita Federal
        <ExternalLink aria-hidden className="size-3.5" />
        <span className="sr-only">(abre em outra aba)</span>
      </a>
    </div>
  );
}
