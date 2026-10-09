"use client";

import { Check, FileText, Info, Plus, Trash2, Upload, X } from "lucide-react";
import Link from "next/link";
import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { apagarCurriculo, salvarCurriculo } from "@/lib/acoes/curriculo";
import {
  CNHS,
  DISPONIBILIDADES,
  ESCOLARIDADES,
  ESCOLARIDADES_COM_CURSO,
  MAX_CURSOS,
  MAX_EXPERIENCIAS,
  MAX_PDF_MB,
} from "@/lib/constantes";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import type { Curriculo, EstadoForm } from "@/lib/tipos";
import { Aviso } from "./ui/basicos";
import { Botao } from "./ui/botao";
import { classesEntrada, MensagemErro, Seletor } from "./ui/campo";

const ESTADO_INICIAL: EstadoForm = { ok: false };

type ItemExperiencia = {
  chave: string;
  cargo: string;
  onde: string;
  inicio: string;
  fim: string;
  atual: boolean;
  descricao: string;
};

function novaChave() {
  return Math.random().toString(36).slice(2);
}

const chip = (ativo: boolean) =>
  `inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-pill border px-3.5 text-label transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus ${
    ativo ? "border-ink bg-ink text-surface-100" : "border-line bg-surface-300 text-ink hover:border-line-strong"
  }`;

function Secao({ titulo, descricao, children }: { titulo: string; descricao?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-5 rounded-lg border border-line bg-surface-200 p-5 sm:p-6">
      <div>
        <h2 className="text-h3">{titulo}</h2>
        {descricao && <p className="mt-2 text-body-sm text-ink-muted">{descricao}</p>}
      </div>
      {children}
    </section>
  );
}

function Rotulo({ htmlFor, children, opcional }: { htmlFor: string; children: ReactNode; opcional?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="text-label">
      {children}
      {opcional && <span className="font-normal text-ink-muted"> (opcional)</span>}
    </label>
  );
}

