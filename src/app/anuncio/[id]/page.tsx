import { AvisoVideoPedido } from "@/components/video/aviso-video-pedido";
import { ConversaModeracao } from "@/components/conversa-moderacao";
import { minhaConversaModeracao } from "@/lib/servidor/conversa-moderacao";
import { diaADiaDasVagas } from "@/lib/servidor/jeito-de-trabalhar";
import { ITENS_DO_JEITO } from "@/lib/jeito-de-trabalhar";
import { minhaEntrevistaVideo } from "@/lib/servidor/entrevista-video";
import {
  Accessibility,
  Banknote,
  Briefcase,
  Building2,
  Bus,
  Footprints,
  CalendarClock,
  ClipboardCheck,
  Clock,
  FileText,
  Flag,
  Gift,
  ListChecks,
  MessageCircleQuestion,
  MessageCircleReply,
  MapPin,
  Navigation,
  ShieldAlert,
  Users,
  UserCheck,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { ganhosDoBanco, perguntasDoBanco, respostasDoBanco, textoDoGanho } from "@/lib/vaga-extra";
import Image from "next/image";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DadosEstruturados } from "@/components/dados-estruturados";
import { headers } from "next/headers";
import { Suspense, type ReactNode } from "react";
import { ConviteDasVagasVistas, PARAMETRO_DA_VOLTA } from "@/components/convite-das-vagas-vistas";
import { anunciosNoAr } from "@/lib/servidor/paginas-busca";
import { BarraCurtirCelular } from "@/components/anuncio/barra-curtir-celular";
import { ContarAbertura } from "@/components/anuncio/contar-abertura";
import { ContarImpulso } from "@/components/anuncio/contar-impulso";
import { BotaoCompartilhar } from "@/components/anuncio/compartilhar";
import { QuadroIndicar } from "@/components/anuncio/indicar";
import { AtalhosDaVaga, SecaoComentarios } from "@/components/anuncio/secao-comentarios";
import { codigoDaPessoa } from "@/lib/indicacao";
import { BotaoSeguir } from "@/components/social/botoes";
import { BotaoSalvarVaga } from "@/components/anuncio/salvar-vaga";
import { VerMaisPerto } from "@/components/anuncio/ver-mais";
import { CnpjDoPerfil } from "@/components/cnpj-agencia";
import { BotaoVagaPreenchida } from "@/components/painel/acoes";
import { PainelCurtir } from "@/components/anuncio/painel-curtir";
import { ListaAvaliacoes, NotaDoProfissional } from "@/components/avaliacoes";
import { MapaArea } from "@/components/mapa/mapa-area";
import { MatchDaVaga, SeloMatch } from "@/components/match-vaga";
import { Aviso, Avatar, Container, Esqueleto, Selo } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { matchComAVaga } from "@/lib/aderencia";
import { comFuncaoDasVagas, comFuncoesDoCurriculo } from "@/lib/servidor/funcoes-pelo-contexto";
import { SITE_URL } from "@/lib/config";
import {
  categoria,
  descreverAtendimento,
  nomeBeneficio,
  nomeEscolaridade,
  nomeExperiencia,
  nomeJornada,
  nomeModelo,
  nomePcd,
  REGIMES,
  STATUS_ANUNCIO,
  TEXTO_SEGUIR,
} from "@/lib/constantes";
import {
  aceitoEsperandoMeuCurriculo,
  contarVisita,
  contatoDoMatch,
  minhaEntrevista,
  listarAvaliacoesPublicas,
  listarMeusBloqueios,
  listarMeusDesfeitos,
  meuCurriculoNaVitrine,
  obterAnuncio,
  obterMeuCurriculo,
  obterMeuPerfil,
  obterNotaDoProfissional,
  obterUsuario,
  respostaDeQuemPublica,
  vagaSalva,
} from "@/lib/dados";
import { comoResponde } from "@/lib/resposta";
import {
  ateQuando,
  formatarLugar,
  formatarValor,
  formatarMesAno,
  primeiro,
  semPrazo,
  rotuloConta,
  rotuloModalidade,
  tempoRelativo,
  nomeDoBairro,
  urlDaFoto,
  urlDaFotoTrabalho,
  valorDoAnuncio,
} from "@/lib/formato";
import { formatarCep } from "@/lib/cep";
import { distanciaKm } from "@/lib/descobrir";
import { deslocamentoCurto, deslocamentos, formatarMinutos } from "@/lib/deslocamento";
import { meusSeguidos } from "@/lib/dados-social";
import { obterLocal } from "@/lib/local";
import { VagasDaVaga } from "@/components/anuncio/vagas-da-vaga";
import { chaveBairro } from "@/lib/regioes";
import { agoraDaRequisicao } from "@/lib/tempo";
import type { AnuncioCompleto, Regime, StatusAnuncio } from "@/lib/tipos";
import { SeloVerificado } from "@/components/selo-verificado";
import { comecaJaDaVaga } from "@/lib/servidor/comeca-ja";
import { contatoPorDaVaga } from "@/lib/servidor/contato-por";
import { funcaoDaVaga } from "@/lib/servidor/paginas-funcao";
import { caminhoDaFuncao, tituloDaFuncao } from "@/lib/funcoes-das-paginas";
import { descricaoNaBusca, tituloNaBusca } from "@/lib/titulo-na-busca";
import { destinoDoAnuncioForaDoAr } from "@/lib/servidor/vaga-fora-do-ar";
import { caminhoDaBusca, caminhoDoBairro, cidadeDoSlug, slugDaCidade } from "@/lib/paginas-busca";
import { soOlharComoPessoa } from "@/lib/servidor/so-olhar";
import { meusTestesDaVaga, testesDaVaga } from "@/lib/servidor/testes";
import { nomeCurtoDoTeste } from "@/lib/testes";
import { AvisoTesteNaVaga } from "@/components/testes/aviso-teste-na-vaga";
import { TestesParaMim } from "@/components/testes/testes-para-mim";
import { AvisoTriagem } from "@/components/anuncio/aviso-triagem";
import { vagaUsaTriagem } from "@/lib/servidor/copiloto";

