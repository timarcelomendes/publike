"use client";

import { LoaderCircle, Mic, Square } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { comecarGravacao, ErroDaFala, podeGravarFala, relogio, transcreverGravacao, type Gravacao } from "@/lib/gravar-fala";
import { Botao } from "../ui/botao";

// O microfone de um campo (22/11/2026; claude/plano-curriculo-otimizado.md, fase 2: "completar por áudio"): a pessoa
// fala o que fazia no trabalho, a fala vira texto e entra no campo para ela conferir. Até 1 minuto; o áudio não fica
// guardado.

const MAX_SEGUNDOS = 60;
const nadaMuda = () => () => {};

export function FalarNoCampo({ aoFalar, rotulo = "Falar" }: { aoFalar: (texto: string) => void; rotulo?: string }) {
  const gravaAqui = useSyncExternalStore(nadaMuda, podeGravarFala, () => false);
  const [desde, setDesde] = useState<number | null>(null);
  const [ouvindo, setOuvindo] = useState(false);
  const [agora, setAgora] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const gravacao = useRef<Gravacao | null>(null);

  async function parar() {
    const g = gravacao.current;
    if (!g) return;
    gravacao.current = null;
    setDesde(null);
    setOuvindo(true);
    try {
      aoFalar(await transcreverGravacao(await g.terminar()));
    } catch (e) {
      setErro(e instanceof ErroDaFala ? e.message : "Não deu para ouvir agora. Tente de novo ou escreva.");
    }
    setOuvindo(false);
  }

  useEffect(() => {
    if (desde === null) return;
    const t = setInterval(() => {
      const n = Date.now();
      setAgora(n);
      if ((n - desde) / 1000 >= MAX_SEGUNDOS) void parar();
    }, 500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só quando começa ou para de gravar
  }, [desde]);

  if (!gravaAqui) return null;

  async function comecar() {
    setErro(null);
    try {
      gravacao.current = await comecarGravacao();
    } catch (e) {
      return setErro(e instanceof ErroDaFala ? e.message : "Não deu para ligar o microfone.");
    }
    const n = Date.now();
    setAgora(n);
    setDesde(n);
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        {desde !== null ? (
          <>
            <Botao tamanho="sm" variante="primario" onClick={() => void parar()}>
              <Square aria-hidden />
              Parar
            </Botao>
            <span role="status" className="flex items-center gap-1.5 text-body-sm text-ink-muted tabular-nums">
              <span aria-hidden className="size-2.5 rounded-pill bg-danger motion-safe:animate-pulse" />
              Gravando {relogio((agora - desde) / 1000)}
            </span>
          </>
        ) : ouvindo ? (
          <span role="status" className="flex items-center gap-1.5 text-body-sm text-ink-muted">
            <LoaderCircle aria-hidden className="size-4 motion-safe:animate-spin" />
            Ouvindo…
          </span>
        ) : (
          <Botao tamanho="sm" variante="fantasma" onClick={() => void comecar()}>
            <Mic aria-hidden />
            {rotulo}
          </Botao>
        )}
      </div>
      {erro && <p className="text-body-sm text-danger">{erro}</p>}
    </div>
  );
}
