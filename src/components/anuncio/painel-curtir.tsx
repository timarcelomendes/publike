"use client";

import { FileText, Heart, HeartCrack, MessagesSquare, PartyPopper, Star, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { pedirConversa } from "@/lib/abrir-conversa";
import { caminhoConversa } from "@/lib/conversas";
import { curtirAnuncio, descurtirAnuncio } from "@/lib/acoes/curtidas";
import { motivoParaOutro, nomeMotivoDesfazer } from "@/lib/constantes";
import { linkDoMatch, mensagemComLink } from "@/lib/link-do-match";
import type { Pergunta, Respostas } from "@/lib/vaga-extra";
import { CaminhoDaCurtida } from "../caminho-curtida";
import { BotoesContato } from "../contato";
import { EntrevistaDoCandidato, type EntrevistaDoCandidato as Entrevista } from "./entrevista-candidato";
import { CamposDasPerguntas, faltandoResponder, SuasRespostas } from "./perguntas-da-vaga";
import { CurtirDeNovo, DesfazerMatch } from "../desfazer-match";
import { Aviso } from "../ui/basicos";
import { Botao, BotaoLink } from "../ui/botao";
import { classesEntrada } from "../ui/campo";

type Props = {
  idCampo: string;
  anuncioId: string;
  titulo: string;
  tipo: string;
  status: string | null;
  mensagem: string | null;
  logado: boolean;
  contato: { whatsapp: string | null; email: string | null } | null;
  /** vaga que pede currículo */
  pedeCurriculo?: boolean;
  /** a pessoa logada já preencheu o currículo (null: não logada) */
  temCurriculo?: boolean | null;
  /** quem publicou já aceitou, e falta só o currículo (a vaga pede) */
  aceita?: boolean;
  /** quem está vendo (para desfazer o match) */
  usuarioId?: string | null;
  /** nome de quem publicou */
  autorNome?: string;
  /** match desfeito: por quem e por quê */
  desfeito?: { porMim: boolean; motivo: string | null; futuro: boolean; bloqueadoPeloOutro?: boolean } | null;
  /** vaga com perguntas da empresa: o candidato responde ao curtir */
  perguntas?: Pergunta[];
  /** o que a pessoa respondeu (depois de curtir) */
  minhasRespostas?: Respostas;
  /** veio do cartão ou do Descobrir sem responder: avisa em cima das perguntas */
  pedirRespostas?: boolean;
  /** tocou em Curtir sem conta, entrou e voltou (?curtir=1): o quadro aparece com o botão à mão */
  continuarCurtida?: boolean;
  /** quem publicou: depois do match, a conversa no Chat do Publike é com ele */
  autorId?: string | null;
  /** depois do match: a entrevista que a empresa marcou */
  entrevista?: Entrevista | null;
  /** quem publicou liberou o contato: curtir já é match */
  contatoDireto?: boolean;
};

/** O currículo, que volta para a vaga depois de salvar. */
const linkDoCurriculo = (anuncioId: string) => `/perfil/curriculo?next=${encodeURIComponent(`/anuncio/${anuncioId}`)}`;

/** Convite para preencher o currículo, que volta para a vaga depois de salvar. */
function ConviteCurriculo({ anuncioId, forte, quem }: { anuncioId: string; forte: boolean; quem: string }) {
  const href = linkDoCurriculo(anuncioId);
  if (!forte) {
    return (
      <p className="text-body-sm">
        Dica: com{" "}
        <Link href={href} className="underline">
          currículo preenchido
        </Link>{" "}
        você chama mais atenção.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-md bg-surface-200 p-3">
      <p className="flex items-center gap-2 text-label">
        <FileText aria-hidden className="size-4 shrink-0" />
        Esta vaga pede currículo
      </p>
      <p className="text-body-sm">
        Mandando agora, o match sai na hora do aceite. Se deixar para depois, você recebe um aviso quando {quem}{" "}
        aceitar. Leva uns 3 minutos.
      </p>
      <Link
        href={href}
        className="inline-flex min-h-11 items-center justify-center rounded-md bg-terra px-4 text-label text-on-terra hover:bg-terra-hover"
      >
        Preencher meu currículo
      </Link>
    </div>
  );
}

/** O quadro "Curtir" da página do anúncio, com mensagem opcional. */
export function PainelCurtir({
  idCampo,
  anuncioId,
  titulo,
  tipo,
  status,
  mensagem,
  logado,
  contato,
  pedeCurriculo = false,
  temCurriculo = null,
  aceita = false,
  usuarioId = null,
  autorNome = "",
  desfeito = null,
  perguntas = [],
  minhasRespostas = {},
  pedirRespostas = false,
  continuarCurtida = false,
  autorId = null,
  entrevista = null,
  contatoDireto = false,
}: Props) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [respostas, setRespostas] = useState<Respostas>({});
  const [faltando, setFaltando] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const servico = tipo === "servico";
  const quadro = useRef<HTMLDivElement>(null);
  const botaoCurtir = useRef<HTMLButtonElement>(null);
  // voltou de "Entrar" para curtir: termina o que a pessoa começou (o quadro na tela, o botão com o foco)
  const continuar = continuarCurtida && logado && (status === null || status === "desfeito");
  useEffect(() => {
    const el = quadro.current;
    // a página tem o quadro duas vezes (celular e computador): só o que está à mostra
    if (!continuar || !el || el.offsetParent === null) return;
    el.scrollIntoView({ block: "center" });
    botaoCurtir.current?.focus({ preventScroll: true });
  }, [continuar]);
  // quem decide se aceita (e, com o aceite, vocês se conectam)
  const quem = autorNome || (servico ? "O profissional" : "Quem publicou");
  // vaga que pede currículo, para quem ainda não mandou: entra o passo do currículo
  const passoDoCurriculo = !servico && pedeCurriculo && temCurriculo === false;

  function curtir() {
    setErro(null);
    if (!logado) {
      router.push(`/entrar?next=${encodeURIComponent(`/anuncio/${anuncioId}?curtir=1`)}`);
      return;
    }
    if (perguntas.length) {
      const falta = faltandoResponder(perguntas, respostas);
      setFaltando(falta);
      if (falta.length) {
        setErro(falta.length === 1 ? "Responda à pergunta marcada para curtir." : "Responda às perguntas marcadas para curtir.");
        return;
      }
    }
    iniciar(async () => {
      const r = await curtirAnuncio(anuncioId, texto, perguntas.length ? respostas : null);
      if (!r.ok) {
        if (r.ir) router.push(r.ir);
        else setErro(r.erro);
      }
    });
  }

  function desfazer() {
    setErro(null);
    iniciar(async () => {
      const r = await descurtirAnuncio(anuncioId);
      if (!r.ok) setErro(r.erro);
    });
  }

  if (status === "match") {
    return (
      <div className="flex flex-col gap-4 rounded-lg bg-cerrado p-5 text-on-cerrado">
        <p className="flex items-center gap-2 font-display text-h3">
          <PartyPopper aria-hidden className="size-5" />
          Deu match! Agora é só conversar.
        </p>
        <p className="text-body-sm opacity-90">
          {contatoDireto
            ? `${quem} libera o contato para quem se interessa: vocês estão conectados.`
            : `${quem} aceitou e vocês estão conectados.`}{" "}
          {servico
            ? "Combinem o serviço, o endereço, o preço e o melhor dia."
            : "Combinem os detalhes, o endereço e o melhor horário."}
        </p>
        {entrevista && <EntrevistaDoCandidato e={entrevista} vaga={titulo} empresa={autorNome} anuncioId={anuncioId} />}
        {autorId && (
          // no Chat do canto da tela, sem sair da página (sem o Chat, a conversa em tela cheia)
          <Link
            href={caminhoConversa(autorId)}
            onClick={(e) => {
              if (pedirConversa({ outroId: autorId, outroNome: autorNome || quem, titulo })) e.preventDefault();
            }}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-pill bg-surface-200 px-5 text-label text-ink hover:bg-surface-300"
          >
            <MessagesSquare aria-hidden className="size-5 text-cerrado-text" />
            Conversar pelo chat do Publike
          </Link>
        )}
        <div className="rounded-md bg-surface-200 p-3">
          <BotoesContato
            whatsapp={contato?.whatsapp ?? null}
            email={contato?.email ?? null}
            // o link: o aceite (a ficha, para quem publicou) ou, no contato direto, o anúncio
            mensagem={mensagemComLink(
              `Olá! Deu match no Publike em “${titulo}”. Podemos conversar?`,
              linkDoMatch({
                anuncioId,
                perfilId: usuarioId ?? "",
                para: "quem_publicou",
                direto: contatoDireto,
                servico,
              }),
            )}
          />
        </div>
        {servico && (
          <Link
            href={`/anuncio/${anuncioId}/avaliar`}
            className="inline-flex min-h-11 items-center gap-2 self-start rounded-pill bg-surface-200 px-4 text-label text-ink hover:bg-surface-300"
          >
            <Star aria-hidden className="size-4 text-ipe" fill="currentColor" strokeWidth={0} />
            Avaliar o serviço
          </Link>
        )}
        {perguntas.length > 0 && (
          <SuasRespostas anuncioId={anuncioId} perguntas={perguntas} iniciais={minhasRespostas} claro />
        )}
        {usuarioId && (
          <DesfazerMatch anuncioId={anuncioId} perfilId={usuarioId} outroNome={autorNome || "quem publicou"} claro />
        )}
      </div>
    );
  }

  if (status === "desfeito") {
    // o cliente ainda pode avaliar quando foi o profissional quem desfez
    const podeAvaliar = servico && desfeito && !desfeito.porMim;
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-5">
        <p className="flex items-center gap-2 font-display text-h3">
          <HeartCrack aria-hidden className="size-5 text-ink-muted" />
          Match desfeito
        </p>
        <p className="text-body-sm text-ink-muted">
          {desfeito?.porMim
            ? `Você desfez este match. Motivo: ${nomeMotivoDesfazer(desfeito.motivo).toLowerCase()}.`
            : `${servico ? "O profissional" : "Quem publicou"} desfez o match. Motivo: ${motivoParaOutro(desfeito?.motivo)}.`}{" "}
          O contato não aparece mais.
          {desfeito?.bloqueadoPeloOutro
            ? ` ${servico ? "O profissional" : "Quem publicou"} preferiu não negociar de novo.`
            : ` Se ainda tiver interesse, ${servico ? "peça" : "curta"} de novo.`}
        </p>
        {!desfeito?.bloqueadoPeloOutro && <CurtirDeNovo anuncioId={anuncioId} servico={servico} />}
        {podeAvaliar && (
          <Link
            href={`/anuncio/${anuncioId}/avaliar`}
            className="inline-flex min-h-11 items-center gap-2 self-start text-label text-terra-text underline-offset-2 hover:underline"
          >
            <Star aria-hidden className="size-4 text-ipe" fill="currentColor" strokeWidth={0} />
            Avaliar o serviço
          </Link>
        )}
        <Link href={servico ? "/?tipo=servico" : "/"} className="text-label text-terra-text underline">
          {servico ? "Ver outros profissionais" : "Ver outras oportunidades"}
        </Link>
      </div>
    );
  }

  if (status === "dispensada") {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-5">
        <p className="font-display text-h3">Não foi dessa vez</p>
        <CaminhoDaCurtida situacao="dispensada" quem={quem} servico={servico} />
        <p className="text-body-sm text-ink-muted">
          {servico
            ? "O profissional não pode atender agora. Tem outros perto de você."
            : "Quem publicou escolheu outra pessoa. Continue curtindo: tem muita oportunidade perto de você."}
        </p>
        <Link href={servico ? "/?tipo=servico" : "/"} className="text-label text-terra-text underline">
          {servico ? "Ver outros profissionais" : "Ver outras oportunidades"}
        </Link>
      </div>
    );
  }

  // quem publicou aceitou e falta só o currículo: o próximo passo é com a pessoa
  if (status === "pendente" && aceita) {
    return (
      <div className="flex flex-col gap-4 rounded-lg border-2 border-terra bg-surface-200 p-5 shadow-card">
        <div className="flex flex-col gap-1.5">
          <p className="flex items-center gap-2 font-display text-h3">
            <PartyPopper aria-hidden className="size-5 shrink-0 text-terra-text" />
            {quem} aceitou você!
          </p>
          <p className="text-body-sm">
            Falta só um passo: esta vaga pede currículo. Mande o seu e o match sai na hora, com a conversa e o WhatsApp
            de vocês aqui.
          </p>
        </div>
        <div className="rounded-md border border-line bg-surface-100 p-3">
          <CaminhoDaCurtida situacao="aceita" quem={quem} />
        </div>
        <div className="flex flex-col gap-1.5">
          <BotaoLink href={linkDoCurriculo(anuncioId)} variante="primario" className="min-h-12 w-full">
            <FileText aria-hidden />
            Mandar meu currículo
          </BotaoLink>
          <p className="text-center text-body-sm text-ink-muted">
            {temCurriculo
              ? "Confira o seu currículo e salve para mandar."
              : "Você preenche uma vez e ele vale para as próximas vagas."}
          </p>
        </div>
        {perguntas.length > 0 && (
          <SuasRespostas anuncioId={anuncioId} perguntas={perguntas} iniciais={minhasRespostas} />
        )}
        <div>
          <Botao variante="fantasma" tamanho="sm" onClick={desfazer} disabled={pendente}>
            Desfazer curtida
          </Botao>
        </div>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
      </div>
    );
  }

  if (status === "pendente") {
    return (
      <div className="flex flex-col gap-3 rounded-lg bg-like-soft p-5 text-ink">
        <p className="flex items-center gap-2 font-display text-h3 text-like-text">
          <Heart aria-hidden className="size-5 text-like" fill="currentColor" />
          {servico ? "Pedido enviado" : "Você curtiu"}
        </p>
        <div className="rounded-md bg-surface-200 p-3">
          <CaminhoDaCurtida situacao="pendente" quem={quem} servico={servico} passoDoCurriculo={passoDoCurriculo} />
        </div>
        <p className="text-body-sm">
          {passoDoCurriculo
            ? `Quando ${quem} responder, você recebe um aviso.`
            : `Quando ${quem} responder, você recebe um aviso e o contato aparece aqui e no seu painel.`}
        </p>
        {mensagem && <p className="rounded-md bg-surface-200 p-3 text-body-sm italic">“{mensagem}”</p>}
        {perguntas.length > 0 && (
          <SuasRespostas anuncioId={anuncioId} perguntas={perguntas} iniciais={minhasRespostas} />
        )}
        {!servico && temCurriculo === false && (
          <ConviteCurriculo anuncioId={anuncioId} forte={pedeCurriculo} quem={quem} />
        )}
        {!servico && temCurriculo && <p className="text-body-sm">Seu currículo foi junto com a curtida.</p>}
        <div>
          <Botao variante="fantasma" tamanho="sm" onClick={desfazer} disabled={pendente}>
            {servico ? "Desfazer pedido" : "Desfazer curtida"}
          </Botao>
        </div>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
      </div>
    );
  }

  return (
    <div
      ref={quadro}
      className={`flex flex-col gap-4 rounded-lg border bg-surface-200 p-5 shadow-card ${
        continuar ? "border-like ring-2 ring-like/30" : "border-line"
      }`}
    >
      {continuar && (
        <p role="status" className="rounded-md bg-like-soft px-3 py-2 text-label text-like-text">
          Pronto, você entrou. Falta só tocar em “{servico ? "Quero contratar" : "Curtir a vaga"}”.
        </p>
      )}
      <div>
        <p className="font-display text-h3">{servico ? "Quer contratar?" : "Tem interesse?"}</p>
        {contatoDireto && !passoDoCurriculo ? (
          // o que mais pesa na decisão: em destaque, no verde do match
          <div className="mt-3 flex items-start gap-3 rounded-md border-2 border-cerrado bg-cerrado/10 p-3.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-pill bg-cerrado text-on-cerrado">
              <Zap aria-hidden className="size-5" />
            </span>
            <p className="min-w-0 text-body">
              <span className="block text-label text-cerrado-text">Contato direto</span>
              {servico ? "Ao tocar em Quero contratar" : "Ao curtir"}, você e{" "}
              <strong className="font-semibold">{quem}</strong> trocam o WhatsApp{" "}
              <strong className="font-semibold">na hora</strong>, sem esperar o aceite.
            </p>
          </div>
        ) : (
          <CaminhoDaCurtida
            situacao="antes"
            quem={quem}
            servico={servico}
            passoDoCurriculo={passoDoCurriculo}
            className="mt-3"
          />
        )}
        {!servico && pedeCurriculo && (
          <p className="mt-2 flex items-start gap-2 text-body-sm">
            <FileText aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
            <span>
              Esta vaga pede currículo.{" "}
              {temCurriculo ? (
                "O seu vai junto quando você curtir."
              ) : (
                <>
                  Pode curtir agora e mandar depois: se {quem} aceitar, você recebe um aviso para mandar. Se preferir,{" "}
                  <Link href={linkDoCurriculo(anuncioId)} className="underline">
                    preencha agora
                  </Link>
                  .
                </>
              )}
            </span>
          </p>
        )}
      </div>
      {perguntas.length > 0 && (
        <div className="flex flex-col gap-3 rounded-md border border-line bg-surface-100 p-3">
          <p className="text-label">A empresa quer saber</p>
          {pedirRespostas && (
            <p className="-mt-1 text-body-sm text-terra-text">Responda para curtir: as respostas vão junto da curtida.</p>
          )}
          <CamposDasPerguntas
            perguntas={perguntas}
            respostas={respostas}
            mudar={(id, v) => {
              setRespostas((r) => ({ ...r, [id]: v }));
              setFaltando((f) => f.filter((x) => x !== id));
              setErro(null);
            }}
            faltando={faltando}
          />
        </div>
      )}
      {logado && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={idCampo} className="text-label">
            Mensagem <span className="font-normal text-ink-muted">(opcional)</span>
          </label>
          <textarea
            id={idCampo}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={280}
            rows={3}
            placeholder={
              servico
                ? "Ex.: Preciso rebocar um muro de 12 metros no Setor Bueno. Pode ser sábado?"
                : "Ex.: Tenho 2 anos de experiência e moro perto."
            }
            className={`${classesEntrada} resize-y`}
          />
          <p className="text-right text-body-sm text-ink-muted">{texto.length}/280</p>
        </div>
      )}
      <button
        ref={botaoCurtir}
        type="button"
        onClick={curtir}
        disabled={pendente}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-pill border border-line-strong bg-surface-200 px-5 text-label text-ink transition-colors hover:bg-like-soft hover:text-like-text disabled:opacity-60"
      >
        <Heart aria-hidden className="size-5 text-like" />
        {pendente ? "Enviando…" : servico ? "Quero contratar" : "Curtir a vaga"}
      </button>
      {!logado && <p className="text-center text-body-sm text-ink-muted">Entrar é rápido, sem senha e grátis.</p>}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
    </div>
  );
}
