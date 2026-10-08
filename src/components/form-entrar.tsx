"use client";

import { ArrowLeft, Mail, Smartphone } from "lucide-react";
import Image from "next/image";
import { startTransition, useEffect, useMemo, useState, type FormEvent } from "react";
import { irDepoisDoLogin } from "@/lib/acoes/perfil";
import { REDES, type BotaoRede, type RedeSocial } from "@/lib/login-social";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import { Aviso } from "./ui/basicos";
import { Botao } from "./ui/botao";
import { classesEntrada } from "./ui/campo";

type ErroAuth = { code?: string; message?: string; status?: number } | null;

/** Mensagens do Supabase Auth em português. */
function traduzir(erro: ErroAuth) {
  const codigo = erro?.code ?? "";
  const msg = (erro?.message ?? "").toLowerCase();
  if (erro?.status === 429 || codigo.includes("rate_limit") || msg.includes("rate limit") || msg.includes("security purposes")) {
    return "Muitas tentativas seguidas. Espere um minuto e tente de novo.";
  }
  if (codigo === "otp_expired" || msg.includes("expired") || msg.includes("invalid") && msg.includes("token")) {
    return "Código errado ou vencido. Confira ou peça um novo.";
  }
  if (codigo === "phone_provider_disabled" || codigo === "sms_send_failed" || msg.includes("sms") || msg.includes("phone provider")) {
    return "O login por celular ainda não está ativado. Entre com seu e-mail.";
  }
  if (codigo === "provider_disabled" || msg.includes("provider is not enabled") || msg.includes("unsupported provider")) {
    return "Esse jeito de entrar ainda não está ativado. Tente outro.";
  }
  if (codigo === "email_address_invalid" || msg.includes("email address")) return "Confira o e-mail digitado.";
  if (codigo === "validation_failed" || msg.includes("phone")) return "Confira o número digitado, com DDD.";
  return "Não deu certo agora. Tente de novo em instantes.";
}

