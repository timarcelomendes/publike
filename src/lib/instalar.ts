// Script do <head> que guarda o "pode instalar" do navegador (beforeinstallprompt).
// O evento chega uma vez só, logo no começo do carregamento, antes do React; o
// components/instalar-app.tsx pega ele em window.__publikePedido.
export const EVENTO_PEDIDO = "publike:pedido";

export const SCRIPT_PEDIDO = `window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__publikePedido=e;window.dispatchEvent(new Event("${EVENTO_PEDIDO}"))});`;
