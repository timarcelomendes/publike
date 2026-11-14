"use client";

import { useState } from "react";
import { salvarPacoteAdmin, type ConfigPacote, type PacoteAVenda } from "@/lib/acoes/admin-impulsos";
import { formatarMoeda } from "@/lib/formato";
import { Botao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";
import { useAcao } from "../ui/usar-acao";
import { Inteiro, Reais } from "./impulsos";

// Admin › Impulsos › Regras › Pacote de candidatos (claude/plano-nova-venda-do-impulso.md; migração 20270519120000):
// os pacotes à venda e o preço, os dias no destaque, a verba que cada pacote soma à campanha geral e a base, o máximo,
// a conta e a campanha do robô que acerta o orçamento dela. A venda nasce desligada (14/11/2026: "Venda desligada,
// piloto antes"); o robô liga e desliga na chave do alto da página (impulsos-chave-da-geral.tsx).

const reais = (v: number) => formatarMoeda(Math.round(v * 100) / 100);

export function ConfigDoPacote({ pacotes, config }: { pacotes: PacoteAVenda[]; config: ConfigPacote }) {
  const [p, setP] = useState(pacotes);
  const [c, setC] = useState(config);
  const { rodar, pendente, mensagem } = useAcao();
  const mudarPacote = (candidatos: number, campo: Partial<PacoteAVenda>) =>
    setP((lista) => lista.map((x) => (x.candidatos === candidatos ? { ...x, ...campo } : x)));

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        rodar(() => salvarPacoteAdmin(p, c));
      }}
    >
      <fieldset className="flex flex-col gap-4">
        <legend className="text-label">À venda</legend>
        <label className="flex items-start gap-2 text-body">
          <input
            type="checkbox"
            checked={c.pacote_ligado}
            onChange={(e) => setC({ ...c, pacote_ligado: e.target.checked })}
            className="mt-1 size-4"
          />
          <span>
            Vender o pacote de candidatos na página da vaga
            <span className="block text-body-sm text-ink-muted">
              Desligado, a página mostra “O impulso chega em breve” (e o saldo de quem já tem). No piloto, dê pacotes de
              presente em Novo impulso.
            </span>
          </span>
        </label>
        {p.map((x) => (
          <div key={x.candidatos} className="flex flex-wrap items-end gap-4 rounded-md border border-line p-4">
            <label className="flex min-w-36 items-center gap-2 self-center text-body">
              <input
                type="checkbox"
                checked={x.ligado}
                onChange={(e) => mudarPacote(x.candidatos, { ligado: e.target.checked })}
                className="size-4"
              />
              {x.candidatos} candidatos
            </label>
            <Reais rotulo="Preço" valor={x.valor} mudar={(v) => mudarPacote(x.candidatos, { valor: v })} min={5} />
            <p className="self-center text-body-sm text-ink-muted">
              {x.valor > 0 ? `${reais(x.valor / x.candidatos)} por candidato` : ""}
            </p>
          </div>
        ))}
        <p className="text-body-sm text-ink-muted">
          Os preços saem do piloto: quanto custou cada curtida ao Publike, mais a margem. Só conta quem curtir a vaga
          depois de chegar pelo destaque; o que não chegar vira saldo do cliente, por 90 dias.
        </p>
        <div className="flex flex-wrap gap-4">
          <Inteiro
            rotulo="Dias no destaque, no máximo"
            valor={c.pacote_dias}
            mudar={(v) => setC({ ...c, pacote_dias: v })}
            max={60}
          />
          <Reais
            rotulo="Cada pacote soma à campanha geral (por dia)"
            valor={c.pacote_verba_dia}
            mudar={(v) => setC({ ...c, pacote_verba_dia: v })}
            min={0}
            passo="0.5"
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="text-label">Campanha geral (a mãe)</legend>
        <p className="max-w-3xl text-body-sm text-ink-muted">
          Com a chave “Campanha geral no automático” ligada, no alto desta página, o robô deixa o orçamento dela na base
          mais a verba de cada pacote no ar, até o máximo: de manhã e quando entra um pacote novo. Ligada, mude o orçamento
          por aqui, não no Google Ads (o robô volta para este valor na manhã seguinte).
        </p>
        <div className="flex flex-wrap gap-4">
          <Reais rotulo="Base por dia" valor={c.geral_base} mudar={(v) => setC({ ...c, geral_base: v })} />
          <Reais rotulo="Máximo por dia" valor={c.geral_maximo} mudar={(v) => setC({ ...c, geral_maximo: v })} />
          <label className="flex flex-col gap-1">
            <span className="text-body-sm text-ink-muted">Conta do Google Ads</span>
            <input
              value={c.geral_conta ?? ""}
              onChange={(e) => setC({ ...c, geral_conta: e.target.value })}
              inputMode="numeric"
              maxLength={12}
              placeholder="948-395-5066"
              className={`${classesEntrada} w-36`}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-body-sm text-ink-muted">Número da campanha</span>
            <input
              value={c.geral_campanha_id ?? ""}
              onChange={(e) => setC({ ...c, geral_campanha_id: e.target.value })}
              inputMode="numeric"
              maxLength={20}
              className={`${classesEntrada} w-40`}
            />
          </label>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Botao type="submit" variante="primario" disabled={pendente}>
          {pendente ? "Salvando…" : "Salvar o pacote"}
        </Botao>
        {mensagem}
      </div>
    </form>
  );
}
