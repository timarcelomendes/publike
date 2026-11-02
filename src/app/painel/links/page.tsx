import { Link2, Palette } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { BotoesDoLink } from "@/components/painel/links-para-mandar";
import { CarrosselDoInstagram } from "@/components/instagram/carrossel";
import { KitDeDivulgacao } from "@/components/painel/kit-de-divulgacao";
import { PaginaDeVagas } from "@/components/painel/pagina-de-vagas";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO, SITE_URL } from "@/lib/config";
import { obterMeuPerfil } from "@/lib/dados";
import { ateQuando, plural, primeiro } from "@/lib/formato";
import { caminhoDaConta } from "@/lib/servidor/caminho";
import { instagramDaConta } from "@/lib/servidor/instagram-da-conta";
import { vagasNoArDaConta } from "@/lib/servidor/vagas-do-dia";
import { marcaDaEmpresa } from "@/lib/servidor/vagas-da-empresa";
import { exigirUsuario } from "@/lib/sessao";
import { criarClientePublico } from "@/lib/supabase/servidor";
import { agoraDaRequisicao } from "@/lib/tempo";
import { linkDasVagas, textoDasVagas } from "@/lib/vagas-da-empresa";
import { diaPorExtenso, lerIdsDoDia, ordenarVagasDoDia, VAGAS_MARCADAS } from "@/lib/vagas-do-dia";

export const metadata: Metadata = { title: "Links para divulgar" };

// Links para divulgar: tudo o que a conta manda para fora num lugar só. A página com todas as
// vagas, o kit de divulgação (o texto para os grupos, o carrossel e os stories do Instagram, o
// Status, o cartaz e o quadro para o site), o link de cada vaga no ar e, na agência, os links de
// finalistas para os clientes.

export default function Links({ searchParams }: PageProps<"/painel/links">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/painel/links">["searchParams"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  await exigirUsuario("/painel/links");
  const [perfil, caminho, agora] = await Promise.all([obterMeuPerfil(), caminhoDaConta(), agoraDaRequisicao()]);
  if (!perfil) return null;
  const marca = perfil.tipo === "pessoa" ? null : await marcaDaEmpresa(perfil.id);
  const noAr = caminho.vagas.filter((v) => v.anuncio.status === "ativo");
  const nomeDoCliente = new Map(caminho.listaClientes.map((c) => [c.id, c.nome]));
  const finalistas = caminho.vagas.filter((v) => v.link && Date.parse(v.link.expira_em) >= agora);
  // as vagas no ar de agora, para o texto pronto (o mesmo do "Mandar no WhatsApp" da página de vagas)
  const vagasNoAr = noAr
    .filter((v) => v.anuncio.tipo === "vaga" && Date.parse(v.anuncio.expira_em) > agora)
    .map((v) => v.anuncio);
  // o Instagram do kit: empresa, comércio e agência, com as vagas no ar da conta (a escolha fica em ?v=)
  const instagram = perfil.tipo === "pessoa" ? null : await instagramDaConta();
  const paraOInstagram = instagram
    ? ordenarVagasDoDia(await vagasNoArDaConta(criarClientePublico(), instagram.conta, new Date(agora).toISOString()))
    : [];
  const pedidas = lerIdsDoDia(primeiro((await searchParams).v)).filter((id) => paraOInstagram.some((v) => v.id === id));
  const texto = (origem: string, curto = false) =>
    textoDasVagas(perfil.nome, vagasNoAr, linkDasVagas(SITE_URL, perfil.id, origem, marca?.apelido), { curto });

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
        site={SITE_URL}
        noAr={caminho.vagasNoAr}
        texto={texto("whatsapp")}
        apelido={marca?.apelido ?? null}
      />

      {perfil.tipo !== "pessoa" && (
        <Link
          href="/painel/links/pagina"
          className="flex items-center gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card hover:bg-surface-300 sm:p-5"
        >
          <Palette aria-hidden className="size-5 shrink-0 text-ink-muted" />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2 text-label">
              Página de carreiras
              <Selo variante="novo">Novo</Selo>
            </span>
            <span className="block text-body-sm text-ink-muted">
              {marca
                ? "A cor da marca, a capa, por que trabalhar aí e o endereço curto."
                : "Com a cara da empresa: cor da marca, capa, benefícios e endereço curto. Libera com mais de 10 vagas publicadas ou com uma assinatura."}
            </span>
          </span>
        </Link>
      )}

      <KitDeDivulgacao
        perfilId={perfil.id}
        site={SITE_URL}
        textoCompleto={texto("grupos")}
        textoCurto={texto("grupos", true)}
        vagas={vagasNoAr.slice(0, 30).map((a) => ({ id: a.id, titulo: a.titulo }))}
        comQuadro={perfil.tipo !== "pessoa"}
        instagram={
          instagram &&
          paraOInstagram.length > 0 && (
            <CarrosselDoInstagram
              candidatas={paraOInstagram}
              iniciais={pedidas.length ? pedidas : paraOInstagram.slice(0, VAGAS_MARCADAS).map((v) => v.id)}
              dia={diaPorExtenso(agora)}
              agora={agora}
              rotas={{ imagens: "/painel/links/instagram/imagem", baixar: "/painel/links/instagram/baixar" }}
              links={{ bio: instagram.bio, story: instagram.story }}
              nomeDaConta={instagram.nome}
              ajudaDaBio="Ponha este link na bio do Instagram da empresa: ele abre a página com todas as suas vagas. Quem se candidatar aparece na sua caixa de candidatos."
            />
          )
        }
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
