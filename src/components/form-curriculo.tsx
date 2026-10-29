"use client";

import { trabalhaAqui } from "@/lib/experiencia";
import {
  Camera,
  Check,
  FileText,
  FileUp,
  Info,
  LoaderCircle,
  Mic,
  Plus,
  Sparkles,
  Square,
  Trash2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  startTransition,
  useActionState,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { apagarCurriculo, lerCurriculoEnviado, salvarCurriculo, type LeituraDoArquivo } from "@/lib/acoes/curriculo";
import { chamarAcao, protegerAcao } from "@/lib/acao-segura";
import { sugerirEmpresas } from "@/lib/acoes/empresas";
import { detalheDoErro, relatarFalha } from "@/lib/falhas";
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
import { arrumarEstudos, experienciaEmBranco, NIVEIS_DE_OUTRO_ESTUDO } from "@/lib/estudos";
import {
  comecarGravacao,
  ErroDaFala,
  lerGravacao,
  MAX_SEGUNDOS_FALA,
  MIN_SEGUNDOS_FALA,
  podeGravarFala,
  relogio,
  type Gravacao,
} from "@/lib/gravar-fala";
import { HABILIDADES_SUGERIDAS, MAX_HABILIDADES } from "@/lib/talentos";
import type { Curriculo, EstadoForm } from "@/lib/tipos";
import { AvisoAoSair } from "./ui/aviso-ao-sair";
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
  /** a unidade ou o bairro (opcional; os rascunhos antigos não têm) */
  unidade?: string;
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

function Secao({
  id,
  titulo,
  descricao,
  children,
}: {
  id?: string;
  titulo: string;
  descricao?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="flex scroll-mt-24 flex-col gap-5 rounded-lg border border-line bg-surface-200 p-5 sm:p-6"
    >
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

// o PDF que a pessoa mandou antes e não chegou a salvar
const NOME_PDF_GUARDADO = "O PDF que você mandou";

// o salvar que não chegou ao servidor: o que a pessoa preencheu fica na aba até ela recarregar
const salvarCurriculoProtegido = protegerAcao(salvarCurriculo, "curriculo");
const apagarCurriculoProtegido = protegerAcao(apagarCurriculo);
const CHAVE_RASCUNHO = "publike_rascunho_curriculo";
// o currículo preenchido sem conta: fica neste aparelho até a pessoa entrar (uma semana, no máximo)
const CHAVE_SEM_CONTA = "publike_curriculo_sem_conta";
const VALIDADE_SEM_CONTA = 7 * 24 * 3600e3;
/** Para onde o "Entrar e salvar" volta: o formulário reabre com o que foi preenchido. */
export const VOLTA_DO_CURRICULO = "/perfil/curriculo?rascunho=1";

function guardarSemConta(r: Retrato) {
  try {
    localStorage.setItem(CHAVE_SEM_CONTA, JSON.stringify({ salvo_em: Date.now(), retrato: r }));
  } catch {}
}

/** O currículo preenchido sem conta (e some do aparelho, a não ser que `manter`). */
function lerSemConta(manter: boolean): Retrato | null {
  try {
    const bruto = localStorage.getItem(CHAVE_SEM_CONTA);
    if (!bruto) return null;
    if (!manter) localStorage.removeItem(CHAVE_SEM_CONTA);
    const r = JSON.parse(bruto) as { salvo_em: number; retrato: Retrato };
    return Date.now() - r.salvo_em > VALIDADE_SEM_CONTA ? null : r.retrato;
  } catch {
    return null;
  }
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

type Situacao =
  | { tipo: "parado" }
  /** currículo falado: esperando a pessoa liberar o microfone, e gravando */
  | { tipo: "pedindo" }
  | { tipo: "gravando"; desde: number }
  | { tipo: "lendo"; fala?: boolean }
  | { tipo: "pronto"; texto: string; semData: number; comPdf: boolean; fala?: boolean }
  | { tipo: "erro"; texto: string };

/** O navegador grava áudio (só no navegador: no servidor, não). */
const nadaMuda = () => () => {};
function useGravaAqui() {
  return useSyncExternalStore(nadaMuda, podeGravarFala, () => false);
}

/**
 * "Já tem currículo pronto?": a pessoa manda o PDF (que fica anexado) ou até 3 fotos da folha
 * (que não ficam guardadas), a IA lê e o formulário vem preenchido. Nada é salvo até ela salvar.
 * Com `ouvir`, também o currículo falado: a pessoa conta a experiência (até 3 minutos), a fala vira
 * texto e a IA preenche; o áudio não fica guardado.
 */
function LerCurriculoPronto({
  usuarioId,
  compacto,
  rotuloSalvar,
  aoLer,
  aoDesfazer,
  aoMudarLendo,
  pdfGuardado = null,
  ouvir = false,
}: {
  usuarioId: string;
  /** a pessoa já tem currículo salvo: o convite é para trocar pelo mais novo */
  compacto: boolean;
  /** o texto do botão de salvar, para o aviso dizer onde tocar */
  rotuloSalvar: string;
  aoLer: (lido: CurriculoLido, pdf: { caminho: string; nome: string } | null) => void;
  aoDesfazer: (() => void) | null;
  aoMudarLendo: (lendo: boolean) => void;
  /** o PDF que a pessoa já mandou e não chegou a salvar: dá para ler de novo sem enviar outra vez */
  pdfGuardado?: string | null;
  /** o currículo falado (a transcrição está ligada no servidor) */
  ouvir?: boolean;
}) {
  const [situacao, setSituacao] = useState<Situacao>({ tipo: "parado" });
  const seletorPdf = useRef<HTMLInputElement>(null);
  const seletorFoto = useRef<HTMLInputElement>(null);
  const aviso = useRef<HTMLDivElement>(null);
  const terminei = useRef<HTMLButtonElement>(null);
  const gravacao = useRef<Gravacao | null>(null);
  // o relógio da gravação (Date.now() de quando o relógio andou)
  const [agora, setAgora] = useState(0);
  const gravaAqui = useGravaAqui();
  const falar = ouvir && gravaAqui;
  const gravandoDesde = situacao.tipo === "gravando" ? situacao.desde : null;

  // o resultado aparece na tela (a pessoa pode ter rolado a página enquanto lia)
  useEffect(() => {
    if (situacao.tipo === "pronto" || situacao.tipo === "erro") aviso.current?.focus();
  }, [situacao]);

  // gravando: o "Terminei" já com o foco, o relógio andando e, em 3 minutos, para sozinho
  const passarTempo = useEffectEvent(() => {
    const instante = Date.now();
    setAgora(instante);
    if (gravandoDesde !== null && (instante - gravandoDesde) / 1000 >= MAX_SEGUNDOS_FALA) void terminarFala();
  });
  useEffect(() => {
    if (gravandoDesde === null) return;
    terminei.current?.focus();
    const relogioAndando = window.setInterval(passarTempo, 500);
    return () => window.clearInterval(relogioAndando);
  }, [gravandoDesde]);
  // saiu da página gravando: o microfone desliga
  useEffect(() => () => gravacao.current?.cancelar(), []);

  async function ler(
    pedido:
      { montar: () => Promise<{ dados: FormData; pdf: { caminho: string; nome: string } | null }> } | { fala: Blob },
  ) {
    const fala = "fala" in pedido;
    setSituacao({ tipo: "lendo", fala });
    aoMudarLendo(true);
    let resultado: LeituraDoArquivo;
    let pdf: { caminho: string; nome: string } | null = null;
    try {
      if ("fala" in pedido) resultado = await lerGravacao(pedido.fala);
      else {
        const enviado = await pedido.montar();
        pdf = enviado.pdf;
        resultado = await lerCurriculoEnviado(enviado.dados);
      }
    } catch (e) {
      const pronta = e instanceof ErroDaLeitura || e instanceof ErroDaFala;
      resultado = {
        ok: false,
        erro: pronta
          ? e.message
          : fala
            ? "Não deu para enviar a gravação. Tente de novo."
            : "Não deu para enviar o arquivo. Tente de novo.",
      };
      // o arquivo que não sobe (ou o pedido que não chega) a equipe precisa saber
      if (!pronta) {
        relatarFalha({
          onde: "curriculo",
          etapa: fala ? "conexao" : "arquivo",
          mensagem: resultado.erro,
          detalhe: `${fala ? "fala" : "leitura"} · ${detalheDoErro(e)}`,
        });
      }
    }
    aoMudarLendo(false);
    if (!resultado.ok) return setSituacao({ tipo: "erro", texto: resultado.erro });
    aoLer(resultado.curriculo, pdf);
    setSituacao({
      tipo: "pronto",
      texto: resumoDaLeitura(resultado.curriculo),
      semData: resultado.curriculo.experiencias.filter((x) => !x.inicio || (!x.atual && !x.fim)).length,
      comPdf: pdf !== null,
      fala,
    });
  }

  async function comecarFala() {
    setSituacao({ tipo: "pedindo" });
    try {
      gravacao.current = await comecarGravacao();
    } catch (e) {
      return setSituacao({
        tipo: "erro",
        texto: e instanceof ErroDaFala ? e.message : "Não deu para ligar o microfone. Tente de novo.",
      });
    }
    const inicio = Date.now();
    setAgora(inicio);
    setSituacao({ tipo: "gravando", desde: inicio });
  }

  async function terminarFala() {
    const g = gravacao.current;
    if (!g || gravandoDesde === null) return;
    gravacao.current = null;
    const segundos = (Date.now() - gravandoDesde) / 1000;
    const audio = await g.terminar();
    if (segundos < MIN_SEGUNDOS_FALA) {
      return setSituacao({
        tipo: "erro",
        texto: "Gravou pouquinho. Toque em “Contar falando” e conte com calma: dá até 3 minutos.",
      });
    }
    void ler({ fala: audio });
  }

  function cancelarFala() {
    gravacao.current?.cancelar();
    gravacao.current = null;
    setSituacao({ tipo: "parado" });
  }

  function escolherPdf(e: ChangeEvent<HTMLInputElement>) {
    const pdf = e.target.files?.[0];
    e.target.value = "";
    if (!pdf) return;
    if (pdf.type !== "application/pdf") return setSituacao({ tipo: "erro", texto: "Envie um arquivo PDF." });
    if (pdf.size > MAX_PDF_MB * 1024 * 1024) {
      return setSituacao({ tipo: "erro", texto: `O PDF pode ter no máximo ${MAX_PDF_MB} MB.` });
    }
    void ler({
      montar: async () => {
        const caminho = await enviarPdf(pdf, usuarioId);
        const dados = new FormData();
        dados.set("pdf", caminho);
        return { dados, pdf: { caminho, nome: pdf.name } };
      },
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
    void ler({
      montar: async () => {
        const menores = await fotosParaLeitura(fotos);
        const dados = new FormData();
        menores.forEach((b, i) => dados.append("foto", b, `pagina-${i + 1}.jpg`));
        return { dados, pdf: null };
      },
    });
  }

  const lendo = situacao.tipo === "lendo";
  // lendo, ou com o microfone ligado: os botões saem da frente
  const ocupado = lendo || situacao.tipo === "pedindo" || situacao.tipo === "gravando";
  const segundos = gravandoDesde !== null ? Math.max(0, (agora - gravandoDesde) / 1000) : 0;
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
            {compacto
              ? "Tem um currículo mais novo?"
              : falar
                ? "Preencha falando ou com o currículo pronto"
                : "Já tem currículo pronto?"}
          </h2>
          <p className="mt-1 text-body-sm text-ink-muted">
            {compacto
              ? "Envie o PDF ou a foto: o Publike lê e troca os campos aqui embaixo. Nada muda até você salvar."
              : falar
                ? "Conte sua experiência em voz alta, ou envie o PDF ou a foto da folha. O Publike preenche os campos para você. Depois é só conferir e salvar."
                : "Envie o PDF ou tire uma foto da folha. O Publike lê e preenche os campos para você. Depois é só conferir e salvar."}
          </p>
        </div>
      </div>

      <div ref={aviso} tabIndex={-1} className="outline-none empty:hidden">
        {situacao.tipo === "pedindo" && (
          <p role="status" className="flex items-center gap-2 text-label">
            <Mic aria-hidden className="size-5 shrink-0" />
            Toque em “Permitir” para o Publike usar o microfone.
          </p>
        )}
        {situacao.tipo === "lendo" && (
          <p role="status" className="flex items-center gap-2 text-label">
            <LoaderCircle aria-hidden className="size-5 shrink-0 motion-safe:animate-spin" />
            {situacao.fala ? "Ouvindo o que você contou…" : "Lendo seu currículo…"} pode levar até um minuto.
          </p>
        )}
        {situacao.tipo === "pronto" && (
          <Aviso tipo="sucesso" titulo="Pronto! Confira os campos aqui embaixo.">
            <p>
              {`Preenchemos ${situacao.texto}${situacao.fala ? " com o que você contou" : ""}.`} Ainda não está salvo:
              confira e toque em “{rotuloSalvar}”, embaixo da tela.
            </p>
            {situacao.fala && <p>Veja se entendemos direito e corrija o que precisar.</p>}
            {situacao.semData > 0 && (
              <p>
                Se souber, ponha as datas que faltam em{" "}
                {situacao.semData === 1 ? "uma experiência" : plural(situacao.semData, "experiência", "experiências")}.
                Sem elas, o currículo salva do mesmo jeito, só não mostra quanto tempo você ficou.
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
      {situacao.tipo === "gravando" && (
        <div className="flex flex-col gap-3 rounded-md border border-line-strong bg-surface-100 p-4">
          <p className="flex flex-wrap items-center gap-x-2 text-label">
            <span aria-hidden className="size-3 shrink-0 rounded-pill bg-danger motion-safe:animate-pulse" />
            <span role="status">Gravando</span>
            <span aria-hidden className="text-ink-muted tabular-nums">
              {relogio(segundos)} de {relogio(MAX_SEGUNDOS_FALA)}
            </span>
          </p>
          <div className="text-body-sm">
            <p>Conte do seu jeito, como se falasse com um amigo:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              <li>que trabalho você procura;</li>
              <li>onde trabalhou, o que fazia e por quanto tempo;</li>
              <li>até onde estudou e os cursos que fez;</li>
              <li>se tem carteira de motorista e quando pode trabalhar.</li>
            </ul>
            <p className="mt-1 text-ink-muted">Não precisa dizer telefone nem endereço.</p>
          </div>
          <div className="grid gap-2 sm:flex">
            <Botao ref={terminei} variante="primario" onClick={() => void terminarFala()}>
              <Square aria-hidden />
              Terminei
            </Botao>
            <Botao variante="fantasma" onClick={cancelarFala}>
              <X aria-hidden />
              Cancelar
            </Botao>
          </div>
        </div>
      )}
      {!ocupado && (
        // no celular, um botão por linha, na largura toda
        <div className="grid gap-2 sm:flex sm:flex-wrap">
          {falar && (
            <Botao variante="primario" onClick={() => void comecarFala()}>
              <Mic aria-hidden />
              {situacao.tipo === "pronto" && situacao.fala ? "Contar de novo" : "Contar falando"}
            </Botao>
          )}
          {pdfGuardado && situacao.tipo !== "pronto" && (
            <Botao
              onClick={() =>
                void ler({
                  montar: async () => {
                    const dados = new FormData();
                    dados.set("pdf", pdfGuardado);
                    return { dados, pdf: { caminho: pdfGuardado, nome: NOME_PDF_GUARDADO } };
                  },
                })
              }
            >
              <Sparkles aria-hidden />
              Preencher com esse PDF
            </Botao>
          )}
          <Botao onClick={() => seletorPdf.current?.click()}>
            <FileUp aria-hidden />
            {situacao.tipo === "pronto" && !situacao.fala ? "Enviar outro PDF" : "Enviar PDF"}
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
          {falar && "Falando, até 3 minutos: o áudio vira texto e não fica guardado. "}
          {falar ? "Ou o PDF" : "PDF"} de até {MAX_PDF_MB} MB ou até {MAX_FOTOS_CURRICULO} fotos, uma por página.
          Telefone, e-mail e endereço não entram nos campos.
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
  ouvirFala = false,
  lido = null,
  pdfGuardado = null,
  semConta = false,
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
  /** o currículo falado, junto do "Já tem currículo pronto?" (com a transcrição ligada no servidor) */
  ouvirFala?: boolean;
  /** "Já tem currículo pronto?": a IA lê o PDF ou a foto e preenche (com a ajuda da IA ligada) */
  lerArquivo?: boolean;
  /** sem currículo salvo: o formulário começa com o que já foi lido (o convite de quem publicou a vaga) */
  lido?: CurriculoLido | null;
  /** sem currículo salvo: o PDF que a pessoa mandou e não chegou a salvar (já vem anexado) */
  pdfGuardado?: string | null;
  /**
   * Quem ainda não entrou: preenche aqui (sem o PDF e sem a leitura, que pedem conta), e o salvar
   * guarda no aparelho e leva ao /entrar; depois de entrar, o formulário volta preenchido.
   */
  semConta?: boolean;
}) {
  const router = useRouter();
  const [estado, acao, enviando] = useActionState(salvarCurriculoProtegido, ESTADO_INICIAL);
  const [recuperado, setRecuperado] = useState(false);
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
          unidade: e.unidade ?? "",
          inicio: e.inicio,
          fim: e.fim ?? "",
          atual: trabalhaAqui(e),
          descricao: e.descricao,
        })),
  );
  // "Empresa ou lugar" sugere as empresas com conta no Publike e os nomes de 3 currículos ou mais
  const [empresasSugeridas, setEmpresasSugeridas] = useState<string[]>([]);
  const esperaEmpresas = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cursos, setCursos] = useState<string[]>(inicial?.cursos ?? semente?.cursos ?? []);
  const [novoCurso, setNovoCurso] = useState("");
  const [habilidades, setHabilidades] = useState<string[]>(inicial?.habilidades ?? semente?.habilidades ?? []);
  const [novaHabilidade, setNovaHabilidade] = useState("");
  const guardado = inicial ? null : pdfGuardado;
  const [arquivo, setArquivo] = useState<string | null>(inicial?.arquivo ?? guardado ?? null);
  const [nomePdf, setNomePdf] = useState<string | null>(guardado ? NOME_PDF_GUARDADO : null);
  const [enviandoPdf, setEnviandoPdf] = useState(false);
  const [erroPdf, setErroPdf] = useState<string | null>(null);
  // a leitura do currículo pronto: enquanto lê, não dá para salvar; "Desfazer" volta ao que era
  const [lendo, setLendo] = useState(false);
  const [antesDaLeitura, setAntesDaLeitura] = useState<Retrato | null>(null);
  const seletorPdf = useRef<HTMLInputElement>(null);
  const formulario = useRef<HTMLFormElement>(null);
  const erros = estado.erros ?? {};
  const pdfOriginal = arquivo !== null && arquivo === inicial?.arquivo;
  // o que está preenchido agora, para saber se mudou desde que a página abriu (salvar troca a chave
  // do formulário, e ele recomeça)
  const retrato = JSON.stringify([
    titulo,
    habilidades,
    escolaridade,
    curso,
    estudos.map((e) => [e.nivel, e.curso]),
    experiencias.map((x) => [x.cargo, x.onde, x.unidade ?? "", x.inicio, x.fim, x.atual, x.descricao]),
    cursos,
    cnh,
    disponibilidade,
    arquivo,
  ]);
  const [retratoAoAbrir] = useState(retrato);
  // tem coisa por salvar (a leitura do PDF, o que a pessoa mexeu, o convite ou o PDF que ficou
  // guardado): o botão de salvar acompanha a tela, para ninguém sair achando que já salvou
  const porSalvar = retrato !== retratoAoAbrir || (!inicial && (semente !== null || guardado !== null));

  // sem conta, o que a pessoa preenche já fica no aparelho (sair e voltar não perde nada)
  useEffect(() => {
    if (!semConta || retrato === retratoAoAbrir) return;
    guardarSemConta({
      titulo,
      habilidades,
      escolaridade,
      curso,
      estudos,
      experiencias,
      cursos,
      cnh,
      disponibilidade,
      arquivo: null,
      nomePdf: null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- o retrato resume todos os campos
  }, [semConta, retrato]);

  // Depois de um erro, leva a pessoa até o primeiro campo com problema
  useEffect(() => {
    if (!estado.erros) return;
    formulario.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [estado]);

  function mudarExperiencia(chave: string, mudancas: Partial<ItemExperiencia>) {
    setExperiencias((lista) => lista.map((e) => (e.chave === chave ? { ...e, ...mudancas } : e)));
  }

  function buscarEmpresas(texto: string) {
    if (semConta || demo) return;
    if (esperaEmpresas.current) clearTimeout(esperaEmpresas.current);
    if (texto.trim().length < 2) return;
    esperaEmpresas.current = setTimeout(async () => {
      const r = await chamarAcao(() => sugerirEmpresas(texto));
      if (r.ok) setEmpresasSugeridas(r.nomes);
    }, 250);
  }

  function adicionarExperiencia() {
    if (experiencias.length >= MAX_EXPERIENCIAS) return;
    const chave = novaChave();
    setExperiencias((lista) => [
      ...lista,
      { chave, cargo: "", onde: "", unidade: "", inicio: "", fim: "", atual: false, descricao: "" },
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
    } catch (falha) {
      const mensagem = "Não deu para enviar o PDF. Tente de novo.";
      setErroPdf(mensagem);
      relatarFalha({
        onde: "curriculo",
        etapa: "arquivo",
        mensagem,
        detalhe: `PDF de ${Math.round(pdf.size / 1024)} KB · ${detalheDoErro(falha)}`,
      });
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

  // o salvar falhou sem chegar ao servidor: guarda o que está preenchido, para voltar depois de recarregar
  useEffect(() => {
    if (!estado.semSalvar) return;
    const retrato: Retrato = {
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
    };
    try {
      sessionStorage.setItem(CHAVE_RASCUNHO, JSON.stringify(retrato));
    } catch {}
    // só quando chega a falha (o que muda depois é guardado de novo na próxima tentativa)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  // voltou depois de recarregar (ou de entrar, com o que preencheu sem conta): o formulário recebe o
  // que estava preenchido. Com um currículo já salvo, o de sem conta não passa por cima dele
  useEffect(() => {
    let r: Retrato | null = null;
    try {
      const guardado = sessionStorage.getItem(CHAVE_RASCUNHO);
      sessionStorage.removeItem(CHAVE_RASCUNHO);
      r = guardado ? (JSON.parse(guardado) as Retrato) : null;
    } catch {}
    if (!r && (semConta || !inicial)) r = lerSemConta(semConta);
    if (!r) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lido do navegador depois de montar
    setTitulo(r.titulo ?? "");
    setHabilidades(r.habilidades ?? []);
    setEscolaridade(r.escolaridade ?? "");
    setCurso(r.curso ?? "");
    setEstudos(r.estudos ?? []);
    setExperiencias(r.experiencias ?? []);
    setCursos(r.cursos ?? []);
    setCnh(r.cnh ?? "");
    setDisponibilidade(r.disponibilidade ?? []);
    setArquivo(r.arquivo ?? null);
    setNomePdf(r.nomePdf ?? null);
    setRecuperado(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao abrir
  }, []);

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // o que ficou pela metade não trava o salvar (o servidor faz o mesmo): o "Outro estudo" vazio ou
    // sem curso sai, o curso sem nível vai para Cursos e a experiência em branco sai; a tela acompanha
    const arrumados = arrumarEstudos(estudos, cursos);
    const experienciasValidas = experiencias.filter((x) => !experienciaEmBranco(x));
    if (arrumados.estudos.length !== estudos.length) setEstudos(arrumados.estudos);
    if (arrumados.cursos.length !== cursos.length) setCursos(arrumados.cursos);
    if (experienciasValidas.length !== experiencias.length) setExperiencias(experienciasValidas);
    if (semConta) {
      // sem conta: guarda no aparelho e entra; depois de entrar, a pessoa confere e salva
      const pendente = novoCurso.replace(/\s+/g, " ").trim();
      const habilidadePendente = novaHabilidade.replace(/\s+/g, " ").trim();
      guardarSemConta({
        titulo,
        habilidades:
          habilidadePendente.length >= 2 && habilidades.length < MAX_HABILIDADES
            ? [...habilidades, habilidadePendente]
            : habilidades,
        escolaridade,
        curso,
        estudos: arrumados.estudos,
        experiencias: experienciasValidas,
        cursos: pendente.length >= 2 ? [...arrumados.cursos, pendente] : arrumados.cursos,
        cnh,
        disponibilidade,
        arquivo: null,
        nomePdf: null,
      });
      router.push(`/entrar?next=${encodeURIComponent(VOLTA_DO_CURRICULO)}`);
      return;
    }
    const dados = new FormData(e.currentTarget);
    dados.set(
      "experiencias",
      JSON.stringify(
        experienciasValidas.map((x) => ({
          cargo: x.cargo,
          onde: x.onde,
          unidade: x.onde.trim() ? (x.unidade ?? "") : "",
          inicio: x.inicio,
          fim: x.atual ? null : x.fim,
          atual: x.atual,
          descricao: x.descricao,
        })),
      ),
    );
    // o que ficou digitado e não foi adicionado também vale
    const pendente = novoCurso.replace(/\s+/g, " ").trim();
    dados.set("cursos", JSON.stringify(pendente.length >= 2 ? [...arrumados.cursos, pendente] : arrumados.cursos));
    dados.set("estudos", JSON.stringify(arrumados.estudos.map(({ nivel, curso }) => ({ nivel, curso }))));
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

      {lerArquivo && !demo && !semConta && (
        <LerCurriculoPronto
          usuarioId={usuarioId}
          compacto={inicial !== null}
          rotuloSalvar={rotuloSalvar}
          aoLer={aplicarLeitura}
          aoDesfazer={antesDaLeitura ? desfazerLeitura : null}
          aoMudarLendo={setLendo}
          pdfGuardado={guardado}
          // quem já tem currículo troca pelo mais novo; contar falando é para quem ainda não tem (não apaga o resto)
          ouvir={ouvirFala && inicial === null}
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
                  <p className="text-body-sm text-ink-muted">
                    Técnico, faculdade ou pós. Curso livre (informática, NR-35…) vai em Cursos, mais abaixo.
                  </p>
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
        id="experiencias"
        titulo="Onde você já trabalhou"
        descricao="Do mais recente para o mais antigo. Freelance e trabalho sem carteira também contam. Primeiro emprego? Pode deixar vazio e contar dos cursos."
      >
        {/* as sugestões de "Empresa ou lugar" (uma lista para todas as experiências) */}
        <datalist id="empresas-sugeridas">
          {empresasSugeridas.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
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
                    onChange={(e) => {
                      mudarExperiencia(x.chave, { onde: e.target.value });
                      buscarEmpresas(e.target.value);
                    }}
                    maxLength={80}
                    placeholder="Ex.: Padaria do Centro, casa de família"
                    list={semConta || demo ? undefined : "empresas-sugeridas"}
                    autoComplete="off"
                    aria-invalid={erro("onde") ? true : undefined}
                    className={classesEntrada}
                  />
                  {erro("onde") && <MensagemErro>{erro("onde")}</MensagemErro>}
                </div>
                {x.onde.trim() && (
                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <Rotulo htmlFor={id("unidade")} opcional>
                      Unidade ou bairro
                    </Rotulo>
                    <input
                      id={id("unidade")}
                      value={x.unidade ?? ""}
                      onChange={(e) => mudarExperiencia(x.chave, { unidade: e.target.value })}
                      maxLength={60}
                      placeholder="Ex.: Perimetral, Setor Bueno"
                      aria-describedby={id("unidade-dica")}
                      aria-invalid={erro("unidade") ? true : undefined}
                      className={`${classesEntrada} sm:max-w-[calc(50%-0.5rem)]`}
                    />
                    <p id={id("unidade-dica")} className="text-body-sm text-ink-muted">
                      Para empresa com mais de uma loja ou unidade.
                    </p>
                    {erro("unidade") && <MensagemErro>{erro("unidade")}</MensagemErro>}
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <Rotulo htmlFor={id("inicio")} opcional>
                    Entrou em
                  </Rotulo>
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
                  <Rotulo htmlFor={x.atual ? id("atual") : id("fim")} opcional>
                    Saiu em
                  </Rotulo>
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
          {erros.cnh && <MensagemErro>{erros.cnh}</MensagemErro>}
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
          {erros.disponibilidade && <MensagemErro>{erros.disponibilidade}</MensagemErro>}
        </fieldset>
      </Secao>

      {semConta ? (
        <p className="rounded-md bg-surface-300 px-4 py-3 text-body-sm">
          Já tem um currículo em PDF? Depois de entrar, dá para anexar e até deixar o Publike preencher por ele.
        </p>
      ) : (
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
      )}

      <div className="flex gap-3 rounded-md bg-surface-300 p-4 text-body-sm">
        <Info aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" />
        <p>
          <strong className="text-label">Quem vê seu currículo:</strong> quem anunciou uma vaga que você curtiu,
          enquanto a curtida existir. Para as empresas acharem você, ou para aparecer na aba Talentos da busca, ligue as
          opções que aparecem embaixo depois de salvar.
        </p>
      </div>

      {recuperado && !estado.erro && (
        <Aviso tipo="info">Voltamos com o que você tinha preenchido. Confira e toque em “{rotuloSalvar}”.</Aviso>
      )}
      {estado.erro && (
        <div role="alert" className="flex flex-col gap-2">
          <Aviso tipo="erro">{estado.erro}</Aviso>
          {estado.semSalvar && (
            <Botao type="button" variante="secundario" onClick={() => window.location.reload()} className="self-start">
              Recarregar a página
            </Botao>
          )}
        </div>
      )}

      {/* com coisa por salvar, o botão acompanha a tela (em cima da barra de baixo, no celular) */}
      <div
        className={
          porSalvar
            ? "sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line-strong bg-surface-200 p-3 shadow-raised md:bottom-4"
            : "flex flex-col gap-3 sm:flex-row sm:items-center"
        }
      >
        <Botao type="submit" variante="primario" disabled={enviando || enviandoPdf || lendo} className="sm:min-w-56">
          {enviando ? "Salvando…" : rotuloSalvar}
        </Botao>
        {semConta ? (
          <p className="text-body-sm text-ink-muted">
            Para salvar, você entra no Publike (grátis). O que preencheu fica guardado neste aparelho.
          </p>
        ) : porSalvar ? (
          <p className="text-body-sm text-ink-muted">Seu currículo ainda não foi salvo.</p>
        ) : (
          <SemContatoNoTexto />
        )}
      </div>
      {porSalvar && <SemContatoNoTexto />}

      {/* sair com coisa por salvar pergunta antes (o salvar que não chegou ao servidor já guardou tudo) */}
      <AvisoAoSair
        ativo={porSalvar && !demo && !estado.semSalvar && !semConta}
        titulo="Sair sem salvar o currículo?"
        texto="Ele ainda não foi salvo, e as empresas só veem depois de salvar."
        rotuloSalvar={rotuloSalvar}
        podeSalvar={!enviando && !enviandoPdf && !lendo}
        aoSalvar={() => formulario.current?.requestSubmit()}
      />
    </form>
  );
}

function SemContatoNoTexto() {
  return (
    <p className="text-body-sm text-ink-muted">
      Sem telefone, e-mail ou link no texto: o contato aparece sozinho no match.{" "}
      <Link href="/privacidade#curriculo" className="underline">
        Como cuidamos do currículo
      </Link>
      .
    </p>
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
  const [estado, acao, enviando] = useActionState(apagarCurriculoProtegido, ESTADO_INICIAL);
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
