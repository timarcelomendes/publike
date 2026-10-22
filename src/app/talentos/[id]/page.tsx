import { ArrowLeft, Lock, MapPin, UserSearch } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BotaoConectar } from "@/components/conexoes/botao-conectar";
import { CurriculoDoTalento } from "@/components/talentos/curriculo-do-talento";
import { ConvidarTalento } from "@/components/talentos/convidar-talento";
import { Aviso, Avatar, Container, Esqueleto, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { obterMeuPerfil, obterUsuario } from "@/lib/dados";
import { formatarLugar, tempoRelativo } from "@/lib/formato";
import { estadosDeConexao } from "@/lib/servidor/conexoes";
import { talentoCompleto, talentoResumo, vagasParaConvidar } from "@/lib/servidor/talentos";
import { tituloDoTalento } from "@/lib/talentos";
import { agoraDaRequisicao } from "@/lib/tempo";

// A página de uma pessoa da aba Talentos. Todo mundo vê o resumo; empresa, comércio e
// agência que entraram veem o currículo completo (as empresas, as datas e o que fazia),
// pedem conexão (sem precisar de vaga) e convidam para uma vaga. Sem telefone, e-mail ou PDF:
// o contato aparece quando a pessoa aceita a conexão ou no match.

export const metadata: Metadata = { title: "Talento no Publike", robots: { index: false, follow: false } };

export default function PaginaTalento({ params }: PageProps<"/talentos/[id]">) {
  return (
    <Container className="max-w-3xl py-6 sm:py-8">
      <Link
        href="/talentos"
        className="inline-flex min-h-11 items-center gap-2 text-label text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
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
  const [vagas, estados] = await Promise.all([
    cv ? vagasParaConvidar(id, agora) : Promise.resolve([]),
    cv ? estadosDeConexao([resumo.perfil_id]) : Promise.resolve(null),
  ]);
  const hoje = new Date(agora).toISOString().slice(0, 7);
  const primeiroNome = resumo.nome.split(" ")[0];

  return (
    <article className="mt-2 flex flex-col gap-6">
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
            trabalhou, podem pedir conexão com você e convidar para uma vaga. Telefone e e-mail só aparecem se você
            aceitar a conexão ou der match.
          </p>
          <p className="mt-2">
            <Link href="/perfil/curriculo" className="text-label underline underline-offset-2">
              Editar meu currículo
            </Link>
          </p>
        </Aviso>
      )}

      {cv && (
        <section
          aria-labelledby="conectar-titulo"
          className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:p-5"
        >
          <h2 id="conectar-titulo" className="text-h3">
            Conectar com {primeiroNome}
          </h2>
          <p className="text-body-sm text-ink-muted">
            Não precisa ter vaga aberta. Se {primeiroNome} aceitar, aparecem o WhatsApp e o e-mail dos dois e vocês
            conversam pelo Publike.
          </p>
          <BotaoConectar
            outroId={resumo.perfil_id}
            outroNome={resumo.nome}
            estado={estados?.get(resumo.perfil_id) ?? null}
            logado
            voltar={`/talentos/${id}`}
            para="talento"
            principal={vagas.length === 0}
          />
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
        Telefone e e-mail só aparecem quando {primeiroNome} aceita a conexão ou dá match numa vaga.
      </p>
    </article>
  );
}
