import { MessagesSquare } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Avatar, Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { ETAPAS_CANDIDATO } from "@/lib/constantes";
import { listarMinhasConversas } from "@/lib/dados";
import { tempoRelativo } from "@/lib/formato";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Conversas" };

export default function Conversas() {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  if (MODO_DEMO) return <SoComSupabase />;
  await exigirUsuario("/painel/conversas");
  const conversas = await listarMinhasConversas();
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
        Quando der match (você curtiu e a outra pessoa curtiu de volta), a conversa abre aqui, sem precisar trocar
        número.
      </Vazio>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-3">
      <p className="text-body text-ink-muted">Converse com quem deu match, sem trocar número. Só vocês dois leem.</p>
      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface-200 shadow-card">
        {conversas.map((c) => {
          const publiquei = c.papel === "publiquei";
          const etapa = ETAPAS_CANDIDATO[c.etapa];
          return (
            <li key={`${c.anuncio_id}-${c.perfil_id}`}>
              <Link
                href={`/painel/conversas/${c.anuncio_id}/${c.outro_id}`}
                className="flex gap-3 p-4 transition-colors hover:bg-surface-300"
              >
                <Avatar nome={c.outro_nome} foto={c.outro_foto} tamanho={48} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={`truncate ${c.nao_lidas > 0 ? "text-label text-ink" : "text-label"}`}>
                      {c.outro_nome}
                    </p>
                    <span className="shrink-0 text-[13px] text-ink-muted">
                      {tempoRelativo(c.ultima_em ?? c.match_em ?? new Date(agora).toISOString(), agora)}
                    </span>
                  </div>
                  <p className="truncate text-body-sm text-ink-muted">{c.anuncio_titulo}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <p
                      className={`min-w-0 flex-1 truncate text-body-sm ${c.nao_lidas > 0 ? "font-semibold text-ink" : "text-ink-muted"}`}
                    >
                      {c.ultima_texto
                        ? `${c.ultima_minha ? "Você: " : ""}${c.ultima_texto}`
                        : "Deu match! Mande a primeira mensagem."}
                    </p>
                    {c.etapa !== "novo" && (
                      <Selo variante="contorno">{publiquei ? etapa.nome : etapa.paraQuemCurtiu}</Selo>
                    )}
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