/** (62) 99999-0000 enquanto a pessoa digita. */
function mascararCelular(valor: string) {
  const d = valor.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function FormEntrar({
  proximo,
  erroInicial,
  redes,
  celular: comCelular,
}: {
  proximo: string;
  erroInicial?: string;
  redes: BotaoRede[];
  celular: boolean;
}) {
  const supabase = useMemo(() => criarClienteNavegador(), []);
  const [modo, setModo] = useState<"celular" | "email">(comCelular ? "celular" : "email");
  const [etapa, setEtapa] = useState<"pedir" | "codigo" | "email-enviado">("pedir");
  const [celular, setCelular] = useState("");
  const [codigo, setCodigo] = useState("");
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState<string | null>(erroInicial ?? null);
  const [carregando, setCarregando] = useState(false);
  const [abrindo, setAbrindo] = useState<RedeSocial | null>(null);

  const digitos = celular.replace(/\D/g, "");
  const telefone = `+55${digitos}`;

  // Quem volta da página da rede pelo botão "voltar" encontra os botões liberados de novo.
  useEffect(() => {
    const aoMostrar = (e: PageTransitionEvent) => {
      if (e.persisted) setAbrindo(null);
    };
    window.addEventListener("pageshow", aoMostrar);
    return () => window.removeEventListener("pageshow", aoMostrar);
  }, []);

  /** Para onde o Supabase devolve a pessoa. `via` diz qual rede foi usada (só muda a mensagem de erro). */
  function urlDeRetorno(via?: RedeSocial) {
    const params = new URLSearchParams({ next: proximo });
    if (via) params.set("via", via);
    return `${window.location.origin}/auth/callback?${params}`;
  }

  function continuar() {
    // O servidor confere se o perfil está completo e leva ao destino.
    startTransition(() => irDepoisDoLogin(proximo));
  }

  async function entrarCom(rede: RedeSocial) {
    setErro(null);
    setAbrindo(rede);
    // Leva a pessoa para o Google, o Facebook ou o LinkedIn; a volta é em /auth/callback.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: REDES[rede].provedor,
      options: { redirectTo: urlDeRetorno(rede) },
    });
    if (error) {
      setErro(traduzir(error));
      setAbrindo(null);
    }
  }

  async function pedirCodigo(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (digitos.length < 10) {
      setErro("Digite o celular com DDD. Ex.: (62) 99999-0000.");
      return;
    }
    setCarregando(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: telefone });
    setCarregando(false);
    if (error) {
      setErro(traduzir(error));
      return;
    }
    setEtapa("codigo");
  }

  async function confirmarCodigo(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (codigo.replace(/\D/g, "").length < 6) {
      setErro("O código tem 6 números.");
      return;
    }
    setCarregando(true);
    const { error } = await supabase.auth.verifyOtp({ phone: telefone, token: codigo.replace(/\D/g, ""), type: "sms" });
    if (error) {
      setCarregando(false);
      setErro(traduzir(error));
      return;
    }
    continuar();
  }

  async function pedirLink(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: urlDeRetorno() },
    });
    setCarregando(false);
    if (error) {
      setErro(traduzir(error));
      return;
    }
    setEtapa("email-enviado");
  }

  if (etapa === "email-enviado") {
    return (
      <div className="flex flex-col gap-4">
        <Aviso tipo="sucesso" titulo="Confira seu e-mail">
          Mandamos um link para <strong>{email}</strong>. Abra o link neste mesmo navegador para entrar. Não chegou? Veja
          a caixa de spam.
        </Aviso>
        <Botao variante="fantasma" onClick={() => setEtapa("pedir")}>
          <ArrowLeft aria-hidden />
          Usar outro e-mail
        </Botao>
      </div>
    );
  }

  if (etapa === "codigo") {
    return (
      <form onSubmit={confirmarCodigo} className="flex flex-col gap-4">
        <p className="text-body text-ink">
          Mandamos um código por SMS para <strong>{celular}</strong>.
        </p>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="codigo" className="text-label">
            Código de 6 números
          </label>
          <input
            id="codigo"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            placeholder="000000"
            className={`${classesEntrada} text-center font-display text-h2 tracking-[0.4em]`}
          />
        </div>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <Botao type="submit" variante="primario" disabled={carregando}>
          {carregando ? "Entrando…" : "Entrar"}
        </Botao>
        <Botao
          variante="fantasma"
          onClick={() => {
            setEtapa("pedir");
            setCodigo("");
          }}
        >
          <ArrowLeft aria-hidden />
          Trocar número ou pedir outro código
        </Botao>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {redes.length > 0 && (
        <>
          <div role="group" aria-label="Entrar com uma rede social" className="flex flex-col gap-3">
            {redes.map(({ rede, nome, logo }) => (
              <Botao
                key={rede}
                onClick={() => entrarCom(rede)}
                disabled={abrindo !== null || carregando}
                className="min-h-12 w-full"
              >
                {logo && <Image src={logo} alt="" width={20} height={20} unoptimized className="size-5 shrink-0" />}
                {abrindo === rede ? `Abrindo o ${nome}…` : `Continuar com o ${nome}`}
              </Botao>
            ))}
          </div>
          <div className="flex items-center gap-3 text-body-sm text-ink-muted">
            <span className="h-px flex-1 bg-line" />
            ou
            <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}

      {modo === "celular" ? (
        <form onSubmit={pedirCodigo} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="celular" className="text-label">
              Seu celular
            </label>
            <input
              id="celular"
              value={celular}
              onChange={(e) => setCelular(mascararCelular(e.target.value))}
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="(62) 99999-0000"
              className={classesEntrada}
            />
            <p className="text-body-sm text-ink-muted">Você recebe um código por SMS.</p>
          </div>
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          <Botao type="submit" variante="primario" disabled={carregando} className="min-h-12">
            <Smartphone aria-hidden />
            {carregando ? "Enviando…" : "Receber código"}
          </Botao>
          <button
            type="button"
            onClick={() => {
              setModo("email");
              setErro(null);
            }}
            className="min-h-11 text-label text-terra-text underline"
          >
            Prefiro entrar com e-mail
          </button>
        </form>
      ) : (
        <form onSubmit={pedirLink} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-label">
              Seu e-mail
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              placeholder="voce@exemplo.com"
              className={classesEntrada}
            />
            <p className="text-body-sm text-ink-muted">Você recebe um link para entrar, sem senha.</p>
          </div>
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          <Botao type="submit" variante="primario" disabled={carregando} className="min-h-12">
            <Mail aria-hidden />
            {carregando ? "Enviando…" : "Receber link"}
          </Botao>
          {comCelular && (
            <button
              type="button"
              onClick={() => {
                setModo("celular");
                setErro(null);
              }}
              className="min-h-11 text-label text-terra-text underline"
            >
              Prefiro entrar com o celular
            </button>
          )}
        </form>
      )}
    </div>
  );
}
