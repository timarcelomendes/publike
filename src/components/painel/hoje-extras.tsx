import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { caminhoConversa, type ConversaPessoa } from "@/lib/conversas";
import { talentosParaVaga } from "@/lib/dados";
import { formatarLugar, tempoRelativo } from "@/lib/formato";
import { montarCaixa, naAba, ordenar } from "@/lib/servidor/caixa";
import type { MeuAnuncio } from "@/lib/tipos";
import { Avatar } from "../ui/basicos";
import { conversaDoModo } from "./cartoes-hoje";
import { ItemDaLista } from "./item-caixa";

// Partes do Hoje de quem contrata (painel e home das empresas): as pessoas que esperam
// resposta, com rosto e % de match; as conversas mais recentes; talentos para uma vaga.

const caixa = "flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 sm:p-5";

function VerTodos({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 self-start text-label text-terra-text hover:text-ink">
      {children}
      <ArrowRight aria-hidden className="size-4" />
    </Link>
  );
}

/** As 5 primeiras pessoas da caixa que esperam resposta (a mesma ordem da caixa). */
export async function EsperandoResposta({ agora }: { agora: number }) {
  const itens = await montarCaixa(agora).catch(() => null);
  const lista = ordenar("responder", (itens ?? []).filter(naAba.responder));
  if (!lista.length) return null;
  return (
    <section aria-labelledby="esperando-resposta" className="flex flex-col gap-3">
      <h2 id="esperando-resposta" className="text-h3">
        Esperando sua resposta
      </h2>
      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface-200">
        {lista.slice(0, 5).map((c) => (
          <ItemDaLista
            key={c.chave}
            c={c}
            agora={agora}
            href={`/painel/caixa?aba=responder&c=${encodeURIComponent(c.chave)}`}
            aberto={false}
          />
        ))}
      </ul>
      <VerTodos href="/painel/caixa?aba=responder">{`Ver todos na caixa (${lista.length})`}</VerTodos>
    </section>
  );
}

/** As 4 conversas mais recentes de quem contrata, as com mensagem nova primeiro. */
export function MensagensRecentes({ conversas, agora }: { conversas: ConversaPessoa[] | null; agora: number }) {
  const lista = (conversas ?? [])
    .filter((c) => conversaDoModo.contratar(c) && c.ultima_texto)
    .sort((a, b) => Number(b.nao_lidas > 0) - Number(a.nao_lidas > 0))
    .slice(0, 4);
  if (!lista.length) return null;
  return (
    <section aria-labelledby="mensagens-recentes" className={caixa}>
      <h2 id="mensagens-recentes" className="text-h3">
        Mensagens
      </h2>
      <ul className="flex flex-col gap-1">
        {lista.map((c) => (
          <li key={c.outro_id}>
            <Link
              href={caminhoConversa(c.outro_id)}
              className="-mx-2 flex items-center gap-3 rounded-md p-2 transition-colors hover:bg-surface-300"
            >
              <Avatar nome={c.outro_nome} foto={c.outro_foto} tamanho={36} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span
                    className={`min-w-0 flex-1 truncate text-body-sm ${c.nao_lidas ? "font-bold" : "font-semibold"}`}
                  >
                    {c.outro_nome}
                  </span>
                  {c.ultima_em && (
                    <span className="shrink-0 text-caption text-ink-muted">{tempoRelativo(c.ultima_em, agora)}</span>
                  )}
                </span>
                <span className={`block truncate text-body-sm ${c.nao_lidas ? "text-ink" : "text-ink-muted"}`}>
                  {c.ultima_minha ? "Você: " : ""}
                  {c.ultima_texto}
                </span>
              </span>
              {c.nao_lidas > 0 && (
                <span className="min-w-6 shrink-0 rounded-pill bg-like px-1.5 text-center text-caption leading-6 text-on-like">
                  {c.nao_lidas}
                  <span className="sr-only"> {c.nao_lidas === 1 ? "mensagem nova" : "mensagens novas"}</span>
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
      <VerTodos href="/painel/conversas">Ver todas as conversas</VerTodos>
    </section>
  );
}

/** 3 pessoas da aba Talentos para a vaga no ar mais nova (a mesma lista de Talentos). */
export async function TalentosDaVaga({ vagas, agora }: { vagas: MeuAnuncio[]; agora: number }) {
  const vaga = vagas
    .filter((v) => v.tipo === "vaga" && v.status === "ativo" && new Date(v.expira_em).getTime() > agora)
    .sort((a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime())[0];
  if (!vaga) return null;
  const talentos = (await talentosParaVaga(vaga.id).catch(() => [])).filter((t) => !t.convidado).slice(0, 3);
  if (!talentos.length) return null;
  return (
    <section aria-labelledby="talentos-da-vaga" className={caixa}>
      <h2 id="talentos-da-vaga" className="text-h3">
        Talentos para {vaga.titulo}
      </h2>
      <ul className="flex flex-col gap-1">
        {talentos.map((t) => (
          <li key={t.perfil_id}>
            <Link
              href={`/talentos/${t.perfil_id}`}
              className="-mx-2 flex items-center gap-3 rounded-md p-2 transition-colors hover:bg-surface-300"
            >
              <Avatar nome={t.nome} foto={t.foto} tamanho={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body-sm font-semibold">{t.nome}</span>
                <span className="block truncate text-body-sm text-ink-muted">
                  {t.titulo ? `${t.titulo} · ` : ""}
                  {formatarLugar(t.bairro, t.cidade)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <VerTodos href={`/painel/talentos?vaga=${vaga.id}`}>Ver mais talentos</VerTodos>
    </section>
  );
}
