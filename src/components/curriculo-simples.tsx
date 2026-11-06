"use client";

import { Download, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";
import { ESCOLARIDADES } from "@/lib/constantes";
import { Botao } from "./ui/botao";
import { classesEntrada, Seletor } from "./ui/campo";

// O Currículo simples grátis (claude/plano-curriculo-simples-gratis.md): preencher e baixar em PDF, sem conta. Nada
// vai para o servidor: o que a pessoa digita fica só neste aparelho (para não perder ao recarregar). O "Baixar em PDF"
// é a impressão do navegador, só com a folha. Depois, o convite para salvar no Publike: o currículo vai para o
// formulário do site (o mesmo rascunho "sem conta" de /perfil/curriculo) e volta preenchido depois de entrar.

type Experiencia = {
  chave: string;
  cargo: string;
  onde: string;
  inicio: string;
  fim: string;
  atual: boolean;
  fazia: string;
};

type Dados = {
  nome: string;
  whatsapp: string;
  email: string;
  onde: string;
  objetivo: string;
  experiencias: Experiencia[];
  escolaridade: string;
  curso: string;
  cursos: string;
  sabe: string;
  cnh: string;
};

const CHAVE = "publike_curriculo_simples";
// o rascunho sem conta do formulário do site (src/components/form-curriculo.tsx)
const CHAVE_DO_SITE = "publike_curriculo_sem_conta";

const nova = (): Experiencia => ({
  chave: Math.random().toString(36).slice(2),
  cargo: "",
  onde: "",
  inicio: "",
  fim: "",
  atual: false,
  fazia: "",
});

const VAZIO: Dados = {
  nome: "",
  whatsapp: "",
  email: "",
  onde: "",
  objetivo: "",
  experiencias: [nova()],
  escolaridade: "",
  curso: "",
  cursos: "",
  sabe: "",
  cnh: "",
};

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** "2024-03" → "mar/2024" */
function mes(valor: string) {
  const [ano, m] = valor.split("-").map(Number);
  return ano && m ? `${MESES[m - 1]}/${ano}` : "";
}

/** "032024" → "03/2024", enquanto digita */
function mascaraMes(t: string) {
  const d = t.replace(/\D/g, "").slice(0, 6);
  return d.length <= 2 ? d : `${d.slice(0, 2)}/${d.slice(2)}`;
}
/** "03/2024" → "2024-03"; "" se não for um mês de verdade */
function mesIso(t: string) {
  const m = /^(\d{2})\/(\d{4})$/.exec(t);
  if (!m) return "";
  const mm = Number(m[1]);
  const a = Number(m[2]);
  return mm >= 1 && mm <= 12 && a >= 1950 && a <= 2100 ? `${m[2]}-${m[1]}` : "";
}
const isoParaMes = (iso: string) => (/^\d{4}-\d{2}$/.test(iso) ? `${iso.slice(5)}/${iso.slice(0, 4)}` : "");

/** Mês e ano digitados (mm/aaaa), sem o calendário do navegador: mais rápido, principalmente para anos atrás. */
function CampoMes({
  rotulo,
  valor,
  mudar,
  desligado = false,
}: {
  rotulo: string;
  valor: string;
  mudar: (iso: string) => void;
  desligado?: boolean;
}) {
  const id = useId();
  const [texto, setTexto] = useState(() => isoParaMes(valor));
  // quando o valor muda por fora (dados guardados, "Trabalho aqui", apagar), o campo acompanha
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza com o valor de fora
    if (mesIso(texto) !== valor) setTexto(isoParaMes(valor));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só quando o valor de fora muda
  }, [valor]);
  const erro = texto.length === 7 && !mesIso(texto);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-label">
        {rotulo}
      </label>
      <input
        id={id}
        className={classesEntrada}
        inputMode="numeric"
        autoComplete="off"
        placeholder="mm/aaaa"
        maxLength={7}
        disabled={desligado}
        value={desligado ? "" : texto}
        aria-invalid={erro || undefined}
        aria-describedby={erro ? `${id}-erro` : undefined}
        onChange={(x) => {
          const t = mascaraMes(x.target.value);
          setTexto(t);
          mudar(mesIso(t));
        }}
      />
      {erro && (
        <span id={`${id}-erro`} className="text-body-sm text-danger">
          Confira o mês (01 a 12) e o ano.
        </span>
      )}
    </div>
  );
}

