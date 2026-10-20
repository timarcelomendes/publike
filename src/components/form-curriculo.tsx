"use client";

import {
  Camera,
  Check,
  FileText,
  FileUp,
  Info,
  LoaderCircle,
  Plus,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
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
import { apagarCurriculo, lerCurriculoEnviado, salvarCurriculo, type LeituraDoArquivo } from "@/lib/acoes/curriculo";
import {
  CNHS,
  DISPONIBILIDADES,
  ESCOLARIDADES,
  ESCOLARIDADES_COM_CURSO,
  MAX_CURSOS,
  MAX_ESTUDOS,
  MAX_EXPERIENCIAS,
  MAX_PDF_MB,
} from "@/lib/constantes";
import {
  enviarPdf,
  ErroDaLeitura,
  fotosParaLeitura,
  MAX_FOTOS_CURRICULO,
  resumoDaLeitura,
} from "@/lib/arquivo-curriculo";
import { NIVEIS_DE_OUTRO_ESTUDO } from "@/lib/estudos";
import { HABILIDADES_SUGERIDAS, MAX_HABILIDADES } from "@/lib/talentos";
import type { Curriculo, EstadoForm } from "@/lib/tipos";
import { Aviso } from "./ui/basicos";
import { Botao } from "./ui/botao";
import { classesEntrada, MensagemErro, Seletor } from "./ui/campo";

const ESTADO_INICIAL: EstadoForm = { ok: false };

/** Um estudo a mais (além do mais alto), com a chave da linha no formulário. */
type ItemEstudo = { chave: string; nivel: string; curso: string };

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

type CurriculoLido = Extract<LeituraDoArquivo, { ok: true }>["curriculo"];

/** O que o formulário tinha antes da leitura do currículo pronto (para o "Desfazer"). */
type Retrato = {
  titulo: string;
  habilidades: string[];
  escolaridade: string;
  curso: string;
  estudos: ItemEstudo[];
  experiencias: ItemExperiencia[];
  cursos: string[];
  cnh: string;
  disponibilidade: string[];
  arquivo: string | null;
  nomePdf: string | null;
};

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

type Situacao =
  | { tipo: "parado" }
  | { tipo: "lendo" }
  | { tipo: "pronto"; texto: string; semData: number; comPdf: boolean }
  | { tipo: "erro"; texto: string };

/**
 * "Já tem currículo pronto?": a pessoa manda o PDF (que fica anexado) ou até 3 fotos da folha
 * (que não ficam guardadas), a IA lê e o formulário vem preenchido. Nada é salvo até ela salvar.
 */
function LerCurriculoPronto({
  usuarioId,
  compacto,
  rotuloSalvar,
  aoLer,
  aoDesfazer,
  aoMudarLendo,
}: {
  usuarioId: string;
  /** a pessoa já tem currículo salvo: o convite é para trocar pelo mais novo */
  compacto: boolean;
  /** o texto do botão de salvar, para o aviso dizer onde tocar */
  rotuloSalvar: string;
  aoLer: (lido: CurriculoLido, pdf: { caminho: string; nome: string } | null) => void;
  aoDesfazer: (() => void) | null;
  aoMudarLendo: (lendo: boolean) => void;
}) {
  const [situacao, setSituacao] = useState<Situacao>({ tipo: "parado" });
  const seletorPdf = useRef<HTMLInputElement>(null);
  const seletorFoto = useRef<HTMLInputElement>(null);
  const aviso = useRef<HTMLDivElement>(null);

  // o resultado aparece na tela (a pessoa pode ter rolado a página enquanto lia)
  useEffect(() => {
    if (situacao.tipo === "pronto" || situacao.tipo === "erro") aviso.current?.focus();
  }, [situacao]);

  async function ler(montar: () => Promise<{ dados: FormData; pdf: { caminho: string; nome: string } | null }>) {
    setSituacao({ tipo: "lendo" });
    aoMudarLendo(true);
    let resultado: LeituraDoArquivo;
    let pdf: { caminho: string; nome: string } | null = null;
    try {
      const pedido = await montar();
      pdf = pedido.pdf;
      resultado = await lerCurriculoEnviado(pedido.dados);
    } catch (e) {
      resultado = {
        ok: false,
        erro: e instanceof ErroDaLeitura ? e.message : "Não deu para enviar o arquivo. Tente de novo.",
      };
    }
    aoMudarLendo(false);
    if (!resultado.ok) return setSituacao({ tipo: "erro", texto: resultado.erro });
    aoLer(resultado.curriculo, pdf);
    setSituacao({
      tipo: "pronto",
      texto: resumoDaLeitura(resultado.curriculo),
      semData: resultado.curriculo.experiencias.filter((x) => !x.inicio || (!x.atual && !x.fim)).length,
      comPdf: pdf !== null,
    });
  }

  function escolherPdf(e: ChangeEvent<HTMLInputElement>) {
    const pdf = e.target.files?.[0];
    e.target.value = "";
    if (!pdf) return;
    if (pdf.type !== "application/pdf") return setSituacao({ tipo: "erro", texto: "Envie um arquivo PDF." });
    if (pdf.size > MAX_PDF_MB * 1024 * 1024) {
      return setSituacao({ tipo: "erro", texto: `O PDF pode ter no máximo ${MAX_PDF_MB} MB.` });
    }
    void ler(async () => {
      const caminho = await enviarPdf(pdf, usuarioId);
      const dados = new FormData();
      dados.set("pdf", caminho);
      return { dados, pdf: { caminho, nome: pdf.name } };
    });
  }

  function escolherFotos(e: ChangeEvent<HTMLInputElement>) {
    const fotos = [...(e.target.files ?? [])];
    e.target.value = "";
    if (!fotos.length) return;
    if (fotos.length > MAX_FOTOS_CURRICULO) {
      return setSituacao({ tipo: "erro", texto: `Escolha no máximo ${MAX_FOTOS_CURRICULO} fotos, uma por página.` });
    }
    if (fotos.some((f) => !f.type.startsWith("image/"))) {
      return setSituacao({ tipo: "erro", texto: "Escolha fotos (JPG ou PNG). Para PDF, use “Enviar PDF”." });
    }
    void ler(async () => {
      const menores = await fotosParaLeitura(fotos);
      const dados = new FormData();
      menores.forEach((b, i) => dados.append("foto", b, `pagina-${i + 1}.jpg`));
      return { dados, pdf: null };
    });
  }

  const lendo = situacao.tipo === "lendo";
  return (
    <section
      aria-labelledby="ler-curriculo"
      className="flex flex-col gap-4 rounded-lg border-2 border-dashed border-line-strong bg-surface-200 p-5 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-terra-soft text-terra-text">
          <Sparkles aria-hidden className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 id="ler-curriculo" className="text-h3">
            {compacto ? "Tem um currículo mais novo?" : "Já tem currículo pronto?"}
          </h2>
          <p className="mt-1 text-body-sm text-ink-muted">
            {compacto
              ? "Envie o PDF ou a foto: o Publike lê e troca os campos aqui embaixo. Nada muda até você salvar."
              : "Envie o PDF ou tire uma foto da folha. O Publike lê e preenche os campos para você. Depois é só conferir e salvar."}
          </p>
        </div>
      </div>

      <div ref={aviso} tabIndex={-1} className="outline-none empty:hidden">
        {lendo && (
          <p role="status" className="flex items-center gap-2 text-label">
            <LoaderCircle aria-hidden className="size-5 shrink-0 motion-safe:animate-spin" />
            Lendo seu currículo… pode levar até um minuto.
          </p>
        )}
        {situacao.tipo === "pronto" && (
          <Aviso tipo="sucesso" titulo="Pronto! Confira os campos aqui embaixo.">
            <p>
              Preenchemos {situacao.texto}. Confira tudo e toque em “{rotuloSalvar}”, no fim da página.
            </p>
            {situacao.semData > 0 && (
              <p>
                Complete as datas que faltam em{" "}
                {situacao.semData === 1 ? "uma experiência" : plural(situacao.semData, "experiência", "experiências")}.
              </p>
            )}
            {situacao.comPdf && <p>O PDF também ficou anexado ao currículo.</p>}
          </Aviso>
        )}
        {situacao.tipo === "erro" && <Aviso tipo="erro">{situacao.texto}</Aviso>}
      </div>

      <input
        ref={seletorPdf}
        type="file"
        accept="application/pdf"
        onChange={escolherPdf}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
      />
      <input
        ref={seletorFoto}
        type="file"
        accept="image/*"
        multiple
        onChange={escolherFotos}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
      />
      {!lendo && (
        // no celular, um botão por linha, na largura toda
        <div className="grid gap-2 sm:flex sm:flex-wrap">
          <Botao onClick={() => seletorPdf.current?.click()}>
            <FileUp aria-hidden />
            {situacao.tipo === "pronto" ? "Enviar outro PDF" : "Enviar PDF"}
          </Botao>
          <Botao onClick={() => seletorFoto.current?.click()}>
            <Camera aria-hidden />
            Foto do currículo
          </Botao>
          {situacao.tipo === "pronto" && aoDesfazer && (
            <Botao
              variante="fantasma"
              onClick={() => {
                aoDesfazer();
                setSituacao({ tipo: "parado" });
              }}
            >
              <Undo2 aria-hidden />
              Desfazer
            </Botao>
          )}
        </div>
      )}
      {(situacao.tipo === "parado" || situacao.tipo === "erro") && (
        <p className="text-body-sm text-ink-muted">
          PDF de até {MAX_PDF_MB} MB ou até {MAX_FOTOS_CURRICULO} fotos, uma por página. Telefone, e-mail e endereço não
          entram nos campos.
        </p>
      )}
    </section>
  );
}

export function FormCurriculo({
  inicial,
  usuarioId,
  linkPdf,
  proximo = "",
  hoje,
  demo = false,
  rotuloSalvar = "Salvar currículo",
  lerArquivo = false,
  lido = null,
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
  /** o texto do botão (ex.: "Salvar e mandar", quando uma vaga já aceitou e espera o currículo) */
  rotuloSalvar?: string;
  /** "Já tem currículo pronto?": a IA lê o PDF ou a foto e preenche (com a ajuda da IA ligada) */
  lerArquivo?: boolean;
  /** sem currículo salvo: o formulário começa com o que já foi lido (o convite de quem publicou a vaga) */
  lido?: CurriculoLido | null;
}) {
  const [estado, acao, enviando] = useActionState(salvarCurriculo, ESTADO_INICIAL);
  const semente = inicial ? null : lido;
  const [titulo, setTitulo] = useState(inicial?.titulo ?? semente?.titulo ?? "");
  const [escolaridade, setEscolaridade] = useState(inicial?.escolaridade ?? semente?.escolaridade ?? "");
  const [curso, setCurso] = useState(inicial?.curso ?? semente?.curso ?? "");
  const [estudos, setEstudos] = useState<ItemEstudo[]>(() =>
    (inicial?.estudos ?? semente?.estudos ?? []).map((e) => ({ chave: novaChave(), nivel: e.nivel, curso: e.curso })),
  );
  const [cnh, setCnh] = useState(inicial?.cnh ?? semente?.cnh ?? "");
  const [disponibilidade, setDisponibilidade] = useState<string[]>(
    inicial?.disponibilidade ?? semente?.disponibilidade ?? [],
  );
  const [experiencias, setExperiencias] = useState<ItemExperiencia[]>(() =>
    semente
      ? semente.experiencias.map((x) => ({ chave: novaChave(), ...x }))
      : (inicial?.experiencias ?? []).map((e) => ({
          chave: novaChave(),
          cargo: e.cargo,
          onde: e.onde,
          inicio: e.inicio,
          fim: e.fim ?? "",
          atual: !e.fim,
          descricao: e.descricao,
        })),
  );
  const [cursos, setCursos] = useState<string[]>(inicial?.cursos ?? semente?.cursos ?? []);
  const [novoCurso, setNovoCurso] = useState("");
  const [habilidades, setHabilidades] = useState<string[]>(inicial?.habilidades ?? semente?.habilidades ?? []);
  const [novaHabilidade, setNovaHabilidade] = useState("");
  const [arquivo, setArquivo] = useState<string | null>(inicial?.arquivo ?? null);
  const [nomePdf, setNomePdf] = useState<string | null>(null);
  const [enviandoPdf, setEnviandoPdf] = useState(false);
  const [erroPdf, setErroPdf] = useState<string | null>(null);
  // a leitura do currículo pronto: enquanto lê, não dá para salvar; "Desfazer" volta ao que era
  const [lendo, setLendo] = useState(false);
  const [antesDaLeitura, setAntesDaLeitura] = useState<Retrato | null>(null);
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

  function adicionarHabilidade(texto: string) {
    const h = texto.replace(/\s+/g, " ").trim().slice(0, 40);
    if (h.length < 2 || habilidades.length >= MAX_HABILIDADES) return;
    if (!habilidades.some((x) => x.toLowerCase() === h.toLowerCase())) setHabilidades([...habilidades, h]);
    setNovaHabilidade("");
  }

  function teclaHabilidade(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      adicionarHabilidade(novaHabilidade);
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
      setArquivo(await enviarPdf(pdf, usuarioId));
      setNomePdf(pdf.name);
    } catch {
      setErroPdf("Não deu para enviar o PDF. Tente de novo.");
    }
    setEnviandoPdf(false);
  }

  function mudarEstudo(chave: string, mudancas: Partial<ItemEstudo>) {
    setEstudos((lista) => lista.map((e) => (e.chave === chave ? { ...e, ...mudancas } : e)));
  }

  function adicionarEstudo() {
    if (estudos.length >= MAX_ESTUDOS) return;
    const chave = novaChave();
    setEstudos((lista) => [...lista, { chave, nivel: "", curso: "" }]);
    setTimeout(() => document.getElementById(`estudo-${chave}-nivel`)?.focus(), 50);
  }

  /** Põe no formulário o que a IA leu (o que ela não achou fica como estava). Nada é salvo ainda. */
  function aplicarLeitura(lido: CurriculoLido, pdf: { caminho: string; nome: string } | null) {
    setAntesDaLeitura({
      titulo,
      habilidades,
      escolaridade,
      curso,
      estudos,
      experiencias,
      cursos,
      cnh,
      disponibilidade,
      arquivo,
      nomePdf,
    });
    if (lido.titulo) setTitulo(lido.titulo);
    if (lido.habilidades.length) setHabilidades(lido.habilidades);
    if (lido.escolaridade) setEscolaridade(lido.escolaridade);
    if (lido.curso) setCurso(lido.curso);
    if (lido.estudos.length) setEstudos(lido.estudos.map((e) => ({ chave: novaChave(), ...e })));
    if (lido.experiencias.length) setExperiencias(lido.experiencias.map((x) => ({ chave: novaChave(), ...x })));
    if (lido.cursos.length) setCursos(lido.cursos);
    if (lido.cnh) setCnh(lido.cnh);
    if (lido.disponibilidade.length) setDisponibilidade(lido.disponibilidade);
    if (pdf) {
      setArquivo(pdf.caminho);
      setNomePdf(pdf.nome);
      setErroPdf(null);
    }
    setNovaHabilidade("");
    setNovoCurso("");
  }

  function desfazerLeitura() {
    const r = antesDaLeitura;
    if (!r) return;
    setTitulo(r.titulo);
    setHabilidades(r.habilidades);
    setEscolaridade(r.escolaridade);
    setCurso(r.curso);
    setEstudos(r.estudos);
    setExperiencias(r.experiencias);
    setCursos(r.cursos);
    setCnh(r.cnh);
    setDisponibilidade(r.disponibilidade);
    setArquivo(r.arquivo);
    setNomePdf(r.nomePdf);
    setAntesDaLeitura(null);
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
    dados.set("estudos", JSON.stringify(estudos.map(({ nivel, curso }) => ({ nivel, curso }))));
    const habilidadePendente = novaHabilidade.replace(/\s+/g, " ").trim();
    dados.set(
      "habilidades",
      JSON.stringify(
        habilidadePendente.length >= 2 && habilidades.length < MAX_HABILIDADES
          ? [...habilidades, habilidadePendente]
          : habilidades,
      ),
    );
    dados.set("arquivo", arquivo ?? "");
    startTransition(() => acao(dados));
  }

  const comCurso = ESCOLARIDADES_COM_CURSO.includes(escolaridade);

  return (
    <form ref={formulario} onSubmit={enviar} noValidate className="flex flex-col gap-6">
      {proximo && <input type="hidden" name="next" value={proximo} />}

      {lerArquivo && !demo && (
        <LerCurriculoPronto
          usuarioId={usuarioId}
          compacto={inicial !== null}
          rotuloSalvar={rotuloSalvar}
          aoLer={aplicarLeitura}
          aoDesfazer={antesDaLeitura ? desfazerLeitura : null}
          aoMudarLendo={setLendo}
        />
      )}

      <Secao
        titulo="O que você faz"
        descricao="É o que as empresas veem primeiro. Diga sua profissão (ou o trabalho que procura) e o que você sabe fazer bem."
      >
        <div className="flex flex-col gap-1.5">
          <Rotulo htmlFor="titulo" opcional>
            Sua profissão ou o trabalho que procura
          </Rotulo>
          <input
            id="titulo"
            name="titulo"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            maxLength={60}
            placeholder="Ex.: Auxiliar de cozinha, Motorista, Vendedora"
            aria-invalid={erros.titulo ? true : undefined}
            className={classesEntrada}
          />
          {erros.titulo && <MensagemErro>{erros.titulo}</MensagemErro>}
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-label" id="habilidades-titulo">
            Habilidades e conhecimentos <span className="font-normal text-ink-muted">(opcional)</span>
          </p>
          {habilidades.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Suas habilidades">
              {habilidades.map((h) => (
                <li
                  key={h}
                  className="inline-flex min-h-10 items-center gap-1 rounded-pill bg-surface-300 pr-1 pl-3.5 text-label"
                >
                  {h}
                  <button
                    type="button"
                    onClick={() => setHabilidades(habilidades.filter((x) => x !== h))}
                    aria-label={`Tirar ${h}`}
                    className="flex size-8 items-center justify-center rounded-pill hover:bg-surface-200"
                  >
                    <X aria-hidden className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {habilidades.length < MAX_HABILIDADES ? (
            <>
              <div className="flex gap-2">
                <label htmlFor="nova-habilidade" className="sr-only">
                  Habilidade ou conhecimento
                </label>
                <input
                  id="nova-habilidade"
                  value={novaHabilidade}
                  onChange={(e) => setNovaHabilidade(e.target.value)}
                  onKeyDown={teclaHabilidade}
                  maxLength={40}
                  placeholder="Ex.: Atendimento ao cliente, Empilhadeira"
                  aria-invalid={erros.habilidades ? true : undefined}
                  aria-describedby="habilidades-titulo"
                  className={classesEntrada}
                />
                <Botao
                  onClick={() => adicionarHabilidade(novaHabilidade)}
                  disabled={novaHabilidade.trim().length < 2}
                  className="shrink-0"
                >
                  <Plus aria-hidden />
                  Pôr
                </Botao>
              </div>
              <div className="flex flex-col gap-1.5">
                <p className="text-body-sm text-ink-muted">Ou toque para pôr:</p>
                <ul className="flex flex-wrap gap-2" aria-label="Sugestões de habilidades">
                  {HABILIDADES_SUGERIDAS.filter(
                    (s) => !habilidades.some((h) => h.toLowerCase() === s.toLowerCase()),
                  ).map((s) => (
                    <li key={s}>
                      <button
                        type="button"
                        onClick={() => adicionarHabilidade(s)}
                        className="inline-flex min-h-10 items-center gap-1 rounded-pill border border-line bg-surface-200 px-3.5 text-label transition-colors hover:border-line-strong"
                      >
                        <Plus aria-hidden className="size-4 text-ink-muted" />
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <p className="text-body-sm text-ink-muted">Você chegou a {MAX_HABILIDADES} habilidades.</p>
          )}
          {erros.habilidades && <MensagemErro>{erros.habilidades}</MensagemErro>}
        </div>
      </Secao>

      <Secao
        titulo="Estudos"
        descricao="Primeiro o mais alto. Fez mais de um técnico, faculdade ou pós? Ponha os outros embaixo."
      >
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
                value={curso}
                onChange={(e) => setCurso(e.target.value)}
                maxLength={80}
                placeholder="Ex.: Administração, Técnico em Enfermagem"
                aria-invalid={erros.curso ? true : undefined}
                className={classesEntrada}
              />
              {erros.curso && <MensagemErro>{erros.curso}</MensagemErro>}
            </div>
          )}
        </div>
        {estudos.map((x, i) => {
          const id = (c: string) => `estudo-${x.chave}-${c}`;
          const erro = (c: string) => erros[`estudos.${i}.${c}`];
          return (
            <fieldset key={x.chave} className="flex flex-col gap-4 rounded-md border border-line-strong p-4">
              <legend className="sr-only">Outro estudo {i + 1}</legend>
              <div className="flex items-center justify-between gap-3">
                <p aria-hidden className="text-label text-ink-muted">
                  Outro estudo
                </p>
                <Botao
                  tamanho="sm"
                  variante="fantasma"
                  onClick={() => setEstudos((l) => l.filter((e) => e.chave !== x.chave))}
                  aria-label={`Tirar outro estudo ${i + 1}`}
                >
                  <Trash2 aria-hidden />
                  Tirar
                </Botao>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Rotulo htmlFor={id("nivel")}>Nível</Rotulo>
                  <Seletor
                    id={id("nivel")}
                    value={x.nivel}
                    onChange={(e) => mudarEstudo(x.chave, { nivel: e.target.value })}
                    aria-invalid={erro("nivel") ? true : undefined}
                    className={classesEntrada}
                  >
                    <option value="" disabled>
                      Escolha…
                    </option>
                    {NIVEIS_DE_OUTRO_ESTUDO.map((e) => (
                      <option key={e.valor} value={e.valor}>
                        {e.nome}
                      </option>
                    ))}
                  </Seletor>
                  {erro("nivel") && <MensagemErro>{erro("nivel")}</MensagemErro>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Rotulo htmlFor={id("curso")}>Qual curso</Rotulo>
                  <input
                    id={id("curso")}
                    value={x.curso}
                    onChange={(e) => mudarEstudo(x.chave, { curso: e.target.value })}
                    maxLength={80}
                    placeholder="Ex.: Técnico em Enfermagem, Pedagogia"
                    aria-invalid={erro("curso") ? true : undefined}
                    className={classesEntrada}
                  />
                  {erro("curso") && <MensagemErro>{erro("curso")}</MensagemErro>}
                </div>
              </div>
            </fieldset>
          );
        })}
        {estudos.length < MAX_ESTUDOS ? (
          <Botao onClick={adicionarEstudo} className="self-start">
            <Plus aria-hidden />
            {estudos.length ? "Pôr mais um estudo" : "Pôr outro estudo"}
          </Botao>
        ) : (
          <p className="text-body-sm text-ink-muted">Você chegou a {MAX_ESTUDOS} estudos a mais.</p>
        )}
        {erros.estudos && <MensagemErro>{erros.estudos}</MensagemErro>}
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
        titulo="Cursos"
        descricao="Cursos livres e técnicos, NR, informática, idiomas, máquinas que sabe operar… Um de cada vez."
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
              Curso
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
          <Seletor id="cnh" name="cnh" value={cnh} onChange={(e) => setCnh(e.target.value)} className={classesEntrada}>
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
              <Disponibilidade
                key={d.valor}
                valor={d.valor}
                nome={d.nome}
                marcado={disponibilidade.includes(d.valor)}
                aoMudar={(marcado) =>
                  setDisponibilidade((l) => (marcado ? [...l, d.valor] : l.filter((v) => v !== d.valor)))
                }
              />
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
          <strong className="text-label">Quem vê seu currículo:</strong> quem anunciou uma vaga que você curtiu,
          enquanto a curtida existir. Para as empresas acharem você, ou para aparecer na aba Talentos da busca, ligue as
          opções que aparecem embaixo depois de salvar.
        </p>
      </div>

      {estado.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Botao type="submit" variante="primario" disabled={enviando || enviandoPdf || lendo} className="sm:min-w-56">
          {enviando ? "Salvando…" : rotuloSalvar}
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
function Disponibilidade({
  valor,
  nome,
  marcado,
  aoMudar,
}: {
  valor: string;
  nome: string;
  marcado: boolean;
  aoMudar: (marcado: boolean) => void;
}) {
  return (
    <label className={chip(marcado)}>
      <input
        type="checkbox"
        name="disponibilidade"
        value={valor}
        checked={marcado}
        onChange={(e) => aoMudar(e.target.checked)}
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
