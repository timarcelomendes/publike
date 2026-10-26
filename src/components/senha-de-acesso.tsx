"use client";

import { KeyRound } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import { Aviso } from "./ui/basicos";
import { Botao } from "./ui/botao";
import { Campo, classesEntrada } from "./ui/campo";

/** A senha é opcional: pelo menos 8 caracteres (o Supabase pode pedir mais e avisa). */
const MINIMO = 8;

type ErroAuth = { code?: string; message?: string; status?: number } | null;

function traduzir(erro: ErroAuth) {
  const codigo = erro?.code ?? "";
  const msg = (erro?.message ?? "").toLowerCase();
  if (codigo === "weak_password" || msg.includes("password should")) {
    return `Senha fraca. Use pelo menos ${MINIMO} caracteres, misturando letras e números.`;
  }
  if (codigo === "same_password" || msg.includes("different from the old")) return "Essa já é a sua senha.";
  if (codigo === "reauthentication_needed" || msg.includes("reauthentic")) {
    return "Por segurança, saia e use o “Esqueci a senha” na tela de entrar: o link no e-mail deixa você criar a senha.";
  }
  if (erro?.status === 429 || msg.includes("rate limit")) return "Muitas tentativas seguidas. Espere um minuto.";
  if (codigo === "session_not_found" || msg.includes("session")) return "Sua sessão acabou. Entre de novo e tente.";
  return "Não deu para salvar a senha agora. Tente de novo em instantes.";
}

/**
 * Senha de acesso (opcional): quem prefere e-mail e senha cria aqui e passa a ter o "Entrar com senha"
 * no /entrar. O link no e-mail, o Google e o LinkedIn continuam valendo. Só para conta com e-mail de
 * login. `tem_senha` no user_metadata só decide o texto ("Criar" ou "Trocar").
 */
export function SenhaDeAcesso({
  email,
  temSenha,
  destaque = false,
}: {
  email: string | null;
  temSenha: boolean;
  /** veio do "Esqueci a senha": a página é só isto */
  destaque?: boolean;
}) {
  const supabase = useMemo(() => criarClienteNavegador(), []);
  const [senha, setSenha] = useState("");
  const [repetir, setRepetir] = useState("");
  const [erros, setErros] = useState<{ senha?: string; repetir?: string }>({});
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salva, setSalva] = useState(false);
  const [jaTem, setJaTem] = useState(temSenha);

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    setSalva(false);
    const novos: typeof erros = {};
    if (senha.length < MINIMO) novos.senha = `Use pelo menos ${MINIMO} caracteres.`;
    else if (repetir !== senha) novos.repetir = "As duas senhas não são iguais.";
    setErros(novos);
    if (Object.keys(novos).length) return;
    setSalvando(true);
    let error: ErroAuth = null;
    try {
      ({ error } = await supabase.auth.updateUser({ password: senha, data: { tem_senha: true } }));
    } catch {
      error = { message: "rede" };
    }
    setSalvando(false);
    if (error) {
      setErro(error.message === "rede" ? "Sem conexão agora. Confira sua internet e tente de novo." : traduzir(error));
      return;
    }
    setSenha("");
    setRepetir("");
    setSalva(true);
    setJaTem(true);
  }

  return (
    <section
      id="senha-acesso"
      aria-labelledby="senha-titulo"
      className="mt-8 flex scroll-mt-24 flex-col gap-4 rounded-lg border border-line bg-surface-200 p-5 shadow-card"
    >
      <div className="flex items-start gap-3">
        <KeyRound aria-hidden className="mt-0.5 size-6 shrink-0 text-terra-text" />
        <div className="min-w-0">
          <h2 id="senha-titulo" className="text-h3">
            {destaque ? "Crie a sua senha nova" : "Senha de acesso"}
          </h2>
          <p className="mt-1 text-body-sm text-ink-muted">
            {email ? (
              <>
                Opcional. Com uma senha, você entra com <strong className="break-all text-ink">{email}</strong> e a
                senha, em “Entrar com senha”. O link no e-mail continua valendo.
              </>
            ) : (
              "Para ter senha, primeiro ponha um e-mail de login (logo acima)."
            )}
          </p>
        </div>
      </div>

      {salva && (
        <Aviso tipo="sucesso" titulo="Senha salva.">
          Da próxima vez, toque em “Entrar com senha” na tela de entrar.
          {destaque && (
            <>
              {" "}
              <Link href="/" className="underline">
                Ir para o início
              </Link>
            </>
          )}
        </Aviso>
      )}

      {email && (
        <form onSubmit={salvar} noValidate className="flex flex-col gap-3">
          {/* para o gerenciador de senhas do navegador saber de qual conta é a senha */}
          <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
          <Campo
            rotulo={jaTem ? "Senha nova" : "Senha"}
            nome="senha-nova"
            erro={erros.senha}
            ajuda={`Pelo menos ${MINIMO} caracteres.`}
          >
            <input
              id="senha-nova"
              name="senha-nova"
              type="password"
              autoComplete="new-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              aria-invalid={Boolean(erros.senha)}
              className={classesEntrada}
            />
          </Campo>
          <Campo rotulo="Repita a senha" nome="senha-repetir" erro={erros.repetir}>
            <input
              id="senha-repetir"
              name="senha-repetir"
              type="password"
              autoComplete="new-password"
              value={repetir}
              onChange={(e) => setRepetir(e.target.value)}
              aria-invalid={Boolean(erros.repetir)}
              className={classesEntrada}
            />
          </Campo>
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          <Botao type="submit" disabled={salvando} className="self-start">
            {salvando ? "Salvando…" : jaTem ? "Trocar senha" : "Criar senha"}
          </Botao>
        </form>
      )}
    </section>
  );
}
