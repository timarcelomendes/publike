"use client";

import { UserPlus } from "lucide-react";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { criarContaPeloAdmin } from "@/lib/acoes/admin-contas";
import { CIDADES, LISTA_TIPOS_CONTA, TIPOS_CONTA } from "@/lib/constantes";
import type { EstadoForm, TipoConta } from "@/lib/tipos";
import { Aviso } from "../ui/basicos";
import { Botao } from "../ui/botao";
import { Campo, classesEntrada, ligarCampo, Seletor } from "../ui/campo";

// No admin, o que cada tipo cobre (pessoa: candidato e prestador de serviço).
const AJUDA_DO_TIPO: Partial<Record<TipoConta, string>> = {
  pessoa: "Candidato, prestador de serviço (diarista, pedreiro…) ou quem contrata para casa",
};

/** Criar uma conta pelo e-mail, para quem pediu ajuda: candidato, prestador, comércio, empresa ou agência. */
export function FormNovaConta() {
  const [estado, acao, enviando] = useActionState(criarContaPeloAdmin, { ok: false } as EstadoForm);
  const [tipo, setTipo] = useState<TipoConta>("pessoa");
  const erros = estado.erros ?? {};

  // com onSubmit (e não action), o formulário não se apaga quando volta um erro
  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    startTransition(() => acao(dados));
  }

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-5">
      <Campo
        rotulo="E-mail de login"
        nome="login"
        erro={erros.login}
        ajuda="É por ele que a pessoa entra (sem senha). Se já tiver conta com este e-mail, abrimos a conta que existe."
      >
        <input
          {...ligarCampo("login", erros.login, true)}
          type="email"
          autoComplete="off"
          required
          placeholder="nome@email.com"
          className={classesEntrada}
        />
      </Campo>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-label">Tipo de conta</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {LISTA_TIPOS_CONTA.map((t) => (
            <label
              key={t}
              className="flex cursor-pointer flex-col rounded-md border border-line-strong bg-surface-200 px-3 py-2.5 transition-colors has-[:checked]:border-ink has-[:checked]:bg-surface-300 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus"
            >
              <input
                type="radio"
                name="tipo"
                value={t}
                checked={tipo === t}
                onChange={() => setTipo(t)}
                className="sr-only"
              />
              <span className="text-label">{TIPOS_CONTA[t].nome}</span>
              <span className="text-body-sm text-ink-muted">{AJUDA_DO_TIPO[t] ?? TIPOS_CONTA[t].ajuda}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <Campo rotulo={tipo === "pessoa" ? "Nome" : "Nome do negócio"} nome="nome" erro={erros.nome}>
        <input {...ligarCampo("nome", erros.nome)} maxLength={80} required className={classesEntrada} />
      </Campo>

      {tipo !== "pessoa" && (
        <Campo
          rotulo={tipo === "agencia" ? "CNPJ da agência" : "CNPJ"}
          nome="cnpj"
          opcional={tipo !== "agencia"}
          erro={erros.cnpj}
          ajuda={
            tipo === "agencia"
              ? "Depois confira na Receita e ligue o selo de verificada na página da conta."
              : undefined
          }
        >
          <input
            {...ligarCampo("cnpj", erros.cnpj, tipo === "agencia")}
            inputMode="text"
            maxLength={18}
            autoComplete="off"
            placeholder="00.000.000/0000-00"
            className={classesEntrada}
          />
        </Campo>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Cidade" nome="cidade" erro={erros.cidade}>
          <Seletor {...ligarCampo("cidade", erros.cidade)} defaultValue="Goiânia" className={classesEntrada}>
            {CIDADES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Seletor>
        </Campo>
        <Campo rotulo="Bairro ou setor" nome="bairro" opcional erro={erros.bairro}>
          <input {...ligarCampo("bairro", erros.bairro)} maxLength={80} className={classesEntrada} />
        </Campo>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          rotulo="WhatsApp"
          nome="whatsapp"
          erro={erros.whatsapp}
          ajuda="Aparece para quem der match com as vagas."
        >
          <input
            {...ligarCampo("whatsapp", erros.whatsapp, true)}
            inputMode="tel"
            autoComplete="off"
            placeholder="(62) 99999-0000"
            className={classesEntrada}
          />
        </Campo>
        <Campo
          rotulo="E-mail de contato"
          nome="email"
          opcional
          erro={erros.email}
          ajuda="Vazio: usa o e-mail de login."
        >
          <input
            {...ligarCampo("email", erros.email, true)}
            type="email"
            autoComplete="off"
            className={classesEntrada}
          />
        </Campo>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-md bg-surface-300 p-4">
        <input type="checkbox" name="enviar_acesso" className="mt-0.5 size-5 shrink-0 accent-[var(--pk-ink)]" />
        <span>
          <span className="block text-label">Mandar o e-mail de acesso agora</span>
          <span className="block text-body-sm text-ink-muted">
            Dica: publique as vagas ou monte a vitrine de serviços antes e mande o acesso depois, pela página da conta.
            Assim o e-mail já conta o que está no ar.
          </span>
        </span>
      </label>

      <p className="text-body-sm text-ink-muted">
        Crie a conta só com a autorização da pessoa ou da empresa. No primeiro acesso, ela confere os dados e aceita as
        regras e a política de privacidade.
      </p>

      {estado.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}

      <Botao type="submit" variante="primario" disabled={enviando} className="self-start">
        <UserPlus aria-hidden />
        {enviando ? "Criando…" : "Criar conta"}
      </Botao>
    </form>
  );
}