export function FormCurriculo({
  inicial,
  usuarioId,
  linkPdf,
  proximo = "",
  hoje,
  demo = false,
}: {
  inicial: Curriculo | null;
  /** mês atual ("2026-10"), vindo do servidor: limite das datas */
  hoje: string;
  usuarioId: string;
  /** link temporário do PDF atual, para a pessoa conferir */
  linkPdf: string | null;
  /** para onde voltar depois de salvar (ex.: a vaga que pediu currículo) */
  proximo?: string;
  /** Modo demonstração: dá para ver o formulário, mas não envia nem salva. */
  demo?: boolean;
}) {
  const [estado, acao, enviando] = useActionState(salvarCurriculo, ESTADO_INICIAL);
  const [escolaridade, setEscolaridade] = useState(inicial?.escolaridade ?? "");
  const [experiencias, setExperiencias] = useState<ItemExperiencia[]>(() =>
    (inicial?.experiencias ?? []).map((e) => ({
      chave: novaChave(),
      cargo: e.cargo,
      onde: e.onde,
      inicio: e.inicio,
      fim: e.fim ?? "",
      atual: !e.fim,
      descricao: e.descricao,
    })),
  );
  const [cursos, setCursos] = useState<string[]>(inicial?.cursos ?? []);
  const [novoCurso, setNovoCurso] = useState("");
  const [arquivo, setArquivo] = useState<string | null>(inicial?.arquivo ?? null);
  const [nomePdf, setNomePdf] = useState<string | null>(null);
  const [enviandoPdf, setEnviandoPdf] = useState(false);
  const [erroPdf, setErroPdf] = useState<string | null>(null);
  const seletorPdf = useRef<HTMLInputElement>(null);
  const formulario = useRef<HTMLFormElement>(null);
  const erros = estado.erros ?? {};
  const pdfOriginal = arquivo !== null && arquivo === inicial?.arquivo;

  // Depois de um erro, leva a pessoa até o primeiro campo com problema
  useEffect(() => {
    if (!estado.erros) return;
    formulario.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [estado]);

  function mudarExperiencia(chave: string, mudancas: Partial<ItemExperiencia>) {
    setExperiencias((lista) => lista.map((e) => (e.chave === chave ? { ...e, ...mudancas } : e)));
  }

  function adicionarExperiencia() {
    if (experiencias.length >= MAX_EXPERIENCIAS) return;
    const chave = novaChave();
    setExperiencias((lista) => [
      ...lista,
      { chave, cargo: "", onde: "", inicio: "", fim: "", atual: false, descricao: "" },
    ]);
    setTimeout(() => document.getElementById(`exp-${chave}-cargo`)?.focus(), 50);
  }

  function adicionarCurso() {
    const c = novoCurso.replace(/\s+/g, " ").trim();
    if (c.length < 2 || cursos.length >= MAX_CURSOS) return;
    if (!cursos.some((x) => x.toLowerCase() === c.toLowerCase())) setCursos([...cursos, c.slice(0, 80)]);
    setNovoCurso("");
  }

  function teclaCurso(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      adicionarCurso();
    }
  }

  async function escolherPdf(e: ChangeEvent<HTMLInputElement>) {
    const pdf = e.target.files?.[0];
    e.target.value = "";
    if (!pdf) return;
    setErroPdf(null);
    if (pdf.type !== "application/pdf") return setErroPdf("Envie um arquivo PDF.");
    if (pdf.size > MAX_PDF_MB * 1024 * 1024) return setErroPdf(`O PDF pode ter no máximo ${MAX_PDF_MB} MB.`);
    if (demo) return setErroPdf("No modo demonstração o PDF não é enviado.");
    setEnviandoPdf(true);
    try {
      const caminho = `${usuarioId}/${Date.now()}.pdf`;
      const { error } = await criarClienteNavegador()
        .storage.from("curriculos")
        .upload(caminho, pdf, { contentType: "application/pdf", upsert: false });
      if (error) throw error;
      setArquivo(caminho);
      setNomePdf(pdf.name);
    } catch {
      setErroPdf("Não deu para enviar o PDF. Tente de novo.");
    }
    setEnviandoPdf(false);
  }

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    dados.set(
      "experiencias",
      JSON.stringify(
        experiencias.map((x) => ({
          cargo: x.cargo,
          onde: x.onde,
          inicio: x.inicio,
          fim: x.atual ? null : x.fim,
          atual: x.atual,
          descricao: x.descricao,
        })),
      ),
    );
    // o que ficou digitado e não foi adicionado também vale
    const pendente = novoCurso.replace(/\s+/g, " ").trim();
    dados.set("cursos", JSON.stringify(pendente.length >= 2 ? [...cursos, pendente] : cursos));
    dados.set("arquivo", arquivo ?? "");
    startTransition(() => acao(dados));
  }

  const comCurso = ESCOLARIDADES_COM_CURSO.includes(escolaridade);

  return (
    <form ref={formulario} onSubmit={enviar} noValidate className="flex flex-col gap-6">
      {proximo && <input type="hidden" name="next" value={proximo} />}

      <Secao titulo="Estudos">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Rotulo htmlFor="escolaridade">Até onde você estudou</Rotulo>
            <Seletor
              id="escolaridade"
              name="escolaridade"
              value={escolaridade}
              onChange={(e) => setEscolaridade(e.target.value)}
              aria-invalid={erros.escolaridade ? true : undefined}
              className={classesEntrada}
            >
              <option value="" disabled>
                Escolha…
              </option>
              {ESCOLARIDADES.map((e) => (
                <option key={e.valor} value={e.valor}>
                  {e.nome}
                </option>
              ))}
            </Seletor>
            {erros.escolaridade && <MensagemErro>{erros.escolaridade}</MensagemErro>}
          </div>
          {comCurso && (
            <div className="flex flex-col gap-1.5">
              <Rotulo htmlFor="curso" opcional>
                Qual curso
              </Rotulo>
              <input
                id="curso"
                name="curso"
                defaultValue={inicial?.curso ?? ""}
                maxLength={80}
                placeholder="Ex.: Administração, Técnico em Enfermagem"
                aria-invalid={erros.curso ? true : undefined}
                className={classesEntrada}
              />
              {erros.curso && <MensagemErro>{erros.curso}</MensagemErro>}
            </div>
          )}
        </div>
      </Secao>

      <Secao
        titulo="Onde você já trabalhou"
        descricao="Do mais recente para o mais antigo. Freelance e trabalho sem carteira também contam. Primeiro emprego? Pode deixar vazio e contar dos cursos."
      >
        {experiencias.map((x, i) => {
          const id = (c: string) => `exp-${x.chave}-${c}`;
          const erro = (c: string) => erros[`experiencias.${i}.${c}`];
          return (
            <fieldset key={x.chave} className="flex flex-col gap-4 rounded-md border border-line-strong p-4">
              <legend className="sr-only">Experiência {i + 1}</legend>
              <div className="flex items-center justify-between gap-3">
                <p aria-hidden className="text-label text-ink-muted">
                  Experiência {i + 1}
                </p>
                <Botao
                  tamanho="sm"
                  variante="fantasma"
                  onClick={() => setExperiencias((l) => l.filter((e) => e.chave !== x.chave))}
                  aria-label={`Tirar experiência ${i + 1}`}
                >
                  <Trash2 aria-hidden />
                  Tirar
                </Botao>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Rotulo htmlFor={id("cargo")}>Cargo ou função</Rotulo>
                  <input
                    id={id("cargo")}
                    value={x.cargo}
                    onChange={(e) => mudarExperiencia(x.chave, { cargo: e.target.value })}
                    maxLength={80}
                    placeholder="Ex.: Atendente, Auxiliar de cozinha"
                    aria-invalid={erro("cargo") ? true : undefined}
                    className={classesEntrada}
                  />
                  {erro("cargo") && <MensagemErro>{erro("cargo")}</MensagemErro>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Rotulo htmlFor={id("onde")} opcional>
                    Empresa ou lugar
                  </Rotulo>
                  <input
                    id={id("onde")}
                    value={x.onde}
                    onChange={(e) => mudarExperiencia(x.chave, { onde: e.target.value })}
                    maxLength={80}
                    placeholder="Ex.: Padaria do Centro, casa de família"
                    aria-invalid={erro("onde") ? true : undefined}
                    className={classesEntrada}
                  />
                  {erro("onde") && <MensagemErro>{erro("onde")}</MensagemErro>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Rotulo htmlFor={id("inicio")}>Entrou em</Rotulo>
                  <input
                    id={id("inicio")}
                    type="month"
                    value={x.inicio}
                    max={hoje}
                    onChange={(e) => mudarExperiencia(x.chave, { inicio: e.target.value })}
                    aria-invalid={erro("inicio") ? true : undefined}
                    className={classesEntrada}
                  />
                  {erro("inicio") && <MensagemErro>{erro("inicio")}</MensagemErro>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Rotulo htmlFor={x.atual ? id("atual") : id("fim")}>Saiu em</Rotulo>
                  {!x.atual && (
                    <input
                      id={id("fim")}
                      type="month"
                      value={x.fim}
                      min={x.inicio || undefined}
                      max={hoje}
                      onChange={(e) => mudarExperiencia(x.chave, { fim: e.target.value })}
                      aria-invalid={erro("fim") ? true : undefined}
                      className={classesEntrada}
                    />
                  )}
                  <label className="flex min-h-10 items-center gap-2 text-body-sm">
                    <input
                      id={id("atual")}
                      type="checkbox"
                      checked={x.atual}
                      onChange={(e) => mudarExperiencia(x.chave, { atual: e.target.checked })}
                      className="size-5 accent-[var(--pk-ink)]"
                    />
                    Trabalho aqui ainda
                  </label>
                  {erro("fim") && <MensagemErro>{erro("fim")}</MensagemErro>}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Rotulo htmlFor={id("descricao")} opcional>
                  O que você fazia
                </Rotulo>
                <textarea
                  id={id("descricao")}
                  value={x.descricao}
                  onChange={(e) => mudarExperiencia(x.chave, { descricao: e.target.value })}
                  maxLength={300}
                  rows={2}
                  placeholder="Ex.: Caixa, atendimento e reposição de estoque."
                  aria-invalid={erro("descricao") ? true : undefined}
                  className={classesEntrada}
                />
                {erro("descricao") && <MensagemErro>{erro("descricao")}</MensagemErro>}
              </div>
            </fieldset>
          );
        })}
        {experiencias.length < MAX_EXPERIENCIAS ? (
          <Botao onClick={adicionarExperiencia} className="self-start">
            <Plus aria-hidden />
            {experiencias.length ? "Pôr outra experiência" : "Pôr uma experiência"}
          </Botao>
        ) : (
          <p className="text-body-sm text-ink-muted">Você chegou a {MAX_EXPERIENCIAS} experiências.</p>
        )}
        {erros.experiencias && <MensagemErro>{erros.experiencias}</MensagemErro>}
      </Secao>

      <Secao
        titulo="Cursos e o que você sabe fazer"
        descricao="Cursos livres, NR, informática, idiomas, máquinas que sabe operar… Um de cada vez."
      >
        {cursos.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Seus cursos">
            {cursos.map((c) => (
              <li
                key={c}
                className="inline-flex min-h-10 items-center gap-1 rounded-pill bg-surface-300 pr-1 pl-3.5 text-label"
              >
                {c}
                <button
                  type="button"
                  onClick={() => setCursos(cursos.filter((x) => x !== c))}
                  aria-label={`Tirar ${c}`}
                  className="flex size-8 items-center justify-center rounded-pill hover:bg-surface-200"
                >
                  <X aria-hidden className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {cursos.length < MAX_CURSOS ? (
          <div className="flex gap-2">
            <label htmlFor="novo-curso" className="sr-only">
              Curso ou habilidade
            </label>
            <input
              id="novo-curso"
              value={novoCurso}
              onChange={(e) => setNovoCurso(e.target.value)}
              onKeyDown={teclaCurso}
              maxLength={80}
              placeholder="Ex.: Excel básico, NR-35, Inglês intermediário"
              aria-invalid={erros.cursos ? true : undefined}
              className={classesEntrada}
            />
            <Botao onClick={adicionarCurso} disabled={novoCurso.trim().length < 2} className="shrink-0">
              <Plus aria-hidden />
              Pôr
            </Botao>
          </div>
        ) : (
          <p className="text-body-sm text-ink-muted">Você chegou a {MAX_CURSOS} cursos.</p>
        )}
        {erros.cursos && <MensagemErro>{erros.cursos}</MensagemErro>}
      </Secao>

      <Secao titulo="Habilitação e horários">
        <div className="flex flex-col gap-1.5 sm:max-w-xs">
          <Rotulo htmlFor="cnh">Carteira de motorista (CNH)</Rotulo>
          <Seletor id="cnh" name="cnh" defaultValue={inicial?.cnh ?? ""} className={classesEntrada}>
            <option value="">Não tenho</option>
            {CNHS.map((c) => (
              <option key={c} value={c}>
                Categoria {c}
              </option>
            ))}
          </Seletor>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-label">
            Quando você pode trabalhar <span className="font-normal text-ink-muted">(marque quantos quiser)</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {DISPONIBILIDADES.map((d) => (
              <Disponibilidade key={d.valor} valor={d.valor} nome={d.nome} inicial={inicial?.disponibilidade ?? []} />
            ))}
          </div>
        </fieldset>
      </Secao>

      <Secao
        titulo="Currículo em PDF"
        descricao="Se você já tem um currículo pronto, pode anexar. Não é obrigatório: o que você preencheu acima já vale."
      >
        {arquivo ? (
          <div className="flex flex-wrap items-center gap-3 rounded-md bg-surface-300 p-3">
            <FileText aria-hidden className="size-6 shrink-0 text-ink-muted" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-label">{nomePdf ?? "Seu currículo.pdf"}</p>
              {pdfOriginal && linkPdf ? (
                <a href={linkPdf} target="_blank" rel="noopener noreferrer" className="text-body-sm underline">
                  Abrir para conferir
                </a>
              ) : (
                <p className="text-body-sm text-ink-muted">{pdfOriginal ? "Anexado" : "Enviado. Falta salvar."}</p>
              )}
            </div>
            <Botao tamanho="sm" variante="fantasma" onClick={() => setArquivo(null)}>
              <Trash2 aria-hidden />
              Tirar
            </Botao>
          </div>
        ) : (
          <div>
            <input
              ref={seletorPdf}
              type="file"
              accept="application/pdf"
              onChange={escolherPdf}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
            />
            <Botao onClick={() => seletorPdf.current?.click()} disabled={enviandoPdf}>
              <Upload aria-hidden />
              {enviandoPdf ? "Enviando…" : "Anexar PDF"}
            </Botao>
            <p className="mt-2 text-body-sm text-ink-muted">Até {MAX_PDF_MB} MB.</p>
          </div>
        )}
        {(erroPdf || erros.arquivo) && <MensagemErro>{erroPdf ?? erros.arquivo}</MensagemErro>}
        <Aviso tipo="info">
          O PDF vai do jeito que está. Se tiver seu telefone, e-mail ou endereço, quem anunciou a vaga vai ver esses
          dados quando você curtir.
        </Aviso>
      </Secao>

      <div className="flex gap-3 rounded-md bg-surface-300 p-4 text-body-sm">
        <Info aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" />
        <p>
          <strong className="text-label">Quem vê seu currículo:</strong> só quem anunciou uma vaga que você curtiu,
          enquanto a curtida existir. Ele não aparece no seu perfil público nem na busca.
        </p>
      </div>

      {estado.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Botao type="submit" variante="primario" disabled={enviando || enviandoPdf} className="sm:min-w-56">
          {enviando ? "Salvando…" : "Salvar currículo"}
        </Botao>
        <p className="text-body-sm text-ink-muted">
          Sem telefone, e-mail ou link no texto: o contato aparece sozinho no match.{" "}
          <Link href="/privacidade#curriculo" className="underline">
            Como cuidamos do currículo
          </Link>
          .
        </p>
      </div>
    </form>
  );
}

/** Chip de disponibilidade (checkbox de verdade, para ir no formulário). */
function Disponibilidade({ valor, nome, inicial }: { valor: string; nome: string; inicial: readonly string[] }) {
  const [marcado, setMarcado] = useState(inicial.includes(valor));
  return (
    <label className={chip(marcado)}>
      <input
        type="checkbox"
        name="disponibilidade"
        value={valor}
        checked={marcado}
        onChange={(e) => setMarcado(e.target.checked)}
        className="sr-only"
      />
      {marcado && <Check aria-hidden className="size-4" />}
      {nome}
    </label>
  );
}

export function ApagarCurriculo() {
  const [estado, acao, enviando] = useActionState(apagarCurriculo, ESTADO_INICIAL);
  return (
    <details className="mt-10 rounded-lg border border-line bg-surface-200 p-5">
      <summary className="cursor-pointer text-label text-ink-muted">Apagar meu currículo</summary>
      <form action={acao} className="mt-4 flex flex-col gap-4">
        <p className="text-body-sm">
          Apaga o que você preencheu e o PDF. Quem anunciou vagas que você curtiu deixa de ver. Dá para preencher de
          novo quando quiser.
        </p>
        <label className="flex items-start gap-3 text-body-sm">
          <input type="checkbox" name="confirmar" className="mt-0.5 size-5 accent-[var(--pk-danger)]" />
          Entendi e quero apagar meu currículo.
        </label>
        {estado.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}
        <Botao type="submit" variante="perigo" disabled={enviando} className="self-start">
          {enviando ? "Apagando…" : "Apagar currículo"}
        </Botao>
      </form>
    </details>
  );
}
