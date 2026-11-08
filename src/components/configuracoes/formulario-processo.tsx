"use client";

import { Check, LoaderCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { salvarProcesso } from "@/lib/acoes/processo";
import { JEITOS, jeitoDasRegras, type MotivoAoTirar, type Processo, type ProcessoDaConta } from "@/lib/processo";
import { Botao } from "../ui/botao";
import { AvisoSalvar, Chave, Pilulas } from "./comum";

// Configurações › Processo (migração 20270315120000): os três jeitos prontos e as regras, que valem para todas as
// vagas. Desligado no padrão. Só quem administra muda.

const MOTIVOS: { valor: MotivoAoTirar; nome: string }[] = [
  { valor: "nao", nome: "Não pedir" },
  { valor: "opcional", nome: "Opcional" },
  { valor: "obrigatorio", nome: "Obrigatório" },
];

export function FormularioProcesso({ inicial, agencia }: { inicial: ProcessoDaConta; agencia: boolean }) {
  const { administra, ...resto } = inicial;
  const [p, setP] = useState<Processo>(resto);
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const jeito = jeitoDasRegras(p);
  const mudar = (m: Partial<Processo>) => {
    setAviso(null);
    setP((x) => ({ ...x, ...m }));
  };
  const travado = !administra;

  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-label">Como é o seu processo?</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {JEITOS.map((j) => {
            const escolhido = jeito === j.valor;
            return (
              <button
                key={j.valor}
                type="button"
                disabled={travado}
                aria-pressed={escolhido}
                onClick={() => mudar({ ...j.regras, ok_do_cliente: p.ok_do_cliente })}
                className={`flex flex-col items-start gap-1 rounded-md border p-4 text-left transition-colors ${
                  escolhido ? "border-ink bg-surface-100 shadow-raised" : "border-line bg-surface-100 hover:border-line-strong"
                }`}
              >
                <span className="flex items-center gap-2 text-label">
                  {escolhido && <Check aria-hidden className="size-4" />}
                  {j.nome}
                  {j.valor === "simples" && <span className="font-normal text-ink-muted">(padrão)</span>}
                </span>
                <span className="text-body-sm text-ink-muted">{j.texto}</span>
              </button>
            );
          })}
        </div>
        {jeito === "proprio" && <p className="text-body-sm text-ink-muted">Do seu jeito: as regras abaixo.</p>}
      </fieldset>

      <div className="flex flex-col gap-2">
        <p className="text-label">As regras</p>
        <Chave
          marcada={p.entrevista_para_contratar}
          mudar={(v) => mudar({ entrevista_para_contratar: v })}
          desligada={travado}
          titulo="Para contratar, passar pela entrevista"
          texto="Quem não teve entrevista não vai para Contratados, nem recebe proposta."
        />
        <Chave
          marcada={p.proposta_para_contratar}
          mudar={(v) => mudar({ proposta_para_contratar: v })}
          desligada={travado}
          titulo="Para contratar, a proposta aceita"
          texto="O botão Contratar vira Mandar a proposta. Quem aceita vai sozinho para Contratados, já com os documentos."
        />
        <Chave
          marcada={p.teste_antes_da_entrevista}
          mudar={(v) => mudar({ teste_antes_da_entrevista: v })}
          desligada={travado}
          titulo="Para ir à entrevista, o teste da vaga feito"
          texto="Vale nas vagas com teste marcado “Antes da entrevista”. A pessoa vê que precisa fazer o teste para seguir."
        />
        {agencia && (
          <Chave
            marcada={p.ok_do_cliente}
            mudar={(v) => mudar({ ok_do_cliente: v })}
            desligada={travado}
            titulo="Contratar só quem o cliente escolheu nos finalistas"
            texto="A pessoa precisa ter o “Entrevistar” do cliente no link dos finalistas."
          />
        )}
        <div className="flex flex-col gap-2 rounded-md border border-line bg-surface-100 p-3 sm:p-4">
          <p className="text-label">Ao tirar alguém do processo (Dispensar ou Não seguiu), pedir o motivo</p>
          <Pilulas
            rotulo="Pedir o motivo"
            valor={p.motivo_ao_tirar}
            opcoes={MOTIVOS}
            mudar={(v) => mudar({ motivo_ao_tirar: v })}
            desligada={travado}
          />
          <p className="text-body-sm text-ink-muted">
            O motivo aparece nos Resultados. “A vaga fechou” e “Outro candidato” vão junto no retorno para a pessoa; os
            outros ficam só com você.
          </p>
        </div>
      </div>

      <p className="text-body-sm text-ink-muted">
        Com uma regra ligada, o botão diz o que falta. Quem administra a conta pode pular, dizendo o motivo, e a Trilha
        da vaga mostra o pulo. A equipe não pula.
      </p>

      {administra ? (
        <div className="flex flex-wrap items-center gap-3">
          <Botao
            variante="primario"
            disabled={pendente}
            onClick={() =>
              iniciar(async () => {
                const r = await chamarAcao(() => salvarProcesso(p));
                setAviso(r.ok ? { ok: true, texto: r.mensagem ?? "Salvo." } : { ok: false, texto: r.erro });
              })
            }
          >
            {pendente && <LoaderCircle aria-hidden className="animate-spin" />}
            Salvar o processo
          </Botao>
          <AvisoSalvar aviso={aviso} />
        </div>
      ) : (
        <p className="text-body-sm">Só quem administra a conta muda o processo.</p>
      )}
    </div>
  );
}
