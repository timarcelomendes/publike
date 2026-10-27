import { ArrowLeft, PartyPopper } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CaminhoDaCurtida } from "@/components/caminho-curtida";
import { ApagarCurriculo, FormCurriculo } from "@/components/form-curriculo";
import { VisibilidadeCurriculo } from "@/components/visibilidade-curriculo";
import { Aviso, Container, Esqueleto } from "@/components/ui/basicos";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { esperaCurriculo } from "@/lib/constantes";
import { TOKEN_CONVITE } from "@/lib/convite-candidato";
import {
  ajudaDaIADisponivel,
  linkDoMeuPdf,
  listarMinhasCurtidas,
  meuCurriculoNaVitrine,
  meuCurriculoVisivel,
  obterMeuCurriculo,
  obterUsuario,
} from "@/lib/dados";
import { faltaData } from "@/lib/experiencia";
import { caminhoSeguro, plural, primeiro, tempoRelativo } from "@/lib/formato";
import { curriculoDoConvite, dadosDoConvite } from "@/lib/servidor/convites-candidato";
import { meuPdfNaoSalvo } from "@/lib/servidor/curriculo-pendente";
import type { MinhaCurtida } from "@/lib/tipos";
import { exigirPerfilCompleto } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = {
  title: "Meu currículo",
  robots: { index: false },
};

