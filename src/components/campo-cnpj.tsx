"use client";

import { BadgeCheck, Building2, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { buscarDadosCnpj } from "@/lib/acoes/cnpj";
import { cnpjValido, formatarCnpj, limparCnpj, nomeDaReceita, type ConsultaCnpj, type DadosCnpj } from "@/lib/cnpj";
import { Aviso } from "./ui/basicos";
import { Campo, classesEntrada, ligarCampo } from "./ui/campo";

function formatarData(iso: string | null) {
  if (!iso) return null;
  const [a, m, d] = iso.split("-");
  return a && m && d ? `${d}/${m}/${a}` : null;
}

/**
 * CNPJ do perfil (agência, comércio ou empresa). Com o número completo, busca
 * os dados públicos na Receita (pela BrasilAPI) e oferece preencher o perfil.
 */
export function CampoCnpj({
  valor,
  aoMudar,
  erro,
  agencia,
  aoAchar,
  aoUsar,
}: {
  valor: string;
  aoMudar: (valor: string) => void;
  erro?: string;
  agencia: boolean;
  /** dados achados (preenche só o que ainda está vazio) */
  aoAchar: (dados: DadosCnpj) => void;
  /** a pessoa pediu para usar o nome e o endereço da Receita */
  aoUsar: (dados: DadosCnpj) => void;
}) {
  const [consulta, setConsulta] = useState<{ cnpj: string; resultado: ConsultaCnpj } | null>(null);
  const [buscando, iniciar] = useTransition();
  const ultimo = useRef<string | null>(null);
  const avisos = useRef({ aoAchar });
  const limpo = limparCnpj(valor);
  const completo = limpo.length === 14 && cnpjValido(limpo);

  useEffect(() => {
    avisos.current = { aoAchar };
  });

  useEffect(() => {
    if (!completo || ultimo.current === limpo) return;
    const espera = setTimeout(() => {
      ultimo.current = limpo;
      iniciar(async () => {
        const r = await buscarDadosCnpj(limpo);
        setConsulta({ cnpj: limpo, resultado: r });
        if (r.ok && r.dados.ativa) avisos.current.aoAchar(r.dados);
      });
    }, 350);
    return () => clearTimeout(espera);
  }, [completo, limpo]);

  const atual = completo && consulta?.cnpj === limpo ? consulta.resultado : null;
  const dados = atual?.ok ? atual.dados : null;

  return (
    <div className="flex flex-col gap-3 rounded-md bg-surface-300 p-4">
      <Campo
        rotulo={agencia ? "CNPJ da agência" : "CNPJ"}
        nome="cnpj"
        opcional={!agencia}
        erro={erro}
        ajuda={
          agencia
            ? "Aparece no seu perfil e nas suas vagas, para quem procura trabalho conferir na Receita. Vale o CNPJ com letras."
            : "Com ele, buscamos na Receita o nome e o bairro da empresa. O número aparece no seu perfil e passa mais confiança."
        }
      >
        <div className="relative">
          <input
            {...ligarCampo("cnpj", erro, true)}
            value={valor}
            onChange={(e) => aoMudar(formatarCnpj(e.target.value))}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={18}
            placeholder="00.000.000/0000-00"
            className={`${classesEntrada} pr-10 font-mono tracking-wide`}
          />
          {buscando && (
            <LoaderCircle
              aria-hidden
              className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-ink-muted"
            />
          )}
        </div>
      </Campo>

      <div aria-live="polite" className="flex flex-col gap-3">
        {buscando && <p className="text-body-sm text-ink-muted">Buscando os dados na Receita…</p>}

        {!buscando && dados && dados.ativa && (
          <div className="flex flex-col gap-3 rounded-md border border-line bg-surface-200 p-4">
            <div className="flex gap-3">
              <Building2 aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" />
              <div className="min-w-0 text-body-sm">
                <p className="flex flex-wrap items-center gap-1.5 text-label">
                  {nomeDaReceita(dados.nomeFantasia || dados.razaoSocial)}
                  <BadgeCheck aria-hidden className="size-4 text-cerrado-text" />
                  <span className="sr-only">CNPJ ativo</span>
                </p>
                {dados.nomeFantasia && <p className="text-ink-muted">{nomeDaReceita(dados.razaoSocial)}</p>}
                <p className="text-ink-muted">
                  Ativa{formatarData(dados.abertura) && ` desde ${formatarData(dados.abertura)}`}
                  {dados.mei && " · MEI"}
                  {dados.municipio && ` · ${nomeDaReceita(dados.municipio)}${dados.uf ? `/${dados.uf}` : ""}`}
                </p>
                {dados.atividade && <p className="text-ink-muted">{dados.atividade}</p>}
              </div>
            </div>
            <button
              type="button"
              onClick={() => aoUsar(dados)}
              className="inline-flex min-h-10 items-center self-start rounded-md border border-line-strong bg-surface-200 px-3.5 text-label hover:bg-surface-300"
            >
              Usar o nome e o bairro da Receita
            </button>
          </div>
        )}

        {!buscando && dados && dados.ativa && agencia && !dados.agenciaDeEmprego && (
          <Aviso tipo="alerta">
            A atividade deste CNPJ na Receita não é de seleção ou agenciamento de mão de obra. Dá para publicar, mas
            a equipe do Publike confere antes de verificar a agência.
          </Aviso>
        )}

        {!buscando && dados && !dados.ativa && (
          <Aviso tipo="erro">
            Este CNPJ está com a situação {dados.situacao.toLowerCase()} na Receita. Use um CNPJ ativo.
          </Aviso>
        )}

        {!buscando && atual?.ok === false && atual.motivo === "nao_encontrado" && (
          <p className="text-body-sm text-ink-muted">
            Não achamos este CNPJ na base pública da Receita. Empresa aberta há pouco tempo pode demorar até um mês
            para aparecer; dá para salvar assim mesmo.
          </p>
        )}

        {!buscando && atual?.ok === false && atual.motivo === "indisponivel" && (
          <p className="text-body-sm text-ink-muted">
            Não deu para consultar a Receita agora. Dá para salvar assim mesmo.
          </p>
        )}
      </div>
    </div>
  );
}
