import { CAMINHO_DOCUMENTACAO } from "@/lib/api-publica";
import { SITE_URL } from "@/lib/config";
import { erroDaApi } from "@/lib/servidor/api-publica";

// Um endereço da API que não existe: o erro em JSON (e não a página de "não encontrado" do site), com a documentação.
function naoExiste() {
  return erroDaApi(404, "nao_encontrado", `Esse endereço da API não existe. Veja a documentação: ${SITE_URL}${CAMINHO_DOCUMENTACAO}`);
}

export const GET = naoExiste;
export const POST = naoExiste;
export const PUT = naoExiste;
export const PATCH = naoExiste;
export const DELETE = naoExiste;
