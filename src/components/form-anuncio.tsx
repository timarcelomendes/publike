"use client";

import { ArrowRight, Briefcase, Check, ChevronDown, Wrench } from "lucide-react";
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
import { temLugar, type ClienteParaVaga } from "@/lib/clientes";
import {
  BENEFICIOS,
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
import { Aviso } from "./ui/basicos";
import { Botao } from "./ui/botao";
import { Campo, classesEntrada, ligarCampo, MensagemErro, Seletor } from "./ui/campo";
import { ResumoErros } from "./ui/resumo-erros";

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

/** Campos que ficam em "Mais detalhes": com erro num deles, a seção abre. */
const CAMPOS_DETALHES = [
  "categoria",
  "descricao",
  "jornada",
  "modelo",
  "beneficios_lista",
  "beneficios_extras",
  "beneficios",
  "vagas",
  "escolaridade_minima",
  "experiencia",
  "cnh",
  "pcd",
  "perguntas",
];

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

function Secao({ numero, titulo, children }: { numero: number; titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-5 rounded-lg border border-line bg-surface-200 p-5 sm:p-6">
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
  enderecoPublico?: boolean;
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
}) {
  const editando = Boolean(inicial.id);
  // a falha sem chegar ao servidor (site publicado de novo com a página aberta) vira aviso na tela
  const acaoProtegida = useMemo(() => protegerAcao(acaoSalvar, "vaga"), [acaoSalvar]);
  const [estado, acao, enviando] = useActionState(acaoProtegida, ESTADO_INICIAL);
  // anúncio novo é sempre vaga; serviço tem cadastro próprio ("Meus serviços")
  const tipo: TipoAnuncio = editando ? inicial.tipo : "vaga";
  const [combinar, setCombinar] = useState(inicial.combinar ?? (editando ? inicial.pagamento_valor == null : false));
  // "Mais detalhes": aberto ao editar; ao publicar, só se a pessoa abrir (ou se um campo de lá tiver erro)
  const [detalhes, setDetalhes] = useState(editando);
  const [unidade, setUnidade] = useState(inicial.pagamento_unidade ?? (inicial.tipo === "vaga" ? "mes" : "servico"));
  const [descricao, setDescricao] = useState(inicial.descricao);
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
  // vaga nova que não chegou ao servidor: o preenchido fica no aparelho e volta ao recarregar
  // (o /publicar traz o rascunho de volta)
  useEffect(() => {
    if (estado.semSalvar && !editando && !equipe && formulario.current) guardarRascunho(formulario.current);
  }, [estado, editando, equipe]);
  const erros = estado.erros ?? {};
  const erroNosDetalhes = Object.keys(erros).some((k) => CAMPOS_DETALHES.includes(k));
  const vaga = tipo === "vaga";

  // Depois de um erro, leva a pessoa até o primeiro campo com problema
  useEffect(() => {
    if (!estado.erros) return;
    const abrir = Object.keys(estado.erros).some((k) => CAMPOS_DETALHES.includes(k));
    const t = window.setTimeout(
      () => {
        formulario.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      },
      abrir ? 50 : 0,
    );
    return () => window.clearTimeout(t);
  }, [estado]);

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

  function aplicarSugestao(titulo: string, novaDescricao: string) {
    const campoTitulo = formulario.current?.elements.namedItem("titulo");
    if (campoTitulo instanceof HTMLInputElement) campoTitulo.value = titulo;
    setDescricao(novaDescricao);
  }

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

      <Secao numero={1} titulo="O que você quer publicar?">
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
                  Contratar alguém: com carteira, temporário, diária ou freelance (um pedreiro para um reboco, uma faxina…).
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
      </Secao>

      <Secao numero={2} titulo={vaga ? "O essencial" : "Conte sobre o serviço"}>
        <p className="-mt-2 text-body-sm text-ink-muted">
          Só isto é obrigatório: o quê, quanto e quando. O resto fica em “Mais detalhes”, se quiser.
        </p>
        <Campo rotulo="Título" nome="titulo" erro={erros.titulo} ajuda="Curto e direto, como você falaria para um vizinho.">
          <input
            {...ligarCampo("titulo", erros.titulo, true)}
            defaultValue={inicial.titulo}
            maxLength={90}
            required
            placeholder={vaga ? "Ex.: Auxiliar de cozinha para o turno da noite" : "Ex.: Pedreiro: reboco e contrapiso"}
            className={classesEntrada}
          />
        </Campo>

        {vaga && agencia && (
          <EmpresaDaVaga
            clientes={clientes}
            inicial={{ cliente_id: inicial.cliente_id ?? null, contratante: inicial.contratante ?? null }}
            erros={erros}
            confidencial={confidencial}
            aoMudarConfidencial={setConfidencial}
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
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-body text-ink-muted">R$</span>
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

        {vaga && <MontarHorario inicial={inicial.horario_detalhe ?? null} erro={erros.horario} />}
      </Secao>

      <Secao numero={3} titulo="Onde é">
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
            publico={enderecoPublico && !confidencial}
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
      </Secao>

      <details
        open={detalhes || erroNosDetalhes}
        onToggle={(e) => setDetalhes(e.currentTarget.open)}
        className="group rounded-lg border border-line bg-surface-200"
      >
        <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 p-5 sm:px-6 [&::-webkit-details-marker]:hidden">
          <span className="flex size-8 items-center justify-center rounded-pill bg-surface-300 text-label">4</span>
          <span className="flex-1">
            <span className="block text-h3">Mais detalhes</span>
            <span className="block text-body-sm text-ink-muted">
              Opcional: descrição, categoria, benefícios, requisitos e perguntas para o candidato.
            </span>
          </span>
          <ChevronDown aria-hidden className="size-5 text-ink-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="flex flex-col gap-5 border-t border-line p-5 sm:p-6">
          <Campo rotulo="Categoria" nome="categoria" opcional erro={erros.categoria}>
            <Seletor
              {...ligarCampo("categoria", erros.categoria)}
              defaultValue={inicial.categoria}
              className={classesEntrada}
            >
              <option value="">Escolher pelo título</option>
              {CATEGORIAS.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.nome}
                </option>
              ))}
            </Seletor>
          </Campo>

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
            <div className="grid gap-4 sm:grid-cols-2">
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
            </div>
          )}

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
                  Quem curtir é convidado a preencher o currículo: estudos, experiências, cursos e CNH. Você vê na lista
                  de interessados. Se aceitar alguém que ainda não mandou, a pessoa recebe o pedido e o match sai quando
                  o currículo chegar.
                </span>
              </span>
            </label>
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

          <div className={vaga ? "grid gap-4 sm:max-w-40" : "grid gap-4"}>
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
          </div>

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
                  <Seletor
                    {...ligarCampo("cnh", erros.cnh)}
                    defaultValue={inicial.cnh ?? ""}
                    className={classesEntrada}
                  >
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
        </div>
      </details>

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

      {previa}

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
            if (CAMPOS_DETALHES.includes(campo)) setDetalhes(true);
          }}
        />
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Botao type="submit" variante="primario" disabled={enviando} className="sm:min-w-56">
          {enviando
            ? semConta
              ? "Conferindo…"
              : "Salvando…"
            : semConta
              ? "Continuar para publicar"
              : equipe
                ? "Salvar correção"
                : editando
                  ? "Salvar alterações"
                  : vaga
                    ? "Publicar vaga"
                    : "Publicar serviço"}
        </Botao>
        {emNomeDe ? (
          <p className="text-body-sm text-ink-muted">
            Fica no ar pelo prazo escolhido. Quem se candidatar aparece no painel de {emNomeDe}, que recebe os avisos
            por e-mail.
          </p>
        ) : equipe ? (
          <p className="text-body-sm text-ink-muted">
            Quem publicou não recebe aviso da correção. A mudança fica no registro da equipe.
          </p>
        ) : (
          <p className="text-body-sm text-ink-muted">
            {semConta ? "Depois é só entrar com seu WhatsApp ou e-mail: a vaga vai ao ar na hora. " : ""}
            Grátis. Seu WhatsApp só aparece no match. Fica no ar pelo prazo que você escolher, e dá para renovar. Ao
            publicar, você concorda com as{" "}
            <Link href="/regras" className="underline">
              regras do Publike
            </Link>
            .
          </p>
        )}
      </div>
    </form>
  );
}

/** O horário montado (campo escondido) em texto, para o rascunho que vai à IA. */
function horarioEscrito(json: string) {
  const r = lerHorario(json || null);
  return r.ok && r.horario ? textoDoHorario(r.horario) : null;
}
