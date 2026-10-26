"use client";

import { ArrowLeft, KeyRound, Mail, MailCheck, RotateCw, Smartphone } from "lucide-react";
import Image from "next/image";
import { startTransition, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ehNavegacao } from "@/lib/acao-segura";
import { irDepoisDoLogin } from "@/lib/acoes/perfil";
import { GOOGLE_CLIENT_ID, TURNSTILE_SITE_KEY } from "@/lib/config";
import { COOKIE_PEDIU_LINK } from "@/lib/link-entrada";
import { REDES, type BotaoRede, type RedeSocial } from "@/lib/login-social";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import { BotaoGoogle } from "./botao-google";
import { Aviso } from "./ui/basicos";
import { Botao, classesBotaoRede } from "./ui/botao";
import { classesEntrada } from "./ui/campo";
import { CampoSenha } from "./ui/campo-senha";
import { VerificacaoRobo } from "./verificacao-robo";

type ErroAuth = { code?: string; message?: string; status?: number } | null;

/** Mensagens do Supabase Auth em português. */
function traduzir(erro: ErroAuth) {
  const codigo = erro?.code ?? "";
  const msg = (erro?.message ?? "").toLowerCase();
  if (codigo === "captcha_failed" || msg.includes("captcha")) {
    return "Não conseguimos confirmar que você não é um robô. Tente de novo; se continuar, recarregue a página.";
  }
  if (codigo === "user_banned" || msg.includes("banned")) {
    return "Esta conta está suspensa e não pode entrar agora. Se achar que é um engano, responda o e-mail de aviso que você recebeu.";
  }
  if (erro?.status === 429 || codigo.includes("rate_limit") || msg.includes("rate limit") || msg.includes("security purposes")) {
    return "Muitas tentativas seguidas. Espere um minuto e tente de novo.";
  }
  if (codigo === "invalid_credentials" || msg.includes("invalid login credentials")) {
    return "E-mail ou senha errados. Ainda não criou uma senha? Entre pelo link no e-mail e crie em Meu perfil.";
  }
  if (codigo === "email_not_confirmed" || msg.includes("email not confirmed")) {
    return "Este e-mail ainda não foi confirmado. Entre pelo link no e-mail.";
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

/** Espera entre um e-mail e outro (o Supabase também segura pedidos seguidos para o mesmo endereço). */
const ESPERA_REENVIO = 60;

/** "…request this after 37 seconds": quanto o Supabase ainda pede para esperar. */
function segundosPedidos(erro: ErroAuth) {
  const n = /after (\d+) seconds?/i.exec(erro?.message ?? "")?.[1];
  return n ? Number(n) : null;
}

/** 0:45 */
function relogio(segundos: number) {
  return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`;
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
  origem,
  erroInicial,
  redes,
  celular: comCelular,
  cabecalho,
  emailInicial,
}: {
  proximo: string;
  /** a campanha de onde a pessoa chegou ("google:servicos"): vai no link de volta do e-mail e das redes */
  origem?: string;
  /** veio do link de acesso: o e-mail que a empresa acabou de ligar à conta */
  emailInicial?: string;
  erroInicial?: string;
  redes: BotaoRede[];
  celular: boolean;
  /** Título do cartão: aparece só enquanto a pessoa escolhe como entrar. */
  cabecalho?: ReactNode;
}) {
  const supabase = useMemo(() => criarClienteNavegador(), []);
  // "senha": quem criou uma senha em Meu perfil (é opcional; o link no e-mail continua valendo)
  const [modo, setModo] = useState<"celular" | "email" | "senha">(comCelular && !emailInicial ? "celular" : "email");
  const [etapa, setEtapa] = useState<"pedir" | "codigo" | "email-enviado">("pedir");
  const [celular, setCelular] = useState("");
  const [codigo, setCodigo] = useState("");
  const [email, setEmail] = useState(emailInicial ?? "");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(erroInicial ?? null);
  const [carregando, setCarregando] = useState(false);
  const [abrindo, setAbrindo] = useState<RedeSocial | null>(null);
  // botão oficial do Google; se o script dele não carregar, volta o botão comum
  const [googleOficial, setGoogleOficial] = useState(Boolean(GOOGLE_CLIENT_ID));
  // Verificação contra robôs: o token vale uma vez só. Depois de cada pedido,
  // `rodada` muda e a verificação recomeça. Se a pessoa enviar antes de o token
  // chegar, o pedido espera por ele (`aguardando`).
  const comVerificacao = Boolean(TURNSTILE_SITE_KEY);
  const [tokenRobo, setTokenRobo] = useState<string | null>(null);
  const [rodada, setRodada] = useState(0);
  const [verificando, setVerificando] = useState(false);
  const aguardando = useRef<"email" | "reenvio" | "celular" | "senha" | "esqueci" | null>(null);
  // "Esqueci a senha": o link para criar uma senha nova foi pedido
  const [pediuSenhaNova, setPediuSenhaNova] = useState(false);
  // Reenvio do link: quando o botão volta a valer, quantas vezes foi e o resultado da última.
  const [liberaEm, setLiberaEm] = useState(0);
  const [agora, setAgora] = useState(0);
  const [reenvios, setReenvios] = useState(0);
  const [reenviado, setReenviado] = useState(false);

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

  // contagem do "Reenviar e-mail": um tique por segundo só enquanto falta tempo
  useEffect(() => {
    if (etapa !== "email-enviado" || liberaEm <= Date.now()) return;
    const relogioId = window.setInterval(() => {
      const t = Date.now();
      setAgora(t);
      if (t >= liberaEm) window.clearInterval(relogioId);
    }, 1000);
    return () => window.clearInterval(relogioId);
  }, [etapa, liberaEm]);
  const faltam = Math.max(0, Math.ceil((liberaEm - agora) / 1000));

  /** Para onde o Supabase devolve a pessoa. `via` diz qual rede foi usada (só muda a mensagem de erro). */
  function urlDeRetorno(via?: RedeSocial) {
    const params = new URLSearchParams({ next: proximo });
    if (via) params.set("via", via);
    // quem abre o link do e-mail em outro navegador (o do app de e-mail) não tem o cookie da campanha
    if (origem) params.set("origem", origem);
    return `${window.location.origin}/auth/callback?${params}`;
  }

  function continuar() {
    // O servidor confere se o perfil está completo e leva ao destino. Se a ação não chegar ao
    // servidor (site publicado de novo com a página aberta), /auth/continuar faz o mesmo caminho.
    setCarregando(true);
    startTransition(async () => {
      try {
        await irDepoisDoLogin(proximo);
      } catch (e) {
        if (ehNavegacao(e)) throw e;
        console.error("Publike: não deu para seguir depois de entrar:", e);
        // carregamento inteiro de propósito: a página aberta pode ser de uma versão velha do site
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign(`/auth/continuar?${new URLSearchParams({ next: proximo })}`);
      }
    });
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

  /** Botão oficial do Google: o Supabase confere o token e abre a sessão aqui mesmo. */
  async function entrarComGoogle(token: string, nonce: string) {
    setErro(null);
    setAbrindo("google");
    const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token, nonce });
    if (error) {
      setErro(traduzir(error));
      setAbrindo(null);
      return;
    }
    continuar();
  }

  /** Token usado: a verificação recomeça para o próximo pedido. */
  function novaVerificacao() {
    if (!comVerificacao) return;
    setTokenRobo(null);
    setRodada((n) => n + 1);
  }

  /** O Turnstile entregou um token; se havia pedido esperando, ele segue agora. */
  function aoVerificar(token: string) {
    setTokenRobo(token);
    setVerificando(false);
    const qual = aguardando.current;
    aguardando.current = null;
    if (qual === "email") void enviarLink(token);
    else if (qual === "reenvio") void enviarLink(token, true);
    else if (qual === "celular") void enviarCodigo(token);
    else if (qual === "senha") void entrarComSenha(token);
    else if (qual === "esqueci") void pedirSenhaNova(token);
  }

  /** Sem token ainda: o pedido espera a verificação terminar. */
  function esperarVerificacao(qual: "email" | "reenvio" | "celular" | "senha" | "esqueci") {
    if (!comVerificacao || tokenRobo) return false;
    aguardando.current = qual;
    setVerificando(true);
    return true;
  }

  async function enviarCodigo(token: string | null) {
    setCarregando(true);
    const { error } = await supabase.auth.signInWithOtp({
      phone: telefone,
      options: token ? { captchaToken: token } : undefined,
    });
    setCarregando(false);
    novaVerificacao();
    if (error) {
      setErro(traduzir(error));
      return;
    }
    setEtapa("codigo");
  }

  async function pedirCodigo(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (digitos.length < 10) {
      setErro("Digite o celular com DDD. Ex.: (62) 99999-0000.");
      return;
    }
    if (esperarVerificacao("celular")) return;
    await enviarCodigo(tokenRobo);
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

  /** O "Reenviar e-mail" fica parado por `segundos`. */
  function esperarReenvio(segundos: number) {
    const t = Date.now();
    setAgora(t);
    setLiberaEm(t + segundos * 1000);
  }

  /** Manda o link (ou manda de novo, na tela "Confira seu e-mail"). */
  async function enviarLink(token: string | null, reenvio = false) {
    setCarregando(true);
    let error: ErroAuth = null;
    try {
      ({ error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: urlDeRetorno(), ...(token ? { captchaToken: token } : {}) },
      }));
    } catch {
      // sem internet ou o Supabase fora do ar: o pedido nem chegou
      error = { message: "rede" };
    }
    setCarregando(false);
    novaVerificacao();
    if (error) {
      setErro(error.message === "rede" ? "Sem conexão agora. Confira sua internet e tente de novo." : traduzir(error));
      // o Supabase diz quanto falta: o botão espera esse tempo
      const espera = segundosPedidos(error);
      if (espera) esperarReenvio(espera);
      return;
    }
    // aberto neste navegador, o link entra sozinho (veja /auth/confirmar)
    document.cookie = `${COOKIE_PEDIU_LINK}=1; Max-Age=3600; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    esperarReenvio(ESPERA_REENVIO);
    setReenviado(reenvio);
    if (reenvio) setReenvios((n) => n + 1);
    setEtapa("email-enviado");
  }

  async function reenviarLink() {
    setErro(null);
    setReenviado(false);
    if (esperarVerificacao("reenvio")) return;
    await enviarLink(tokenRobo, true);
  }

  async function pedirLink(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (esperarVerificacao("email")) return;
    await enviarLink(tokenRobo);
  }

  /** Quem criou uma senha em Meu perfil: entra aqui mesmo, sem esperar o e-mail. */
  async function entrarComSenha(token: string | null) {
    setCarregando(true);
    let error: ErroAuth = null;
    try {
      ({ error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: senha,
        options: token ? { captchaToken: token } : undefined,
      }));
    } catch {
      error = { message: "rede" };
    }
    novaVerificacao();
    if (error) {
      setCarregando(false);
      setErro(error.message === "rede" ? "Sem conexão agora. Confira sua internet e tente de novo." : traduzir(error));
      return;
    }
    continuar();
  }

  async function pedirEntrarComSenha(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!email.trim() || !senha) {
      setErro("Digite o e-mail e a senha.");
      return;
    }
    if (esperarVerificacao("senha")) return;
    await entrarComSenha(tokenRobo);
  }

  /** "Esqueci a senha": o e-mail leva para Meu perfil › Senha, já com a pessoa dentro da conta. */
  async function pedirSenhaNova(token: string | null) {
    setCarregando(true);
    let error: ErroAuth = null;
    try {
      ({ error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?${new URLSearchParams({ next: "/perfil/senha" })}`,
        ...(token ? { captchaToken: token } : {}),
      }));
    } catch {
      error = { message: "rede" };
    }
    setCarregando(false);
    novaVerificacao();
    if (error) {
      setErro(error.message === "rede" ? "Sem conexão agora. Confira sua internet e tente de novo." : traduzir(error));
      return;
    }
    // aberto neste navegador, o link entra sozinho (veja /auth/confirmar)
    document.cookie = `${COOKIE_PEDIU_LINK}=1; Max-Age=3600; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    setPediuSenhaNova(true);
  }

  async function esqueciASenha() {
    setErro(null);
    setPediuSenhaNova(false);
    if (!email.trim() || !email.includes("@")) {
      setErro("Digite o seu e-mail acima e toque de novo em Esqueci a senha.");
      return;
    }
    if (esperarVerificacao("esqueci")) return;
    await pedirSenhaNova(tokenRobo);
  }

  const verificacao = comVerificacao && (
    <VerificacaoRobo
      key={rodada}
      siteKey={TURNSTILE_SITE_KEY}
      aoVerificar={aoVerificar}
      aoExpirar={() => setTokenRobo(null)}
    />
  );

  if (etapa === "email-enviado") {
    return (
      <div className="flex flex-col items-start gap-4">
        <span className="flex size-12 items-center justify-center rounded-pill bg-surface-300">
          <MailCheck aria-hidden className="size-6 text-cerrado-text" />
        </span>
        <div role="status">
          <p className="font-display text-h3">Confira seu e-mail</p>
          <p className="mt-1 text-body text-ink-muted">
            Mandamos um link para <strong className="text-ink">{email}</strong>. Abra o link neste mesmo navegador para
            entrar. Não chegou em alguns minutos? Veja a caixa de spam.
          </p>
        </div>
        {reenviado && !erro && (
          <Aviso tipo="sucesso" className="w-full">
            Mandamos de novo. Use o link do e-mail mais novo: os anteriores deixam de valer.
          </Aviso>
        )}
        {erro && (
          <Aviso tipo="erro" className="w-full">
            {erro}
          </Aviso>
        )}
        <Botao
          variante="secundario"
          onClick={reenviarLink}
          disabled={carregando || verificando || faltam > 0}
          className="min-h-12 w-full"
        >
          <RotateCw aria-hidden />
          {verificando
            ? "Confirmando que você não é um robô…"
            : carregando
              ? "Enviando de novo…"
              : faltam > 0
                ? `Reenviar e-mail em ${relogio(faltam)}`
                : "Reenviar e-mail"}
        </Botao>
        {reenvios >= 2 && (
          <p className="text-body-sm text-ink-muted">
            Ainda nada? Confira se o endereço está certo
            {comCelular ? " ou entre com o celular, pelo código por SMS" : ""}.
          </p>
        )}
        <Botao
          variante="fantasma"
          onClick={() => {
            setEtapa("pedir");
            setErro(null);
            setReenviado(false);
            setReenvios(0);
          }}
          className="-ml-3"
        >
          <ArrowLeft aria-hidden />
          Usar outro e-mail
        </Botao>
        {verificacao}
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
      {cabecalho && <div className="-mb-5">{cabecalho}</div>}
      {redes.length > 0 && (
        <>
          <div role="group" aria-label="Entrar com uma rede social" className="flex flex-col gap-3">
            {redes.map(({ rede, nome, logo }) =>
              rede === "google" && googleOficial ? (
                <div key={rede} className="flex flex-col gap-1">
                  <BotaoGoogle
                    clientId={GOOGLE_CLIENT_ID}
                    aoEntrar={entrarComGoogle}
                    aoFalhar={() => setGoogleOficial(false)}
                  />
                  {abrindo === "google" && (
                    <p role="status" className="text-center text-body-sm text-ink-muted">
                      Entrando com o Google…
                    </p>
                  )}
                </div>
              ) : (
                <button
                  key={rede}
                  type="button"
                  onClick={() => entrarCom(rede)}
                  disabled={abrindo !== null || carregando}
                  className={classesBotaoRede}
                >
                  {logo && <Image src={logo} alt="" width={20} height={20} unoptimized className="size-5 shrink-0" />}
                  {abrindo === rede ? `Abrindo o ${nome}…` : `Continuar com o ${nome}`}
                </button>
              ),
            )}
          </div>
          <div className="flex items-center gap-3 text-body-sm text-ink-muted">
            <span className="h-px flex-1 bg-line" />
            {modo === "celular" ? "ou use seu celular" : "ou use seu e-mail"}
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
          <Botao type="submit" variante="primario" disabled={carregando || verificando} className="min-h-12">
            <Smartphone aria-hidden />
            {verificando ? "Confirmando que você não é um robô…" : carregando ? "Enviando…" : "Receber código"}
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
      ) : modo === "senha" ? (
        <form onSubmit={pedirEntrarComSenha} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email-senha" className="text-label">
              Seu e-mail
            </label>
            <input
              id="email-senha"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
              placeholder="voce@exemplo.com"
              className={classesEntrada}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="senha" className="text-label">
              Senha
            </label>
            <CampoSenha
              id="senha"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="current-password"
              required
            />
            <p className="text-body-sm text-ink-muted">
              A senha que você criou em Meu perfil. Ainda não tem? Entre pelo link no e-mail e crie lá.
            </p>
          </div>
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          {pediuSenhaNova && !erro && (
            <Aviso tipo="sucesso">
              Se houver uma conta com {email.trim()}, mandamos um link para criar uma senha nova. Abra neste mesmo
              navegador. Não chegou em alguns minutos? Veja a caixa de spam.
            </Aviso>
          )}
          <Botao type="submit" variante="primario" disabled={carregando || verificando} className="min-h-12">
            <KeyRound aria-hidden />
            {verificando ? "Confirmando que você não é um robô…" : carregando ? "Entrando…" : "Entrar"}
          </Botao>
          <button
            type="button"
            onClick={esqueciASenha}
            disabled={carregando || verificando}
            className="min-h-11 text-label text-terra-text underline disabled:opacity-60"
          >
            Esqueci a senha
          </button>
          <button
            type="button"
            onClick={() => {
              setModo("email");
              setSenha("");
              setErro(null);
              setPediuSenhaNova(false);
            }}
            className="min-h-11 text-label text-terra-text underline"
          >
            Receber o link no e-mail
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
            <p className="text-body-sm text-ink-muted">Mandamos um link para este e-mail. É só abrir para entrar.</p>
          </div>
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          <Botao type="submit" variante="primario" disabled={carregando || verificando} className="min-h-12">
            <Mail aria-hidden />
            {verificando ? "Confirmando que você não é um robô…" : carregando ? "Enviando…" : "Receber link de acesso"}
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
          <button
            type="button"
            onClick={() => {
              setModo("senha");
              setErro(null);
            }}
            className="min-h-11 text-label text-terra-text underline"
          >
            Entrar com senha
          </button>
        </form>
      )}
      {verificacao}
    </div>
  );
}
