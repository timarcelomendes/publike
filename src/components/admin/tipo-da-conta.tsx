"use client";

import { Check } from "lucide-react";
import { useActionState, useState } from "react";
import { protegerAcao } from "@/lib/acao-segura";
import { mudarTipoECnpj } from "@/lib/acoes/admin";
import { formatarCnpj } from "@/lib/cnpj";
import type { EstadoForm } from "@/lib/tipos";
import { Aviso } from "../ui/basicos";
import { Botao } from "../ui/botao";
import { Campo, classesEntrada, ligarCampo, Seletor } from "../ui/campo";

const INICIAL: EstadoForm = { ok: false };
const mudarTipoECnpjProtegido = protegerAcao(mudarTipoECnpj);

const TIPOS = [
  { valor: "empresa", nome: "Empresa" },
  { valor: "comercio", nome: "Comércio" },
  { valor: "agencia", nome: "Agência de emprego / RH" },
] as const;

/**
 * Corrigir o tipo da conta de quem contrata (comércio, empresa ou agência) e o CNPJ: por exemplo, quem se
 * cadastrou como agência por engano vira empresa, sem o CNPJ. Conta de pessoa não troca por aqui.
 */
export function FormTipoDaConta({ usuarioId, tipo, cnpj }: { usuarioId: string; tipo: string; cnpj: string | null }) {
  const [estado, acao, enviando] = useActionState(mudarTipoECnpjProtegido, INICIAL);
  const [escolhido, setEscolhido] = useState(tipo);
  const [numero, setNumero] = useState(cnpj ? formatarCnpj(cnpj) : "");
  const erroTipo = estado.erros?.tipo;
  const erroCnpj = estado.erros?.cnpj;
  const mudou = escolhido !== tipo || numero.replace(/[^0-9A-Za-z]/g, "").toUpperCase() !== (cnpj ?? "");

  return (
    <form action={acao} className="flex flex-col gap-3 rounded-md border border-line p-3">
      <input type="hidden" name="usuario_id" value={usuarioId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Tipo da conta" nome="tipo" erro={erroTipo}>
          <Seletor
            {...ligarCampo("tipo", erroTipo)}
            value={escolhido}
            onChange={(e) => setEscolhido(e.target.value)}
            className={classesEntrada}
          >
            {TIPOS.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.nome}
              </option>
            ))}
          </Seletor>
        </Campo>
        <Campo
          rotulo="CNPJ"
          nome="cnpj"
          erro={erroCnpj}
          opcional={escolhido !== "agencia"}
          ajuda={escolhido === "agencia" ? "Agência precisa de CNPJ válido." : "Deixe em branco para tirar o CNPJ."}
        >
          <div className="flex gap-2">
            <input
              {...ligarCampo("cnpj", erroCnpj, true)}
              value={numero}
              onChange={(e) => setNumero(formatarCnpj(e.target.value))}
              inputMode="text"
              autoComplete="off"
              maxLength={18}
              placeholder="00.000.000/0000-00"
              className={`${classesEntrada} font-mono`}
            />
            {numero && (
              <Botao type="button" variante="secundario" onClick={() => setNumero("")}>
                Tirar
              </Botao>
            )}
          </div>
        </Campo>
      </div>
      <p className="text-body-sm text-ink-muted">
        Se mudar o tipo ou o CNPJ, o selo de verificado sai (ele vale para aquele tipo e aquele CNPJ). A troca fica no
        registro da equipe.
      </p>
      <Botao type="submit" disabled={enviando || !mudou} className="self-start">
        <Check aria-hidden />
        {enviando ? "Salvando…" : "Salvar tipo e CNPJ"}
      </Botao>
      {estado.erro && !erroTipo && !erroCnpj && <Aviso tipo="erro">{estado.erro}</Aviso>}
      {estado.ok && estado.mensagem && <Aviso tipo="sucesso">{estado.mensagem}</Aviso>}
    </form>
  );
}
