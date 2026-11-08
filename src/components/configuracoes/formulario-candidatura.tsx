"use client";

import { LoaderCircle } from "lucide-react";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { aplicarPadroes, salvarPadroesDaCandidatura } from "@/lib/acoes/processo";
import {
  OPCOES_CONTATO_POR,
  type CurriculoPadrao,
  type PadroesDaConta,
  type TestePadrao,
} from "@/lib/processo";
import type { Pergunta } from "@/lib/vaga-extra";
import { EditorPerguntas } from "../anuncio/extras-da-vaga";
import { Botao } from "../ui/botao";
import { AvisoSalvar, Chave, Pilulas } from "./comum";

// Configurações › Candidatura (migração 20270315120000): como as vagas novas começam. Cada vaga continua podendo
// mudar no formulário dela; "Levar para as vagas no ar" muda as que já estão publicadas.

const CURRICULO: { valor: CurriculoPadrao; nome: string }[] = [
  { valor: "regime", nome: "Pelo tipo de contratação" },
  { valor: "sempre", nome: "Sempre" },
  { valor: "nunca", nome: "Nunca" },
];
const TESTE: { valor: TestePadrao; nome: string; texto: string }[] = [
  { valor: "opcional", nome: "Opcional", texto: "O teste da Publike que combina com a vaga entra como opcional." },
  { valor: "antes", nome: "Antes da entrevista", texto: "O teste entra marcado “Antes da entrevista”." },
  { valor: "nenhum", nome: "Sem teste", texto: "A vaga sai sem teste; você põe quando quiser." },
];

export function FormularioCandidatura({ inicial, perguntas }: { inicial: PadroesDaConta; perguntas: Pergunta[] }) {
  const form = useRef<HTMLFormElement>(null);
  const [curriculo, setCurriculo] = useState<CurriculoPadrao>(inicial.curriculo);
  const [direto, setDireto] = useState(inicial.contato_direto);
  const [contatoPor, setContatoPor] = useState(inicial.contato_por);
  const [tirar, setTirar] = useState(inicial.tirar_eliminados);
  const [teste, setTeste] = useState<TestePadrao>(inicial.teste);
  const [levar, setLevar] = useState<string[]>([]);
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [avisoLevar, setAvisoLevar] = useState<{ ok: boolean; texto: string } | null>(null);
  const travado = !inicial.administra;

  function salvar(e: FormEvent) {
    e.preventDefault();
    let lista: unknown = [];
    try {
      lista = JSON.parse(String(new FormData(form.current!).get("perguntas") ?? "[]"));
    } catch {
      lista = [];
    }
    iniciar(async () => {
      const r = await chamarAcao(() =>
        salvarPadroesDaCandidatura({
          curriculo,
          contato_direto: direto,
          contato_por: contatoPor,
          perguntas: lista,
          tirar_eliminados: tirar,
          teste,
        }),
      );
      setAviso(r.ok ? { ok: true, texto: r.mensagem ?? "Salvo." } : { ok: false, texto: r.erro });
    });
  }

  return (
    <form ref={form} onSubmit={salvar} className="flex flex-col gap-5">
      <fieldset disabled={travado} className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <p className="text-label">Pedir currículo</p>
          <Pilulas rotulo="Pedir currículo" valor={curriculo} opcoes={CURRICULO} mudar={setCurriculo} />
          <p className="text-body-sm text-ink-muted">
            {curriculo === "regime"
              ? "Pede em CLT, aprendiz, estágio, trainee e temporário (como hoje)."
              : curriculo === "sempre"
                ? "Toda vaga nova pede currículo: o match espera a pessoa mandar."
                : "Nenhuma vaga nova pede currículo."}
          </p>
        </div>

        <Chave
          marcada={direto}
          mudar={setDireto}
          titulo="Contato direto: quem curtir já dá match"
          texto="Sem esperar você aceitar. Mais rápido, mas chegam mais contatos."
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-label">Depois do match, como os candidatos falam com você?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {OPCOES_CONTATO_POR.map((o) => (
              <label
                key={o.valor}
                className="flex cursor-pointer items-start gap-3 rounded-md border border-line bg-surface-100 p-3 has-[:checked]:border-ink"
              >
                <input
                  type="radio"
                  name="contato_por_padrao"
                  checked={contatoPor === o.valor}
                  onChange={() => setContatoPor(o.valor)}
                  className="mt-0.5 size-5 shrink-0 accent-[var(--pk-ink)]"
                />
                <span>
                  <span className="block text-label">{o.nome}</span>
                  <span className="block text-body-sm text-ink-muted">{o.ajuda}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <EditorPerguntas inicial={perguntas} />
          <Chave
            marcada={tirar}
            mudar={setTirar}
            titulo="Quem responder diferente numa pergunta eliminatória sai do processo"
            texto="Desligado, a pessoa só fica marcada no quadro, e você decide. Ligado, ela é dispensada sozinha, com o retorno."
          />
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-label">Teste da vaga</p>
          <Pilulas rotulo="Teste da vaga" valor={teste} opcoes={TESTE} mudar={setTeste} />
          <p className="text-body-sm text-ink-muted">{TESTE.find((t) => t.valor === teste)?.texto}</p>
        </div>
      </fieldset>

      {!travado ? (
        <div className="flex flex-wrap items-center gap-3">
          <Botao type="submit" variante="primario" disabled={pendente}>
            {pendente && <LoaderCircle aria-hidden className="animate-spin" />}
            Salvar o padrão
          </Botao>
          <AvisoSalvar aviso={aviso} />
        </div>
      ) : (
        <p className="text-body-sm">Só quem administra a conta muda o padrão.</p>
      )}

      {!travado && (
        <div className="flex flex-col gap-2 rounded-md bg-surface-300 p-3 sm:p-4">
          <p className="text-label">Levar para as vagas no ar</p>
          <p className="text-body-sm text-ink-muted">
            Salve antes. As perguntas e o teste ficam só para as vagas novas: mudar nas vagas no ar mudaria o que já foi
            respondido.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {[
              { valor: "curriculo", nome: "Pedir currículo" },
              { valor: "contato_direto", nome: "Contato direto" },
              { valor: "contato_por", nome: "Como falam depois do match" },
            ].map((o) => (
              <label key={o.valor} className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-body-sm">
                <input
                  type="checkbox"
                  checked={levar.includes(o.valor)}
                  onChange={(e) => setLevar((l) => (e.target.checked ? [...l, o.valor] : l.filter((x) => x !== o.valor)))}
                  className="size-5 accent-[var(--pk-ink)]"
                />
                {o.nome}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Botao
              tamanho="sm"
              disabled={pendente || !levar.length}
              onClick={() =>
                iniciar(async () => {
                  const r = await chamarAcao(() => aplicarPadroes(levar));
                  setAvisoLevar(r.ok ? { ok: true, texto: r.mensagem ?? "Pronto." } : { ok: false, texto: r.erro });
                })
              }
            >
              Levar para as vagas no ar
            </Botao>
            <AvisoSalvar aviso={avisoLevar} />
          </div>
        </div>
      )}
    </form>
  );
}
