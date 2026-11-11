import "server-only";

// A chamada de vídeo da entrevista ao vivo (claude/plano-recursos-concorrentes.md, parte 3), pela Daily
// (https://docs.daily.co/reference/rest-api). Variáveis de ambiente, só na Vercel:
//   DAILY_API_KEY   a chave da API da conta da Daily
//   DAILY_API_URL   (só em teste) outro endereço da API
// Sem a chave, o formato "Pelo Publike (vídeo)" não aparece.

export function dailyConfigurado() {
  return Boolean((process.env.DAILY_API_KEY || "").trim());
}

function base() {
  return (process.env.DAILY_API_URL || "").trim().replace(/\/+$/, "") || "https://api.daily.co/v1";
}

async function pedir<T>(caminho: string, corpo?: unknown): Promise<T> {
  const chave = (process.env.DAILY_API_KEY || "").trim();
  if (!chave) throw new Error("A chamada de vídeo não está configurada.");
  const r = await fetch(`${base()}${caminho}`, {
    method: corpo === undefined ? "GET" : "POST",
    headers: { authorization: `Bearer ${chave}`, "content-type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!r.ok) {
    const texto = await r.text().catch(() => "");
    throw Object.assign(new Error(`Daily ${r.status}: ${texto.slice(0, 200)}`), { status: r.status, texto });
  }
  return (await r.json()) as T;
}

/**
 * A sala da entrevista: privada, aberta de 15 min antes até 2 h depois, até 4 pessoas, em português. O nome sai
 * do id da entrevista (a mesma entrevista, a mesma sala). Devolve o endereço da sala.
 */
export async function salaDaEntrevista(d: { id: string; abre: Date; fecha: Date }): Promise<string> {
  const nome = `publike-${d.id.replace(/-/g, "").slice(0, 24)}`;
  try {
    const sala = await pedir<{ url: string }>("/rooms", {
      name: nome,
      privacy: "private",
      properties: {
        nbf: Math.floor(d.abre.getTime() / 1000),
        exp: Math.floor(d.fecha.getTime() / 1000),
        // o candidato, quem entrevista e mais um da equipe (cada pessoa conta minutos na Daily)
        max_participants: 3,
        eject_at_room_exp: true,
        enable_prejoin_ui: true,
        enable_chat: true,
        lang: "pt-BR",
      },
    });
    return sala.url;
  } catch (e) {
    // já existe (outra pessoa entrou antes): lê a que está lá
    const texto = (e as { texto?: string }).texto ?? "";
    if (/already exists/i.test(texto)) return (await pedir<{ url: string }>(`/rooms/${nome}`)).url;
    throw e;
  }
}

/** A chave de entrada de uma pessoa na sala, até a sala fechar. Quem marcou entra como dono. */
export async function chaveDeEntrada(d: { sala: string; nome: string; dono: boolean; fecha: Date }): Promise<string> {
  const r = await pedir<{ token: string }>("/meeting-tokens", {
    properties: {
      room_name: d.sala.split("/").pop(),
      user_name: d.nome.slice(0, 60),
      is_owner: d.dono,
      exp: Math.floor(d.fecha.getTime() / 1000),
      lang: "pt-BR",
    },
  });
  return r.token;
}
