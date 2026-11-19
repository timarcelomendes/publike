"use client";

import { useState, useTransition } from "react";
import { salvarVagasPeloWhatsapp, type ConfigVagasDoAdmin } from "@/lib/acoes/admin-vagas-whatsapp";
import type { RascunhoConvite } from "@/lib/convites";
import {
  CHAVES_TEXTOS_VAGAS,
  LIMITES_VAGAS_WHATSAPP,
  respostaDasVagas,
  TEXTOS_VAGAS,
  textoDasVagas,
  type ChaveTextoVagas,
} from "@/lib/vagas-pelo-whatsapp";
import { classesBotao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";

// Admin › Publicar pelo WhatsApp: ligar e desligar o recurso e cada parte dele, os limites e os textos das respostas,
// com a prévia da mensagem como a empresa recebe.

/** A vaga de exemplo da prévia. */
const EXEMPLO: RascunhoConvite = {
  titulo: "Atendente de padaria",
  descricao: "",
  categoria: "alimentacao",
  regime: "clt",
  salario: 1800,
  salario_ate: null,
  unidade: "mes",
  beneficios: ["vale_transporte", "vale_refeicao"],
  cidade: "Goiânia",
  bairro: "Setor Bueno",
  quantidade: 2,
  horario_detalhe: {
    escala: "6x1",
    dias: ["seg", "ter", "qua", "qui", "sex", "sab"],
    turnos: [{ inicio: "07:00", fim: "15:20" }],
    obs: "",
  },
  experiencia: "6_meses",
};
const EXEMPLO_2: RascunhoConvite = { ...EXEMPLO, titulo: "Confeiteiro", quantidade: 1, salario: 2200, bairro: "" };

function Ligar({
  marcado,
  mudar,
  titulo,
  ajuda,
  desligado = false,
}: {
  marcado: boolean;
  mudar: (v: boolean) => void;
  titulo: string;
  ajuda: string;
  desligado?: boolean;
}) {
  return (
    <label className={`flex min-h-12 cursor-pointer items-start gap-3 py-2 ${desligado ? "opacity-60" : ""}`}>
      <input
        type="checkbox"
        checked={marcado}
        disabled={desligado}
        onChange={(e) => mudar(e.target.checked)}
        className="mt-0.5 size-5 shrink-0 accent-[var(--pk-ink)]"
      />
      <span className="min-w-0">
        <span className="block text-body text-ink">{titulo}</span>
        <span className="block text-body-sm text-ink-muted">{ajuda}</span>
      </span>
    </label>
  );
}

/** A mensagem como a empresa recebe no WhatsApp (o balão, com o botão embaixo). */
function Balao({ texto, botao }: { texto: string; botao?: string }) {
  return (
    <div className="w-full max-w-sm overflow-hidden rounded-lg border border-line bg-surface-100 text-body-sm shadow-card">
      <p className="px-3 py-2.5 whitespace-pre-line">
        {texto.split(/(\*[^*\n]+\*)/g).map((parte, i) =>
          parte.startsWith("*") && parte.endsWith("*") ? (
            <strong key={i}>{parte.slice(1, -1)}</strong>
          ) : (
            <span key={i}>{parte}</span>
          ),
        )}
      </p>
      {botao && <p className="border-t border-line px-3 py-2 text-center text-label text-terra-text">{botao}</p>}
    </div>
  );
}

export function ConfigVagasPeloWhatsapp({ inicial }: { inicial: ConfigVagasDoAdmin }) {
  const [c, setC] = useState(inicial);
  const [pendente, iniciar] = useTransition();
  const [resposta, setResposta] = useState<{ ok: boolean; texto: string } | null>(null);
  const mudar = <K extends keyof ConfigVagasDoAdmin>(k: K) => (v: ConfigVagasDoAdmin[K]) => {
    setC((atual) => ({ ...atual, [k]: v }));
    setResposta(null);
  };
  const mudarTexto = (k: ChaveTextoVagas, v: string) => {
    setC((atual) => ({ ...atual, textos: { ...atual.textos, [k]: v } }));
    setResposta(null);
  };
  const t = (k: ChaveTextoVagas, marcas?: Record<string, string | number>) => textoDasVagas(c.textos, k, marcas);
  const umaVaga = respostaDasVagas(c.textos, [EXEMPLO]);
  const variasVagas = respostaDasVagas(c.textos, [EXEMPLO, EXEMPLO_2]);

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          const r = await salvarVagasPeloWhatsapp(c);
          setResposta(r.ok ? { ok: true, texto: r.mensagem ?? "Salvo." } : { ok: false, texto: r.erro });
        });
      }}
    >
      <fieldset className="flex flex-col divide-y divide-line">
        <legend className="mb-1 text-label text-ink">O recurso</legend>
        <Ligar
          marcado={c.ligado}
          mudar={mudar("ligado")}
          titulo="Publicar pelo WhatsApp ligado"
          ajuda="Quem manda a foto, o PDF ou o texto de uma vaga para o número do Publike recebe a vaga pronta para conferir e publicar. Desligado, a foto recebe a resposta de antes (publicar pelo site)."
        />
        <Ligar
          marcado={c.fotos}
          mudar={mudar("fotos")}
          desligado={!c.ligado}
          titulo="Ler fotos"
          ajuda="O cartaz, o post, o print. Várias fotos seguidas são lidas juntas (até 4)."
        />
        <Ligar
          marcado={c.pdf}
          mudar={mudar("pdf")}
          desligado={!c.ligado}
          titulo="Ler PDF"
          ajuda="O anúncio ou a descrição da vaga em PDF (até 6 MB)."
        />
        <Ligar
          marcado={c.texto}
          mudar={mudar("texto")}
          desligado={!c.ligado}
          titulo="Ler o texto escrito ou colado"
          ajuda="Só quando o texto parece um anúncio de vaga (o cargo e as condições). Quem procura trabalho continua com o atendimento de sempre."
        />
        <Ligar
          marcado={c.confirmar}
          mudar={mudar("confirmar")}
          desligado={!c.ligado}
          titulo="Avisar quando a vaga entrar no ar"
          ajuda="Uma mensagem com o botão “Ver a vaga”, se a empresa falou com o Publike nas últimas 23 horas."
        />
        <Ligar
          marcado={c.oferecer_avisos}
          mudar={mudar("oferecer_avisos")}
          desligado={!c.ligado || !c.confirmar}
          titulo="Oferecer os candidatos pelo WhatsApp"
          ajuda="Junto do aviso, para quem ainda não recebe: “Sim, quero receber” liga os avisos da conta (é o aceite)."
        />
        <Ligar
          marcado={c.no_site}
          mudar={mudar("no_site")}
          desligado={!c.ligado}
          titulo="Mostrar no site"
          ajuda="O “Prefere pelo WhatsApp?” no começo do publicar e em /empresas, com o número do Publike."
        />
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-label text-ink">Os limites</legend>
        <div className="grid grid-cols-2 items-end gap-4 sm:flex sm:flex-wrap">
          <label className="flex flex-col gap-1.5 sm:w-48">
            <span className="text-body-sm text-ink">Vagas por mensagem</span>
            <input
              type="number"
              inputMode="numeric"
              required
              min={LIMITES_VAGAS_WHATSAPP.por_mensagem.faixa[0]}
              max={LIMITES_VAGAS_WHATSAPP.por_mensagem.faixa[1]}
              value={c.por_mensagem}
              onChange={(e) => mudar("por_mensagem")(e.target.value)}
              className={classesEntrada}
            />
          </label>
          <label className="flex flex-col gap-1.5 sm:w-48">
            <span className="text-body-sm text-ink">Leituras por número por dia</span>
            <input
              type="number"
              inputMode="numeric"
              required
              min={LIMITES_VAGAS_WHATSAPP.leituras_dia.faixa[0]}
              max={LIMITES_VAGAS_WHATSAPP.leituras_dia.faixa[1]}
              value={c.leituras_dia}
              onChange={(e) => mudar("leituras_dia")(e.target.value)}
              className={classesEntrada}
            />
          </label>
        </div>
        <p className="max-w-2xl text-body-sm text-ink-muted">
          A IA lê até 10 vagas de cada anúncio. Com o limite abaixo disso, a resposta prepara as primeiras e pede uma foto
          só da parte que falta. Passou das leituras do dia, a resposta leva ao site. Cada leitura usa a IA de “Ler
          currículo e vaga” (Admin › IA).
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-label text-ink">Os textos das respostas</legend>
        <p className="max-w-2xl text-body-sm text-ink-muted">
          Vazio, vale o texto do Publike (o cinza). Nos botões, até 20 letras.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          {CHAVES_TEXTOS_VAGAS.map((k) => {
            const def = TEXTOS_VAGAS[k];
            const valor = c.textos[k] ?? "";
            const curto = def.max <= 20;
            return (
              <label key={k} className="flex flex-col gap-1.5">
                <span className="text-body-sm text-ink">
                  {def.nome}
                  {def.marcas?.length ? (
                    <span className="text-ink-muted"> · use {def.marcas.join(", ")}</span>
                  ) : null}
                </span>
                {curto ? (
                  <input
                    value={valor}
                    maxLength={def.max}
                    placeholder={def.padrao}
                    onChange={(e) => mudarTexto(k, e.target.value)}
                    className={classesEntrada}
                  />
                ) : (
                  <textarea
                    value={valor}
                    maxLength={def.max}
                    rows={3}
                    placeholder={def.padrao}
                    onChange={(e) => mudarTexto(k, e.target.value)}
                    className={`${classesEntrada} py-2`}
                  />
                )}
                <span className="text-body-sm text-ink-muted">{def.ajuda}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <section className="flex flex-col gap-3" aria-label="Prévia das respostas">
        <p className="text-label text-ink">Como a empresa recebe</p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <p className="text-body-sm text-ink-muted">Uma vaga no anúncio</p>
            <Balao texto={umaVaga.texto} botao={umaVaga.botao} />
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-body-sm text-ink-muted">Várias vagas no anúncio</p>
            <Balao texto={variasVagas.texto} botao={variasVagas.botao} />
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-body-sm text-ink-muted">Depois de publicar</p>
            <Balao texto={t("no_ar", { titulo: EXEMPLO.titulo })} botao="Ver a vaga" />
            {c.oferecer_avisos && <Balao texto={t("oferta")} botao="Sim, quero receber · Agora não" />}
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-body-sm text-ink-muted">Quando não é vaga</p>
            <Balao texto={t("nao_e_vaga")} />
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pendente} className={classesBotao("primario")}>
          {pendente ? "Salvando…" : "Salvar"}
        </button>
        {resposta && (
          <p role="status" className={`text-body-sm ${resposta.ok ? "text-ink" : "text-danger"}`}>
            {resposta.texto}
          </p>
        )}
      </div>
    </form>
  );
}
