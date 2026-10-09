"use client";

import { UserPlus } from "lucide-react";
import { useActionState } from "react";
import { adicionarModerador } from "@/lib/acoes/admin";
import type { EstadoForm } from "@/lib/tipos";
import { Aviso } from "../ui/basicos";
import { Botao } from "../ui/botao";
import { Campo, classesEntrada, ligarCampo } from "../ui/campo";

const INICIAL: EstadoForm = { ok: false };

export function FormNovoModerador() {
  const [estado, acao, enviando] = useActionState(adicionarModerador, INICIAL);
  return (
    <form action={acao} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Campo
          rotulo="E-mail da pessoa"
          nome="email"
          erro={estado.erros?.email}
          ajuda="Ela precisa já ter entrado no Publike e criado o perfil."
          className="flex-1"
        >
          <input {...ligarCampo("email", estado.erros?.email, true)} type="email" required className={classesEntrada} />
        </Campo>
        <Botao type="submit" disabled={enviando} className="sm:mb-7">
          <UserPlus aria-hidden />
          {enviando ? "Adicionando…" : "Pôr na moderação"}
        </Botao>
      </div>
      {estado.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}
      {estado.ok && estado.mensagem && <Aviso tipo="sucesso">{estado.mensagem}</Aviso>}
    </form>
  );
}
