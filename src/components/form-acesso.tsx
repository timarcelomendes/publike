"use client";

import { Mail } from "lucide-react";
import { startTransition, useActionState, useMemo, type FormEvent } from "react";
import { protegerAcao } from "@/lib/acao-segura";
import { vincularEmailDoAcesso } from "@/lib/acoes/acesso";
import type { EstadoForm } from "@/lib/tipos";
import { Aviso } from "./ui/basicos";
import { Botao } from "./ui/botao";
import { Campo, classesEntrada, ligarCampo } from "./ui/campo";

/** O e-mail da empresa (ou da pessoa, na vitrine de serviços) no link de acesso: vira o login da conta. */
export function FormAcesso({ token, pessoal = false }: { token: string; pessoal?: boolean }) {
  const vincularProtegido = useMemo(() => protegerAcao(vincularEmailDoAcesso.bind(null, token)), [token]);
  const [estado, acao, enviando] = useActionState(vincularProtegido, { ok: false } as EstadoForm);
  const erros = estado.erros ?? {};
  // sem limpar o campo quando volta com erro (o "action" do form limparia)
  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    startTransition(() => acao(dados));
  }
  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
      <Campo rotulo={pessoal ? "Seu e-mail" : "E-mail da empresa"} nome="email_empresa" erro={erros.email_empresa}>
        <input
          {...ligarCampo("email_empresa", erros.email_empresa)}
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder={pessoal ? "seunome@gmail.com" : "contato@empresa.com.br"}
          className={classesEntrada}
        />
      </Campo>
      {estado.erro && !erros.email_empresa && <Aviso tipo="erro">{estado.erro}</Aviso>}
      <Botao type="submit" variante="primario" disabled={enviando} className="self-start">
        <Mail aria-hidden />
        {enviando ? "Ligando…" : "Usar este e-mail"}
      </Botao>
    </form>
  );
}
