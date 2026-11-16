import { ArrowLeft, Lock, MapPin, MessagesSquare, UserSearch } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DesfazerConexao } from "@/components/conexoes/acoes-conexao";
import { BotaoConectar } from "@/components/conexoes/botao-conectar";
import { BotaoLiberarContato, OfertaContatoNoConvite } from "@/components/conexoes/contato-no-convite";
import { BotoesContato } from "@/components/contato";
import { CurriculoDoTalento } from "@/components/talentos/curriculo-do-talento";
import { ConvidarTalento } from "@/components/talentos/convidar-talento";
import { RegistrarVisitaPerfil } from "@/components/visitas/registrar-visita";
import { Aviso, Avatar, Container, Esqueleto, Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { caminhoConversa } from "@/lib/conversas";
import { obterMeuPerfil, obterUsuario } from "@/lib/dados";
import { formatarLugar, tempoRelativo } from "@/lib/formato";
import { dataCurta } from "@/lib/recursos-pagos";
import { conexaoCom, estadosDeConexao } from "@/lib/servidor/conexoes";
import { acessoAoContatoNoConvite, contatoNoConviteDe } from "@/lib/servidor/contato-no-convite";
import { talentoCompleto, talentoResumo, vagasParaConvidar } from "@/lib/servidor/talentos";
import { tituloDoTalento } from "@/lib/talentos";
import { agoraDaRequisicao } from "@/lib/tempo";
import { TemVoltarProprio } from "@/components/voltar";

// A página de uma pessoa da aba Talentos. Todo mundo vê o resumo; empresa, comércio e
// agência que entraram veem o currículo completo (as empresas, as datas e o que fazia),
// pedem conexão (sem precisar de vaga) e convidam para uma vaga. Sem telefone, e-mail ou PDF:
// o contato aparece quando a pessoa aceita a conexão ou no match; nos planos, já no pedido de
// conexão, se a pessoa deixou (o contato no convite, migração 20270626120000).

export const metadata: Metadata = { title: "Talento no Publike", robots: { index: false, follow: false } };

export default function PaginaTalento({ params }: PageProps<"/talentos/[id]">) {
  return (
    <Container className="max-w-3xl py-6 sm:py-8">
      <Link
        href="/talentos"
        className="inline-flex min-h-11 items-center gap-2 text-label text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        <TemVoltarProprio />
        Talentos
      </Link>
      <Suspense fallback={<Esqueleto className="mt-2 h-[36rem] w-full rounded-lg" />}>
        <Conteudo params={params} />
      </Suspense>
    </Container>
  );
}

async function Conteudo({ params }: { params: PageProps<"/talentos/[id]">["params"] }) {
  const { id } = await params;
  const resumo = MODO_DEMO ? null : await talentoResumo(id);
  if (!resumo) {
    return (
      <div className="mt-2">
        <Vazio
          icone={UserSearch}
          titulo="Essa pessoa não está mais na aba Talentos"
          acao={<BotaoLink href="/talentos">Ver os talentos</BotaoLink>}
        >
          Quem procura trabalho escolhe aparecer ou sair da aba quando quiser.
        </Vazio>
      </div>
    );
  }

  const [usuario, perfil, agora] = await Promise.all([obterUsuario(), obterMeuPerfil(), agoraDaRequisicao()]);
  const souEu = usuario?.id === resumo.perfil_id;
  const empresa = Boolean(perfil && perfil.tipo !== "pessoa") && !souEu;
  const completo = empresa ? await talentoCompleto(id) : null;
  const cv = completo?.ok ? completo.talento : null;
  const [vagas, estados, acesso, doTalento] = await Promise.all([
    cv ? vagasParaConvidar(id, agora) : Promise.resolve([]),
    cv ? estadosDeConexao([resumo.perfil_id]) : Promise.resolve(null),
    cv ? acessoAoContatoNoConvite() : Promise.resolve(null),
    cv ? contatoNoConviteDe(resumo.perfil_id) : Promise.resolve(null),
  ]);
  const estado = estados?.get(resumo.perfil_id) ?? null;
  // o contato já à vista: no pedido liberado pelo plano ou na conexão aceita
  const conexao =
    cv && estado && (estado.contato || estado.status === "aceita") ? await conexaoCom(resumo.perfil_id) : null;
  const comContato = conexao && (conexao.contato_liberado || conexao.status === "aceita") ? conexao : null;
  const hoje = new Date(agora).toISOString().slice(0, 7);
  const primeiroNome = resumo.nome.split(" ")[0];
  // com o plano (ou nos 15 dias), o contato vem no pedido, se a pessoa deixou
  const contatoNoPedido = Boolean(acesso?.liberado) && doTalento === "sim";
  const textoConectar = contatoNoPedido
    ? `Não precisa ter vaga aberta. Com o seu plano, o WhatsApp e o e-mail de ${primeiroNome} aparecem assim que você pede a conexão, e a conversa no Publike já abre.`
    : acesso?.liberado && doTalento === "desligado"
      ? `Não precisa ter vaga aberta. ${primeiroNome} prefere mostrar o contato só depois de aceitar: aí aparecem o WhatsApp e o e-mail dos dois e vocês conversam pelo Publike.`
      : acesso?.liberado && doTalento === "aviso" && acesso.valeEm
        ? `Não precisa ter vaga aberta. O contato de ${primeiroNome} passa a vir no pedido a partir de ${dataCurta(acesso.valeEm)}; até lá, aparece quando ${primeiroNome} aceitar.`
        : `Não precisa ter vaga aberta. Se ${primeiroNome} aceitar, aparecem o WhatsApp e o e-mail dos dois e vocês conversam pelo Publike.`;
  // sem o plano: a oferta, na hora de pedir ou esperando a resposta (não para quem desligou o contato no convite)
  const oferta =
    acesso?.disponivel &&
    !acesso.liberado &&
    (doTalento === "sim" || doTalento === "aviso") &&
    (!estado || (estado.status === "pendente" && estado.pedi));

  return (
    <article className="mt-2 flex flex-col gap-6">
      {/* conta para "Quem viu seu perfil": empresa que abre o currículo avisa a pessoa */}
      {!souEu && <RegistrarVisitaPerfil perfilId={resumo.perfil_id} onde="talento" />}
      <header className="flex items-start gap-4">
        <Avatar nome={resumo.nome} foto={cv?.foto ?? null} tamanho={64} />
        <div className="min-w-0 flex-1">
          <h1 className="text-h2 break-words">{tituloDoTalento(resumo)}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 text-body text-ink-muted">
            <span>{resumo.nome}</span>
            {/* o alfinete vai junto com o lugar quando a linha quebra */}
            <span className="inline-flex items-center gap-1">
              <MapPin aria-hidden className="size-4 shrink-0" />
              {formatarLugar(resumo.bairro, resumo.cidade)}
            </span>
          </p>
          <p className="text-body-sm text-ink-muted">
            Currículo atualizado {tempoRelativo(resumo.atualizado_em, agora)}
          </p>
        </div>
      </header>

      {souEu && (
        <Aviso tipo="info" titulo="É assim que você aparece na aba Talentos">
          <p>
            Quem visita vê este resumo. Empresas, comércios e agências que entraram veem também as empresas onde você
            trabalhou, podem pedir conexão com você e convidar para uma vaga. Telefone e e-mail aparecem quando você
            aceita a conexão ou dá match e, se você liberou, já no pedido de conexão de uma empresa com plano.
          </p>
          <p className="mt-2">
            <Link href="/perfil/curriculo#contato-no-convite" className="text-label underline underline-offset-2">
              Mudar quem vê o meu contato
            </Link>
          </p>
        </Aviso>
      )}

      {cv && comContato && (
        <section
          aria-labelledby="conectar-titulo"
          className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:p-5"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="conectar-titulo" className="text-h3">
              Falar com {primeiroNome}
            </h2>
            <Selo variante={comContato.status === "aceita" ? "match" : "aviso"}>
              {comContato.status === "aceita" ? "Conectados" : "Contato liberado"}
            </Selo>
          </div>
          <p className="text-body-sm text-ink-muted">
            {comContato.status === "aceita"
              ? `Vocês estão conectados. Chame ${primeiroNome} no WhatsApp, por e-mail ou pela conversa no Publike.`
              : `O contato veio no pedido, pelo seu plano. ${primeiroNome} ainda não aceitou a conexão: chame no WhatsApp, por e-mail ou pela conversa no Publike.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <BotaoLink href={caminhoConversa(resumo.perfil_id)} variante="primario" tamanho="sm">
              <MessagesSquare aria-hidden />
              Conversar no Publike
            </BotaoLink>
            <BotoesContato
              whatsapp={comContato.whatsapp}
              email={comContato.email}
              mensagem={`Olá, ${primeiroNome}! Vi o seu currículo no Publike.`}
            />
          </div>
          {comContato.status === "pendente" && (
            <div className="border-t border-line pt-2">
              <DesfazerConexao id={comContato.id} rotulo="Cancelar pedido" />
            </div>
          )}
        </section>
      )}

      {cv && !comContato && (
        <section
          aria-labelledby="conectar-titulo"
          className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:p-5"
        >
          <h2 id="conectar-titulo" className="text-h3">
            Conectar com {primeiroNome}
          </h2>
          <p className="text-body-sm text-ink-muted">{textoConectar}</p>
          {acesso?.liberado && !acesso.plano && acesso.ate && (
            <p className="text-body-sm text-ink-muted">
              Nos 15 dias grátis, até {dataCurta(acesso.ate)}: {acesso.hoje} de {acesso.limite} contatos nas últimas 24
              horas.
            </p>
          )}
          <BotaoConectar
            outroId={resumo.perfil_id}
            outroNome={resumo.nome}
            estado={estado}
            logado
            voltar={`/talentos/${id}`}
            para="talento"
            principal={vagas.length === 0 || contatoNoPedido}
            rotulo={contatoNoPedido ? "Conectar e ver o contato" : undefined}
          />
          {/* um pedido que já esperava, feito antes do plano: ver o contato agora */}
          {contatoNoPedido && estado?.status === "pendente" && estado.pedi && !estado.contato && (
            <BotaoLiberarContato conexaoId={estado.id} />
          )}
          {oferta && acesso && (
            <OfertaContatoNoConvite
              primeiroNome={primeiroNome}
              testou={acesso.testou}
              esperando={estado?.status === "pendente"}
              aPartirDe={doTalento === "aviso" && acesso.valeEm ? dataCurta(acesso.valeEm) : undefined}
            />
          )}
        </section>
      )}
      {cv && vagas.length > 0 && <ConvidarTalento perfilId={resumo.perfil_id} nome={resumo.nome} vagas={vagas} />}
      {cv && vagas.length === 0 && (
        <Aviso tipo="info" titulo={`Tem vaga para ${primeiroNome}?`}>
          <p>Publique a vaga e convide daqui: {primeiroNome} vê a vaga e decide se curte. Publicar é grátis.</p>
          <p className="mt-2">
            <BotaoLink href="/publicar" tamanho="sm">
              Publicar vaga grátis
            </BotaoLink>
          </p>
        </Aviso>
      )}
      {completo && !completo.ok && <Aviso tipo="alerta">{completo.erro}</Aviso>}

      {cv?.sobre && <p className="text-body whitespace-pre-line">{cv.sobre}</p>}

      <CurriculoDoTalento resumo={resumo} cv={cv} hoje={hoje} />

      {!usuario && (
        <Aviso tipo="info" titulo="Para ver o currículo completo e se conectar">
          <p>
            Entre com a conta da sua empresa, comércio ou agência: aparecem as empresas onde {primeiroNome} trabalhou,
            as datas e o que fazia, e você pede conexão (mesmo sem vaga aberta) ou convida para uma vaga sua. É grátis.
          </p>
          <p className="mt-2">
            <BotaoLink href={`/entrar?next=${encodeURIComponent(`/talentos/${id}`)}`} tamanho="sm" variante="primario">
              Entrar como empresa
            </BotaoLink>
          </p>
        </Aviso>
      )}
      {usuario && !empresa && !souEu && (
        <Aviso tipo="info">
          O currículo completo, a conexão e o convite para uma vaga são para empresas, comércios e agências. Você está
          vendo o resumo.
        </Aviso>
      )}

      <p className="flex items-start gap-2 border-t border-line pt-4 text-body-sm text-ink-muted">
        <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
        Telefone e e-mail aparecem quando {primeiroNome} aceita a conexão ou dá match numa vaga e, nos planos do
        Publike, já no pedido de conexão, se {primeiroNome} deixou.
      </p>
    </article>
  );
}
