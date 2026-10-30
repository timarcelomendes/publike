"use client";

import { Mail } from "lucide-react";
import { startTransition, useActionState, useMemo, type FormEvent } from "react";
import { protegerAcao } from "@/lib/acao-segura";
import { vincularEmailDoAcesso } from "@/lib/acoes/acesso";
import type { EstadoForm } from "@/lib/tipos";
import { Aviso } from "./ui/basicos";
import { Botao } from "./ui/botao";
import { Campo, classesEntrada, ligarCampo } from "./ui/campo";

/** O e-mail de quem vai cuidar da conta (o da pessoa, não o da empresa) no link de acesso: vira o login. */
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
      {/* o e-mail de quem vai entrar (não o da empresa): muita gente punha o contato@ que ninguém lê */}
      <Campo
        rotulo="Seu e-mail"
        nome="email_empresa"
        erro={erros.email_empresa}
        ajuda={pessoal ? undefined : "O seu, que você abre todo dia. Não precisa ser o da empresa."}
      >
        <input
          {...ligarCampo("email_empresa", erros.email_empresa, !pessoal)}
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="seunome@gmail.com"
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