/** "(62) 99999-0000" enquanto digita */
function telefone(valor: string) {
  const d = valor.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
}

const linhas = (t: string) =>
  t
    .split(/\n|,|;/)
    .map((x) => x.trim())
    .filter(Boolean);

export function CurriculoSimples() {
  const id = useId();
  const [d, setD] = useState<Dados>(VAZIO);
  const [baixou, setBaixou] = useState(false);

  // o que estava preenchido neste aparelho
  useEffect(() => {
    try {
      const guardado = localStorage.getItem(CHAVE);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lido do navegador depois de montar
      if (guardado) setD({ ...VAZIO, ...(JSON.parse(guardado) as Partial<Dados>) });
    } catch {}
  }, []);
  useEffect(() => {
    try {
      if (d !== VAZIO) localStorage.setItem(CHAVE, JSON.stringify(d));
    } catch {}
  }, [d]);

  const muda = <K extends keyof Dados>(campo: K, valor: Dados[K]) => setD((x) => ({ ...x, [campo]: valor }));
  const mudaExp = (chave: string, mudanca: Partial<Experiencia>) =>
    setD((x) => ({ ...x, experiencias: x.experiencias.map((e) => (e.chave === chave ? { ...e, ...mudanca } : e)) }));

  const escolaridade = ESCOLARIDADES.find((e) => e.valor === d.escolaridade)?.nome ?? "";
  const comCurso = ["tecnico", "superior_incompleto", "superior", "pos"].includes(d.escolaridade);
  const experiencias = d.experiencias.filter((e) => e.cargo.trim() || e.onde.trim());

  function baixar() {
    window.print();
    setBaixou(true);
  }

  // leva para o formulário do site: volta preenchido depois de entrar
  function salvarNoPublike() {
    try {
      localStorage.setItem(
        CHAVE_DO_SITE,
        JSON.stringify({
          salvo_em: Date.now(),
          retrato: {
            titulo: d.objetivo.trim(),
            habilidades: linhas(d.sabe).slice(0, 20),
            escolaridade: d.escolaridade,
            curso: comCurso ? d.curso.trim() : "",
            estudos: [],
            experiencias: experiencias.map((e) => ({
              chave: e.chave,
              cargo: e.cargo.trim(),
              onde: e.onde.trim(),
              inicio: e.inicio,
              fim: e.atual ? "" : e.fim,
              atual: e.atual,
              descricao: e.fazia.trim(),
            })),
            cursos: linhas(d.cursos).slice(0, 12),
            cnh: d.cnh,
            disponibilidade: [],
            arquivo: null,
            nomePdf: null,
          },
        }),
      );
    } catch {}
  }

  const rotulo = "text-label";
  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-start">
      <form className="flex flex-col gap-6 print:hidden" onSubmit={(e) => e.preventDefault()}>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-h3">1. Seus dados</legend>
          <label className="flex flex-col gap-1.5">
            <span className={rotulo}>Nome completo</span>
            <input
              className={classesEntrada}
              value={d.nome}
              onChange={(e) => muda("nome", e.target.value)}
              autoComplete="name"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className={rotulo}>WhatsApp</span>
              <input
                className={classesEntrada}
                value={d.whatsapp}
                onChange={(e) => muda("whatsapp", telefone(e.target.value))}
                inputMode="tel"
                autoComplete="tel"
                placeholder="(62) 99999-0000"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={rotulo}>E-mail (se tiver)</span>
              <input
                className={classesEntrada}
                value={d.email}
                onChange={(e) => muda("email", e.target.value)}
                type="email"
                autoComplete="email"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className={rotulo}>Bairro e cidade</span>
            <input
              className={classesEntrada}
              value={d.onde}
              onChange={(e) => muda("onde", e.target.value)}
              placeholder="Setor Bueno, Goiânia"
            />
          </label>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-h3">2. O que você procura</legend>
          <label className="flex flex-col gap-1.5">
            <span className={rotulo}>Objetivo, em uma linha</span>
            <input
              className={classesEntrada}
              value={d.objetivo}
              onChange={(e) => muda("objetivo", e.target.value)}
              maxLength={120}
              placeholder="Vaga de auxiliar de cozinha ou atendente"
            />
          </label>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-h3">3. Onde você trabalhou</legend>
          <p className="text-body-sm text-ink-muted">
            Comece pelo mais recente. Nunca trabalhou com carteira? Conta também o bico, a diária, o trabalho na família
            e o voluntário.
          </p>
          {d.experiencias.map((e, i) => (
            <div key={e.chave} className="flex flex-col gap-3 rounded-lg border border-line bg-surface-100 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className={rotulo}>Função</span>
                  <input
                    className={classesEntrada}
                    value={e.cargo}
                    onChange={(x) => mudaExp(e.chave, { cargo: x.target.value })}
                    placeholder="Atendente"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className={rotulo}>Onde</span>
                  <input
                    className={classesEntrada}
                    value={e.onde}
                    onChange={(x) => mudaExp(e.chave, { onde: x.target.value })}
                    placeholder="Padaria do bairro"
                  />
                </label>
                <CampoMes rotulo="Começou em" valor={e.inicio} mudar={(v) => mudaExp(e.chave, { inicio: v })} />
                <CampoMes
                  rotulo="Saiu em"
                  valor={e.atual ? "" : e.fim}
                  desligado={e.atual}
                  mudar={(v) => mudaExp(e.chave, { fim: v })}
                />
              </div>
              <label className="flex min-h-11 items-center gap-2 text-body-sm">
                <input
                  type="checkbox"
                  className="size-5 accent-[var(--pk-ink)]"
                  checked={e.atual}
                  onChange={(x) => mudaExp(e.chave, { atual: x.target.checked })}
                />
                Trabalho aqui
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={rotulo}>O que você fazia</span>
                <textarea
                  className={`${classesEntrada} min-h-20 py-2`}
                  value={e.fazia}
                  onChange={(x) => mudaExp(e.chave, { fazia: x.target.value })}
                  maxLength={400}
                  placeholder="Atendia no balcão, cuidava do caixa e repunha os produtos."
                />
              </label>
              {d.experiencias.length > 1 && (
                <Botao
                  variante="fantasma"
                  tamanho="sm"
                  className="self-start"
                  onClick={() =>
                    muda(
                      "experiencias",
                      d.experiencias.filter((x) => x.chave !== e.chave),
                    )
                  }
                >
                  <Trash2 aria-hidden className="size-4" />
                  Tirar o trabalho {i + 1}
                </Botao>
              )}
            </div>
          ))}
          {d.experiencias.length < 6 && (
            <Botao
              tamanho="sm"
              className="self-start"
              onClick={() => muda("experiencias", [...d.experiencias, nova()])}
            >
              <Plus aria-hidden className="size-4" />
              Mais um trabalho
            </Botao>
          )}
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-h3">4. Estudo e cursos</legend>
          <label className="flex flex-col gap-1.5">
            <span className={rotulo}>Até onde estudou</span>
            <Seletor value={d.escolaridade} onChange={(e) => muda("escolaridade", e.target.value)}>
              <option value="">Escolha</option>
              {ESCOLARIDADES.map((e) => (
                <option key={e.valor} value={e.valor}>
                  {e.nome}
                </option>
              ))}
            </Seletor>
          </label>
          {comCurso && (
            <label className="flex flex-col gap-1.5">
              <span className={rotulo}>Qual curso</span>
              <input className={classesEntrada} value={d.curso} onChange={(e) => muda("curso", e.target.value)} />
            </label>
          )}
          <label className="flex flex-col gap-1.5">
            <span className={rotulo}>Cursos que fez (um por linha, mesmo os curtos e gratuitos)</span>
            <textarea
              className={`${classesEntrada} min-h-20 py-2`}
              value={d.cursos}
              onChange={(e) => muda("cursos", e.target.value)}
              placeholder={"Manipulação de alimentos (Senac)\nInformática básica"}
            />
          </label>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-h3">5. O que você sabe fazer</legend>
          <label className="flex flex-col gap-1.5">
            <span className={rotulo}>Separe por vírgula</span>
            <textarea
              className={`${classesEntrada} min-h-20 py-2`}
              value={d.sabe}
              onChange={(e) => muda("sabe", e.target.value)}
              placeholder="Operar caixa, atender cliente, mexer no computador"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={rotulo}>Carteira de motorista (se tiver)</span>
            <Seletor value={d.cnh} onChange={(e) => muda("cnh", e.target.value)}>
              <option value="">Não tenho</option>
              {["A", "B", "AB", "C", "D", "E"].map((c) => (
                <option key={c} value={c}>
                  Categoria {c}
                </option>
              ))}
            </Seletor>
          </label>
        </fieldset>
        <p className="text-body-sm text-ink-muted">
          O que você digita fica só neste aparelho: o Publike não recebe nada até você decidir salvar.
        </p>
      </form>

      {/* a folha: a prévia na tela e o que sai no PDF */}
      <div className="flex flex-col gap-4 lg:sticky lg:top-24">
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <Botao variante="primario" onClick={baixar} disabled={!d.nome.trim()}>
            <Download aria-hidden />
            Baixar em PDF
          </Botao>
          {!d.nome.trim() && <span className="text-body-sm text-ink-muted">Comece pelo seu nome.</span>}
        </div>
        {baixou && (
          <div role="status" className="rounded-lg border border-cerrado bg-surface-100 p-4 print:hidden">
            <p className="text-label">Quer que as empresas de Goiânia achem você?</p>
            <p className="mt-1 text-body-sm text-ink-muted">
              Salve este currículo no Publike, é grátis: quem contrata perto de casa vê, e você se candidata às vagas
              com um toque.
            </p>
            <Link
              href="/perfil/curriculo"
              onClick={salvarNoPublike}
              className="mt-3 inline-flex min-h-11 items-center rounded-pill bg-ink px-5 text-label text-surface-100 hover:opacity-90"
            >
              Salvar no Publike
            </Link>
          </div>
        )}
        <article
          id="folha-curriculo"
          aria-labelledby={`${id}-nome`}
          className="min-h-[34rem] w-full rounded-md border border-line bg-white p-[7%] text-[13px] text-[#1a1a1a] shadow-raised sm:text-[14px] print:min-h-0 print:rounded-none print:border-0 print:p-0 print:shadow-none"
        >
          <h2 id={`${id}-nome`} className="text-[1.6em] font-bold leading-tight">
            {d.nome.trim() || "Seu nome completo"}
          </h2>
          <p className="mt-1 text-[0.8em] text-[#444]">
            {[d.whatsapp && `WhatsApp ${d.whatsapp}`, d.email, d.onde].filter(Boolean).join("  ·  ") ||
              "WhatsApp  ·  e-mail  ·  bairro e cidade"}
          </p>
          {d.objetivo.trim() && (
            <Secao titulo="Objetivo">
              <p>{d.objetivo}</p>
            </Secao>
          )}
          {experiencias.length > 0 && (
            <Secao titulo="Experiência">
              <ul className="flex flex-col gap-2.5">
                {experiencias.map((e) => (
                  <li key={e.chave}>
                    <p className="font-semibold">{[e.cargo, e.onde].filter((x) => x.trim()).join(" — ")}</p>
                    {(e.inicio || e.fim || e.atual) && (
                      <p className="text-[0.85em] text-[#555]">
                        {[mes(e.inicio), e.atual ? "atual" : mes(e.fim)].filter(Boolean).join(" a ")}
                      </p>
                    )}
                    {e.fazia.trim() && <p className="mt-0.5">{e.fazia}</p>}
                  </li>
                ))}
              </ul>
            </Secao>
          )}
          {(escolaridade || linhas(d.cursos).length > 0) && (
            <Secao titulo="Estudo e cursos">
              {escolaridade && (
                <p>
                  {escolaridade}
                  {comCurso && d.curso.trim() ? ` — ${d.curso}` : ""}
                </p>
              )}
              {linhas(d.cursos).length > 0 && (
                <ul className="mt-1 list-disc pl-5">
                  {linhas(d.cursos).map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              )}
            </Secao>
          )}
          {(linhas(d.sabe).length > 0 || d.cnh) && (
            <Secao titulo="O que sei fazer">
              {linhas(d.sabe).length > 0 && <p>{linhas(d.sabe).join(" · ")}</p>}
              {d.cnh && <p className="mt-0.5">Carteira de motorista categoria {d.cnh}</p>}
            </Secao>
          )}
        </article>
      </div>

      {/* na impressão, só a folha */}
      <style>{`
        @media print {
          @page { size: A4; margin: 16mm; }
          html, body { background: #fff !important; }
          body * { visibility: hidden; }
          #folha-curriculo, #folha-curriculo * { visibility: visible; }
          #folha-curriculo { position: absolute; inset: 0 auto auto 0; width: 100%; font-size: 12pt; }
        }
      `}</style>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mt-[1.2em] text-[0.9em] leading-snug">
      <h3 className="mb-1 border-b border-[#ccc] pb-0.5 text-[0.95em] font-bold text-[#222]">{titulo}</h3>
      {children}
    </section>
  );
}
