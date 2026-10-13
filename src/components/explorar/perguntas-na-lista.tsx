"use client";

import { useId, useState } from "react";
import type { Filtros } from "@/lib/filtros";
import { tipoDaIntencao, type Intencao } from "@/lib/intencao";
import { AVISOS_GPS, pedirPosicao, useIrPara } from "./barra-busca";
import { CartaoIntencao, FaixaIntencao, FolhaIntencao, type ProximoPasso } from "./intencao";
import { PainelOndeMora, PerguntaOndeMora, usePerguntaAdiada } from "./onde-mora";

/**
 * As perguntas da primeira visita, no meio dos anúncios (depois dos dois primeiros) e uma
 * por vez: "O que você quer fazer no Publike?", depois "Onde você mora?" e, respondidas,
 * o próximo passo para a resposta (currículo, vitrine, publicar), com o "Mudar".
 * Em cima da lista ficam só a busca e os filtros: os anúncios aparecem logo na primeira tela.
 * Sem resposta, "O que você quer fazer" abre numa janela por cima ao chegar; fechada ("Agora
 * não"), continua aqui, no meio dos anúncios. "Agora não" também deixa o "Onde você mora?" para depois.
 */
export function PerguntasNaLista({
  filtros,
  intencao,
  temLocal,
  proximoPasso,
}: {
  filtros: Filtros;
  intencao: Intencao | null;
  /** a pessoa já disse onde mora (CEP, bairro ou o bairro do perfil) */
  temLocal: boolean;
  proximoPasso: ProximoPasso;
}) {
  const [ir] = useIrPara(filtros);
  const [adiada, adiar] = usePerguntaAdiada();
  // a resposta tocada agora vale na hora, antes de o servidor devolver a página
  const [escolhidaAgora, setEscolhidaAgora] = useState<Intencao | null>(null);
  const [semCep, setSemCep] = useState(false);
  const [avisoGps, setAvisoGps] = useState<string | null>(null);
  const painel = useId();
  const intencaoAtual = escolhidaAgora ?? intencao;

  // Procuro trabalho → Vagas; Quero contratar um serviço → Serviços (as outras ficam em Tudo)
  function escolher(i: Intencao) {
    setEscolhidaAgora(i);
    const tipo = tipoDaIntencao(i);
    ir({ tipo, tudo: !tipo, regime: tipo === "servico" ? null : filtros.regime }, true);
  }

  // quem acabou de dizer onde mora quer ver a partir de casa, não de onde está agora
  function contarDeCasa() {
    if (filtros.origem !== "centro") ir({ origem: "centro" }, true);
  }

  function usarLocalizacao() {
    setAvisoGps(null);
    pedirPosicao(
      ({ lat, lng }) => ir({ lat, lng, origem: "gps", ordem: "perto" }),
      (motivo) => setAvisoGps(AVISOS_GPS[motivo]),
    );
  }

  // a pergunta não some: na chegada, numa janela por cima; fechada, fica aqui no meio dos anúncios
  if (!intencaoAtual) {
    return adiada ? <CartaoIntencao aoEscolher={escolher} /> : <FolhaIntencao aoEscolher={escolher} aoAdiar={adiar} />;
  }

  if (!temLocal && filtros.origem === "centro" && !adiada) {
    // "Não sei o CEP": cidade e bairro, aqui mesmo
    if (semCep) {
      return <PainelOndeMora id={painel} local={null} fechar={() => setSemCep(false)} aoSalvar={contarDeCasa} />;
    }
    return (
      <div className="flex flex-col gap-2">
        <PerguntaOndeMora
          usarLocalizacao={usarLocalizacao}
          escolherBairro={() => setSemCep(true)}
          aoSalvar={contarDeCasa}
        />
        {avisoGps && (
          <p role="status" className="text-body-sm text-terra-text">
            {avisoGps}
          </p>
        )}
      </div>
    );
  }

  // respondidas: o próximo passo vem do servidor para a resposta dele (some até ele confirmar a nova)
  const passo = escolhidaAgora && escolhidaAgora !== intencao ? null : proximoPasso;
  if (!passo) return null;
  return (
    <div className="rounded-lg border border-line bg-surface-300 px-3 py-1.5 sm:px-4">
      <FaixaIntencao intencao={intencaoAtual} proximoPasso={passo} aoEscolher={escolher} />
    </div>
  );
}
