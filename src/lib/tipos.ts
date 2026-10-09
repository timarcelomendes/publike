import type { Database } from "./supabase/tipos-banco";

type Funcoes = Database["public"]["Functions"];
/** Uma linha do resultado de uma função do banco. */
type LinhaDe<F extends keyof Funcoes> = Funcoes[F]["Returns"] extends (infer L)[] ? L : never;

export type TipoAnuncio = "vaga" | "servico";
export type Regime = "clt" | "temporario" | "diaria" | "freelance" | "estagio" | "pj" | "outro";
export type Unidade = "hora" | "dia" | "semana" | "mes" | "servico";
export type TipoConta = "pessoa" | "comercio" | "empresa";
export type StatusAnuncio = "ativo" | "pausado" | "encerrado" | "expirado" | "em_analise" | "removido";
export type StatusCurtida = "pendente" | "match" | "dispensada";

export type AnuncioResumo = LinhaDe<"buscar_anuncios">;
export type AnuncioCompleto = LinhaDe<"obter_anuncio">;
export type MeuAnuncio = LinhaDe<"meus_anuncios">;
export type Interessado = LinhaDe<"interessados">;
export type MinhaCurtida = LinhaDe<"minhas_curtidas">;
export type Match = LinhaDe<"meus_matches">;
export type ItemModeracao = LinhaDe<"fila_moderacao">;

/** O mínimo que um card de anúncio precisa mostrar. */
export type DadosCard = Pick<
  AnuncioResumo,
  | "id"
  | "tipo"
  | "titulo"
  | "categoria"
  | "regime"
  | "pagamento_valor"
  | "pagamento_unidade"
  | "beneficios"
  | "cidade"
  | "bairro"
  | "criado_em"
  | "autor_id"
  | "autor_nome"
  | "autor_tipo"
  | "autor_verificado"
  | "minha_curtida"
> & { distancia_km: number | null };

export type Perfil = {
  id: string;
  nome: string;
  tipo: string;
  /** caminho no Storage: <id>/<data>.jpg */
  foto: string | null;
  cidade: string;
  bairro: string | null;
  sobre: string | null;
  servicos: string[];
  verificado: boolean;
  criado_em: string;
  /** conta suspensa ou banida até esta data */
  suspenso_ate?: string | null;
};

export type MeuPerfil = Perfil & { whatsapp: string | null; email: string | null; receber_emails: boolean };

/** `nome` vem da conta Google, Facebook ou LinkedIn (quando houver) e só serve de sugestão no perfil. */
export type Usuario = { id: string; email: string | null; telefone: string | null; nome: string | null };

/** Resposta padrão das ações (server actions). */
export type Resultado = { ok: true; mensagem?: string } | { ok: false; erro: string; ir?: string };

/** Estado dos formulários com useActionState. */
export type EstadoForm = {
  ok: boolean;
  mensagem?: string;
  erro?: string;
  erros?: Record<string, string>;
};
