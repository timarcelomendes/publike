"use client";

import { Rocket, Search } from "lucide-react";
import { useState, useTransition } from "react";
import {
  impulsionarPeloAdmin,
  pararImpulsoPeloAdmin,
  salvarImpulsoAdmin,
  testarGoogleAds,
  vagasParaImpulso,
  type ConfigImpulso,
  type PrecoImpulso,
  type VagaParaImpulso,
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

/**
 * Impulsionar a vaga de um cliente sem cobrar, para medir o retorno: procura a vaga (as paradas primeiro), escolhe os
 * dias e quanto vai para o Google. O robô cria o anúncio como num impulso pago.
 */
export function ImpulsionarPeloAdmin({ verbaPadrao }: { verbaPadrao: number }) {
  const [busca, setBusca] = useState("");
  const [vagas, setVagas] = useState<VagaParaImpulso[] | null>(null);
  const [erroBusca, setErroBusca] = useState<string | null>(null);
  const [procurando, iniciar] = useTransition();
  const [escolhida, setEscolhida] = useState<VagaParaImpulso | null>(null);
  const [dias, setDias] = useState(7);
  const [verba, setVerba] = useState(verbaPadrao);
  const [avisar, setAvisar] = useState(true);
  const { rodar, pendente, mensagem } = useAcao();

  function procurar() {
    setErroBusca(null);
    iniciar(async () => {
      const r = await vagasParaImpulso(busca);
      if (r.ok) setVagas(r.vagas);
      else setErroBusca(r.erro);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <form
        role="search"
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          procurar();
        }}
      >
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-label">Vaga ou cliente</span>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Auxiliar de cozinha, Mais RH…"
            maxLength={80}
            className={`${classesEntrada} w-full max-w-md`}
          />
        </label>
        <Botao type="submit" tamanho="sm" disabled={procurando}>
          <Search aria-hidden className="size-4" />
          {procurando ? "Procurando…" : busca.trim() ? "Procurar" : "Ver as vagas paradas"}
        </Botao>
      </form>
      {erroBusca && <p className="text-body-sm text-danger">{erroBusca}</p>}

      {vagas && vagas.length === 0 && (
        <p className="text-body-sm text-ink-muted">Nenhuma vaga no ar com esse nome. Tente parte do título ou o nome do cliente.</p>
      )}
      {vagas && vagas.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Escolha a vaga</legend>
          <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto rounded-md border border-line p-1">
            {vagas.map((v) => (
              <li key={v.id}>
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-md px-3 py-2 hover:bg-surface-300 ${
                    v.impulsionada ? "cursor-not-allowed opacity-60" : ""
                  } ${escolhida?.id === v.id ? "bg-surface-300" : ""}`}
                >
                  <input
                    type="radio"
                    name="vaga"
                    className="mt-1 size-4"
                    disabled={v.impulsionada}
                    checked={escolhida?.id === v.id}
                    onChange={() => setEscolhida(v)}
                  />
                  <span className="min-w-0">
                    <span className="text-label">{v.titulo}</span>
                    <span className="block text-body-sm text-ink-muted">
                      {v.conta}, {v.bairro}, {v.cidade}. {v.curtidas} {v.curtidas === 1 ? "curtida" : "curtidas"}
                      {v.parada ? ", parada há 5 dias ou mais" : ""}
                      {v.impulsionada ? ". Já está sendo impulsionada" : ""}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}

      {escolhida && (
        <form
          className="flex flex-col gap-4 rounded-md border border-line p-4"
          onSubmit={(e) => {
            e.preventDefault();
            rodar(
              () => impulsionarPeloAdmin({ anuncio: escolhida.id, dias, verba, avisar }),
              (r) => {
                if (r.ok) {
                  setEscolhida(null);
                  setVagas(null);
                }
              },
            );
          }}
        >
          <p className="text-body">
            Impulsionar <span className="text-label">“{escolhida.titulo}”</span>, de {escolhida.conta}, sem cobrar.
          </p>
          <div className="flex flex-wrap gap-4">
            <Inteiro rotulo="Dias" valor={dias} mudar={setDias} max={30} />
            <Reais rotulo="Vai para o Google (total)" valor={verba} mudar={setVerba} />
          </div>
          <p className="text-body-sm text-ink-muted">
            Cerca de R$ {(verba / Math.max(dias, 1)).toFixed(2).replace(".", ",")} por dia, do cartão da conta do Google
            Ads. Os dias contam quando o Google aprovar.
          </p>
          <label className="flex items-start gap-2 text-body">
            <input type="checkbox" checked={avisar} onChange={(e) => setAvisar(e.target.checked)} className="mt-1 size-4" />
            <span>
              Avisar o cliente
              <span className="block text-body-sm text-ink-muted">
                Ele recebe no sino e acompanha os números na vaga. Desligado, ele só fica sabendo quando o anúncio entrar
                no ar.
              </span>
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Botao type="submit" variante="primario" tamanho="sm" disabled={pendente}>
              <Rocket aria-hidden className="size-4" />
              {pendente ? "Impulsionando…" : `Impulsionar ${dias} ${dias === 1 ? "dia" : "dias"} grátis`}
            </Botao>
            <Botao tamanho="sm" onClick={() => setEscolhida(null)}>
              Escolher outra
            </Botao>
          </div>
        </form>
      )}
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
