"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Aviso } from "../ui/basicos";

// Depois de tocar em Publicar (ou Salvar), o servidor grava e manda abrir a vaga. Em 12/11/2026 a vaga da Katheleen
// gravou em 1 s, mas a tela ficou em "Salvando…" até ela desistir: a página dela era de antes de uma publicação nova
// do site, e aí o Next.js troca a navegação por uma recarga completa e espera a página sair (o botão continua
// girando até lá, de propósito). A pergunta "Sair do site?" do formulário aparecia nessa hora; com Cancelar, nada
// mais acontecia. Agora a pergunta fica desligada enquanto salva (form-anuncio.tsx) e, com a resposta do servidor
// na mão, a tela que não mudar diz que deu certo e abre a página sozinha. Sem resposta por muito tempo, diz como
// conferir sem perder o que foi escrito.

/** Depois da resposta do servidor, ainda sem a página nova na tela: o aviso (ms)... */
const AVISAR_EM = 2500;
/** ...e a página abre sozinha, com recarga completa. */
const ABRIR_EM = 6000;
/** Sem resposta do servidor: o aviso de demora. */
const DEMORA_EM = 15000;

/** Gravou e vai para `destino` (`travou`: a tela ainda não mudou), está demorando, ou nada a dizer. */
export type SaidaDoSalvar = { destino: string; travou: boolean } | "demorando" | null;

/** O servidor gravou a vaga: leva a ela (publicada, repetida ou salva) ou à lista das publicadas. */
export function vagaGravada(destino: string) {
  return /^\/anuncio\/[0-9a-f-]{36}(\?|$)/i.test(destino) || /^\/painel\/anuncios\?(.*&)?publicadas=/.test(destino);
}

/**
 * Acompanha um salvar: `comecar` ao tocar no botão, `seguir` quando o servidor manda para outra página (o redirect da
 * ação). Se a página sai da tela antes (o normal), nada aparece: o Next.js esconde a de antes e os relógios param.
 */
export function useSaidaDoSalvar() {
  const [saida, setSaida] = useState<SaidaDoSalvar>(null);
  // o relógio da demora (para quando o servidor responde) e os de depois da resposta (só param com a página)
  const demora = useRef<number | null>(null);
  const relogios = useRef<number[]>([]);
  const parar = useCallback(() => {
    if (demora.current !== null) window.clearTimeout(demora.current);
    demora.current = null;
  }, []);
  const limpar = useCallback(() => {
    parar();
    for (const r of relogios.current) window.clearTimeout(r);
    relogios.current = [];
  }, [parar]);
  // a página saiu da tela (a vaga abriu e o Next.js guardou esta escondida) ou fechou: nada mais dispara
  useEffect(() => limpar, [limpar]);

  /** Tocou em salvar: começa a contar a demora. */
  const comecar = useCallback(() => {
    limpar();
    setSaida(null);
    demora.current = window.setTimeout(() => setSaida("demorando"), DEMORA_EM);
  }, [limpar]);

  /** O servidor gravou e mandou para `destino`: se a tela não mudar, avisa e abre a página. */
  const seguir = useCallback(
    (destino: string) => {
      limpar();
      const depois = (ms: number, fazer: () => void) => relogios.current.push(window.setTimeout(fazer, ms));
      // pelo relógio, fora da transição da navegação (que pode não terminar): o aviso aparece mesmo com ela parada
      depois(0, () => setSaida({ destino, travou: false }));
      depois(AVISAR_EM, () => setSaida({ destino, travou: true }));
      depois(ABRIR_EM, () => window.location.assign(destino));
    },
    [limpar],
  );

  /** `parar`: o servidor respondeu sem sair da página (um erro na tela): a demora não conta mais. */
  return { saida, comecar, seguir, parar };
}

/** O que dizer de cada destino do salvar. */
function textoDoDestino(destino: string) {
  const q = new URLSearchParams(destino.split("?")[1] ?? "");
  if (q.has("publicadas")) return { titulo: "Suas vagas foram publicadas", pagina: "a lista das suas vagas" };
  if (q.get("repetido") === "1") return { titulo: "Esta vaga já estava publicada", pagina: "a vaga" };
  if (q.get("publicado") === "1") return { titulo: "Sua vaga foi publicada", pagina: "a vaga" };
  if (q.get("salvo") === "1") return { titulo: "Alterações salvas", pagina: "a vaga" };
  return { titulo: "Pronto", pagina: "a próxima página" };
}

/** O rótulo do botão enquanto salva: depois da resposta do servidor, diz para onde vai. */
export function rotuloSalvando(saida: SaidaDoSalvar) {
  if (!saida || saida === "demorando") return "Salvando…";
  return saida.destino.startsWith("/anuncio/") ? "Abrindo a vaga…" : "Abrindo…";
}

/**
 * Perto do botão: gravou e a página está abrindo (com o link, se o navegador não abrir sozinho), ou está demorando.
 * `vagaNova`: o link para conferir em Minhas vagas.
 */
export function AvisoDaSaida({
  saida,
  vagaNova = false,
  className = "",
}: {
  saida: SaidaDoSalvar;
  vagaNova?: boolean;
  className?: string;
}) {
  if (saida === "demorando") {
    return (
      <Aviso tipo="info" titulo="Ainda salvando" className={className}>
        <p>Está demorando mais que o normal. Não feche esta página: o que você preencheu continua aqui.</p>
        {vagaNova && (
          <p>
            Para ver se a vaga já saiu, abra{" "}
            <a
              href="/painel/anuncios"
              target="_blank"
              rel="noopener"
              className="font-semibold underline underline-offset-2"
            >
              Minhas vagas em outra aba
            </a>
            .
          </p>
        )}
      </Aviso>
    );
  }
  if (!saida?.travou) return null;
  const { titulo, pagina } = textoDoDestino(saida.destino);
  return (
    <Aviso tipo="sucesso" titulo={titulo} className={className}>
      <p>
        Abrindo {pagina}…{" "}
        {/* recarga completa, de propósito: é o caminho que não depende da navegação que parou */}
        <a href={saida.destino} className="font-semibold underline underline-offset-2">
          Abrir agora
        </a>
      </p>
    </Aviso>
  );
}
