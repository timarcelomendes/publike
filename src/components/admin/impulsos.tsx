"use client";

import { useState } from "react";
import {
  pararCampanhaDoCliente,
  pararImpulsoPeloAdmin,
  salvarImpulsoAdmin,
  testarGoogleAds,
  type ConfigImpulso,
  type PrecoImpulso,
} from "@/lib/acoes/admin-impulsos";
import { Botao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";
import { useAcao } from "../ui/usar-acao";

// Admin › Impulsos: os preços, o impulso grátis, o automático e o raio, o teste da ligação e os botões de parar (a
// página: app/admin/impulsos; o impulso novo, os tipos e o histórico ficam em impulsos-*.tsx).

export function Reais({
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

export function Inteiro({ rotulo, valor, mudar, max }: { rotulo: string; valor: number; mudar: (v: number) => void; max: number }) {
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
        <legend className="text-label">Impulso automático do Publike</legend>
        <label className="flex items-start gap-2 text-body">
          <input
            type="checkbox"
            checked={c.auto_ligado}
            onChange={(e) => setC({ ...c, auto_ligado: e.target.checked })}
            className="mt-1 size-4"
          />
          <span>
            Impulsionar sozinho as vagas paradas, com a verba do Publike
            <span className="block text-body-sm text-ink-muted">
              Vaga de empresa, comércio ou agência no ar há 5 dias ou mais, sem curtida nos últimos 5: é onde falta
              gente. Primeiro as que mostram o salário. Cada vaga ganha um só, e o cliente recebe o relatório no fim.
            </span>
          </span>
        </label>
        <div className="flex flex-wrap gap-4">
          <Reais
            rotulo="Teto no mês"
            valor={c.auto_verba_mes}
            mudar={(v) => setC({ ...c, auto_verba_mes: v })}
            min={0}
          />
          <Reais rotulo="Por vaga" valor={c.auto_verba} mudar={(v) => setC({ ...c, auto_verba: v })} />
          <Inteiro rotulo="Dias" valor={c.auto_dias} mudar={(v) => setC({ ...c, auto_dias: v })} max={15} />
          <Inteiro
            rotulo="Ao mesmo tempo"
            valor={c.auto_simultaneos}
            mudar={(v) => setC({ ...c, auto_simultaneos: v })}
            max={50}
          />
        </div>
        <p className="text-body-sm text-ink-muted">
          Até {Math.max(0, Math.floor((c.auto_verba_mes || 0) / Math.max(c.auto_verba || 1, 1)))} vagas por mês, cerca
          de R$ {((c.auto_verba || 0) / Math.max(c.auto_dias || 1, 1)).toFixed(2).replace(".", ",")} por dia em cada uma.
        </p>
        <label className="flex items-start gap-2 text-body">
          <input
            type="checkbox"
            checked={c.auto_avisar}
            onChange={(e) => setC({ ...c, auto_avisar: e.target.checked })}
            className="mt-1 size-4"
          />
          <span>Avisar o cliente quando começar</span>
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="text-label">Até onde o anúncio aparece</legend>
        <div className="flex flex-wrap gap-4">
          <Inteiro rotulo="Raio na capital (km)" valor={c.raio_capital} mudar={(v) => setC({ ...c, raio_capital: v })} max={65} />
          <Inteiro rotulo="Raio nas outras cidades (km)" valor={c.raio_outras} mudar={(v) => setC({ ...c, raio_outras: v })} max={65} />
        </div>
        <p className="text-body-sm text-ink-muted">
          Em volta do bairro da vaga. Vale também para os impulsos que já estão no ar: o Google recebe o raio novo
          logo depois de salvar. Só por lugar e pela busca: idade, sexo e outros recortes de pessoa ficam de fora (CLT,
          art. 373-A).
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

/** Para um impulso pela tabela do admin (com a confirmação no próprio lugar). */
export function PararImpulso({ id, noAr }: { id: string; noAr: boolean }) {
  const [certeza, setCerteza] = useState(false);
  const { rodar, pendente, mensagem } = useAcao();
  if (!certeza)
    return (
      <Botao tamanho="sm" onClick={() => setCerteza(true)}>
        Parar
      </Botao>
    );
  return (
    <span className="flex flex-col items-start gap-1">
      <span className="text-body-sm">{noAr ? "Tirar do Google agora?" : "Cancelar antes de entrar no ar?"}</span>
      <span className="flex gap-1">
        <Botao tamanho="sm" variante="primario" disabled={pendente} onClick={() => rodar(() => pararImpulsoPeloAdmin(id))}>
          Parar
        </Botao>
        <Botao tamanho="sm" onClick={() => setCerteza(false)}>
          Não
        </Botao>
      </span>
      {mensagem}
    </span>
  );
}

/** Para a campanha do cliente inteira (com a confirmação no próprio lugar). */
export function PararCampanha({ id, vagas }: { id: string; vagas: number }) {
  const [certeza, setCerteza] = useState(false);
  const { rodar, pendente, mensagem } = useAcao();
  if (!certeza)
    return (
      <Botao tamanho="sm" onClick={() => setCerteza(true)}>
        Parar tudo
      </Botao>
    );
  return (
    <span className="flex flex-col items-start gap-1">
      <span className="text-body-sm">
        Parar {vagas === 1 ? "a vaga" : `as ${vagas} vagas`} deste cliente? As que estão no ar saem do Google.
      </span>
      <span className="flex gap-1">
        <Botao tamanho="sm" variante="primario" disabled={pendente} onClick={() => rodar(() => pararCampanhaDoCliente(id))}>
          Parar tudo
        </Botao>
        <Botao tamanho="sm" onClick={() => setCerteza(false)}>
          Não
        </Botao>
      </span>
      {mensagem}
    </span>
  );
}
