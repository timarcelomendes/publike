"use client";

import { Heart, PartyPopper } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { curtirAnuncio, descurtirAnuncio } from "@/lib/acoes/curtidas";
import { BotoesContato } from "../contato";
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
};

/** O quadro "Curtir" da página do anúncio, com mensagem opcional. */
export function PainelCurtir({ idCampo, anuncioId, titulo, tipo, status, mensagem, logado, contato }: Props) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const nome = tipo === "vaga" ? "vaga" : "serviço";

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
        <p className="text-body-sm opacity-90">Combinem os detalhes, o endereço e o melhor horário direto com quem publicou.</p>
        <div className="rounded-md bg-surface-200 p-3">
          <BotoesContato
            whatsapp={contato?.whatsapp ?? null}
            email={contato?.email ?? null}
            mensagem={`Olá! Deu match no Publike em “${titulo}”. Podemos conversar?`}
          />
        </div>
      </div>
    );
  }

  if (status === "dispensada") {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-5">
        <p className="font-display text-h3">Não foi dessa vez</p>
        <p className="text-body-sm text-ink-muted">
          Quem publicou escolheu outra pessoa. Continue curtindo: tem muita oportunidade perto de você.
        </p>
        <Link href="/" className="text-label text-terra-text underline">
          Ver outras oportunidades
        </Link>
      </div>
    );
  }

  if (status === "pendente") {
    return (
      <div className="flex flex-col gap-3 rounded-lg bg-like-soft p-5 text-ink">
        <p className="flex items-center gap-2 font-display text-h3 text-like-text">
          <Heart aria-hidden className="size-5 text-like" fill="currentColor" />
          Você curtiu
        </p>
        <p className="text-body-sm">
          Agora é com quem publicou. Se curtir você de volta, dá match e o contato aparece aqui e no seu painel.
        </p>
        {mensagem && <p className="rounded-md bg-surface-200 p-3 text-body-sm italic">“{mensagem}”</p>}
        <div>
          <Botao variante="fantasma" tamanho="sm" onClick={desfazer} disabled={pendente}>
            Desfazer curtida
          </Botao>
        </div>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface-200 p-5 shadow-card">
      <div>
        <p className="font-display text-h3">Tem interesse?</p>
        <p className="mt-1 text-body-sm text-ink-muted">
          Curta a {nome}. Se quem publicou curtir você de volta, dá match e o WhatsApp dos dois aparece.
        </p>
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
              tipo === "vaga"
                ? "Ex.: Tenho 2 anos de experiência e moro perto."
                : "Ex.: Faço esse serviço há 5 anos e tenho as ferramentas."
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
        {pendente ? "Curtindo…" : tipo === "vaga" ? "Curtir a vaga" : "Curtir o serviço"}
      </button>
      {!logado && <p className="text-center text-body-sm text-ink-muted">Entrar é rápido, sem senha e grátis.</p>}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
    </div>
  );
}
