"use client";

import { ArrowLeft, ArrowRight, Briefcase, CalendarClock, Check, Wrench, X } from "lucide-react";
import Link from "next/link";
import {
  startTransition,
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { protegerAcao } from "@/lib/acao-segura";
import { guardarRascunho } from "@/lib/rascunho-anuncio";
import { salvarAnuncio } from "@/lib/acoes/anuncios";
import type { RascunhoAnuncio } from "@/lib/acoes/ia";
import { BAIRROS } from "@/lib/bairros";
import { categoriaSugerida } from "@/lib/categoria-sugerida";
import { temLugar, type ClienteParaVaga } from "@/lib/clientes";
import {
  BENEFICIOS,
  categoria as nomeCategoria,
  CATEGORIAS,
  CIDADES,
  CNHS,
  ESCOLARIDADES,
  EXPERIENCIAS,
  JORNADAS,
  MODELOS,
  PCDS,
  REGIMES,
  REGIMES_COM_CURRICULO,
  UNIDADES,
  type Cidade,
} from "@/lib/constantes";
import type { EstadoForm, Regime, TipoAnuncio } from "@/lib/tipos";
import { lerNumeroBR } from "@/lib/numero";
import { faltaNoPasso, PASSOS_PUBLICAR, primeiroPassoComErro, TOTAL_PASSOS, passoDoCampo } from "@/lib/passos-publicar";
import { formatarValor } from "@/lib/formato";
import {
  ganhosDoBanco,
  lerHorario,
  textoDoHorario,
  type GanhoExtra,
  type HorarioDetalhe,
  type Pergunta,
} from "@/lib/vaga-extra";
import { EmpresaDaVaga } from "./anuncio/empresa-da-vaga";
import { BeneficiosExtras, EditorPerguntas, GanhosExtras, MontarHorario } from "./anuncio/extras-da-vaga";
import { MelhorarTexto } from "./anuncio/melhorar-texto";
import { LocalComCep } from "./mapa/local-com-cep";
import { trocarBairro } from "./mapa/seletor-local";
import { AvisoAoSair, useFormularioMudou } from "./ui/aviso-ao-sair";
import { Aviso, Selo } from "./ui/basicos";
import { Botao } from "./ui/botao";
import { Campo, classesEntrada, ligarCampo, MensagemErro, Seletor } from "./ui/campo";
import { ResumoErros } from "./ui/resumo-erros";
import { jeitosDeEntrar } from "@/lib/login-social";

/** Os tipos de contratação que aparecem primeiro (os outros ficam em "Outros tipos"). */
const REGIMES_PRINCIPAIS: Regime[] = ["clt", "diaria", "freelance", "temporario", "estagio", "aprendiz"];

export type ValoresAnuncio = {
  id?: string;
  tipo: TipoAnuncio;
  titulo: string;
  descricao: string;
  categoria: string;
  regime: string | null;
  pagamento_valor: number | null;
  pagamento_unidade: string | null;
  beneficios: string | null;
  horario: string | null;
  vagas: number;
  /** vaga: quem curtir é convidado a preencher o currículo, e você vê o currículo de cada um */
  pede_curriculo?: boolean;
  /** quem curtir já recebe o contato (match na hora) */
  contato_direto?: boolean;
  /** vaga: precisa de alguém para começar logo (a etiqueta e o filtro "Começa já") */
  comeca_ja?: boolean;
  /** em quantos dias a vaga sai do ar sozinha; null: sem prazo (fica até ser encerrada) */
  prazo_dias?: number | null;
  /** vaga de agência: a empresa que contrata (vazio quando é confidencial) */
  contratante?: string | null;
  contratante_confidencial?: boolean;
  /** vaga de agência: o cliente (Clientes, no painel) */
  cliente_id?: string | null;
  /** vaga: fim da faixa salarial, comissão, benefícios marcados, requisitos, jornada, modelo e PCD */
  pagamento_ate?: number | null;
  /** "Mais comissão" de antes; os ganhos a mais (abaixo) tomaram o lugar */
  comissao?: boolean;
  /** comissão, bônus, gorjeta... junto do valor */
  ganhos_extras?: GanhoExtra[];
  beneficios_lista?: string[];
  escolaridade_minima?: string | null;
  experiencia?: string | null;
  cnh?: string | null;
  jornada?: string | null;
  modelo?: string | null;
  pcd?: string | null;
  /** vaga: perguntas para o candidato, benefícios a mais e horário montado (vaga-extra.ts) */
  perguntas?: Pergunta[];
  beneficios_extras?: string[];
  horario_detalhe?: HorarioDetalhe | null;
  cidade: string;
  bairro: string;
  /** comércio, empresa e agência: o endereço que aparece na vaga */
  cep?: string | null;
  endereco?: string | null;
  lat: number | null;
  lng: number | null;
  /** valor a combinar (rascunho e modelos) */
  combinar?: boolean;
};

/** O nome de cada campo no resumo do que falta, perto do botão. */
const NOMES_CAMPOS: Record<string, string> = {
  titulo: "Título",
  contratante: "Empresa da vaga",
  cliente_id: "Empresa da vaga",
  regime: "Tipo de contratação",
  pagamento_valor: "Valor",
  pagamento_ate: "Valor “Até”",
  pagamento_unidade: "Valor “Por”",
  ganhos_extras: "Ganhos a mais",
  horario: "Horário",
  cidade: "Cidade",
  bairro: "Bairro",
  cep: "CEP",
  endereco: "Endereço",
  lat: "Lugar no mapa",
  lng: "Lugar no mapa",
  categoria: "Categoria",
  descricao: "Descrição",
  jornada: "Jornada",
  modelo: "Modelo de trabalho",
  beneficios_lista: "Benefícios",
  beneficios_extras: "Benefícios",
  beneficios: "Benefícios",
  vagas: "Quantas pessoas",
  escolaridade_minima: "Escolaridade",
  experiencia: "Experiência",
  cnh: "CNH",
  pcd: "Pessoas com deficiência",
  perguntas: "Perguntas para o candidato",
  prazo_dias: "Prazo",
};

const ESTADO_INICIAL: EstadoForm = { ok: false };

/** Opção em forma de pílula (rádio ou caixa de marcar), como o tipo de contratação. */
/** As opções de prazo da vaga, em dias (e ainda "outro" e "sem prazo"). */
const PRAZOS = [15, 30, 60, 90];

const classesPilula =
  "inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-pill border border-line bg-surface-300 px-3.5 text-label transition-colors has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-surface-100 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus";

function emTexto(valor: number | null | undefined) {
  return valor != null ? String(valor).replace(".", ",") : "";
}

function Secao({ numero, titulo, children, id }: { numero: number; titulo: string; children: ReactNode; id?: string }) {
  return (
    <section
      id={id}
      className="flex scroll-mt-24 flex-col gap-5 rounded-lg border border-line bg-surface-200 p-5 sm:p-6"
    >
      <h2 className="flex items-center gap-3 text-h3">
        <span className="flex size-8 items-center justify-center rounded-pill bg-surface-300 text-label">{numero}</span>
        {titulo}
      </h2>
      {children}
    </section>
  );
}

export function FormAnuncio({
  inicial,
  acaoSalvar = salvarAnuncio,
  equipe = false,
  ia = false,
  agencia = false,
  contatoAgencia = null,
  clientes = null,
  enderecoPublico = false,
  emNomeDe = null,
  semConta = false,
  aposConferir,
  previa = null,
  extras,
  jaMudou = false,
  passos = false,
  passoInicial = 1,
  atalhos = null,
  aoMudarPasso,
}: {
  inicial: ValoresAnuncio;
  /** Ação que salva (padrão: publicar ou editar o próprio anúncio). */
  acaoSalvar?: (anterior: EstadoForm, formData: FormData) => Promise<EstadoForm>;
  /** Correção feita pela moderação no anúncio de outra pessoa. */
  equipe?: boolean;
  /** Mostra o botão "Melhorar texto com IA". */
  ia?: boolean;
  /** Quem publica é agência de emprego / RH: a vaga diz para qual empresa é. */
  agencia?: boolean;
  /** Agência publicando: o WhatsApp e o e-mail da conta, que o candidato recebe no match. */
  contatoAgencia?: { whatsapp: string | null; email: string | null } | null;
  /** Agência: os clientes para escolher (null: só o nome escrito à mão, como na moderação). */
  clientes?: ClienteParaVaga[] | null;
  /** Comércio, empresa e agência: o endereço aparece na vaga (pessoa física: só a região). */
  /** true: comércio, empresa e agência; "talvez": quem ainda não entrou (o endereço fica opcional) */
  enderecoPublico?: boolean | "talvez";
  /** Admin publicando em nome de uma conta: o nome dela. */
  emNomeDe?: string | null;
  /** Quem ainda não entrou: o botão confere e segue para entrar (a vaga sai depois). */
  semConta?: boolean;
  /** Sem conta: o formulário passou na conferência (com o que foi enviado). */
  aposConferir?: (dados: FormData) => void;
  /** Como a vaga aparece na busca, logo antes do botão. */
  previa?: ReactNode;
  /** Campos escondidos a mais (o convite da empresa, que vira o aceite ao publicar). */
  extras?: Record<string, string>;
  /** Veio preenchido pelo que a pessoa fez antes (a arte da vaga lida pela IA): sair pergunta mesmo sem mexer. */
  jaMudou?: boolean;
  /** Publicar em passos (o /publicar): um passo por vez, com o Continuar e o resumo no fim. */
  passos?: boolean;
  /** Em passos: onde começa (5, Conferir, quando a vaga veio pronta: convite, parecida, foto). */
  passoInicial?: number;
  /** Em passos: os atalhos do passo 1 (modelos, foto, texto). */
  atalhos?: ReactNode;
  /** Em passos: a cada troca de passo (para guardar o rascunho com o passo). */
  aoMudarPasso?: (passo: number) => void;
}) {
  const editando = Boolean(inicial.id);
  // a falha sem chegar ao servidor (site publicado de novo com a página aberta) vira aviso na tela
  const acaoProtegida = useMemo(() => protegerAcao(acaoSalvar, "vaga"), [acaoSalvar]);
  const [estado, acao, enviando] = useActionState(acaoProtegida, ESTADO_INICIAL);
  // anúncio novo é sempre vaga; serviço tem cadastro próprio ("Meus serviços")
  const tipo: TipoAnuncio = editando ? inicial.tipo : "vaga";
  const [combinar, setCombinar] = useState(inicial.combinar ?? (editando ? inicial.pagamento_valor == null : false));
  // em passos: o passo aberto, o mais longe já aberto (dá para voltar a ele pelo topo) e o que falta nele
  const [passo, setPasso] = useState(passos ? Math.min(Math.max(passoInicial, 1), TOTAL_PASSOS) : 0);
  const [maxPasso, setMaxPasso] = useState(passos ? passoInicial : TOTAL_PASSOS);
  const [errosLocais, setErrosLocais] = useState<Record<string, string>>({});
  const [resumo, setResumo] = useState<{ nome: string; texto: string; passo: number }[]>([]);
  const topo = useRef<HTMLDivElement>(null);
  const [unidade, setUnidade] = useState(inicial.pagamento_unidade ?? (inicial.tipo === "vaga" ? "mes" : "servico"));
  const [descricao, setDescricao] = useState(inicial.descricao);
  // o título e a categoria, para sugerir a área quando fica em "Outros" (categoria-sugerida.ts)
  const [tituloAtual, setTituloAtual] = useState(inicial.titulo);
  const [categoriaAtual, setCategoriaAtual] = useState(inicial.categoria);
  const [cidade, setCidade] = useState(inicial.cidade);
  // o prazo da vaga: uma das opções, outro número de dias ou sem prazo
  const prazoInicial = inicial.prazo_dias === undefined ? 30 : inicial.prazo_dias;
  const [prazo, setPrazo] = useState<string>(
    prazoInicial === null ? "sem" : PRAZOS.includes(prazoInicial) ? String(prazoInicial) : "outro",
  );
  const [pedeCurriculo, setPedeCurriculo] = useState(inicial.pede_curriculo ?? false);
  // Em vaga nova, CLT, estágio e temporário já marcam "pedir currículo" (até a pessoa mexer na caixa)
  const [mexeuNoCurriculo, setMexeuNoCurriculo] = useState(editando);
  const [confidencial, setConfidencial] = useState(inicial.contratante_confidencial ?? false);
  // o lugar da vaga: escolher um cliente traz o dele (e monta o "Onde é" de novo)
  const [lugar, setLugar] = useState({
    bairro: inicial.bairro,
    cep: inicial.cep ?? null,
    endereco: inicial.endereco ?? null,
    lat: inicial.lat,
    lng: inicial.lng,
  });
  const [chaveLugar, setChaveLugar] = useState(0);
  const [lugarDoCliente, setLugarDoCliente] = useState<string | null>(null);
  const [beneficiosMarcados, setBeneficiosMarcados] = useState<string[]>(inicial.beneficios_lista ?? []);
  // tipos de contratação: os mais comuns à mostra, os outros atrás de "Outros tipos"
  const [todosRegimes, setTodosRegimes] = useState(
    Boolean(inicial.regime && !REGIMES_PRINCIPAIS.includes(inicial.regime as Regime)),
  );
  const formulario = useRef<HTMLFormElement>(null);
  // sair com a vaga mexida e não salva pergunta antes (o salvar leva para outra página)
  const mudouDesdeQueAbriu = useFormularioMudou(formulario);
  // vaga nova que não chegou ao servidor: o preenchido fica no aparelho e volta ao recarregar
  // (o /publicar traz o rascunho de volta)
  useEffect(() => {
    if (estado.semSalvar && !editando && !equipe && formulario.current) guardarRascunho(formulario.current);
  }, [estado, editando, equipe]);
  const erros = { ...(estado.erros ?? {}), ...errosLocais };
  const vaga = tipo === "vaga";
  const rotuloSalvar = semConta
    ? "Continuar para publicar"
    : equipe
      ? "Salvar correção"
      : editando
        ? "Salvar alterações"
        : vaga
          ? "Publicar vaga"
          : "Publicar serviço";

  // Depois de um erro, leva a pessoa até o primeiro campo com problema (em passos, antes ao passo dele)
  useEffect(() => {
    if (!estado.erros) return;
    const doErro = passos ? primeiroPassoComErro(estado.erros) : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- o erro veio do servidor: abre o passo dele
    if (doErro) setPasso(doErro);
    const t = window.setTimeout(() => focarErro(), 60);
    return () => window.clearTimeout(t);
    // só quando chega uma resposta nova do servidor
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  function focarErro() {
    const visivel = [...(formulario.current?.querySelectorAll<HTMLElement>('[aria-invalid="true"]') ?? [])].find(
      (c) => c.offsetParent !== null || c.getClientRects().length > 0,
    );
    visivel?.focus();
  }

  // voltar do navegador (e do Android): volta um passo
  useEffect(() => {
    if (!passos) return;
    history.replaceState({ ...history.state, passoPublicar: passo }, "");
    function aoVoltar(e: PopStateEvent) {
      const n = Number((e.state as { passoPublicar?: number } | null)?.passoPublicar ?? 1);
      if (Number.isInteger(n) && n >= 1 && n <= TOTAL_PASSOS) {
        setPasso(n);
        if (n === TOTAL_PASSOS) setResumo(montarResumo());
      }
    }
    window.addEventListener("popstate", aoVoltar);
    return () => window.removeEventListener("popstate", aoVoltar);
    // liga uma vez; o passo de começo entra no histórico
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passos]);

  // o passo 5 de começo (a vaga veio pronta) já mostra o resumo
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- o resumo lê o formulário já montado
    if (passos && passo === TOTAL_PASSOS) setResumo(montarResumo());
    // só na abertura
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function irPara(n: number) {
    if (n === passo) return;
    setPasso(n);
    setMaxPasso((m) => Math.max(m, n));
    if (n === TOTAL_PASSOS) setResumo(montarResumo());
    history.pushState({ ...history.state, passoPublicar: n }, "");
    aoMudarPasso?.(n);
    window.requestAnimationFrame(() => topo.current?.scrollIntoView({ block: "start" }));
  }

  function continuar() {
    if (!formulario.current) return;
    const falta = faltaNoPasso(passo, new FormData(formulario.current), { vaga, agencia });
    setErrosLocais(falta);
    if (Object.keys(falta).length) {
      window.setTimeout(() => focarErro(), 30);
      return;
    }
    irPara(passo + 1);
  }

  /** O resumo do passo 5: uma linha por passo, com o que foi escrito. */
  function montarResumo() {
    const f = formulario.current ? new FormData(formulario.current) : new FormData();
    const t = (k: string) => {
      const v = f.get(k);
      return typeof v === "string" ? v.trim() : "";
    };
    const juntar = (partes: (string | null | false | undefined)[]) => partes.filter(Boolean).join(" · ");
    const regime = REGIMES[t("regime") as Regime]?.nome;
    const n = Number(t("vagas") || "1");
    const combinarAgora = t("combinar") === "on";
    const valorNum = lerNumeroBR(t("pagamento_valor"));
    const ateNum = t("pagamento_ate") ? lerNumeroBR(t("pagamento_ate")) : null;
    const valorTexto = combinarAgora
      ? "Valor a combinar"
      : formatarValor(
          valorNum != null && Number.isFinite(valorNum) ? valorNum : null,
          t("pagamento_unidade") || null,
          null,
          false,
          { ate: ateNum != null && Number.isFinite(ateNum) ? ateNum : null, ganhos: [] },
        );
    const beneficios = f
      .getAll("beneficios_lista")
      .map((b): string | undefined => BENEFICIOS.find((x) => x.valor === b)?.nome)
      .filter(Boolean)
      .concat(f.getAll("beneficios_extras").filter((b): b is string => typeof b === "string" && Boolean(b.trim())));
    const horario = horarioEscrito(t("horario_detalhe"));
    const perguntasTexto = t("perguntas");
    let perguntas = 0;
    try {
      perguntas = perguntasTexto ? (JSON.parse(perguntasTexto) as unknown[]).length : 0;
    } catch {}
    return [
      {
        passo: 1,
        nome: "A vaga",
        texto: juntar([t("titulo"), regime, vaga && `${n} ${n === 1 ? "pessoa" : "pessoas"}`]),
      },
      {
        passo: 2,
        nome: "Pagamento e horário",
        texto: juntar([valorTexto, beneficios.length > 0 && beneficios.slice(0, 4).join(", "), horario]),
      },
      { passo: 3, nome: "Onde", texto: juntar([t("endereco"), t("bairro"), t("cidade")]) },
      {
        passo: 4,
        nome: "Mais detalhes",
        texto: juntar([
          t("descricao") ? "Descrição escrita por você" : "Descrição montada pelo Publike",
          t("pede_curriculo") === "on" && "Pede currículo",
          perguntas > 0 && `${perguntas} ${perguntas === 1 ? "pergunta" : "perguntas"} para o candidato`,
        ]),
      },
    ];
  }

  // sem conta: com tudo certo, quem usa o formulário guarda o rascunho e leva para entrar
  const enviado = useRef<FormData | null>(null);
  useEffect(() => {
    if (estado.ok && enviado.current && aposConferir) aposConferir(enviado.current);
  }, [estado, aposConferir]);

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    enviado.current = new FormData(e.currentTarget);
    startTransition(() => acao(dados));
  }

  const valor = emTexto(inicial.pagamento_valor);

  // O que já está escrito no formulário vai para a IA como rascunho.
  function lerRascunho(): RascunhoAnuncio {
    const f = formulario.current ? new FormData(formulario.current) : new FormData();
    const texto = (nome: string) => {
      const v = f.get(nome);
      return typeof v === "string" ? v : "";
    };
    const valorDigitado = combinar ? null : lerNumeroBR(f.get("pagamento_valor"));
    return {
      tipo,
      titulo: texto("titulo"),
      descricao,
      categoria: texto("categoria"),
      regime: vaga ? texto("regime") || null : null,
      pagamento_valor: valorDigitado != null && Number.isFinite(valorDigitado) ? valorDigitado : null,
      pagamento_unidade: combinar ? null : unidade,
      beneficios: vaga ? f.getAll("beneficios_extras").join(", ") || null : texto("beneficios") || null,
      horario: vaga ? horarioEscrito(texto("horario_detalhe")) : texto("horario") || null,
      vagas: Number(texto("vagas")) || 1,
      cidade: texto("cidade"),
      bairro: texto("bairro"),
    };
  }

  function usarLugarDoCliente(c: ClienteParaVaga) {
    if (!temLugar(c)) {
      setLugarDoCliente(null);
      return;
    }
    if (c.cidade && (CIDADES as readonly string[]).includes(c.cidade)) setCidade(c.cidade);
    setLugar({ bairro: c.bairro ?? "", cep: c.cep, endereco: c.endereco, lat: c.lat, lng: c.lng });
    setChaveLugar((k) => k + 1);
    setLugarDoCliente(c.nome);
  }

  // marcar ou desmarcar "Empresa confidencial" monta o "Onde é" de outro jeito (sem ou com o mapa): o bairro
  // que já estava escrito vai junto, senão o campo novo voltava com o bairro de antes
  function mudarConfidencial(valor: boolean) {
    const campo = formulario.current?.elements.namedItem("bairro");
    if (campo instanceof HTMLInputElement) {
      const bairro = campo.value.trim();
      setLugar((l) => (l.bairro === bairro ? l : { ...l, bairro }));
    }
    setConfidencial(valor);
  }
  function aplicarSugestao(titulo: string, novaDescricao: string) {
    const campoTitulo = formulario.current?.elements.namedItem("titulo");
    if (campoTitulo instanceof HTMLInputElement) campoTitulo.value = titulo;
    setTituloAtual(titulo);
    setDescricao(novaDescricao);
  }

  // ficou em "Outros" (escolhido, não em branco: em branco o título já decide) e o título diz a área
  const sugerida = categoriaAtual === "outros" ? categoriaSugerida(tituloAtual, descricao) : null;

  // a cidade e o bairro (dentro do CEP e do mapa; na vaga confidencial, sozinhos)
  const camposDoLugar = (
    <div className="grid gap-4 sm:grid-cols-2">
      <Campo rotulo="Cidade" nome="cidade" erro={erros.cidade}>
        <Seletor
          {...ligarCampo("cidade", erros.cidade)}
          value={cidade}
          onChange={(e) => setCidade(e.target.value)}
          className={classesEntrada}
        >
          {CIDADES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Seletor>
      </Campo>
      <Campo rotulo={confidencial ? "Bairro ou setor (opcional)" : "Bairro ou setor"} nome="bairro" erro={erros.bairro}>
        <input
          {...ligarCampo("bairro", erros.bairro)}
          defaultValue={confidencial && lugar.bairro === cidade ? "" : lugar.bairro}
          list="bairros"
          maxLength={80}
          required={!confidencial}
          placeholder="Ex.: Setor Bueno"
          autoComplete="off"
          className={classesEntrada}
        />
        <datalist id="bairros">
          {(BAIRROS[cidade as Cidade] ?? []).map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
      </Campo>
    </div>
  );

  const resumoErrosNoTopo = (
    <ResumoErros
      erros={erros}
      nomes={NOMES_CAMPOS}
      acao={semConta ? "continuar" : equipe || editando ? "salvar" : "publicar"}
      reserva={estado.erro}
      antesDeIr={(campo) => {
        if (passos) irPara(passoDoCampo(campo));
      }}
    />
  );

  // os 5 grupos (em passos, um por vez; editando, todos numa página com o índice no alto)
  const nomesDosGrupos = vaga
    ? PASSOS_PUBLICAR.map((p) => (p.numero === TOTAL_PASSOS && !passos ? "Publicação" : p.nome))
    : ["O serviço", "Valor e quando", "Onde", "Mais detalhes", "Publicação"];
  const grupo = (n: number, conteudo: ReactNode) =>
    passos ? (
      <section
        key={n}
        id={`passo-${n}`}
        hidden={passo !== n}
        aria-labelledby={`passo-${n}-titulo`}
        className={
          passo === n ? "flex flex-col gap-5 rounded-lg border border-line bg-surface-200 p-5 sm:p-6" : "hidden"
        }
      >
        <h2 id={`passo-${n}-titulo`} className="text-h3">
          {nomesDosGrupos[n - 1]}
          {n === 4 && <span className="text-body-sm font-normal text-ink-muted"> (opcional)</span>}
        </h2>
        {conteudo}
        {n < TOTAL_PASSOS && (
          <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 -mx-2 flex items-center gap-3 rounded-lg border border-line-strong bg-surface-200 p-3 shadow-raised sm:static sm:mx-0 sm:border-0 sm:border-t sm:border-line sm:p-0 sm:pt-5 sm:shadow-none sm:rounded-none">
            {n > 1 && (
              <Botao type="button" variante="secundario" onClick={() => irPara(n - 1)} aria-label="Voltar">
                <ArrowLeft aria-hidden />
                <span className="hidden sm:inline">Voltar</span>
              </Botao>
            )}
            {n === 4 && (
              <Botao type="button" variante="fantasma" onClick={() => irPara(n + 1)}>
                Pular
              </Botao>
            )}
            <Botao type="button" variante="primario" onClick={continuar} className="flex-1 sm:flex-none sm:min-w-44">
              Continuar
              <ArrowRight aria-hidden />
            </Botao>
          </div>
        )}
      </section>
    ) : (
      <Secao key={n} numero={n} titulo={nomesDosGrupos[n - 1]} id={`secao-${n}`}>
        {conteudo}
      </Secao>
    );

  const conteudoDaVaga = (
    <>
      {passos && !editando && atalhos}
      {passos ? (
        !editando && (
          <>
            <input type="hidden" name="tipo" value="vaga" />
            <p className="-mt-2 text-body-sm text-ink-muted">
              Só são obrigatórios o título, o tipo de contratação, o valor e o bairro. Oferece serviços?{" "}
              <Link href="/painel/servicos" className="underline underline-offset-2">
                Monte sua vitrine
              </Link>
              .
            </p>
          </>
        )
      ) : (
        <div className="flex flex-col gap-3">
          {editando ? (
            <>
              <input type="hidden" name="tipo" value={tipo} />
              <p className="text-body text-ink-muted">
                {vaga ? "Uma vaga de trabalho." : "Um serviço oferecido."} O tipo não muda depois de publicado.
              </p>
            </>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="tipo" value="vaga" />
              <div className="flex gap-3 rounded-md border border-ink bg-surface-300 p-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-surface-200 text-ink">
                  <Briefcase aria-hidden className="size-5" />
                </span>
                <span>
                  <span className="flex items-center gap-1.5 text-label">
                    Uma vaga
                    <Check aria-hidden className="size-4" />
                  </span>
                  <span className="block text-body-sm text-ink-muted">
                    Contratar alguém: com carteira, temporário, diária ou freelance (um pedreiro para um reboco, uma
                    faxina…).
                  </span>
                </span>
              </div>
              <Link
                href="/painel/servicos"
                className="flex gap-3 rounded-md border border-line-strong bg-surface-200 p-4 transition-colors hover:bg-surface-300"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-surface-300 text-ink">
                  <Wrench aria-hidden className="size-5" />
                </span>
                <span>
                  <span className="flex items-center gap-1 text-label">
                    Ofereço serviços
                    <ArrowRight aria-hidden className="size-4" />
                  </span>
                  <span className="block text-body-sm text-ink-muted">
                    Sou pedreiro, diarista, manicure… Monte sua vitrine com fotos e preço.
                  </span>
                </span>
              </Link>
            </div>
          )}
        </div>
      )}
      {editando && passos && <input type="hidden" name="tipo" value={tipo} />}
      <Campo
        rotulo="Título"
        nome="titulo"
        erro={erros.titulo}
        ajuda="Curto e direto, como você falaria para um vizinho."
      >
        <input
          {...ligarCampo("titulo", erros.titulo, true)}
          defaultValue={inicial.titulo}
          onChange={(e) => setTituloAtual(e.target.value)}
          maxLength={90}
          required
          placeholder={vaga ? "Ex.: Auxiliar de cozinha para o turno da noite" : "Ex.: Pedreiro: reboco e contrapiso"}
          className={classesEntrada}
        />
      </Campo>

      <Campo rotulo="Categoria" nome="categoria" opcional erro={erros.categoria}>
        <Seletor
          {...ligarCampo("categoria", erros.categoria)}
          value={categoriaAtual}
          onChange={(e) => setCategoriaAtual(e.target.value)}
          className={classesEntrada}
        >
          <option value="">Escolher pelo título</option>
          {CATEGORIAS.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.nome}
            </option>
          ))}
        </Seletor>
        {sugerida && (
          <p role="status" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm">
            <span>Parece {nomeCategoria(sugerida).nome}.</span>
            <button
              type="button"
              onClick={() => setCategoriaAtual(sugerida)}
              className="min-h-9 text-label text-terra-text underline underline-offset-2"
            >
              Usar {nomeCategoria(sugerida).nome}
            </button>
          </p>
        )}
      </Campo>

      {vaga && agencia && (
        <EmpresaDaVaga
          clientes={clientes}
          inicial={{ cliente_id: inicial.cliente_id ?? null, contratante: inicial.contratante ?? null }}
          erros={erros}
          confidencial={confidencial}
          aoMudarConfidencial={mudarConfidencial}
          aoEscolherCliente={usarLugarDoCliente}
          equipe={equipe}
          emNomeDe={emNomeDe}
          contatoAgencia={contatoAgencia}
        />
      )}

      {vaga && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-label">Tipo de contratação</legend>
          <div className="flex flex-wrap gap-2">
            {Object.entries(REGIMES)
              .filter(([v]) => todosRegimes || REGIMES_PRINCIPAIS.includes(v as Regime))
              .map(([v, r]) => (
                <label
                  key={v}
                  title={r.ajuda}
                  className="inline-flex min-h-10 cursor-pointer items-center rounded-pill border border-line bg-surface-300 px-3.5 text-label transition-colors has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-surface-100 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus"
                >
                  <input
                    type="radio"
                    name="regime"
                    value={v}
                    defaultChecked={inicial.regime === v}
                    onChange={() => {
                      if (!mexeuNoCurriculo) setPedeCurriculo(REGIMES_COM_CURRICULO.includes(v as Regime));
                    }}
                    className="sr-only"
                  />
                  {r.nome}
                </label>
              ))}
            {!todosRegimes && (
              <button
                type="button"
                onClick={() => setTodosRegimes(true)}
                className="inline-flex min-h-10 items-center rounded-pill px-2 text-label text-terra-text underline underline-offset-2"
              >
                Outros tipos
              </button>
            )}
          </div>
          {erros.regime && <MensagemErro>{erros.regime}</MensagemErro>}
        </fieldset>
      )}

      {vaga && (
        <Campo rotulo="Quantas pessoas" nome="vagas" erro={erros.vagas}>
          <input
            {...ligarCampo("vagas", erros.vagas)}
            type="number"
            inputMode="numeric"
            min={1}
            max={999}
            defaultValue={inicial.vagas}
            className={classesEntrada}
          />
        </Campo>
      )}
    </>
  );

  const conteudoDoPagamento = (
    <>
      <label className="inline-flex min-h-11 cursor-pointer items-center gap-3 self-start text-label">
        <input
          type="checkbox"
          name="combinar"
          checked={combinar}
          onChange={(e) => setCombinar(e.target.checked)}
          className="size-5 accent-[var(--pk-ink)]"
        />
        Valor a combinar
      </label>

      {!combinar && (
        <div className={`grid gap-4 ${vaga ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          <Campo
            rotulo={vaga ? "Valor ou a partir de (R$)" : "Valor (R$)"}
            nome="pagamento_valor"
            erro={erros.pagamento_valor}
          >
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-body text-ink-muted">
                R$
              </span>
              <input
                {...ligarCampo("pagamento_valor", erros.pagamento_valor)}
                defaultValue={valor}
                inputMode="decimal"
                placeholder={vaga ? "1.900" : "300"}
                className={`${classesEntrada} pl-10`}
              />
            </div>
          </Campo>
          {vaga && (
            <Campo rotulo="Até (R$)" nome="pagamento_ate" opcional erro={erros.pagamento_ate}>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-body text-ink-muted">
                  R$
                </span>
                <input
                  {...ligarCampo("pagamento_ate", erros.pagamento_ate)}
                  defaultValue={emTexto(inicial.pagamento_ate)}
                  inputMode="decimal"
                  placeholder="2.200"
                  className={`${classesEntrada} pl-10`}
                />
              </div>
            </Campo>
          )}
          <Campo rotulo="Por" nome="pagamento_unidade" erro={erros.pagamento_unidade}>
            <Seletor
              {...ligarCampo("pagamento_unidade", erros.pagamento_unidade)}
              value={unidade}
              onChange={(e) => setUnidade(e.target.value)}
              className={classesEntrada}
            >
              {Object.entries(UNIDADES).map(([v, nome]) => (
                <option key={v} value={v}>
                  {nome}
                </option>
              ))}
            </Seletor>
          </Campo>
        </div>
      )}

      {vaga && !combinar && (
        <p className="-mt-2 text-body-sm text-ink-muted">
          Para mostrar uma faixa, preencha o “Até”: aparece “de R$ 1.800 a R$ 2.200”.
        </p>
      )}

      {vaga && (
        <GanhosExtras
          inicial={inicial.ganhos_extras ?? ganhosDoBanco([], inicial.comissao)}
          erro={erros.ganhos_extras}
        />
      )}

      {vaga && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-label">
            Benefícios <span className="font-normal text-ink-muted">(opcional)</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {BENEFICIOS.map((b) => (
              <label key={b.valor} className={classesPilula}>
                <input
                  type="checkbox"
                  name="beneficios_lista"
                  value={b.valor}
                  checked={beneficiosMarcados.includes(b.valor)}
                  onChange={(e) =>
                    setBeneficiosMarcados((atual) =>
                      e.target.checked ? [...atual, b.valor] : atual.filter((v) => v !== b.valor),
                    )
                  }
                  className="sr-only"
                />
                {beneficiosMarcados.includes(b.valor) && <Check aria-hidden className="size-4" />}
                {b.nome}
              </label>
            ))}
          </div>
          {erros.beneficios_lista && <MensagemErro>{erros.beneficios_lista}</MensagemErro>}
          <BeneficiosExtras
            inicial={inicial.beneficios_extras ?? []}
            erro={erros.beneficios_extras ?? erros.beneficios}
          />
        </fieldset>
      )}

      {vaga && <MontarHorario inicial={inicial.horario_detalhe ?? null} erro={erros.horario} />}
      {!vaga && (
        <Campo rotulo="Quando" nome="horario" opcional erro={erros.horario}>
          <input
            {...ligarCampo("horario", erros.horario)}
            defaultValue={inicial.horario ?? ""}
            maxLength={120}
            placeholder="Ex.: Pode ser no fim de semana"
            className={classesEntrada}
          />
        </Campo>
      )}
      {vaga && (
        <div className="grid gap-4 sm:max-w-72">
          <Campo rotulo="Jornada" nome="jornada" opcional erro={erros.jornada}>
            <Seletor
              {...ligarCampo("jornada", erros.jornada)}
              defaultValue={inicial.jornada ?? ""}
              className={classesEntrada}
            >
              <option value="">Não informar</option>
              {JORNADAS.map((j) => (
                <option key={j.valor} value={j.valor}>
                  {j.nome}
                </option>
              ))}
            </Seletor>
          </Campo>
        </div>
      )}
    </>
  );

  const conteudoDoLugar = (
    <>
      <p className="-mt-2 text-body-sm text-ink-muted">
        {confidencial
          ? "Empresa confidencial: a vaga mostra só a cidade, sem endereço nem ponto no mapa. O bairro é opcional: sem ele, a distância conta do centro da cidade."
          : "Basta o bairro. O CEP e o pino no mapa são opcionais: sem eles, a vaga fica no meio do bairro."}
      </p>
      {lugarDoCliente && (
        <p role="status" className="-mt-2 rounded-md bg-surface-300 px-3 py-2 text-body-sm text-ink">
          Veio o endereço de {lugarDoCliente}. Confira se a vaga é lá.
        </p>
      )}
      {confidencial ? (
        // confidencial: sem CEP, endereço e pino (o servidor põe o ponto no meio do bairro ou da cidade)
        camposDoLugar
      ) : (
        <LocalComCep
          key={chaveLugar}
          inicial={lugar.lat != null && lugar.lng != null ? { lat: lugar.lat, lng: lugar.lng } : null}
          inicialCep={lugar.cep}
          inicialEndereco={lugar.endereco}
          publico={confidencial ? false : enderecoPublico}
          mapaOpcional
          cidade={cidade}
          erro={erros.lat ?? erros.lng}
          aoAchar={({ cidade: c, bairro: b }) => {
            if ((CIDADES as readonly string[]).includes(c)) setCidade(c);
            return trocarBairro(formulario.current?.elements.namedItem("bairro"), b);
          }}
        >
          {camposDoLugar}
        </LocalComCep>
      )}
      {(erros.lat || erros.lng) && <MensagemErro>{erros.lat ?? erros.lng}</MensagemErro>}
      {(erros.cep || erros.endereco) && <MensagemErro>{erros.cep ?? erros.endereco}</MensagemErro>}
      {vaga && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-label">Modelo de trabalho</legend>
          <div className="flex flex-wrap gap-2">
            {MODELOS.map((m) => (
              <label key={m.valor} className={classesPilula}>
                <input
                  type="radio"
                  name="modelo"
                  value={m.valor}
                  defaultChecked={(inicial.modelo ?? (editando ? null : "presencial")) === m.valor}
                  className="sr-only"
                />
                {m.nome}
              </label>
            ))}
          </div>
          {erros.modelo && <MensagemErro>{erros.modelo}</MensagemErro>}
        </fieldset>
      )}
    </>
  );

  const conteudoDosDetalhes = (
    <>
      <Campo
        rotulo="Descrição"
        nome="descricao"
        opcional
        erro={erros.descricao}
        ajuda={
          vaga
            ? "O que a pessoa vai fazer, o que precisa saber e o que você oferece. Em branco, montamos uma descrição simples com o que você preencheu. Sem telefone: o contato aparece no match."
            : "O que você faz, há quanto tempo e o que está incluído. Sem telefone: o contato aparece no match."
        }
      >
        <textarea
          {...ligarCampo("descricao", erros.descricao, true)}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          rows={7}
          maxLength={3000}
          className={`${classesEntrada} resize-y`}
        />
        <span className="self-end text-body-sm text-ink-muted">{descricao.length}/3000</span>
      </Campo>
      {ia && <MelhorarTexto lerRascunho={lerRascunho} aplicar={aplicarSugestao} />}

      {vaga && (
        <label className="flex cursor-pointer items-start gap-3 rounded-md bg-surface-300 p-4">
          <input
            type="checkbox"
            name="pede_curriculo"
            checked={pedeCurriculo}
            onChange={(e) => {
              setMexeuNoCurriculo(true);
              setPedeCurriculo(e.target.checked);
            }}
            className="mt-0.5 size-5 shrink-0 accent-[var(--pk-ink)]"
          />
          <span>
            <span className="block text-label">Pedir currículo</span>
            <span className="block text-body-sm text-ink-muted">
              Quem curtir é convidado a preencher o currículo: estudos, experiências, cursos e CNH. Você vê na lista de
              interessados. Se aceitar alguém que ainda não mandou, a pessoa recebe o pedido e o match sai quando o
              currículo chegar.
            </span>
          </span>
        </label>
      )}

      {vaga && (
        <div className="flex flex-col gap-5 border-t border-line pt-5">
          <h3 className="text-label">Requisitos</h3>
          <p className="-mt-2 text-body-sm text-ink-muted">
            Tudo opcional. Peça só o que o trabalho precisa de verdade: quanto menos exigência, mais gente perto se
            candidata.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo rotulo="Escolaridade mínima" nome="escolaridade_minima" erro={erros.escolaridade_minima}>
              <Seletor
                {...ligarCampo("escolaridade_minima", erros.escolaridade_minima)}
                defaultValue={inicial.escolaridade_minima ?? ""}
                className={classesEntrada}
              >
                <option value="">Não exige</option>
                {ESCOLARIDADES.map((e) => (
                  <option key={e.valor} value={e.valor}>
                    {e.nome}
                  </option>
                ))}
              </Seletor>
            </Campo>
            <Campo rotulo="Experiência" nome="experiencia" erro={erros.experiencia}>
              <Seletor
                {...ligarCampo("experiencia", erros.experiencia)}
                defaultValue={inicial.experiencia ?? ""}
                className={classesEntrada}
              >
                <option value="">Não informar</option>
                {EXPERIENCIAS.map((e) => (
                  <option key={e.valor} value={e.valor}>
                    {e.nome}
                  </option>
                ))}
              </Seletor>
            </Campo>
            <Campo rotulo="CNH" nome="cnh" erro={erros.cnh}>
              <Seletor {...ligarCampo("cnh", erros.cnh)} defaultValue={inicial.cnh ?? ""} className={classesEntrada}>
                <option value="">Não precisa</option>
                {CNHS.map((c) => (
                  <option key={c} value={c}>
                    Categoria {c}
                  </option>
                ))}
              </Seletor>
            </Campo>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-label">Pessoas com deficiência (PCD)</legend>
            <div className="flex flex-wrap gap-2">
              <label className={classesPilula}>
                <input type="radio" name="pcd" value="" defaultChecked={!inicial.pcd} className="sr-only" />
                Não é específica
              </label>
              {PCDS.map((p) => (
                <label key={p.valor} title={p.ajuda} className={classesPilula}>
                  <input
                    type="radio"
                    name="pcd"
                    value={p.valor}
                    defaultChecked={inicial.pcd === p.valor}
                    className="sr-only"
                  />
                  {p.nome}
                </label>
              ))}
            </div>
            {erros.pcd && <MensagemErro>{erros.pcd}</MensagemErro>}
          </fieldset>
          <EditorPerguntas inicial={inicial.perguntas ?? []} erro={erros.perguntas} />
        </div>
      )}
    </>
  );

  const conteudoDaPublicacao = (
    <>
      {passos && resumo.length > 0 && (
        <ul
          aria-label="Resumo da vaga"
          className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-100"
        >
          {resumo.map((r) => (
            <li key={r.passo} className="flex items-start gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-label">{r.nome}</span>
                <span className="block text-body-sm text-ink-muted">{r.texto || "Nada preenchido"}</span>
              </span>
              <button
                type="button"
                onClick={() => irPara(r.passo)}
                className="min-h-9 shrink-0 text-label text-terra-text underline underline-offset-2"
              >
                Editar
              </button>
            </li>
          ))}
        </ul>
      )}
      {vaga && (
        <fieldset className="flex flex-col gap-2 rounded-md border border-line bg-surface-200 p-4">
          <legend className="sr-only">Expiração automática</legend>
          <p className="text-label" aria-hidden>
            Expiração automática
          </p>
          <p className="-mt-1 text-body-sm text-ink-muted">
            Em quantos dias a vaga sai do ar sozinha. Sem prazo, ela fica no ar até você encerrar ou marcar como
            preenchida.
          </p>
          <div className="flex flex-wrap gap-2">
            {PRAZOS.map((d) => (
              <label key={d} className={classesPilula}>
                <input
                  type="radio"
                  name="prazo"
                  value={d}
                  checked={prazo === String(d)}
                  onChange={() => setPrazo(String(d))}
                  className="sr-only"
                />
                {d} dias
              </label>
            ))}
            <label className={classesPilula}>
              <input
                type="radio"
                name="prazo"
                value="outro"
                checked={prazo === "outro"}
                onChange={() => setPrazo("outro")}
                className="sr-only"
              />
              Outro
            </label>
            <label className={classesPilula}>
              <input
                type="radio"
                name="prazo"
                value="sem"
                checked={prazo === "sem"}
                onChange={() => setPrazo("sem")}
                className="sr-only"
              />
              Sem prazo
            </label>
          </div>
          {prazo === "outro" && (
            <label htmlFor="prazo-outro" className="flex items-center gap-2 text-body-sm">
              <input
                id="prazo-outro"
                name="prazo_outro"
                type="number"
                inputMode="numeric"
                min={1}
                max={365}
                defaultValue={prazoInicial && !PRAZOS.includes(prazoInicial) ? prazoInicial : ""}
                aria-invalid={erros.prazo_dias ? true : undefined}
                className={`${classesEntrada} w-24`}
              />
              dias (de 1 a 365)
            </label>
          )}
          {erros.prazo_dias && <MensagemErro>{erros.prazo_dias}</MensagemErro>}
        </fieldset>
      )}

      {vaga && (
        // em destaque (borda e fundo laranja, o ícone e a tag "Novo"): é a marca nova e a que mais chama gente
        <label className="flex cursor-pointer items-start gap-3 rounded-md border-2 border-terra bg-terra-soft p-4 has-[:checked]:shadow-raised">
          {/* o servidor só mexe no "Começa já" quando o formulário tem a caixa */}
          <input type="hidden" name="comeca_ja_enviado" value="1" />
          <input
            type="checkbox"
            name="comeca_ja"
            defaultChecked={inicial.comeca_ja ?? false}
            className="mt-0.5 size-5 shrink-0 accent-[var(--pk-terra)]"
          />
          <CalendarClock aria-hidden className="mt-0.5 size-5 shrink-0 text-terra-text" />
          <span>
            <span className="flex flex-wrap items-center gap-2 text-label">
              Começa já: precisa de alguém para começar logo
              <Selo variante="novo">Novo</Selo>
            </span>
            <span className="mt-0.5 block text-body-sm text-ink">
              A vaga ganha a etiqueta “Começa já”, e quem pode começar na hora acha pelo filtro. Desmarque quando a
              pressa passar.
            </span>
          </span>
        </label>
      )}

      {vaga && (
        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-line bg-surface-200 p-4">
          <input
            type="checkbox"
            name="contato_direto"
            defaultChecked={inicial.contato_direto ?? false}
            className="mt-0.5 size-5 shrink-0 accent-[var(--pk-ink)]"
          />
          <span>
            <span className="block text-label">Contato direto: quem curtir já recebe o WhatsApp</span>
            <span className="block text-body-sm text-ink-muted">
              Sem esperar você aceitar, e você vê o contato de quem curtiu. Mais rápido, mas chegam mais contatos.
              Desligado, você escolhe quem aceita.
            </span>
          </span>
        </label>
      )}

      {passos ? <div className="lg:hidden">{previa}</div> : previa}
      {estado.semSalvar && (
        <Aviso tipo="erro" titulo="Nada foi salvo ainda">
          {editando || equipe ? (
            <>Toque em salvar de novo. Se não der, copie o que você mudou antes de recarregar a página.</>
          ) : (
            <span className="flex flex-col items-start gap-2">
              O que você preencheu ficou guardado neste aparelho e volta quando a página abrir de novo.
              <Botao type="button" variante="secundario" tamanho="sm" onClick={() => window.location.reload()}>
                Recarregar a página
              </Botao>
            </span>
          )}
        </Aviso>
      )}
      {estado.erro && (
        <ResumoErros
          erros={erros}
          nomes={NOMES_CAMPOS}
          acao={semConta ? "continuar" : equipe || editando ? "salvar" : "publicar"}
          reserva={estado.erro}
          antesDeIr={(campo) => {
            if (passos) irPara(passoDoCampo(campo));
          }}
        />
      )}
    </>
  );

  return (
    <form ref={formulario} onSubmit={enviar} noValidate className="flex flex-col gap-6">
      {inicial.id && <input type="hidden" name="id" value={inicial.id} />}
      {Object.entries(extras ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {emNomeDe && (
        <Aviso tipo="alerta" titulo={`Publicando em nome de ${emNomeDe}`}>
          A vaga sai no nome e com o contato desta conta, como se ela mesma tivesse publicado.
        </Aviso>
      )}

      {passos ? (
        <div ref={topo} className="flex scroll-mt-24 flex-col gap-4">
          <CabecalhoDosPassos passo={passo} maxPasso={maxPasso} irPara={irPara} sair={semConta ? "/" : "/painel"} />
          {passo < TOTAL_PASSOS && estado.erro && resumoErrosNoTopo}
        </div>
      ) : (
        <nav aria-label="Partes do formulário" className="flex flex-wrap gap-x-4 gap-y-1 text-label text-ink-muted">
          {nomesDosGrupos.map((nome, k) => (
            <a
              key={nome}
              href={`#secao-${k + 1}`}
              className="min-h-9 underline-offset-2 hover:text-ink hover:underline"
            >
              {k + 1}. {nome}
            </a>
          ))}
        </nav>
      )}

      <div
        className={
          passos ? "flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-8" : "contents"
        }
      >
        <div className="flex min-w-0 flex-col gap-6">
          {grupo(1, conteudoDaVaga)}
          {grupo(2, conteudoDoPagamento)}
          {grupo(3, conteudoDoLugar)}
          {grupo(4, conteudoDosDetalhes)}
          {passos ? (
            <section
              id="passo-5"
              hidden={passo !== TOTAL_PASSOS}
              aria-labelledby="passo-5-titulo"
              className={passo === TOTAL_PASSOS ? "flex flex-col gap-5" : "hidden"}
            >
              <h2 id="passo-5-titulo" className="sr-only">
                Conferir e publicar
              </h2>
              {conteudoDaPublicacao}
              <div
                className={`flex flex-col gap-3 sm:flex-row sm:items-center ${passos ? "sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 -mx-1 rounded-lg border border-line-strong bg-surface-200 p-3 shadow-raised sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none" : ""}`}
              >
                {passos && (
                  <Botao
                    type="button"
                    variante="secundario"
                    onClick={() => irPara(passo - 1)}
                    className="hidden sm:inline-flex"
                  >
                    <ArrowLeft aria-hidden />
                    Voltar
                  </Botao>
                )}
                <Botao type="submit" variante="primario" disabled={enviando} className="sm:min-w-56">
                  {enviando ? (semConta ? "Conferindo…" : "Salvando…") : rotuloSalvar}
                </Botao>
                {emNomeDe ? (
                  <p className="text-body-sm text-ink-muted">
                    Fica no ar pelo prazo escolhido. Quem se candidatar aparece no painel de {emNomeDe}, que recebe os
                    avisos por e-mail.
                  </p>
                ) : equipe ? (
                  <p className="text-body-sm text-ink-muted">
                    Quem publicou não recebe aviso da correção. A mudança fica no registro da equipe.
                  </p>
                ) : (
                  <p className="text-body-sm text-ink-muted">
                    {semConta ? `Depois é só entrar com ${jeitosDeEntrar()}: a vaga vai ao ar na hora. ` : ""}
                    Grátis. Seu WhatsApp só aparece no match. Fica no ar pelo prazo que você escolher, e dá para
                    renovar. Ao publicar, você concorda com as{" "}
                    <Link href="/regras" className="underline">
                      regras do Publike
                    </Link>
                    .
                  </p>
                )}
              </div>
            </section>
          ) : (
            <div id="secao-5" className="flex scroll-mt-24 flex-col gap-6">
              {conteudoDaPublicacao}
              <div
                className={`flex flex-col gap-3 sm:flex-row sm:items-center ${passos ? "sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 -mx-1 rounded-lg border border-line-strong bg-surface-200 p-3 shadow-raised sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none" : ""}`}
              >
                {passos && (
                  <Botao
                    type="button"
                    variante="secundario"
                    onClick={() => irPara(passo - 1)}
                    className="hidden sm:inline-flex"
                  >
                    <ArrowLeft aria-hidden />
                    Voltar
                  </Botao>
                )}
                <Botao type="submit" variante="primario" disabled={enviando} className="sm:min-w-56">
                  {enviando ? (semConta ? "Conferindo…" : "Salvando…") : rotuloSalvar}
                </Botao>
                {emNomeDe ? (
                  <p className="text-body-sm text-ink-muted">
                    Fica no ar pelo prazo escolhido. Quem se candidatar aparece no painel de {emNomeDe}, que recebe os
                    avisos por e-mail.
                  </p>
                ) : equipe ? (
                  <p className="text-body-sm text-ink-muted">
                    Quem publicou não recebe aviso da correção. A mudança fica no registro da equipe.
                  </p>
                ) : (
                  <p className="text-body-sm text-ink-muted">
                    {semConta ? `Depois é só entrar com ${jeitosDeEntrar()}: a vaga vai ao ar na hora. ` : ""}
                    Grátis. Seu WhatsApp só aparece no match. Fica no ar pelo prazo que você escolher, e dá para
                    renovar. Ao publicar, você concorda com as{" "}
                    <Link href="/regras" className="underline">
                      regras do Publike
                    </Link>
                    .
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
        {passos && previa && <aside className="hidden lg:sticky lg:top-24 lg:block">{previa}</aside>}
      </div>

      {/* a vaga nova que não chegou ao servidor já ficou guardada: recarregar não pergunta */}
      <AvisoAoSair
        ativo={!(estado.semSalvar && !editando && !equipe)}
        mudou={() => jaMudou || mudouDesdeQueAbriu()}
        // sem conta, o que a pessoa escreve já fica no aparelho: fechar a aba não perde nada
        perguntarAoFechar={!semConta}
        titulo={editando || equipe ? "Sair sem salvar as alterações?" : "Sair sem publicar a vaga?"}
        texto={
          editando || equipe
            ? "O que você mudou ainda não foi salvo."
            : semConta
              ? "O que você escreveu fica guardado neste aparelho, mas a vaga só vai ao ar quando você continuar e entrar."
              : "Ela ainda não foi publicada, e o que você preencheu se perde."
        }
        rotuloSalvar={rotuloSalvar}
        rotuloSair={semConta ? "Sair e terminar depois" : undefined}
        podeSalvar={!enviando}
        aoSalvar={() => formulario.current?.requestSubmit()}
      />
    </form>
  );
}

/** Os passos no alto: no computador, na horizontal (tocar num já aberto volta para ele); no celular, "Passo 2 de 5". */
function CabecalhoDosPassos({
  passo,
  maxPasso,
  irPara,
  sair,
}: {
  passo: number;
  maxPasso: number;
  irPara: (n: number) => void;
  /** no celular, o X para sair (o AvisoAoSair pergunta antes, se já escreveu algo) */
  sair: string;
}) {
  const atual = PASSOS_PUBLICAR[passo - 1];
  return (
    <>
      <ol aria-label="Passos para publicar" className="hidden items-center sm:flex">
        {PASSOS_PUBLICAR.map((p, k) => {
          const feito = p.numero < passo;
          const agora = p.numero === passo;
          const pode = p.numero <= maxPasso && !agora;
          const marca = (
            <span
              aria-hidden
              className={`grid size-8 shrink-0 place-items-center rounded-pill border-2 text-label ${
                agora
                  ? "border-ink bg-ink text-surface-100"
                  : feito
                    ? "border-cerrado bg-cerrado text-on-cerrado"
                    : "border-line-strong bg-surface-200 text-ink-muted"
              }`}
            >
              {feito ? <Check className="size-4" /> : p.numero}
            </span>
          );
          return (
            <li key={p.numero} className={`flex items-center ${k < PASSOS_PUBLICAR.length - 1 ? "flex-1" : ""}`}>
              {pode ? (
                <button
                  type="button"
                  onClick={() => irPara(p.numero)}
                  className="flex min-h-11 items-center gap-2 text-label whitespace-nowrap hover:underline"
                >
                  {marca}
                  {p.nome}
                </button>
              ) : (
                <span
                  aria-current={agora ? "step" : undefined}
                  className={`flex min-h-11 items-center gap-2 text-label whitespace-nowrap ${agora ? "" : "text-ink-muted"}`}
                >
                  {marca}
                  {p.nome}
                </span>
              )}
              {k < PASSOS_PUBLICAR.length - 1 && (
                <span aria-hidden className={`mx-3 h-0.5 min-w-4 flex-1 ${feito ? "bg-cerrado" : "bg-line"}`} />
              )}
            </li>
          );
        })}
      </ol>
      <div className="sm:hidden">
        <div className="flex items-center justify-between gap-2">
          <p className="text-label">
            Passo {passo} de {TOTAL_PASSOS} · {atual.nome}
            {"opcional" in atual && atual.opcional && <span className="font-normal text-ink-muted"> (opcional)</span>}
          </p>
          <Link
            href={sair}
            aria-label="Sair sem publicar"
            className="-mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-pill text-ink-muted hover:bg-surface-300 hover:text-ink"
          >
            <X aria-hidden className="size-5" />
          </Link>
        </div>
        <div
          role="progressbar"
          aria-label="Quanto falta"
          aria-valuemin={1}
          aria-valuemax={TOTAL_PASSOS}
          aria-valuenow={passo}
          className="mt-2 h-1.5 overflow-hidden rounded-pill bg-surface-300"
        >
          <span className="block h-full rounded-pill bg-ink" style={{ width: `${(passo / TOTAL_PASSOS) * 100}%` }} />
        </div>
      </div>
    </>
  );
}

/** O horário montado (campo escondido) em texto, para o rascunho que vai à IA. */
function horarioEscrito(json: string) {
  const r = lerHorario(json || null);
  return r.ok && r.horario ? textoDoHorario(r.horario) : null;
}