export default function PaginaCurriculo({ searchParams }: PageProps<"/perfil/curriculo">) {
  return (
    <Container className="max-w-2xl py-8">
      <Link href="/perfil" className="inline-flex min-h-11 items-center gap-2 text-label text-ink-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" />
        Meu perfil
      </Link>
      <h1 className="mt-1 text-h2 sm:text-h1">Meu currículo</h1>
      <p className="mt-2 mb-6 text-body text-ink-muted">
        Para vagas com carteira, estágio e temporárias. Preencha uma vez: ele aparece no seu perfil, as empresas da
        região acham você e, quando você curtir uma vaga, quem anunciou vê seu currículo junto com o seu perfil.
      </p>
      <Suspense fallback={<Esqueleto className="h-[56rem] w-full rounded-lg" />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/perfil/curriculo">["searchParams"] }) {
  const sp = await searchParams;
  const hoje = new Date(await agoraDaRequisicao()).toISOString().slice(0, 7);
  const proximo = caminhoSeguro(primeiro(sp.next), "");

  if (MODO_DEMO) {
    return (
      <>
        <Aviso tipo="alerta" className="mb-6" titulo="Modo demonstração">
          {MENSAGEM_DEMO}
        </Aviso>
        <FormCurriculo
          inicial={null}
          usuarioId="00000000-0000-0000-0000-000000000000"
          linkPdf={null}
          hoje={hoje}
          demo
        />
      </>
    );
  }

  // veio de "Cadastrar meu currículo" (aba Talentos): o passo a passo no alto
  const paraTalentos = primeiro(sp.para) === "talentos";
  // veio do convite de quem publicou a vaga (candidato de fora): o currículo vem pronto
  const tokenConvite = primeiro(sp.convite);
  const convite = tokenConvite && TOKEN_CONVITE.test(tokenConvite) ? tokenConvite : null;
  // sem conta: dá para preencher; o salvar guarda no aparelho e pede para entrar (o convite pede conta)
  if (!convite && !(await obterUsuario())) {
    return (
      <>
        <Aviso tipo="info" className="mb-6" titulo="Preencha agora, entre só para salvar">
          O que você preencher fica guardado neste aparelho. No fim, toque em “Entrar e salvar o currículo”: depois de
          entrar, ele volta preenchido para você conferir e salvar.
        </Aviso>
        <FormCurriculo
          inicial={null}
          usuarioId=""
          linkPdf={null}
          hoje={hoje}
          rotuloSalvar="Entrar e salvar o currículo"
          semConta
        />
      </>
    );
  }
  const { usuario, perfil } = await exigirPerfilCompleto(
    proximo
      ? `/perfil/curriculo?next=${encodeURIComponent(proximo)}`
      : paraTalentos
        ? "/perfil/curriculo?para=talentos"
        : convite
          ? `/perfil/curriculo?convite=${convite}`
          : "/perfil/curriculo",
  );
  // currículo é de pessoa: comércio, empresa e agência contratam (quem age pela agência também cai aqui)
  if (perfil.tipo !== "pessoa") {
    return (
      <Aviso tipo="info" titulo="Currículo é para quem procura trabalho">
        <p>
          Esta conta é de {perfil.tipo === "agencia" ? "agência" : perfil.tipo === "empresa" ? "empresa" : "comércio"}:
          aqui não tem currículo. Para procurar trabalho, entre com a sua conta de pessoa.
        </p>
        <p className="mt-2">
          <Link href="/painel" className="text-label underline">
            Ir para o painel
          </Link>
        </p>
      </Aviso>
    );
  }
  const [curriculo, curtidas, visivel, vitrine, ia, dadosConvite] = await Promise.all([
    obterMeuCurriculo(),
    listarMinhasCurtidas().catch(() => []),
    meuCurriculoVisivel(),
    meuCurriculoNaVitrine(),
    ajudaDaIADisponivel().catch(() => false),
    convite ? dadosDoConvite(convite).catch(() => null) : null,
  ]);
  const lido = convite && !curriculo && dadosConvite?.meu ? await curriculoDoConvite(convite, hoje) : null;
  // mandou o PDF e o currículo não foi salvo: o formulário já vem com ele
  const pdfNaoSalvo = !curriculo && !lido ? await meuPdfNaoSalvo() : null;
  const agora = await agoraDaRequisicao();
  const linkPdf = await linkDoMeuPdf(curriculo?.arquivo ?? pdfNaoSalvo?.caminho ?? null);
  // as vagas que já aceitaram a pessoa e só esperam o currículo
  const aceitas = curtidas.filter((c) => c.tipo === "vaga" && esperaCurriculo(c));
  // quem veio para a aba Talentos, ao salvar, cai direto na opção de aparecer nela
  const depoisDeSalvar =
    proximo || (paraTalentos && !vitrine && !aceitas.length ? "/perfil/curriculo?salvo=1#quem-acha" : "");

  return (
    <>
      {aceitas.length > 0 && <AceitasEsperando aceitas={aceitas} temCurriculo={curriculo !== null} />}
      {paraTalentos && !vitrine && (
        <Aviso tipo="info" className="mb-6" titulo="Para aparecer na aba Talentos">
          {curriculo ? (
            // já tem currículo, mas escondeu da aba: o caminho é ligar de novo
            <p>
              Seu currículo está escondido da aba. No fim da página, ligue{" "}
              <a href="#quem-acha" className="text-label underline">
                “Aparecer na aba Talentos”
              </a>
              .
            </p>
          ) : (
            <p>
              {ia
                ? "Envie o PDF ou a foto do seu currículo (o Publike preenche) ou preencha aqui, e toque em “Salvar currículo”."
                : "Preencha o currículo e toque em “Salvar currículo”."}{" "}
              Pronto: ele já aparece na aba Talentos.
            </p>
          )}
          <p className="mt-2">
            As empresas da região veem seu currículo e podem convidar você para vagas. Telefone e e-mail ficam
            escondidos até o match.
          </p>
        </Aviso>
      )}
      {!curriculo && !paraTalentos && (
        // currículo novo já aparece: a pessoa sabe antes de salvar
        <p className="mb-6 rounded-md bg-surface-300 px-4 py-3 text-body-sm">
          Ao salvar, seu currículo aparece para as empresas da região e na aba Talentos, com o nome encurtado e sem
          telefone, e-mail nem o PDF. Prefere não aparecer? Depois de salvar, é só desligar no fim da página.
        </p>
      )}
      {paraTalentos && vitrine && (
        <Aviso tipo="sucesso" className="mb-6" titulo="Você já aparece na aba Talentos">
          <Link href={`/talentos/${usuario.id}`} className="text-label underline">
            Ver como você aparece
          </Link>
        </Aviso>
      )}
      {pdfNaoSalvo && (
        <Aviso tipo="alerta" className="mb-6" titulo="Seu currículo ainda não foi salvo">
          <p>
            Você mandou o PDF{pdfNaoSalvo.enviadoEm ? ` ${tempoRelativo(pdfNaoSalvo.enviadoEm, agora)}` : ""}, mas o
            currículo não chegou a ser salvo. O PDF já está aqui embaixo.
            {ia ? " Toque em “Preencher com esse PDF”, confira" : " Preencha"} e toque em “Salvar currículo”, no fim da
            página.
          </p>
        </Aviso>
      )}
      {lido && dadosConvite && (
        <Aviso tipo="info" className="mb-6" titulo="Seu currículo já veio preenchido">
          {dadosConvite.quem.nome} montou com o currículo que você mandou. Confira tudo, corrija o que precisar e salve
          no fim da página.
        </Aviso>
      )}
      {primeiro(sp.salvo) === "1" && (
        <Aviso tipo="sucesso" className="mb-6" titulo="Currículo salvo!">
          <p>
            Agora é só curtir as vagas que combinam com você. Quem anunciou vê seu currículo e, se curtir de volta, o
            WhatsApp dos dois aparece.
          </p>
          {vitrine ? (
            <p className="mt-2">
              Seu currículo já aparece para as empresas da região e na aba Talentos, sem telefone e e-mail (
              <Link href={`/talentos/${usuario.id}`} className="text-label underline">
                ver como aparece
              </Link>
              ). Prefere não aparecer? Desligue no{" "}
              <a href="#quem-acha" className="text-label underline">
                fim da página
              </a>
              .
            </p>
          ) : (
            <p className="mt-2">
              Quer que as empresas achem você? Ligue{" "}
              <a href="#quem-acha" className="text-label underline">
                “Aparecer na aba Talentos”
              </a>{" "}
              no fim da página.
            </p>
          )}
          {/* salvou sem dizer até onde estudou (não trava o salvar): o lembrete fica aqui */}
          {curriculo && !curriculo.escolaridade && (
            <p className="mt-2">
              Falta dizer até onde você estudou: muitas vagas pedem.{" "}
              <a href="#escolaridade" className="text-label underline">
                Pôr agora
              </a>
            </p>
          )}
          {/* salvou experiência sem as datas (não trava): o lembrete fica aqui */}
          {curriculo && curriculo.experiencias.some(faltaData) && (
            <p className="mt-2">
              Faltam as datas de{" "}
              {plural(curriculo.experiencias.filter(faltaData).length, "experiência", "experiências")}. Com elas, quem
              contrata vê quanto tempo você ficou em cada trabalho.{" "}
              <a href="#experiencias" className="text-label underline">
                Pôr agora
              </a>
            </p>
          )}
          <p className="mt-3">
            <Link href="/?tipo=vaga" className="text-label underline">
              Ver vagas perto de mim
            </Link>
          </p>
        </Aviso>
      )}
      {primeiro(sp.apagado) === "1" && (
        <Aviso tipo="info" className="mb-6" titulo="Currículo apagado">
          Ninguém mais vê. Se quiser, preencha de novo abaixo.
        </Aviso>
      )}
      <FormCurriculo
        key={curriculo?.atualizado_em ?? (lido ? "convite" : "novo")}
        inicial={curriculo}
        lido={lido}
        usuarioId={usuario.id}
        linkPdf={linkPdf}
        proximo={depoisDeSalvar}
        hoje={hoje}
        rotuloSalvar={aceitas.length ? "Salvar e mandar o currículo" : undefined}
        lerArquivo={ia}
        pdfGuardado={pdfNaoSalvo?.caminho ?? null}
      />
      {curriculo && <VisibilidadeCurriculo visivel={visivel} vitrine={vitrine} />}
      {curriculo && <ApagarCurriculo />}
    </>
  );
}

/** Quem já aceitou a pessoa e só espera o currículo: salvando aqui, dá match na hora. */
function AceitasEsperando({ aceitas, temCurriculo }: { aceitas: MinhaCurtida[]; temCurriculo: boolean }) {
  const uma = aceitas.length === 1 ? aceitas[0] : null;
  const fazer = temCurriculo ? "confira e salve" : "preencha e salve";
  return (
    <section
      aria-labelledby="aceitas-titulo"
      className="mb-6 flex flex-col gap-3 rounded-lg border-2 border-terra bg-surface-200 p-4 shadow-card sm:p-5"
    >
      <h2 id="aceitas-titulo" className="flex items-center gap-2 font-display text-h3">
        <PartyPopper aria-hidden className="size-5 shrink-0 text-terra-text" />
        {uma ? `${uma.autor_nome} aceitou você!` : `${aceitas.length} vagas aceitaram você!`}
      </h2>
      <p className="text-body-sm">
        {uma ? (
          <>
            Na vaga “{uma.titulo}”. Falta só o seu currículo: {fazer} aqui embaixo e dá match na hora.
          </>
        ) : (
          <>Falta só o seu currículo: {fazer} aqui embaixo e dá match em todas de uma vez.</>
        )}
      </p>
      {uma ? (
        <CaminhoDaCurtida
          situacao="aceita"
          quem={uma.autor_nome}
          className="rounded-md border border-line bg-surface-100 p-3"
        />
      ) : (
        <ul className="flex flex-col gap-1.5 rounded-md border border-line bg-surface-100 p-3 text-body-sm">
          {aceitas.map((c) => (
            <li key={c.anuncio_id}>
              <Link href={`/anuncio/${c.anuncio_id}`} className="font-semibold underline underline-offset-2">
                {c.titulo}
              </Link>{" "}
              <span className="text-ink-muted">· {c.autor_nome}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
