"use client";

import { LoaderCircle, RotateCcw, Sparkles, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { lerCurriculoEnviado, type LeituraDoArquivo } from "@/lib/acoes/curriculo";
import { resumoDaLeitura } from "@/lib/arquivo-curriculo";
import { detalheDoErro, relatarFalha } from "@/lib/falhas";
import { Aviso } from "../ui/basicos";
import { Botao } from "../ui/botao";
import { irParaOCampo } from "./seu-cartao";

type CurriculoLido = Extract<LeituraDoArquivo, { ok: true }>["curriculo"];

type Situacao =
  | { tipo: "parado" }
  | { tipo: "lendo" }
  | { tipo: "pronto"; texto: string; semData: number }
  | { tipo: "erro"; texto: string };

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * "Preencher com este PDF" (claude/plano-preencher-pelo-pdf.md), na parte "Currículo em PDF": a IA lê o PDF anexado
 * (o que acabou de subir ou o que já estava salvo) e põe nos campos o que achar, como o "Já tem currículo pronto?".
 * O que o PDF não tem fica como estava, e nada é salvo antes de a pessoa salvar. `destaque`: o PDF acabou de ser
 * anexado (a pergunta em destaque); o PDF já salvo ganha só o botão.
 */
export function PreencherComOPdf({
  arquivo,
  destaque,
  rotuloSalvar,
  aoLer,
  aoDesfazer,
  aoMudarLendo,
}: {
  /** o caminho do PDF anexado, na pasta da pessoa */
  arquivo: string;
  destaque: boolean;
  /** o texto do botão de salvar, para o aviso dizer onde tocar */
  rotuloSalvar: string;
  aoLer: (lido: CurriculoLido) => void;
  aoDesfazer: (() => void) | null;
  aoMudarLendo: (lendo: boolean) => void;
}) {
  const [situacao, setSituacao] = useState<Situacao>({ tipo: "parado" });
  const aviso = useRef<HTMLDivElement>(null);

  // o resultado aparece na tela e o leitor de tela fala
  useEffect(() => {
    if (situacao.tipo === "pronto" || situacao.tipo === "erro") aviso.current?.focus();
  }, [situacao]);

  async function preencher() {
    setSituacao({ tipo: "lendo" });
    aoMudarLendo(true);
    let resultado: LeituraDoArquivo;
    try {
      const dados = new FormData();
      dados.set("pdf", arquivo);
      resultado = await lerCurriculoEnviado(dados);
    } catch (e) {
      resultado = { ok: false, erro: "Não deu para ler o PDF agora. Tente de novo." };
      relatarFalha({
        onde: "curriculo",
        etapa: "conexao",
        mensagem: resultado.erro,
        detalhe: `pdf anexado · ${detalheDoErro(e)}`,
      });
    }
    aoMudarLendo(false);
    if (!resultado.ok) return setSituacao({ tipo: "erro", texto: resultado.erro });
    aoLer(resultado.curriculo);
    setSituacao({
      tipo: "pronto",
      texto: resumoDaLeitura(resultado.curriculo),
      semData: resultado.curriculo.experiencias.filter((x) => !x.inicio || (!x.atual && !x.fim)).length,
    });
  }

  if (situacao.tipo === "lendo") {
    return (
      <p role="status" className="flex items-center gap-2 rounded-md border border-line bg-surface-100 p-4 text-label">
        <LoaderCircle aria-hidden className="size-5 shrink-0 motion-safe:animate-spin" />
        Lendo seu currículo… pode levar até um minuto.
      </p>
    );
  }

  if (situacao.tipo === "pronto") {
    return (
      <div ref={aviso} tabIndex={-1} className="outline-none">
        <Aviso tipo="sucesso" titulo="Pronto! Confira os campos.">
          <p>
            Preenchemos {situacao.texto} com o PDF. Ainda não está salvo: confira e toque em “{rotuloSalvar}”.
          </p>
          {situacao.semData > 0 && (
            <p>
              Se souber, ponha as datas que faltam em{" "}
              {situacao.semData === 1 ? "uma experiência" : plural(situacao.semData, "experiência", "experiências")}.
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <Botao tamanho="sm" onClick={() => irParaOCampo("titulo")}>
              Ver os campos
            </Botao>
            {aoDesfazer && (
              <Botao
                tamanho="sm"
                variante="fantasma"
                onClick={() => {
                  aoDesfazer();
                  setSituacao({ tipo: "parado" });
                }}
              >
                <Undo2 aria-hidden />
                Desfazer
              </Botao>
            )}
          </div>
        </Aviso>
      </div>
    );
  }

  const erro =
    situacao.tipo === "erro" ? (
      <div ref={aviso} tabIndex={-1} className="outline-none">
        <Aviso tipo="erro">{situacao.texto}</Aviso>
      </div>
    ) : null;

  if (!destaque) {
    return (
      <div className="flex flex-col gap-2">
        {erro}
        <Botao onClick={() => void preencher()} className="self-start">
          {erro ? <RotateCcw aria-hidden /> : <Sparkles aria-hidden />}
          {erro ? "Tentar de novo" : "Preencher os campos com este PDF"}
        </Botao>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-line-strong bg-surface-100 p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-pill bg-terra-soft text-terra-text">
          <Sparkles aria-hidden className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-label">Quer que o Publike preencha os campos com este PDF?</p>
          <p className="mt-0.5 text-body-sm text-ink-muted">
            Ele lê o arquivo e põe nos campos o que achar. O que o PDF não tem fica como está, e nada é salvo antes de
            você conferir. Telefone, e-mail e endereço não entram nos campos.
          </p>
        </div>
      </div>
      {erro}
      <Botao onClick={() => void preencher()} className="self-start">
        {erro ? <RotateCcw aria-hidden /> : <Sparkles aria-hidden />}
        {erro ? "Tentar de novo" : "Preencher com este PDF"}
      </Botao>
    </div>
  );
}
