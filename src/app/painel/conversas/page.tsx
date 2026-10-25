import { MessagesSquare } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AbasMensagens, AbasMensagensBase } from "@/components/painel/abas-mensagens";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Avatar, Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { caminhoConversa, etapaParaMim, origemDaConversa } from "@/lib/conversas";
import { tempoRelativo } from "@/lib/formato";
import { conversasPorPessoa } from "@/lib/servidor/conversas";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Mensagens" };

// Uma conversa por pessoa: o que veio de cada vaga em comum e da conexão fica junto. É a aba padrão
// das Mensagens (com os Matches e as Conexões).

export default function Conversas() {
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Suspense fallback={<AbasMensagensBase atual="conversas" />}>
        <AbasMensagens atual="conversas" />
      </Suspense>
      <Suspense fallback={<EsqueletoLista />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

async function Conteudo() {
  if (MODO_DEMO) return <SoComSupabase />;
  await exigirUsuario("/painel/conversas");
  const conversas = await conversasPorPessoa();
  const agora = await agoraDaRequisicao();

  if (!conversas) {
    return (
      <Aviso tipo="alerta" titulo="Não deu para carregar as conversas agora">
        Tente de novo em instantes. Enquanto isso, o WhatsApp de cada match está em “Matches”.
      </Aviso>
    );
  }
  if (conversas.length === 0) {
    return (
      <Vazio
        icone={MessagesSquare}
        titulo="Nenhuma conversa ainda"
        acao={<BotaoLink href="/">Ver oportunidades</BotaoLink>}
      >
        Quando der match (você curtiu e a outra pessoa curtiu de volta) ou uma conexão for aceita, a conversa abre aqui,
        sem precisar trocar número.
      </Vazio>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-3">
      <p className="text-body text-ink-muted">
        Uma conversa por pessoa, sem trocar número: o que veio das vagas e da conexão fica junto. Só vocês dois leem.
      </p>
      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface-200 shadow-card">
        {conversas.map((c) => {
          // a etapa aparece quando a conversa vem de uma vaga só
          const unica = c.vagas.length === 1 ? c.vagas[0] : null;
          return (
            <li key={c.outro_id}>
              <Link
                href={caminhoConversa(c.outro_id)}
                className="flex gap-3 p-4 transition-colors hover:bg-surface-300"
              >
                <Avatar nome={c.outro_nome} foto={c.outro_foto} tamanho={48} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={`truncate ${c.nao_lidas > 0 ? "text-label text-ink" : "text-label"}`}>
                      {c.outro_nome}
                    </p>
                    <span className="shrink-0 text-[13px] text-ink-muted">
                      {tempoRelativo(c.ultima_em ?? c.desde ?? new Date(agora).toISOString(), agora)}
                    </span>
                  </div>
                  <p className="truncate text-body-sm text-ink-muted">{origemDaConversa(c)}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <p
                      className={`min-w-0 flex-1 truncate text-body-sm ${c.nao_lidas > 0 ? "font-semibold text-ink" : "text-ink-muted"}`}
                    >
                      {c.ultima_texto
                        ? `${c.ultima_minha ? "Você: " : ""}${c.ultima_texto}`
                        : c.vagas.length
                          ? "Deu match! Mande a primeira mensagem."
                          : "Conectados! Mande a primeira mensagem."}
                    </p>
                    {unica && unica.etapa !== "novo" && <Selo variante="contorno">{etapaParaMim(unica)}</Selo>}
                    {c.nao_lidas > 0 && (
                      <span className="inline-flex min-w-6 shrink-0 items-center justify-center rounded-pill bg-like px-1.5 text-caption text-on-like">
                        {c.nao_lidas}
                        <span className="sr-only"> {c.nao_lidas === 1 ? "mensagem nova" : "mensagens novas"}</span>
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
