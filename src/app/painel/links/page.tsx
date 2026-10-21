import { Link2 } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { BotoesDoLink } from "@/components/painel/links-para-mandar";
import { PaginaDeVagas } from "@/components/painel/pagina-de-vagas";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO, SITE_URL } from "@/lib/config";
import { obterMeuPerfil } from "@/lib/dados";
import { ateQuando, plural } from "@/lib/formato";
import { caminhoDaConta } from "@/lib/servidor/caminho";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Links para divulgar" };

// Links para divulgar: tudo o que a conta manda para fora num lugar só. A página com todas as
// vagas (e o código para o site), o link de cada vaga no ar e, na agência, os links de
// finalistas para os clientes.

export default function Links() {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  if (MODO_DEMO) return <SoComSupabase />;
  await exigirUsuario("/painel/links");
  const [perfil, caminho, agora] = await Promise.all([obterMeuPerfil(), caminhoDaConta(), agoraDaRequisicao()]);
  if (!perfil) return null;
  const noAr = caminho.vagas.filter((v) => v.anuncio.status === "ativo");
  const nomeDoCliente = new Map(caminho.listaClientes.map((c) => [c.id, c.nome]));
  const finalistas = caminho.vagas.filter((v) => v.link && Date.parse(v.link.expira_em) >= agora);

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-2xl">
        <h2 className="text-h2">Links para divulgar</h2>
        <p className="mt-1 text-body text-ink-muted">
          Copie e mande no WhatsApp, nos grupos do bairro, no Instagram ou no site. Quem tocar no link chega na vaga, e
          quem curtir aparece na sua caixa de candidatos.
        </p>
      </div>

      <PaginaDeVagas
        perfilId={perfil.id}
        nome={perfil.nome}
        site={SITE_URL}
        noAr={caminho.vagasNoAr}
        comQuadro={perfil.tipo !== "pessoa"}
      />

      <section aria-labelledby="links-das-vagas" className="flex flex-col gap-3">
        <h3 id="links-das-vagas" className="text-h3">
          Cada vaga no ar
        </h3>
        {noAr.length === 0 ? (
          <Vazio icone={Link2} titulo="Nenhuma vaga no ar" acao={<BotaoLink href="/publicar">Publicar vaga</BotaoLink>}>
            Quando a vaga for ao ar, o link dela aparece aqui para mandar.
          </Vazio>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
            {noAr.map((v) => (
              <LinhaDoLink
                key={v.anuncio.id}
                titulo={v.anuncio.titulo}
                detalhe={`${v.clienteId ? `${nomeDoCliente.get(v.clienteId) ?? "Cliente"} · ` : ""}${ateQuando(v.anuncio.expira_em)} · ${plural(v.candidatos.length, "candidato", "candidatos")}`}
                url={`${SITE_URL}/anuncio/${v.anuncio.id}`}
                mensagem={`Vaga: ${v.anuncio.titulo}. Candidate-se de graça no Publike`}
              />
            ))}
          </ul>
        )}
      </section>

      {caminho.agencia && (
        <section aria-labelledby="links-finalistas" className="flex flex-col gap-3">
          <h3 id="links-finalistas" className="text-h3">
            Finalistas para os clientes
          </h3>
          {finalistas.length === 0 ? (
            <p className="rounded-md bg-surface-300 px-4 py-3 text-body-sm">
              Nenhum link de finalistas no ar. Monte o primeiro em Para o cliente.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
              {finalistas.map((v) => (
                <LinhaDoLink
                  key={v.anuncio.id}
                  titulo={v.anuncio.titulo}
                  detalhe={`Para ${(v.clienteId && nomeDoCliente.get(v.clienteId)) || "o cliente"} · ${plural(v.finalistas.length, "finalista", "finalistas")} · ${v.link?.aberto_em ? "já aberto" : "ainda não aberto"}`}
                  url={`${SITE_URL}/finalistas/${v.link?.token}`}
                  mensagem={`Os finalistas para ${v.anuncio.titulo}`}
                />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function LinhaDoLink({
  titulo,
  detalhe,
  url,
  mensagem,
}: {
  titulo: string;
  detalhe: string;
  url: string;
  mensagem: string;
}) {
  return (
    <li className="flex items-center gap-2 px-4 py-3 sm:px-5">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-label">{titulo}</span>
        <span className="block truncate text-body-sm text-ink-muted">{detalhe}</span>
      </span>
      <BotoesDoLink url={url} nome={titulo} mensagem={mensagem} />
    </li>
  );
}
