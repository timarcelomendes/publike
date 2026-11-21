"use client";

import { MessageCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  confirmarCodigoParaLigar,
  desligarWhatsappDoLogin,
  pedirCodigoParaLigar,
} from "@/lib/acoes/whatsapp-de-acesso";
import { Aviso } from "./ui/basicos";
import { Botao } from "./ui/botao";
import { Campo, classesEntrada } from "./ui/campo";

/** (62) 99999-0000 enquanto digita */
function mascarar(valor: string) {
  const d = valor.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/**
 * Meu perfil › Entrar também pelo WhatsApp (20/11/2026). Quem entra com o e-mail liga o WhatsApp ao login com um código
 * que chega na conversa com o Publike; depois, entra com o código no WhatsApp, sem e-mail. Ligado: mostra o número e o
 * "Desligar" (só para quem também entra com o e-mail, para a conta não ficar sem entrada).
 */
export function WhatsappDeAcesso({
  ligado,
  podeDesligar,
  sugestao,
  linkDoOi,
}: {
  /** o WhatsApp do login, já formatado, ou null */
  ligado: string | null;
  podeDesligar: boolean;
  /** o WhatsApp do cadastro, para já vir escrito */
  sugestao: string | null;
  /** wa.me do Publike com "Oi", para quem precisa mandar um oi antes de receber o código */
  linkDoOi: string | null;
}) {
  const [numero, setNumero] = useState(sugestao ? mascarar(sugestao.replace(/^55/, "")) : "");
  const [codigo, setCodigo] = useState("");
  const [etapa, setEtapa] = useState<"numero" | "codigo">("numero");
  const [enviadoPara, setEnviadoPara] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mandarOi, setMandarOi] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [atual, setAtual] = useState(ligado);
  const [pronto, setPronto] = useState(false);
  const [confirmandoDesligar, setConfirmandoDesligar] = useState(false);

  async function pedir(e?: FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    setErro(null);
    setMandarOi(false);
    if (numero.replace(/\D/g, "").length < 10) {
      setErro("Digite o WhatsApp com DDD. Ex.: (62) 99999-0000.");
      return;
    }
    setCarregando(true);
    const r = await pedirCodigoParaLigar(numero).catch(() => ({ ok: false as const, erro: "Sem conexão agora. Tente de novo." }));
    setCarregando(false);
    if (!r.ok) {
      setErro(r.erro);
      setMandarOi(Boolean("mandarOi" in r && r.mandarOi));
      return;
    }
    setEnviadoPara(r.numero ?? numero);
    setCodigo("");
    setEtapa("codigo");
  }

  async function confirmar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    if (codigo.replace(/\D/g, "").length !== 6) {
      setErro("O código tem 6 números.");
      return;
    }
    setCarregando(true);
    const r = await confirmarCodigoParaLigar(numero, codigo).catch(() => ({
      ok: false as const,
      erro: "Sem conexão agora. Tente de novo.",
    }));
    setCarregando(false);
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    setAtual(r.numero ?? enviadoPara);
    setPronto(true);
    setEtapa("numero");
  }

  async function desligar() {
    setErro(null);
    setCarregando(true);
    const r = await desligarWhatsappDoLogin().catch(() => ({ ok: false as const, erro: "Sem conexão agora. Tente de novo." }));
    setCarregando(false);
    setConfirmandoDesligar(false);
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    setAtual(null);
    setPronto(false);
  }

  return (
    <section
      id="whatsapp-acesso"
      aria-labelledby="whatsapp-acesso-titulo"
      className="mt-8 flex scroll-mt-24 flex-col gap-4 rounded-lg border border-line bg-surface-200 p-5 shadow-card"
    >
      <div className="flex items-start gap-3">
        <MessageCircle aria-hidden className="mt-0.5 size-6 shrink-0 text-terra-text" />
        <div className="min-w-0">
          <h2 id="whatsapp-acesso-titulo" className="text-h3">
            Entrar pelo WhatsApp
          </h2>
          <p className="mt-1 text-body-sm text-ink-muted">
            {atual ? (
              <>
                O WhatsApp <strong className="text-ink">{atual}</strong> está vinculado a esta conta. Para entrar por ele,
                toque em “Entrar com o WhatsApp” na tela de entrar: o código chega na conversa com o Publike.
              </>
            ) : (
              "Opcional. Vincule o seu WhatsApp a esta conta para entrar com um código que chega na conversa com o Publike, sem e-mail e sem senha."
            )}
          </p>
        </div>
      </div>

      {pronto && atual && (
        <Aviso tipo="sucesso" titulo="WhatsApp vinculado a esta conta.">
          Da próxima vez, na tela de entrar, toque em “Entrar com o WhatsApp”.
        </Aviso>
      )}

      {atual ? (
        podeDesligar && (
          <div className="flex flex-col gap-3">
            {confirmandoDesligar ? (
              <>
                <p className="text-body-sm">Desvincular o WhatsApp desta conta? Você continua entrando com o e-mail.</p>
                <div className="flex flex-wrap gap-2">
                  <Botao type="button" variante="perigo" disabled={carregando} onClick={desligar}>
                    {carregando ? "Desvinculando…" : "Desvincular o WhatsApp"}
                  </Botao>
                  <Botao type="button" variante="secundario" disabled={carregando} onClick={() => setConfirmandoDesligar(false)}>
                    Manter
                  </Botao>
                </div>
              </>
            ) : (
              <Botao type="button" variante="secundario" className="self-start" onClick={() => setConfirmandoDesligar(true)}>
                Desvincular o WhatsApp
              </Botao>
            )}
          </div>
        )
      ) : etapa === "numero" ? (
        <form onSubmit={pedir} noValidate className="flex flex-col gap-3">
          <Campo rotulo="Seu WhatsApp" nome="numero-whatsapp-acesso" ajuda="O código chega na conversa com o Publike.">
            <input
              id="numero-whatsapp-acesso"
              aria-describedby="numero-whatsapp-acesso-ajuda"
              value={numero}
              onChange={(e) => setNumero(mascarar(e.target.value))}
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="(62) 99999-0000"
              className={classesEntrada}
            />
          </Campo>
          {erro && (
            <Aviso tipo="erro">
              {erro}
              {mandarOi && linkDoOi && (
                <>
                  {" "}
                  <a href={linkDoOi} target="_blank" rel="noopener noreferrer" className="underline">
                    Mandar um oi no WhatsApp
                  </a>
                </>
              )}
            </Aviso>
          )}
          <Botao type="submit" disabled={carregando} className="self-start">
            {carregando ? "Enviando…" : "Receber código no WhatsApp"}
          </Botao>
        </form>
      ) : (
        <form onSubmit={confirmar} noValidate className="flex flex-col gap-3">
          <p className="text-body-sm">
            Mandamos um código no WhatsApp <strong>{enviadoPara}</strong>.
          </p>
          <Campo rotulo="Código de 6 números" nome="codigo-whatsapp-acesso">
            <input
              id="codigo-whatsapp-acesso"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              className={classesEntrada}
            />
          </Campo>
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          <div className="flex flex-wrap gap-2">
            <Botao type="submit" disabled={carregando}>
              {carregando ? "Conferindo…" : "Vincular o WhatsApp"}
            </Botao>
            <Botao type="button" variante="secundario" disabled={carregando} onClick={() => void pedir()}>
              Mandar de novo
            </Botao>
            <Botao
              type="button"
              variante="fantasma"
              disabled={carregando}
              onClick={() => {
                setEtapa("numero");
                setErro(null);
              }}
            >
              Trocar o número
            </Botao>
          </div>
        </form>
      )}
    </section>
  );
}
