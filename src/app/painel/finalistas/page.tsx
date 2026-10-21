import { Building2, Send } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { BotoesDoLink } from "@/components/painel/links-para-mandar";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Selo, Vazio, type VarianteSelo } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO, SITE_URL } from "@/lib/config";
import { plural, tempoRelativo } from "@/lib/formato";
import { caminhoDaConta, type VagaNoCaminho } from "@/lib/servidor/caminho";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Para o cliente" };

// Para o cliente (só agência): uma linha por vaga com o cliente, os finalistas, o estado do
// link e as ações. Antes, o link de finalistas só aparecia dentro do quadro de cada vaga.

export default function ParaOCliente() {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo />
    </Suspense>
  );
}

type Estado = { nome: string; tom: VarianteSelo };

function estadoDoLink(v: VagaNoCaminho, agora: number): Estado {
  if (!v.link) return { nome: "Sem link", tom: "contorno" };
  if (Date.parse(v.link.expira_em) < agora) return { nome: "Link vencido", tom: "aviso" };
  if (v.finalistas.some((f) => f.decisao)) return { nome: "O cliente respondeu", tom: "match" };
  if (v.link.aberto_em) return { nome: "O cliente abriu", tom: "novo" };
  return { nome: "Enviado, ainda não aberto", tom: "contorno" };
}

async function Conteudo() {
  if (MODO_DEMO) return <SoComSupabase />;
  await exigirUsuario("/painel/finalistas");
  const [caminho, agora] = await Promise.all([caminhoDaConta(), agoraDaRequisicao()]);
  if (!caminho.agencia) {
    return (
      <Vazio
        icone={Building2}
        titulo="Para o cliente é para agência de emprego e RH"
        acao={<BotaoLink href="/painel">Voltar para Hoje</BotaoLink>}
      >
        A agência manda os finalistas de cada vaga para a empresa cliente por um link, sem conta.
      </Vazio>
    );
  }
  const nomeDoCliente = new Map(caminho.listaClientes.map((c) => [c.id, c.nome]));
  const vagas = caminho.vagas
    .filter((v) => v.anuncio.status === "ativo" || v.anuncio.status === "pausado" || v.link || v.finalistas.length)
    // primeiro quem tem gente pronta, depois quem tem resposta do cliente
    .sort(
      (a, b) =>
        Number(b.prontos.length > 0) - Number(a.prontos.length > 0) ||
        Number(b.finalistas.some((f) => f.decisao)) - Number(a.finalistas.some((f) => f.decisao)),
    );

  return (
    <div className="flex flex-col gap-5">
      <div className="max-w-2xl">
        <h2 className="text-h2">Para o cliente</h2>
        <p className="mt-1 text-body text-ink-muted">
          Os finalistas de cada vaga num link sem conta: o cliente vê o currículo e o seu parecer e responde “Quero
          entrevistar” ou “Não seguir”. O contato dos candidatos continua só com você.
        </p>
      </div>
      {vagas.length === 0 ? (
        <Vazio icone={Send} titulo="Nenhuma vaga no ar" acao={<BotaoLink href="/publicar">Publicar vaga</BotaoLink>}>
          Publique a vaga do cliente. Quando alguém der match, você monta a lista de finalistas aqui.
        </Vazio>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200 shadow-card">
          {vagas.map((v) => {
            const estado = estadoDoLink(v, agora);
            const valido = v.link && Date.parse(v.link.expira_em) >= agora;
            const respostas = v.finalistas.filter((f) => f.decisao).length;
            const cliente = (v.clienteId && nomeDoCliente.get(v.clienteId)) || "Sem cliente";
            const url = valido && v.link ? `${SITE_URL}/finalistas/${v.link.token}` : null;
            return (
              <li key={v.anuncio.id} data-vaga={v.anuncio.titulo} className="flex flex-col gap-3 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/painel/anuncio/${v.anuncio.id}/quadro`}
                      className="font-display text-h3 hover:underline"
                    >
                      {v.anuncio.titulo}
                    </Link>
                    <p className="text-body-sm text-ink-muted">Para {cliente}</p>
                  </div>
                  <Selo variante={estado.tom}>{estado.nome}</Selo>
                </div>
                <p className="flex flex-wrap gap-x-4 gap-y-1 text-body-sm text-ink-muted">
                  <span>
                    <strong className="text-ink">{v.finalistas.length}</strong> na lista
                  </span>
                  <span>
                    <strong className={v.prontos.length ? "text-terra-text" : "text-ink"}>{v.prontos.length}</strong>{" "}
                    {v.prontos.length === 1 ? "pronto para ir" : "prontos para ir"}
                  </span>
                  <span>
                    <strong className="text-ink">{respostas}</strong> {respostas === 1 ? "resposta" : "respostas"}
                  </span>
                  {v.link?.aberto_em && <span>aberto {tempoRelativo(v.link.aberto_em, agora)}</span>}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <BotaoLink
                    href={`/painel/anuncio/${v.anuncio.id}/finalistas`}
                    tamanho="sm"
                    variante={v.prontos.length && !v.link ? "primario" : "secundario"}
                  >
                    <Send aria-hidden />
                    {!v.link
                      ? "Montar o link"
                      : v.prontos.length
                        ? `Pôr ${plural(v.prontos.length, "pessoa", "pessoas")} na lista`
                        : "Abrir a lista"}
                  </BotaoLink>
                  {url && (
                    <BotoesDoLink
                      url={url}
                      nome={`Finalistas de ${v.anuncio.titulo}`}
                      mensagem={`Os finalistas para ${v.anuncio.titulo}`}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
