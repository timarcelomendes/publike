"use client";

import { Ban, BadgeCheck, Building2, Check, Link2, Merge, Pencil, Search, Sparkles, X } from "lucide-react";
import { useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import {
  buscarEmpresasParaJuntar,
  dispensarContaDaEmpresa,
  juntarEmpresas,
  juntarVariasEmpresas,
  marcarGrupoDiferente,
  ligarEmpresaAoPerfil,
  marcarEmpresasDiferentes,
  mudarTipoDaEmpresa,
  renomearEmpresa,
  sugerirRepetidasComIA,
  type SugestaoDaIA,
} from "@/lib/acoes/admin-empresas";
import type { ContaParaLigar, EmpresaDoAdmin, EmpresasRepetidas } from "@/lib/admin/dados";
import { plural } from "@/lib/formato";
import type { Resultado } from "@/lib/tipos";
import { Avatar, Aviso } from "../ui/basicos";
import { Botao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";

// As peças de Admin › Empresas que mudam o cadastro (src/lib/acoes/admin-empresas.ts).

function useAcao() {
  const [enviando, iniciar] = useTransition();
  const [r, setR] = useState<Resultado | null>(null);
  const rodar = (acao: () => Promise<Resultado>) =>
    iniciar(async () => {
      setR(await chamarAcao(acao));
    });
  const aviso =
    r && (r.ok ? r.mensagem && <Aviso tipo="sucesso">{r.mensagem}</Aviso> : <Aviso tipo="erro">{r.erro}</Aviso>);
  return { enviando, rodar, aviso };
}

/** Um par de nomes parecidos: juntar num ou noutro, ou dizer que são diferentes. */
export function ParRepetido({ par }: { par: EmpresasRepetidas[number] }) {
  const { enviando, rodar, aviso } = useAcao();
  const nome = (e: EmpresasRepetidas[number]["a"]) =>
    `${e.nome} (${plural(e.pessoas, "currículo", "currículos")}${e.com_conta ? ", com conta" : ""})`;
  // a que tem conta (ou a mais citada) fica
  const fica = par.a.com_conta || (!par.b.com_conta && par.a.pessoas >= par.b.pessoas) ? par.a : par.b;
  const sai = fica === par.a ? par.b : par.a;
  return (
    <li className="flex flex-col gap-2 border-t border-line pt-3 first:border-t-0 first:pt-0">
      <p className="text-body-sm">
        <span className="text-label">{nome(par.a)}</span> e <span className="text-label">{nome(par.b)}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        <Botao tamanho="sm" disabled={enviando} onClick={() => rodar(() => juntarEmpresas(sai.id, fica.id))}>
          <Merge aria-hidden />
          Juntar em “{fica.nome}”
        </Botao>
        <Botao
          tamanho="sm"
          variante="fantasma"
          disabled={enviando}
          onClick={() => rodar(() => juntarEmpresas(fica.id, sai.id))}
        >
          Juntar em “{sai.nome}”
        </Botao>
        <Botao
          tamanho="sm"
          variante="fantasma"
          disabled={enviando}
          onClick={() => rodar(() => marcarEmpresasDiferentes(par.a.id, par.b.id))}
        >
          <X aria-hidden />
          São diferentes
        </Botao>
      </div>
      {aviso}
    </li>
  );
}

/** O que dá para mudar numa empresa: o nome, juntar com outra, "não é empresa" e a conta no Publike. */
export function AcoesDaEmpresa({ e }: { e: EmpresaDoAdmin }) {
  const { enviando, rodar, aviso } = useAcao();
  const [nome, setNome] = useState(e.nome);
  const [busca, setBusca] = useState("");
  const [achadas, setAchadas] = useState<Awaited<ReturnType<typeof buscarEmpresasParaJuntar>> | null>(null);
  const [conta, setConta] = useState("");
  const [buscando, iniciarBusca] = useTransition();
  const ehEmpresa = e.tipo === "empresa";

  return (
    <div className="flex flex-col gap-4 pt-3">
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(ev) => {
          ev.preventDefault();
          rodar(() => renomearEmpresa(e.id, nome));
        }}
      >
        <label className="flex flex-1 flex-col gap-1.5 text-body-sm">
          <span className="text-label">Nome que aparece</span>
          <input value={nome} onChange={(ev) => setNome(ev.target.value)} maxLength={80} className={classesEntrada} />
        </label>
        <Botao type="submit" tamanho="sm" disabled={enviando || nome.trim() === e.nome}>
          <Pencil aria-hidden />
          Salvar nome
        </Botao>
      </form>

      {ehEmpresa && (
        <div className="flex flex-col gap-2">
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(ev) => {
              ev.preventDefault();
              iniciarBusca(async () => setAchadas(await chamarAcao(() => buscarEmpresasParaJuntar(busca, e.id))));
            }}
          >
            <label className="flex flex-1 flex-col gap-1.5 text-body-sm">
              <span className="text-label">Juntar com outra empresa</span>
              <input
                value={busca}
                onChange={(ev) => setBusca(ev.target.value)}
                placeholder="O nome da outra"
                className={classesEntrada}
              />
            </label>
            <Botao type="submit" tamanho="sm" disabled={buscando || busca.trim().length < 2}>
              <Search aria-hidden />
              {buscando ? "Procurando…" : "Procurar"}
            </Botao>
          </form>
          {achadas && !achadas.ok && <Aviso tipo="erro">{achadas.erro}</Aviso>}
          {achadas?.ok && !achadas.itens.length && (
            <p className="text-body-sm text-ink-muted">Nenhuma com esse nome.</p>
          )}
          {achadas?.ok && achadas.itens.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {achadas.itens.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 text-body-sm">
                  <span>
                    {o.nome}{" "}
                    <span className="text-ink-muted">
                      ({plural(o.pessoas, "currículo", "currículos")}
                      {o.perfil ? ", com conta" : ""})
                    </span>
                  </span>
                  <Botao tamanho="sm" disabled={enviando} onClick={() => rodar(() => juntarEmpresas(e.id, o.id))}>
                    <Merge aria-hidden />
                    Juntar nesta
                  </Botao>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {ehEmpresa && (
        <div className="flex flex-col gap-2">
          <span className="text-label">Conta no Publike</span>
          {e.perfil ? (
            <div className="flex flex-wrap items-center gap-2 text-body-sm">
              <span>Ligada a “{e.perfil.nome}”.</span>
              <Botao
                tamanho="sm"
                variante="fantasma"
                disabled={enviando}
                onClick={() => rodar(() => ligarEmpresaAoPerfil(e.id, ""))}
              >
                <X aria-hidden />
                Tirar a conta
              </Botao>
            </div>
          ) : (
            <>
              {(e.contas_parecidas ?? []).map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-body-sm">
                  <span>
                    {p.nome} <span className="text-ink-muted">({p.cidade})</span>
                  </span>
                  <Botao tamanho="sm" disabled={enviando} onClick={() => rodar(() => ligarEmpresaAoPerfil(e.id, p.id))}>
                    <Link2 aria-hidden />
                    Ligar a esta conta
                  </Botao>
                </div>
              ))}
              <form
                className="flex flex-col gap-2 sm:flex-row sm:items-end"
                onSubmit={(ev) => {
                  ev.preventDefault();
                  rodar(() => ligarEmpresaAoPerfil(e.id, conta));
                }}
              >
                <label className="flex flex-1 flex-col gap-1.5 text-body-sm">
                  <span className="text-ink-muted">Ou cole o link do perfil da empresa</span>
                  <input
                    value={conta}
                    onChange={(ev) => setConta(ev.target.value)}
                    placeholder="publike.org/perfil/…"
                    className={classesEntrada}
                  />
                </label>
                <Botao type="submit" tamanho="sm" disabled={enviando || !conta.trim()}>
                  <Building2 aria-hidden />
                  Ligar
                </Botao>
              </form>
            </>
          )}
        </div>
      )}

      <div>
        <Botao
          tamanho="sm"
          variante="fantasma"
          disabled={enviando}
          onClick={() => rodar(() => mudarTipoDaEmpresa(e.id, ehEmpresa ? "nao_empresa" : "empresa"))}
        >
          {ehEmpresa ? <Ban aria-hidden /> : <Check aria-hidden />}
          {ehEmpresa ? "Não é empresa" : "É empresa"}
        </Botao>
        {ehEmpresa && (
          <p className="mt-1 text-body-sm text-ink-muted">
            Casa de família, autônomo, informal: não junta ninguém e não aparece nas sugestões.
          </p>
        )}
      </div>
      {aviso}
    </div>
  );
}

/** Uma conta nova de empresa com o mesmo nome de uma empresa dos currículos: ligar ou dizer que não é a mesma. */
export function ContaParaLigarItem({ item }: { item: ContaParaLigar }) {
  const { enviando, rodar, aviso } = useAcao();
  const { perfil, empresa } = item;
  return (
    <li className="flex flex-col gap-2 border-t border-line pt-3 first:border-t-0 first:pt-0">
      <div className="flex items-start gap-3">
        <Avatar nome={perfil.nome} foto={perfil.foto} tamanho={32} forma="quadrada" />
        <p className="text-body-sm">
          <a href={`/admin/usuarios/${perfil.id}`} className="text-label underline-offset-2 hover:underline">
            {perfil.nome}
          </a>
          {perfil.verificado && <BadgeCheck aria-label="verificada" className="ml-1 inline size-4 text-cerrado-text" />}
          <span className="text-ink-muted"> ({perfil.cidade})</span> pode ser{" "}
          <span className="text-label">{empresa.nome}</span>, que está em{" "}
          {plural(empresa.pessoas, "currículo", "currículos")}.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Botao
          tamanho="sm"
          disabled={enviando}
          onClick={() => rodar(() => ligarEmpresaAoPerfil(empresa.id, perfil.id))}
        >
          <Link2 aria-hidden />
          Ligar a esta conta
        </Botao>
        <Botao
          tamanho="sm"
          variante="fantasma"
          disabled={enviando}
          onClick={() => rodar(() => dispensarContaDaEmpresa(perfil.id, empresa.id))}
        >
          <X aria-hidden />
          Não é a mesma
        </Botao>
      </div>
      {aviso}
    </li>
  );
}

function GrupoDaIA({ g }: { g: SugestaoDaIA }) {
  const { enviando, rodar, aviso } = useAcao();
  const [feito, setFeito] = useState(false);
  // a que tem conta (ou a mais citada) fica
  const fica = [...g.empresas].sort((a, b) => Number(b.com_conta) - Number(a.com_conta) || b.pessoas - a.pessoas)[0];
  if (feito) return null;
  return (
    <li className="flex flex-col gap-2 border-t border-line pt-3 first:border-t-0 first:pt-0">
      <p className="text-body-sm">
        {g.empresas.map((e, i) => (
          <span key={e.id}>
            {i > 0 && (i === g.empresas.length - 1 ? " e " : ", ")}
            <span className="text-label">{e.nome}</span>{" "}
            <span className="text-ink-muted">
              ({plural(e.pessoas, "currículo", "currículos")}
              {e.com_conta ? ", com conta" : ""})
            </span>
          </span>
        ))}
      </p>
      {g.motivo && <p className="text-body-sm text-ink-muted">{g.motivo}</p>}
      <div className="flex flex-wrap gap-2">
        <Botao
          tamanho="sm"
          disabled={enviando}
          onClick={() =>
            rodar(() =>
              juntarVariasEmpresas(
                fica.id,
                g.empresas.filter((e) => e.id !== fica.id).map((e) => e.id),
              ),
            )
          }
        >
          <Merge aria-hidden />
          Juntar em “{fica.nome}”
        </Botao>
        <Botao
          tamanho="sm"
          variante="fantasma"
          disabled={enviando}
          onClick={() =>
            rodar(async () => {
              const r = await marcarGrupoDiferente(g.ids);
              if (r.ok) setFeito(true);
              return r;
            })
          }
        >
          <X aria-hidden />
          Não são a mesma
        </Botao>
      </div>
      {aviso}
    </li>
  );
}

/** "Pedir à IA": a IA olha as empresas mais citadas e sugere as repetidas. Só sugere; quem junta é o admin. */
export function RepetidasDaIA() {
  const [pedindo, iniciar] = useTransition();
  const [r, setR] = useState<Awaited<ReturnType<typeof sugerirRepetidasComIA>> | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Botao
          tamanho="sm"
          disabled={pedindo}
          onClick={() => iniciar(async () => setR(await chamarAcao(() => sugerirRepetidasComIA())))}
        >
          <Sparkles aria-hidden />
          {pedindo ? "A IA está olhando…" : r ? "Pedir de novo à IA" : "Pedir à IA para achar mais"}
        </Botao>
        <span className="text-body-sm text-ink-muted">Ela vê só os nomes das 200 empresas mais citadas.</span>
      </div>
      {r && !r.ok && <Aviso tipo="erro">{r.erro}</Aviso>}
      {r?.ok && !r.grupos.length && <p className="text-body-sm text-ink-muted">A IA não achou repetidas.</p>}
      {r?.ok && r.grupos.length > 0 && (
        <ul className="flex flex-col gap-3">
          {r.grupos.map((g) => (
            <GrupoDaIA key={g.ids.join("-")} g={g} />
          ))}
        </ul>
      )}
    </div>
  );
}
