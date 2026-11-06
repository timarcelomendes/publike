import { Calculator, Clock, FileText, HandCoins } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { caminhoDasRecentes, DIAS_RECENTES } from "@/lib/paginas-busca";
import { anunciosNoAr } from "@/lib/servidor/paginas-busca";
import { agoraDaRequisicao } from "@/lib/tempo";
import { CardAnuncio } from "./card-anuncio";

// O fim das ferramentas grátis (claude/plano-ferramentas-compartilhar-e-vagas.md): as outras ferramentas e as vagas
// mais novas de Goiânia. Quem calcula a rescisão ou monta o currículo está, quase sempre, procurando emprego.

export type Ferramenta = "curriculo" | "seguro" | "rescisao";

const CIDADE = "Goiânia";
const QUANTAS_VAGAS = 6;

const FERRAMENTAS: { id: Ferramenta; href: string; nome: string; texto: string; icone: typeof FileText }[] = [
  {
    id: "curriculo",
    href: "/curriculo-simples",
    nome: "Currículo simples grátis",
    texto: "Preencha, veja pronto e baixe em PDF. Uma página, sem cadastro.",
    icone: FileText,
  },
  {
    id: "rescisao",
    href: "/calculadora-rescisao",
    nome: "Calculadora de rescisão",
    texto: "Aviso prévio, férias, 13º, FGTS e multa, com a conta de cada valor.",
    icone: Calculator,
  },
  {
    id: "seguro",
    href: "/seguro-desemprego",
    nome: "Seguro-desemprego",
    texto: "Veja se tem direito, quantas parcelas e de quanto.",
    icone: HandCoins,
  },
];

export function MaisDoPublike({ atual }: { atual: Ferramenta }) {
  const recentes = caminhoDasRecentes(CIDADE);
  return (
    <div className="mt-14 flex flex-col gap-12 print:hidden">
      <section aria-labelledby="mais-ferramentas">
        <h2 id="mais-ferramentas" className="text-h3">
          Mais ferramentas grátis
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {FERRAMENTAS.filter((f) => f.id !== atual).map((f) => (
            <li key={f.id} className="grid">
              <Cartao href={f.href} nome={f.nome} texto={f.texto} Icone={f.icone} />
            </li>
          ))}
          <li className="grid">
            <Cartao
              href={recentes}
              nome={`Vagas dos últimos ${DIAS_RECENTES} dias`}
              texto={`O que abriu agora em ${CIDADE}. Curtir é se candidatar, de graça.`}
              Icone={Clock}
            />
          </li>
        </ul>
      </section>

      <section aria-labelledby="vagas-novas">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="vagas-novas" className="text-h3">
            Vagas novas em {CIDADE}
          </h2>
          <Link href={recentes} className="text-body-sm font-semibold underline underline-offset-2">
            Ver todas as vagas dos últimos {DIAS_RECENTES} dias
          </Link>
        </div>
        <Suspense
          fallback={<div aria-hidden className="mt-4 h-56 animate-pulse rounded-lg bg-surface-300" />}
        >
          <VagasNovas />
        </Suspense>
      </section>
    </div>
  );
}

function Cartao({
  href,
  nome,
  texto,
  Icone,
}: {
  href: string;
  nome: string;
  texto: string;
  Icone: typeof FileText;
}) {
  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-lg border border-line bg-surface-100 p-4 hover:border-line-strong hover:bg-surface-200"
    >
      <Icone aria-hidden className="mt-0.5 size-5 shrink-0 text-cerrado" />
      <span className="flex flex-col gap-0.5">
        <span className="text-label">{nome}</span>
        <span className="text-body-sm text-ink-muted">{texto}</span>
      </span>
    </Link>
  );
}

async function VagasNovas() {
  const [todas, agora] = await Promise.all([anunciosNoAr("vaga", CIDADE), agoraDaRequisicao()]);
  const lista = todas
    .filter((a) => a.cidade === CIDADE)
    .sort((x, y) => Date.parse(y.criado_em ?? "") - Date.parse(x.criado_em ?? ""))
    .slice(0, QUANTAS_VAGAS);
  if (lista.length === 0) {
    return (
      <p className="mt-4 rounded-lg border border-dashed border-line-strong p-6 text-body">
        Agora não há vagas no ar em {CIDADE}.{" "}
        <Link href="/" className="font-semibold underline underline-offset-2">
          Veja as vagas perto de você
        </Link>
        .
      </p>
    );
  }
  return (
    <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {lista.map((a) => (
        <li key={a.id} className="grid">
          <CardAnuncio anuncio={a} agora={agora} usuarioId={null} />
        </li>
      ))}
    </ul>
  );
}
