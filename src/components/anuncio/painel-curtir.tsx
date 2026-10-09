"use client";

import { FileText, Heart, HeartCrack, PartyPopper, Star } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { curtirAnuncio, descurtirAnuncio } from "@/lib/acoes/curtidas";
import { motivoParaOutro, nomeMotivoDesfazer } from "@/lib/constantes";
import { BotoesContato } from "../contato";
import { CurtirDeNovo, DesfazerMatch } from "../desfazer-match";
import { Aviso } from "../ui/basicos";
import { Botao } from "../ui/botao";
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
  /** quem está vendo (para desfazer o match) */
  usuarioId?: string | null;
  /** nome de quem publicou */
  autorNome?: string;
  /** match desfeito: por quem e por quê */
  desfeito?: { porMim: boolean; motivo: string | null; futuro: boolean } | null;
};

/** Convite para preencher o currículo, que volta para a vaga depois de salvar. */
function ConviteCurriculo({ anuncioId, forte }: { anuncioId: string; forte: boolean }) {
  const href = `/perfil/curriculo?next=${encodeURIComponent(`/anuncio/${anuncioId}`)}`;
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
        Quem publicou só consegue dar match depois que você preencher o seu. Leva uns 3 minutos.
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
  usuarioId = null,
  autorNome = "",
  desfeito = null,
}: Props) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const servico = tipo === "servico";

  function curtir() {
    setErro(null);
    if (!logado) {
      router.push(`/entrar?next=${encodeURIComponent(`/anuncio/${anuncioId}`)}`);
      return;
    }
    iniciar(async () => {
      const r = await curtirAnuncio(anuncioId, texto);
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
          {servico
            ? "Combinem o serviço, o endereço, o preço e o melhor dia direto com o profissional."
            : "Combinem os detalhes, o endereço e o melhor horário direto com quem publicou."}
        </p>
        <div className="rounded-md bg-surface-200 p-3">
          <BotoesContato
            whatsapp={contato?.whatsapp ?? null}
            email={contato?.email ?? null}
            mensagem={`Olá! Deu match no Publike em “${titulo}”. Podemos conversar?`}
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
          {desfeito?.futuro &&
            (desfeito.porMim
              ? " Você disse que topa negociar de novo: se mudar de ideia, curta outra vez."
              : " Mas topa negociar em outro momento: se ainda tiver interesse, curta de novo.")}
        </p>
        {desfeito?.futuro && <CurtirDeNovo anuncioId={anuncioId} />}
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

  if (status === "pendente") {
    return (
      <div className="flex flex-col gap-3 rounded-lg bg-like-soft p-5 text-ink">
        <p className="flex items-center gap-2 font-display text-h3 text-like-text">
          <Heart aria-hidden className="size-5 text-like" fill="currentColor" />
          {servico ? "Pedido enviado" : "Você curtiu"}
        </p>
        <p className="text-body-sm">
          {servico
            ? "Agora é com o profissional. Se ele aceitar, dá match e o contato aparece aqui e no seu painel."
            : "Agora é com quem publicou. Se curtir você de volta, dá match e o contato aparece aqui e no seu painel."}
        </p>
        {mensagem && <p className="rounded-md bg-surface-200 p-3 text-body-sm italic">“{mensagem}”</p>}
        {!servico && temCurriculo === false && <ConviteCurriculo anuncioId={anuncioId} forte={pedeCurriculo} />}
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
    <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface-200 p-5 shadow-card">
      <div>
        <p className="font-display text-h3">{servico ? "Quer contratar?" : "Tem interesse?"}</p>
        <p className="mt-1 text-body-sm text-ink-muted">
          {servico
            ? "Mande um pedido. Se o profissional aceitar, dá match e o WhatsApp dos dois aparece."
            : "Curta a vaga. Se quem publicou curtir você de volta, dá match e o WhatsApp dos dois aparece."}
        </p>
        {!servico && pedeCurriculo && (
          <p className="mt-2 flex items-start gap-2 text-body-sm">
            <FileText aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
            <span>
              Esta vaga pede currículo.{" "}
              {temCurriculo ? (
                "O seu vai junto quando você curtir."
              ) : (
                <>
                  O match só acontece com currículo preenchido:{" "}
                  <Link href={`/perfil/curriculo?next=${encodeURIComponent(`/anuncio/${anuncioId}`)}`} className="underline">
                    preencha o seu
                  </Link>{" "}
                  antes ou depois de curtir.
                </>
              )}
            </span>
          </p>
        )}
      </div>
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