export async function generateMetadata({ params }: PageProps<"/anuncio/[id]">): Promise<Metadata> {
  const { id } = await params;
  const anuncio = await obterAnuncio(id);
  // vaga que saiu do ar: para as parecidas; sem o anúncio, 404 de verdade (para os robôs, o metadado vem antes da
  // página e a resposta sai com o código certo)
  if (!anuncio) return paraAsParecidasOu404(id);
  // no Google: "Vaga de frentista em Setor Bueno, Goiânia · R$ 2.300" e o convite (claude/plano-alcance-e-cadastros.md)
  const titulo = tituloNaBusca(anuncio);
  const descricao = descricaoNaBusca(anuncio);
  return {
    title: titulo,
    description: descricao,
    alternates: { canonical: `/anuncio/${id}` },
    openGraph: { title: titulo, description: descricao, type: "article" },
    // fora do ar ou preenchida: sai da busca, mas os links (as vagas parecidas) continuam valendo
    robots: anuncio.status === "ativo" && !anuncio.preenchida_em ? undefined : { index: false, follow: true },
  };
}

/**
 * Anúncio que o visitante não pode ver: se ele já esteve no ar (pausado, encerrado, vencido), vai para as vagas
 * parecidas, com o aviso; se não existe ou nunca foi público, o 404.
 */
async function paraAsParecidasOu404(id: string): Promise<never> {
  const destino = await destinoDoAnuncioForaDoAr(id);
  if (destino) redirect(destino);
  notFound();
}

export default function PaginaAnuncio({ params, searchParams }: PageProps<"/anuncio/[id]">) {
  return (
    <Suspense fallback={<EsqueletoAnuncio />}>
      <DetalheAnuncio params={params} searchParams={searchParams} />
    </Suspense>
  );
}

// Um par da lista: dentro do <dl>, só um <div> com o <dt> e o <dd> (o ícone vai no <dt>, ao lado), para o
// leitor de tela ler "Onde é: Setor Sul" (com o ícone num invólucro à parte, a lista não valia)
function Fato({ icone: Icone, rotulo, children }: { icone: LucideIcon; rotulo: string; children: ReactNode }) {
  return (
    <div className="relative min-h-10 pl-[52px]">
      <dt className="text-body-sm text-ink-muted">
        <span
          aria-hidden
          className="absolute top-0 left-0 flex size-10 items-center justify-center rounded-pill bg-surface-300 text-ink"
        >
          <Icone className="size-5" />
        </span>
        {rotulo}
      </dt>
      <dd className="text-label text-ink">{children}</dd>
    </div>
  );
}

/** Dados estruturados para o Google mostrar a vaga na busca de empregos. */
function dadosVaga(a: AnuncioCompleto) {
  const tipos: Record<string, string> = {
    clt: "FULL_TIME",
    aprendiz: "PART_TIME",
    estagio: "INTERN",
    trainee: "FULL_TIME",
    temporario: "TEMPORARY",
    intermitente: "PART_TIME",
    diaria: "PER_DIEM",
    freelance: "CONTRACTOR",
    produtividade: "OTHER",
    autonomo: "CONTRACTOR",
    pj: "CONTRACTOR",
    outro: "OTHER",
  };
  const unidades: Record<string, string> = { hora: "HOUR", dia: "DAY", semana: "WEEK", mes: "MONTH" };
  return {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: a.titulo,
    description: a.descricao.replace(/\n/g, "<br>"),
    datePosted: a.criado_em,
    ...(semPrazo(a.expira_em) ? {} : { validThrough: a.expira_em }),
    employmentType:
      a.jornada === "meio_periodo" && a.regime === "clt" ? "PART_TIME" : (tipos[a.regime ?? "outro"] ?? "OTHER"),
    // vaga de agência: quem contrata é a empresa (ou "confidencial"), não a agência
    hiringOrganization: {
      "@type": "Organization",
      name: a.contratante ?? (a.contratante_confidencial ? "Confidencial" : a.autor_nome),
      // quem publicou é quem contrata: o perfil público dele no Publike
      ...(!a.contratante && !a.contratante_confidencial ? { sameAs: `${SITE_URL}/perfil/${a.autor_id}` } : {}),
      // o logo ao lado da vaga no Google Vagas: a foto de quem publicou, quando é quem contrata
      ...(!a.contratante && !a.contratante_confidencial && a.autor_foto && a.autor_tipo !== "pessoa"
        ? { logo: urlDaFoto(a.autor_foto) }
        : {}),
    },
    identifier: { "@type": "PropertyValue", name: "Publike", value: a.id },
    occupationalCategory: categoria(a.categoria).nome,
    industry: categoria(a.categoria).nome,
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        ...(a.local_exato && a.endereco ? { streetAddress: a.endereco } : {}),
        ...(a.local_exato && a.cep ? { postalCode: a.cep } : {}),
        addressLocality: a.cidade,
        addressRegion: "GO",
        addressCountry: "BR",
      },
    },
    directApply: false,
    url: `${SITE_URL}/anuncio/${a.id}`,
    ...(a.modelo === "remoto"
      ? { jobLocationType: "TELECOMMUTE", applicantLocationRequirements: { "@type": "State", name: "Goiás" } }
      : {}),
    ...(a.experiencia === "sem" ? { experienceRequirements: "no requirements" } : {}),
    ...(a.experiencia && a.experiencia !== "sem"
      ? {
          experienceRequirements: {
            "@type": "OccupationalExperienceRequirements",
            monthsOfExperience: { "6_meses": 6, "1_ano": 12, "2_anos": 24 }[a.experiencia] ?? 0,
          },
        }
      : {}),
    ...(a.escolaridade_minima ? { educationRequirements: nomeEscolaridade(a.escolaridade_minima) } : {}),
    // comissão, bônus, gorjeta...: o Google mostra junto do salário
    ...(ganhosDoBanco(a.ganhos_extras, a.comissao).length
      ? { incentiveCompensation: ganhosDoBanco(a.ganhos_extras, a.comissao).map(textoDoGanho).join("; ") }
      : {}),
    ...(a.pagamento_valor != null && a.pagamento_unidade && unidades[a.pagamento_unidade]
      ? {
          baseSalary: {
            "@type": "MonetaryAmount",
            currency: "BRL",
            value:
              a.pagamento_ate != null
                ? {
                    "@type": "QuantitativeValue",
                    minValue: a.pagamento_valor,
                    maxValue: a.pagamento_ate,
                    unitText: unidades[a.pagamento_unidade],
                  }
                : { "@type": "QuantitativeValue", value: a.pagamento_valor, unitText: unidades[a.pagamento_unidade] },
          },
        }
      : {}),
  };
}

