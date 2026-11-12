"use client";

import { useState } from "react";
import {
  salvarImpulsoAdmin,
  testarGoogleAds,
  type ConfigImpulso,
  type PrecoImpulso,
} from "@/lib/acoes/admin-impulsos";
import { Botao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";
import { useAcao } from "../ui/usar-acao";

// Admin › Impulsos: os preços, o impulso grátis e o raio (a página: app/admin/impulsos).

function Reais({
  rotulo,
  valor,
  mudar,
  min = 1,
}: {
  rotulo: string;
  valor: number;
  mudar: (v: number) => void;
  min?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-body-sm text-ink-muted">{rotulo}</span>
      <span className="flex items-center gap-1.5">
        <span className="text-body-sm text-ink-muted">R$</span>
        <input
          type="number"
          inputMode="decimal"
          min={min}
          step="1"
          value={Number.isFinite(valor) ? valor : ""}
          onChange={(e) => mudar(Number(e.target.value))}
          className={`${classesEntrada} w-24`}
        />
      </span>
    </label>
  );
}

function Inteiro({ rotulo, valor, mudar, max }: { rotulo: string; valor: number; mudar: (v: number) => void; max: number }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-body-sm text-ink-muted">{rotulo}</span>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        step="1"
        value={Number.isFinite(valor) ? valor : ""}
        onChange={(e) => mudar(Number(e.target.value))}
        className={`${classesEntrada} w-24`}
      />
    </label>
  );
}

export function ConfigImpulsos({ precos, config }: { precos: PrecoImpulso[]; config: ConfigImpulso }) {
  const [p, setP] = useState(precos);
  const [c, setC] = useState(config);
  const { rodar, pendente, mensagem } = useAcao();
  const mudarPreco = (dias: number, campo: Partial<PrecoImpulso>) =>
    setP((lista) => lista.map((x) => (x.dias === dias ? { ...x, ...campo } : x)));

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        rodar(() => salvarImpulsoAdmin(p, c));
      }}
    >
      <fieldset className="flex flex-col gap-4">
        <legend className="text-label">À venda</legend>
        {p.map((x) => (
          <div key={x.dias} className="flex flex-wrap items-end gap-4 rounded-md border border-line p-4">
            <label className="flex min-w-36 items-center gap-2 self-center text-body">
              <input
                type="checkbox"
                checked={x.ligado}
                onChange={(e) => mudarPreco(x.dias, { ligado: e.target.checked })}
                className="size-4"
              />
              {x.dias} dias
            </label>
            <Reais rotulo="Preço" valor={x.valor} mudar={(v) => mudarPreco(x.dias, { valor: v })} min={5} />
            <Reais rotulo="Vai para o Google" valor={x.verba} mudar={(v) => mudarPreco(x.dias, { verba: v })} />
            <p className="self-center text-body-sm text-ink-muted">
              Fica com o Publike: R$ {Math.max(0, (x.valor || 0) - (x.verba || 0)).toFixed(0)}
            </p>
          </div>
        ))}
        <p className="text-body-sm text-ink-muted">
          Desligado, o impulso some da vaga. O que vai para o Google é o teto: se gastar menos, a sobra fica com o
          Publike.
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="text-label">Impulso grátis (um por conta)</legend>
        <label className="flex items-start gap-2 text-body">
          <input
            type="checkbox"
            checked={c.cortesia_ligada}
            onChange={(e) => setC({ ...c, cortesia_ligada: e.target.checked })}
            className="mt-1 size-4"
          />
          <span>
            Oferecer um impulso grátis
            <span className="block text-body-sm text-ink-muted">
              Para a primeira vaga que ficar parada (sem curtidas em 5 dias). Quem testou e gostou volta pagando.
            </span>
          </span>
        </label>
        <div className="flex flex-wrap gap-4">
          <Inteiro rotulo="Dias" valor={c.cortesia_dias} mudar={(v) => setC({ ...c, cortesia_dias: v })} max={15} />
          <Reais rotulo="Vai para o Google" valor={c.cortesia_verba} mudar={(v) => setC({ ...c, cortesia_verba: v })} />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="text-label">Até onde o anúncio aparece</legend>
        <div className="flex flex-wrap gap-4">
          <Inteiro rotulo="Raio na capital (km)" valor={c.raio_capital} mudar={(v) => setC({ ...c, raio_capital: v })} max={65} />
          <Inteiro rotulo="Raio nas outras cidades (km)" valor={c.raio_outras} mudar={(v) => setC({ ...c, raio_outras: v })} max={65} />
        </div>
        <p className="text-body-sm text-ink-muted">
          Em volta do bairro da vaga. Só por lugar e pela busca: idade, sexo e outros recortes de pessoa ficam de fora
          (CLT, art. 373-A).
        </p>
      </fieldset>

      <Botao type="submit" tamanho="sm" disabled={pendente} className="self-start">
        Salvar
      </Botao>
      {mensagem}
    </form>
  );
}

export function TestarGoogleAds() {
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <div className="flex flex-col gap-2">
      <Botao tamanho="sm" variante="secundario" disabled={pendente} className="self-start" onClick={() => rodar(testarGoogleAds)}>
        {pendente ? "Testando…" : "Testar a ligação"}
      </Botao>
      {mensagem}
    </div>
  );
}
