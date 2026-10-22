import { obterMeuPerfil } from "@/lib/dados";
import { nomeDaConta } from "@/lib/so-olhar";
import { soOlharComoPessoa } from "@/lib/servidor/so-olhar";
import { FaixaSoOlhar } from "./faixa-so-olhar";

/** No alto de todas as páginas (layout): a faixa do "só olhar", quando a conta está vendo como pessoa. */
export async function SoOlharDaConta() {
  if (!(await soOlharComoPessoa())) return null;
  const perfil = await obterMeuPerfil().catch(() => null);
  return <FaixaSoOlhar conta={nomeDaConta(perfil?.tipo)} />;
}