async function DetalheAnuncio({
  params,
  searchParams,
}: {
  params: PageProps<"/anuncio/[id]">["params"];
  searchParams: PageProps<"/anuncio/[id]">["searchParams"];
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [anuncio, usuario, seguidos] = await Promise.all([obterAnuncio(id), obterUsuario(), meusSeguidos()]);
  if (!anuncio) return paraAsParecidasOu404(id);

  const agora = await agoraDaRequisicao();
  const dono = usuario?.id === anuncio.autor_id;
  // empresa vendo como pessoa ("só olhar"): a própria vaga aparece como as pessoas veem
  const proprio = dono && !(await soOlharComoPessoa());
  const [contato, entrevista] =
    anuncio.minha_curtida === "match"
      ? await Promise.all([contatoDoMatch(anuncio.id), minhaEntrevista(anuncio.id)])
      : [null, null];
  if (!dono && anuncio.tipo === "vaga") await contarVisita(anuncio.id, (await headers()).get("user-agent"));
  // match desfeito: dá para curtir de novo, a não ser que quem publicou tenha bloqueado
  const desfeito =
    anuncio.minha_curtida === "desfeito"
      ? await Promise.all([listarMeusDesfeitos(), listarMeusBloqueios()]).then(([d, b]) => {
          const item = d.get(anuncio.id);
          return item ? { ...item, bloqueadoPeloOutro: Boolean(b.get(anuncio.autor_id)?.ele) } : null;
        })
      : null;
  const paraQuemProcura = usuario && !proprio && anuncio.tipo === "vaga";
  const curriculo = paraQuemProcura ? await obterMeuCurriculo() : null;
  const temCurriculo = paraQuemProcura ? curriculo !== null : null;
  // à mostra na aba Talentos: no contato direto, o link do currículo vai na mensagem do WhatsApp
  const curriculoNaVitrine = curriculo ? await meuCurriculoNaVitrine().catch(() => false) : false;
  // o % de match com o currículo (com pouco para comparar, não aparece)
  const perfil = curriculo ? await obterMeuPerfil().catch(() => null) : null;
  // só conta de pessoa (como a lista, em quemProcura): empresa não tem % de match
  // o % pelo contexto: a função que a IA leu de cada experiência e da vaga (cópias; o currículo não muda)
  const quem =
    curriculo && perfil?.tipo === "pessoa"
      ? { curriculo: await comFuncoesDoCurriculo(curriculo), cidade: perfil.cidade, bairro: perfil.bairro }
      : null;
  const match = quem ? matchComAVaga((await comFuncaoDasVagas([anuncio]))[0], quem, agora) : null;
  // quem publicou já aceitou e falta o currículo (vaga que pede): o próximo passo é mandar
  const aceita =
    anuncio.minha_curtida === "pendente" && anuncio.pede_curriculo && (await aceitoEsperandoMeuCurriculo(anuncio.id));
  const lugar = formatarLugar(anuncio.bairro, anuncio.cidade);
  const valor = valorDoAnuncio(anuncio);
  const vaga = anuncio.tipo === "vaga";
  const novo = agora - new Date(anuncio.criado_em).getTime() < 48 * 3600 * 1000;
  const status = anuncio.status as StatusAnuncio;
  // com a moderação (em análise ou removido): quem publicou conversa com a equipe aqui (migração 20270405120000)
  const comModeracao = status === "em_analise" || status === "removido";
  const conversaModeracao = proprio && comModeracao ? await minhaConversaModeracao(anuncio.id) : [];
  const fotos = anuncio.fotos.map((f) => urlDaFotoTrabalho(f)).filter((u): u is string => Boolean(u));
  const [nota, avaliacoes] = vaga
    ? [null, []]
    : await Promise.all([obterNotaDoProfissional(anuncio.autor_id), listarAvaliacoesPublicas(anuncio.autor_id)]);
  const primeiroNome = anuncio.autor_nome.split(" ")[0];
  // pessoa pelo primeiro nome; comércio, empresa e agência pelo nome inteiro
  const nomeParaSeguir = anuncio.autor_tipo === "pessoa" ? primeiroNome : anuncio.autor_nome;
  const salva = vaga && usuario && !proprio ? await vagaSalva(anuncio.id) : false;
  const comecaJa = vaga && anuncio.status === "ativo" && !anuncio.preenchida_em && (await comecaJaDaVaga(anuncio.id));
  // depois do match, só pelo chat do Publike (sem o contato de quem publicou; claude/plano-so-chat-ou-whatsapp.md)
  const soChat = vaga && !proprio && (await contatoPorDaVaga(anuncio.id)) === "chat";
  // quanto quem publicou costuma responder as curtidas (só com 5 curtidas ou mais)
  const resposta =
    vaga && !proprio
      ? ((await respostaDeQuemPublica([anuncio.autor_id]).catch(() => null))?.get(anuncio.autor_id) ?? null)
      : null;
  const responde = resposta ? comoResponde(resposta, true) : null;
  const agencia = anuncio.autor_tipo === "agencia";
  // tempo de casa até o trabalho (só com o CEP de casa: o ponto da pessoa)
  const local = vaga && !proprio ? await obterLocal() : null;
  // arredondada a 0,1 km, como a distância da lista (buscar_anuncios): o mesmo tempo nas duas
  const kmDeCasa = local?.ponto
    ? Math.round(distanciaKm(local.ponto.lat, local.ponto.lng, anuncio.lat, anuncio.lng) * 10) / 10
    : null;
  const comoChegar = `https://www.google.com/maps/dir/?api=1&destination=${anuncio.lat},${anuncio.lng}&travelmode=transit`;
  const temContratante = vaga && (anuncio.contratante !== null || anuncio.contratante_confidencial);
  const beneficios = [
    ...anuncio.beneficios_lista.flatMap((b) => nomeBeneficio(b) ?? []),
    ...(anuncio.beneficios ? [anuncio.beneficios] : []),
  ];
  const perguntas = vaga ? perguntasDoBanco(anuncio.perguntas) : [];
  const ganhos = vaga ? ganhosDoBanco(anuncio.ganhos_extras, anuncio.comissao) : [];
  const requisitos = [
    anuncio.escolaridade_minima ? `${nomeEscolaridade(anuncio.escolaridade_minima)}` : null,
    nomeExperiencia(anuncio.experiencia),
    anuncio.cnh ? `CNH ${anuncio.cnh}` : null,
  ].filter((r): r is string => Boolean(r));

  // como é o dia a dia (o jeito de trabalhar, migração 20270309120000)
  const diaADia = vaga ? ((await diaADiaDasVagas([anuncio.id])).get(anuncio.id) ?? []) : [];
  const nomesDoDiaADia = ITENS_DO_JEITO.filter((i) => diaADia.includes(i.id)).map((i) => i.vaga);
  // os testes Publike da vaga (migração 20261204120000): quem curtiu faz por aqui
  const testes = vaga ? await testesDaVaga(anuncio.id) : [];
  const meusTestes =
    testes.length && paraQuemProcura && (anuncio.minha_curtida === "pendente" || anuncio.minha_curtida === "match")
      ? await meusTestesDaVaga(anuncio.id)
      : null;
  const caixaDeTestes = meusTestes ? <TestesParaMim anuncioId={anuncio.id} testes={testes} meus={meusTestes} /> : null;
  // a entrevista em vídeo que a empresa pediu (migração 20270105120000)
  const meuVideo =
    vaga && paraQuemProcura && (anuncio.minha_curtida === "pendente" || anuncio.minha_curtida === "match")
      ? await minhaEntrevistaVideo(anuncio.id)
      : null;
  const caixaDeVideo = meuVideo ? <AvisoVideoPedido anuncioId={anuncio.id} e={meuVideo} /> : null;
  // a empresa usa a Triagem com IA: quem vê a vaga (e se candidata) fica sabendo (migração 20261226120000)
  const avisoTriagem = vaga && !proprio && (await vagaUsaTriagem(anuncio.id)) ? <AvisoTriagem /> : null;

  const quadroAcao = (sufixo: string) =>
    proprio ? (
      <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-5 shadow-card">
        <p className="font-display text-h3">{vaga ? "Este anúncio é seu" : "Este serviço é seu"}</p>
        <p className="text-body-sm text-ink-muted">
          {vaga
            ? "Veja quem curtiu e aceite para dar match."
            : "Veja quem quer contratar você e aceite para dar match."}
        </p>
        <BotaoLink href={`/painel/anuncio/${anuncio.id}`} variante="sucesso">
          {vaga ? "Ver quem curtiu" : "Ver pedidos"}
        </BotaoLink>
        <BotaoLink href={vaga ? `/painel/anuncio/${anuncio.id}/editar` : "/painel/servicos"}>
          {vaga ? "Editar anúncio" : "Editar meus serviços"}
        </BotaoLink>
        {vaga && (anuncio.status === "ativo" || anuncio.status === "pausado") && (
          <BotaoVagaPreenchida id={anuncio.id} preenchida={Boolean(anuncio.preenchida_em)} />
        )}
      </div>
    ) : anuncio.preenchida_em && anuncio.minha_curtida !== "match" ? (
      <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-5 shadow-card">
        <p className="flex items-center gap-2 font-display text-h3">
          <UserCheck aria-hidden className="size-5 text-cerrado-text" />
          Vaga preenchida
        </p>
        <p className="text-body-sm text-ink-muted">
          {anuncio.autor_nome || "Quem publicou"} já achou quem procurava
          {anuncio.minha_curtida ? ". Obrigado pelo seu interesse!" : "."} Tem outras vagas perto de você.
        </p>
        <BotaoLink href="/?tipo=vaga" variante="primario">
          Ver vagas perto de mim
        </BotaoLink>
      </div>
    ) : (
      <PainelCurtir
        idCampo={`mensagem-curtida-${sufixo}`}
        anuncioId={anuncio.id}
        titulo={anuncio.titulo}
        tipo={anuncio.tipo}
        status={anuncio.minha_curtida}
        mensagem={anuncio.minha_mensagem}
        logado={usuario !== null}
        contato={contato}
        pedeCurriculo={anuncio.pede_curriculo}
        temCurriculo={temCurriculo}
        curriculoNaVitrine={curriculoNaVitrine}
        aceita={aceita}
        usuarioId={usuario?.id ?? null}
        autorNome={anuncio.autor_nome}
        desfeito={desfeito}
        perguntas={perguntas}
        minhasRespostas={respostasDoBanco(anuncio.minhas_respostas)}
        pedirRespostas={primeiro(sp.responder) === "1"}
        continuarCurtida={primeiro(sp.curtir) === "1" || primeiro(sp.curtir) === "auto"}
        // voltou da folha de entrar (claude/plano-curtir-sem-pagina-de-entrar.md): a curtida sai sozinha
        curtirSozinho={primeiro(sp.curtir) === "auto"}
        autorId={anuncio.autor_id}
        entrevista={entrevista}
        contatoDireto={anuncio.contato_direto && anuncio.status === "ativo"}
        soChat={soChat}
      />
    );

  return (
    <Container className="py-6 sm:py-8">
      {/* conta a abertura para "Mais relevantes" (não conta quem publicou: o banco confere) */}
      {anuncio.status === "ativo" && <ContarAbertura anuncioId={anuncio.id} />}
      {anuncio.tipo === "vaga" && <ContarImpulso anuncioId={anuncio.id} />}
      {/* vaga preenchida sai do Google para Vagas (o Google pede para tirar as vagas fechadas) */}
      {vaga && anuncio.status === "ativo" && !anuncio.preenchida_em && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(dadosVaga(anuncio)).replace(/</g, "\\u003c") }}
        />
      )}

      <VerMaisPerto tipo={vaga ? "vaga" : "servico"} />

      {primeiro(sp.publicado) === "1" &&
        (status === "ativo" ? (
          <Aviso tipo="sucesso" className="mt-4" titulo="Seu anúncio está no ar!">
            Ele fica no ar pelo prazo que você escolheu e pode ser renovado. Quando alguém curtir, você recebe um aviso e
            vê a pessoa no seu painel. Preencheu a vaga? Marque como preenchida no painel.
          </Aviso>
        ) : (
          // salvou, mas ainda não está para todo mundo (o aviso logo abaixo diz por quê)
          <Aviso tipo="sucesso" className="mt-4" titulo="Anúncio salvo." />
        ))}
      {/* o Teste Prático que entrou na vaga ao publicar (?teste=1): qual é e como tirar */}
      {primeiro(sp.publicado) === "1" && primeiro(sp.teste) === "1" && proprio && (
        <AvisoTesteNaVaga anuncioId={anuncio.id} titulo={testes[0]?.titulo ?? null} />
      )}
      {/* tocou em Publicar de novo com o mesmo anúncio: o banco não deixa sair repetido e traz para cá */}
      {primeiro(sp.repetido) === "1" && proprio && (
        <Aviso tipo="info" className="mt-4" titulo="Este anúncio já estava publicado">
          Você tocou em Publicar de novo com o mesmo texto. Para não sair repetido, trouxemos você ao que já está no
          Publike. Quer mudar algo? Toque em Editar.
        </Aviso>
      )}
      {primeiro(sp.salvo) === "1" && <Aviso tipo="sucesso" className="mt-4" titulo="Alterações salvas." />}
      {primeiro(sp.triagem) === "0" && proprio && (
        <Aviso tipo="alerta" className="mt-4" titulo="As respostas da triagem não salvaram">
          O resto do anúncio está salvo. Abra Editar, confira as perguntas da triagem e salve de novo. A equipe do
          Publike já foi avisada.
        </Aviso>
      )}
      {proprio && status !== "ativo" && (
        <Aviso tipo="alerta" className="mt-4" titulo={`Este anúncio está: ${STATUS_ANUNCIO[status]?.nome ?? status}`}>
          {STATUS_ANUNCIO[status]?.ajuda}. Só você consegue ver esta página agora.
        </Aviso>
      )}
      {proprio && comModeracao && (
        <div className="mt-4">
          <ConversaModeracao anuncioId={anuncio.id} mensagens={conversaModeracao} lado="autor" status={status} />
        </div>
      )}

      <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
        <article className="min-w-0">
          <div className="flex flex-wrap gap-2">
            {match && <SeloMatch match={match} />}
            {novo && <Selo variante="novo">Novo</Selo>}
            <Selo>{rotuloModalidade(anuncio.tipo, anuncio.regime)}</Selo>
            {vaga && agencia && (
              <Selo variante="aviso">
                <Building2 aria-hidden />
                Vaga de agência
              </Selo>
            )}
            {vaga && anuncio.pcd && (
              <Selo>
                <Accessibility aria-hidden />
                {nomePcd(anuncio.pcd)}
              </Selo>
            )}
            <Selo variante="contorno">{categoria(anuncio.categoria).nome}</Selo>
            {vaga && anuncio.pede_curriculo && (
              <Selo variante="contorno">
                <FileText aria-hidden />
                Pede currículo
              </Selo>
            )}
            {vaga && anuncio.preenchida_em && (
              <Selo variante="aviso">
                <UserCheck aria-hidden />
                Vaga preenchida
              </Selo>
            )}
            {comecaJa && (
              <Selo variante="aviso">
                <CalendarClock aria-hidden />
                Começa já
              </Selo>
            )}
            {anuncio.contato_direto && anuncio.status === "ativo" && !anuncio.preenchida_em && (
              <Selo variante="match">
                <Zap aria-hidden />
                Contato direto
              </Selo>
            )}
          </div>
          <h1 className="mt-3 text-h2 sm:text-h1">{anuncio.titulo}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-1 text-body text-ink-muted">
            <Link href={`/perfil/${anuncio.autor_id}`} className="font-semibold text-ink underline-offset-2 hover:underline">
              {anuncio.autor_nome}
            </Link>
            · {rotuloConta(anuncio.autor_tipo)}
            {anuncio.autor_verificado && (
              <SeloVerificado agencia={agencia} />
            )}
            {/* vaga de empresa com a conta conferida: dito por extenso, contra o medo de golpe */}
            {vaga && anuncio.autor_verificado && !agencia && anuncio.autor_tipo !== "pessoa" && (
              <span className="text-body-sm font-semibold text-cerrado-text">Empresa conferida pelo Publike</span>
            )}
          </p>
          {vaga && !proprio && anuncio.status === "ativo" && !anuncio.preenchida_em && (
            <Suspense fallback={null}>
              <AtalhosDaVaga anuncioId={anuncio.id} titulo={anuncio.titulo} logado={usuario !== null} />
            </Suspense>
          )}
          {nota && nota.total > 0 && (
            <p className="mt-1">
              <a href="#avaliacoes" className="hover:underline">
                <NotaDoProfissional media={nota.media} total={nota.total} />
              </a>
            </p>
          )}

          <dl className="mt-6 grid gap-5 rounded-lg border border-line bg-surface-200 p-5 sm:grid-cols-2 sm:p-6">
            <Fato icone={MapPin} rotulo={vaga ? "Onde é" : "Onde fica"}>
              {anuncio.local_exato && anuncio.endereco ? (
                <>
                  {anuncio.endereco}
                  <span className="block text-body-sm font-normal text-ink-muted">{lugar}</span>
                </>
              ) : (
                <>
                  {lugar}
                  <span className="block text-body-sm font-normal text-ink-muted">região aproximada</span>
                </>
              )}
            </Fato>
            {kmDeCasa != null && (
              // o mesmo tempo da lista (deslocamentoCurto): a pé até 1,5 km, senão de ônibus
              <Fato icone={kmDeCasa <= 1.5 ? Footprints : Bus} rotulo="Da sua casa">
                {deslocamentoCurto(kmDeCasa)}
                <span className="block text-body-sm font-normal text-ink-muted">
                  {kmDeCasa < 1 ? "menos de 1 km" : `${kmDeCasa.toFixed(1).replace(".", ",")} km`} em linha reta · estimativa
                </span>
              </Fato>
            )}
            <Fato icone={Banknote} rotulo={vaga ? "Valor" : "Preço"}>
              {vaga
                ? formatarValor(anuncio.pagamento_valor, anuncio.pagamento_unidade, null, false, {
                    ate: anuncio.pagamento_ate,
                  })
                : valor}
              {/* os ganhos a mais, um por linha, com como funciona */}
              {ganhos.map((g) => (
                <span key={g.nome} className="mt-0.5 block text-body-sm font-normal">
                  + {g.nome}
                  {g.detalhe && <span className="text-ink-muted">: {g.detalhe}</span>}
                </span>
              ))}
            </Fato>
            {temContratante && (
              <Fato icone={Building2} rotulo="Empresa contratante">
                {anuncio.contratante ?? "Confidencial"}
                <span className="block text-body-sm font-normal text-ink-muted">
                  {anuncio.contratante
                    ? `seleção feita por ${anuncio.autor_nome}; no match, você fala com a agência`
                    : "a agência conta o nome no processo seletivo"}
                </span>
              </Fato>
            )}
            {vaga ? (
              <Fato icone={Briefcase} rotulo="Contratação">
                {anuncio.regime ? REGIMES[anuncio.regime as Regime]?.nome : "Vaga"}
                {(anuncio.jornada || anuncio.modelo) && (
                  <span className="block text-body-sm font-normal text-ink-muted">
                    {[nomeJornada(anuncio.jornada), nomeModelo(anuncio.modelo)].filter(Boolean).join(" · ")}
                  </span>
                )}
              </Fato>
            ) : (
              <Fato icone={Wrench} rotulo="Atende">
                {anuncio.atende.length ? descreverAtendimento(anuncio.atende) : lugar}
              </Fato>
            )}
            {anuncio.horario && (
              <Fato icone={Clock} rotulo={vaga ? "Quando" : "Quando atende"}>
                {anuncio.horario}
              </Fato>
            )}
            {vaga && beneficios.length > 0 && (
              <Fato icone={Gift} rotulo="Benefícios">
                {beneficios.join(", ")}
              </Fato>
            )}
            {vaga && requisitos.length > 0 && (
              <Fato icone={ListChecks} rotulo="Requisitos">
                {requisitos.join(" · ")}
              </Fato>
            )}
            {nomesDoDiaADia.length > 0 && (
              <Fato icone={ListChecks} rotulo="Como é o dia a dia">
                {nomesDoDiaADia.join(" · ")}
              </Fato>
            )}
            {testes.length > 0 && (
              <Fato icone={ClipboardCheck} rotulo="Teste Prático">
                {testes
                  .map(
                    (t) => `${nomeCurtoDoTeste(t.titulo)}${t.obrigatoria ? " (antes da entrevista)" : " (opcional)"}`,
                  )
                  .join(" · ")}
              </Fato>
            )}
            {perguntas.length > 0 && (
              <Fato icone={MessageCircleQuestion} rotulo="A empresa vai perguntar">
                {perguntas.map((p) => p.nome).join(" · ")}
              </Fato>
            )}
            {vaga && anuncio.vagas > 1 && (
              <Fato icone={Users} rotulo="Vagas">
                {anuncio.vagas} pessoas
              </Fato>
            )}
            <Fato icone={CalendarClock} rotulo="Publicado">
              {tempoRelativo(anuncio.criado_em, agora)}
              <span className="block text-body-sm font-normal text-ink-muted">
                {anuncio.preenchida_em ? "vaga preenchida" : `fica no ar ${ateQuando(anuncio.expira_em)}`}
              </span>
            </Fato>
          </dl>

          {/* No celular, curtir fica logo aqui; no computador, na coluna ao lado */}
          <div id="quadro-celular" className="mt-6 scroll-mt-24 lg:hidden">
            {quadroAcao("celular")}
            {caixaDeVideo}
            {caixaDeTestes}
            {avisoTriagem}
          </div>
          {!proprio && !(anuncio.preenchida_em && anuncio.minha_curtida !== "match") && (
            <BarraCurtirCelular
              alvo="quadro-celular"
              titulo={anuncio.titulo}
              valor={valor}
              status={anuncio.minha_curtida}
              servico={!vaga}
            />
          )}

          {vaga && !proprio && primeiro(sp.indicado) === "1" && anuncio.minha_curtida == null && (
            <Aviso tipo="sucesso" titulo="Você chegou por uma indicação" className="mt-6">
              Se a vaga combinar com você, toque em Curtir para se candidatar. A empresa vê que foi indicação.
            </Aviso>
          )}

          {match && <MatchDaVaga a={match} className="mt-6" />}

          <h2 className="mt-8 text-h2">{vaga ? "Sobre a vaga" : "Sobre o serviço"}</h2>
          <div className="mt-3 text-body whitespace-pre-line text-ink">{anuncio.descricao}</div>

          {vaga && (
            <Suspense fallback={null}>
              <SecaoComentarios anuncioId={anuncio.id} agora={agora} />
            </Suspense>
          )}

          {fotos.length > 0 && (
            <>
              <h2 className="mt-8 text-h2">Trabalhos feitos</h2>
              <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {fotos.map((url, n) => (
                  <li key={url} className="relative aspect-square overflow-hidden rounded-md bg-surface-300">
                    <a href={url} target="_blank" rel="noopener" className="block size-full">
                      <Image
                        src={url}
                        alt={`Trabalho ${n + 1} de ${anuncio.autor_nome}`}
                        fill
                        unoptimized
                        sizes="(min-width: 640px) 33vw, 50vw"
                        className="object-cover"
                      />
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}

          {!vaga && (
            <section id="avaliacoes" className="scroll-mt-24">
              <h2 className="mt-8 text-h2">Avaliações de {primeiroNome}</h2>
              {avaliacoes.length ? (
                <>
                  <div className="mt-4">
                    <ListaAvaliacoes
                      avaliacoes={avaliacoes.slice(0, 3)}
                      agora={agora}
                      nomeProfissional={anuncio.autor_nome}
                    />
                  </div>
                  {avaliacoes.length > 3 && (
                    <Link
                      href={`/perfil/${anuncio.autor_id}#avaliacoes`}
                      className="mt-4 inline-flex min-h-11 items-center text-label text-terra-text underline-offset-2 hover:underline"
                    >
                      Ver as {avaliacoes.length} avaliações
                    </Link>
                  )}
                </>
              ) : (
                <p className="mt-2 text-body-sm text-ink-muted">
                  Ainda sem avaliações. Quem contrata pelo Publike pode avaliar depois do match.
                </p>
              )}
            </section>
          )}

          <h2 className="mt-8 text-h2">{vaga ? "Onde é" : "Onde fica"}</h2>
          {anuncio.local_exato && anuncio.endereco ? (
            <p className="mt-1 mb-3 text-body-sm text-ink-muted">
              {anuncio.endereco} · {lugar}
              {anuncio.cep && <> · CEP {formatarCep(anuncio.cep)}</>}
            </p>
          ) : (
            <p className="mt-1 mb-3 text-body-sm text-ink-muted">
              Mostramos só uma área de uns 500 metros em {lugar}. O endereço vocês combinam depois do match.
            </p>
          )}
          {kmDeCasa != null && (
            <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-body-sm text-ink-muted" aria-label="Tempo estimado da sua casa">
              {deslocamentos(kmDeCasa).map((d) => (
                <li key={d.jeito}>
                  <span className="text-ink">{formatarMinutos(d.minutos)}</span> {d.nome}
                </li>
              ))}
            </ul>
          )}
          <MapaArea lat={anuncio.lat} lng={anuncio.lng} exato={anuncio.local_exato} />
          {anuncio.local_exato && (
            <a
              href={comoChegar}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex min-h-11 items-center gap-2 text-label text-terra-text underline-offset-2 hover:underline"
            >
              <Navigation aria-hidden className="size-4" />
              Como chegar de ônibus
            </a>
          )}
          {vaga && !proprio && !local?.ponto && (
            <p className="mt-3 text-body-sm text-ink-muted">
              Quer saber quanto tempo leva da sua casa?{" "}
              <Link href="/?casa=1#busca" className="text-terra-text underline underline-offset-2">
                Informe seu CEP
              </Link>
              .
            </p>
          )}
        </article>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          <div className="hidden lg:block">
            {quadroAcao("lateral")}
            {caixaDeVideo}
            {caixaDeTestes}
            {avisoTriagem}
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4">
            <div className="flex items-center gap-3">
              <Avatar nome={anuncio.autor_nome} foto={anuncio.autor_foto} tamanho={48} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-label">{anuncio.autor_nome}</p>
                <p className="text-body-sm text-ink-muted">
                  {rotuloConta(anuncio.autor_tipo)} · no Publike desde {formatarMesAno(anuncio.autor_desde)}
                </p>
              </div>
              <Link
                href={`/perfil/${anuncio.autor_id}`}
                className="text-label text-terra-text underline-offset-2 hover:underline"
              >
                Ver perfil
              </Link>
            </div>
            {responde && (
              <p
                className={`flex items-start gap-2 text-body-sm ${responde.bom ? "text-cerrado-text" : "text-ink-muted"}`}
              >
                <MessageCircleReply aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                  {responde.texto}
                  <span className="block text-ink-muted">nos últimos 6 meses, nas vagas do Publike</span>
                </span>
              </p>
            )}
            {!proprio && (
              <div className="flex flex-col items-start gap-2 border-t border-line pt-3">
                <BotaoSeguir
                  alvo={{ perfil: anuncio.autor_id }}
                  seguidoId={seguidos.find((s) => s.alvo_perfil === anuncio.autor_id)?.id ?? null}
                  logado={usuario !== null}
                  voltar={`/anuncio/${anuncio.id}`}
                  rotulo={`Seguir ${nomeParaSeguir}`}
                  rotuloSeguindo={`Seguindo ${nomeParaSeguir}`}
                />
                {anuncio.bairro && (
                  <BotaoSeguir
                    alvo={{ cidade: anuncio.cidade, bairro: anuncio.bairro }}
                    seguidoId={
                      seguidos.find(
                        (s) =>
                          !s.alvo_perfil &&
                          s.cidade === anuncio.cidade &&
                          s.bairro_chave === chaveBairro(anuncio.bairro ?? ""),
                      )?.id ?? null
                    }
                    logado={usuario !== null}
                    voltar={`/anuncio/${anuncio.id}`}
                    rotulo={`Seguir o bairro ${anuncio.bairro}`}
                    rotuloSeguindo={`Seguindo o bairro ${anuncio.bairro}`}
                  />
                )}
                <p className="text-body-sm text-ink-muted">{TEXTO_SEGUIR}</p>
              </div>
            )}
            {anuncio.autor_cnpj && (
              <CnpjDoPerfil
                cnpj={anuncio.autor_cnpj}
                verificada={agencia && anuncio.autor_verificado}
                className="border-t border-line pt-3"
              />
            )}
          </div>

          {anuncio.status === "ativo" && (
            <QuadroIndicar
              url={`${SITE_URL}/anuncio/${anuncio.id}`}
              titulo={anuncio.titulo}
              lugar={lugar}
              vaga={vaga}
              proprio={proprio}
              valor={valor}
              codigo={usuario && vaga && !proprio ? codigoDaPessoa(usuario.id) : undefined}
              anuncioId={anuncio.id}
              logado={usuario !== null}
            />
          )}

          <div className="flex flex-wrap justify-start gap-2">
            {vaga && !proprio && (
              <BotaoSalvarVaga
                anuncioId={anuncio.id}
                salva={salva}
                logado={usuario !== null}
                salvarSozinho={primeiro(sp.salvar) === "1"}
              />
            )}
            <BotaoCompartilhar titulo={anuncio.titulo} texto={`${anuncio.titulo} · ${lugar} · Publike`} />
          </div>

          <div className="flex gap-3 rounded-lg bg-terra-soft p-4 text-body-sm text-ink">
            <ShieldAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-terra-text" />
            <div>
              <p className="text-label">Fique de olho</p>
              {vaga ? (
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  <li>
                    {agencia
                      ? "A agência não pode cobrar nada de você: nem cadastro, nem taxa, nem curso."
                      : "Ninguém pode cobrar para você conseguir trabalho."}
                  </li>
                  <li>Não mande Pix adiantado nem senhas.</li>
                  <li>No primeiro encontro, prefira um lugar movimentado.</li>
                </ul>
              ) : (
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  <li>Combine o preço e o prazo por escrito no WhatsApp.</li>
                  <li>Não pague o serviço inteiro adiantado.</li>
                  <li>Na primeira visita, se puder, tenha alguém por perto.</li>
                </ul>
              )}
            </div>
          </div>

          {!proprio && (
            <Link
              href={`/anuncio/${anuncio.id}/denunciar`}
              className="inline-flex min-h-11 items-center gap-2 self-start text-label text-danger underline-offset-2 hover:underline"
            >
              <Flag aria-hidden className="size-4" />
              {vaga ? "Denunciar anúncio" : "Denunciar serviço"}
            </Link>
          )}
        </aside>
      </div>
      {/* a página da função na cidade ("Mais vagas de frentista em Goiânia": claude/plano-vagas-por-funcao.md) */}
      {vaga && anuncio.status === "ativo" && (
        <Suspense fallback={null}>
          <LinksDaVaga id={anuncio.id} titulo={anuncio.titulo} cidade={anuncio.cidade} bairro={anuncio.bairro} />
        </Suspense>
      )}
      {/* sem conta: na segunda vaga da mesma área, o convite para receber as novas; com conta, voltando do convite,
          o aviso da área é criado (claude/plano-visitante-que-entra.md) */}
      {vaga && !proprio && anuncio.status === "ativo" && (!usuario || primeiro(sp[PARAMETRO_DA_VOLTA]) === "1") && (
        <Suspense fallback={null}>
          <ConviteDaArea
            logado={usuario !== null}
            anuncioId={anuncio.id}
            area={anuncio.categoria}
            cidade={anuncio.cidade}
          />
        </Suspense>
      )}
      {/* no fim, as vagas parecidas e as outras de quem publicou (não para quem publicou) */}
      {vaga && !proprio && (
        <Suspense fallback={null}>
          <VagasDaVaga
            vaga={{
              id: anuncio.id,
              titulo: anuncio.titulo,
              autor_id: anuncio.autor_id,
              cidade: anuncio.cidade,
              lat: anuncio.lat,
              lng: anuncio.lng,
            }}
            ve={{ quem, usuarioId: usuario?.id ?? null, ponto: local?.ponto ?? null }}
            agora={agora}
          />
        </Suspense>
      )}
    </Container>
  );
}

/**
 * "Mais vagas de frentista em Goiânia" (com o salário da região, na página da função, quando a vaga tem função) e
 * "Vagas no Setor Bueno". Os links e o caminho para o Google (BreadcrumbList) fazem as páginas de função e de bairro
 * subirem na busca: elas duram, a vaga sai do ar (claude/plano-alcance-e-cadastros.md).
 */
async function LinksDaVaga({ id, titulo, cidade, bairro }: { id: string; titulo: string; cidade: string; bairro: string }) {
  if (!cidadeDoSlug(slugDaCidade(cidade))) return null;
  const funcao = await funcaoDaVaga(id, cidade);
  const nomeBairro = nomeDoBairro(bairro.trim());
  const temBairro = Boolean(nomeBairro) && slugDaCidade(nomeBairro) !== slugDaCidade(cidade);
  const caminho = [
    { nome: "Publike", url: SITE_URL },
    { nome: `Vagas em ${cidade}`, url: `${SITE_URL}${caminhoDaBusca("vaga", cidade)}` },
    ...(funcao
      ? [{ nome: tituloDaFuncao(funcao.nome, cidade), url: `${SITE_URL}${caminhoDaFuncao(cidade, funcao.slug)}` }]
      : []),
    { nome: titulo, url: `${SITE_URL}/anuncio/${id}` },
  ];
  return (
    <>
      <DadosEstruturados
        dados={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: caminho.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.nome, item: c.url })),
        }}
      />
      <ul className="mt-8 flex flex-col gap-2 text-body">
        {funcao && (
          <li>
            <Link
              href={caminhoDaFuncao(cidade, funcao.slug)}
              className="font-semibold text-terra-text underline-offset-2 hover:underline"
            >
              Mais vagas de {funcao.nome} em {cidade}
            </Link>
            <span className="text-ink-muted"> e quanto se paga na região</span>
          </li>
        )}
        {temBairro && (
          <li>
            <Link
              href={caminhoDoBairro(cidade, nomeBairro)}
              className="font-semibold text-terra-text underline-offset-2 hover:underline"
            >
              Vagas no {nomeBairro}
            </Link>
            <span className="text-ink-muted"> e perto dele</span>
          </li>
        )}
        <li>
          <Link
            href={caminhoDaBusca("vaga", cidade)}
            className="font-semibold text-terra-text underline-offset-2 hover:underline"
          >
            Todas as vagas em {cidade}
          </Link>
        </li>
      </ul>
    </>
  );
}

function EsqueletoAnuncio() {
  return (
    <Container className="py-8" aria-busy="true">
      <Esqueleto className="h-6 w-40" />
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
        <div className="flex flex-col gap-4">
          <Esqueleto className="h-6 w-32 rounded-pill" />
          <Esqueleto className="h-10 w-3/4" />
          <Esqueleto className="h-5 w-1/3" />
          <Esqueleto className="h-48 w-full rounded-lg" />
          <Esqueleto className="h-32 w-full" />
        </div>
        <Esqueleto className="h-64 w-full rounded-lg" />
      </div>
    </Container>
  );
}

/** O convite das vagas vistas, com quantas vagas da área estão no ar na cidade (a lista em cache das buscas). */
async function ConviteDaArea({
  logado,
  anuncioId,
  area,
  cidade,
}: {
  logado: boolean;
  anuncioId: string;
  area: string;
  cidade: string;
}) {
  const total = (await anunciosNoAr("vaga", cidade)).filter((a) => a.categoria === area && a.cidade === cidade).length;
  return (
    <ConviteDasVagasVistas
      logado={logado}
      anuncioId={anuncioId}
      area={area}
      nomeDaArea={categoria(area).nome}
      cidade={cidade}
      total={total}
    />
  );
}
