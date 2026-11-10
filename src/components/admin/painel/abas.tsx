import Link from "next/link";

// As abas do Painel do admin (claude/plano-indicadores-do-admin.md): a Visão geral e uma aba para cada parte do
// caminho. A aba fica no endereço (?aba=); cada uma faz só as consultas dela. Equipe › Números usa as mesmas, sem
// Dinheiro.

export const ABAS_DO_PAINEL = [
  { id: "visao", nome: "Visão geral", soAdmin: false },
  { id: "chegada", nome: "Quem chega", soAdmin: false },
  { id: "cadastro", nome: "Cadastro", soAdmin: false },
  { id: "vagas", nome: "Vagas e candidatos", soAdmin: false },
  { id: "volta", nome: "Quem volta", soAdmin: false },
  { id: "dinheiro", nome: "Dinheiro", soAdmin: true },
  { id: "site", nome: "Uso do site", soAdmin: false },
] as const;

export type AbaDoPainel = (typeof ABAS_DO_PAINEL)[number]["id"];

/** A aba pedida no endereço; a que não existe (ou não é para quem vê) vira a Visão geral. */
export function abaDoPainel(valor: string | undefined, admin: boolean): AbaDoPainel {
  const aba = ABAS_DO_PAINEL.find((a) => a.id === valor && (admin || !a.soAdmin));
  return aba?.id ?? "visao";
}

/** O endereço de uma aba, levando junto o que já está escolhido (o período, a equipe). */
export function linkDaAba(base: string, aba: AbaDoPainel, manter: Record<string, string | undefined> = {}) {
  const p = new URLSearchParams();
  if (aba !== "visao") p.set("aba", aba);
  for (const [k, v] of Object.entries(manter)) if (v) p.set(k, v);
  const q = p.toString();
  return q ? `${base}?${q}` : base;
}

export function AbasDoPainel({
  ativa,
  base,
  admin,
  manter,
}: {
  ativa: AbaDoPainel;
  base: string;
  admin: boolean;
  manter?: Record<string, string | undefined>;
}) {
  return (
    <nav aria-label="Seções do Painel" className="-mx-1 overflow-x-auto px-1">
      <ul className="flex min-w-max gap-6 border-b border-line">
        {ABAS_DO_PAINEL.filter((a) => admin || !a.soAdmin).map((a) => {
          const atual = a.id === ativa;
          return (
            <li key={a.id}>
              <Link
                href={linkDaAba(base, a.id, manter)}
                aria-current={atual ? "page" : undefined}
                className={`block py-3 text-label whitespace-nowrap ${
                  atual ? "text-ink shadow-[inset_0_-3px_0_var(--pk-ink)]" : "text-ink-muted hover:text-ink"
                }`}
              >
                {a.nome}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
