// Toque antes da hora: logo que a página aparece, os botões ainda não respondem (o React ainda está
// ligando a página; num celular simples, isso leva alguns segundos). Este script roda antes de
// tudo: o toque num botão que ainda não está pronto fica guardado, o botão mostra que está
// esperando (data-esperando) e o toque é refeito assim que ele fica pronto. Dois toques valem um
// (e, se a pessoa tocar de novo com o botão já pronto, vale esse toque, sem repetir o guardado);
// depois de 15 segundos, desiste. Só nos primeiros 30 segundos da página (depois, tudo já está
// ligado). Links e a busca funcionam sem isso; o mapa (MapLibre) e o botão do Google
// ([data-sem-react]) são desenhados fora do React e ficam de fora.
//
// Pronto = o React já ligou o botão (as props dele ficam no elemento, numa chave "__reactProps$…").

/** Vai no <head> (layout), antes do React. JavaScript simples, que qualquer celular entende. */
export const SCRIPT_TOQUE_CEDO = `(function(){
var pronto=function(e){return Object.keys(e).some(function(k){return k.indexOf("__reactProps$")===0})};
var esperando=[];
var largar=function(b){var i=esperando.indexOf(b);if(i>=0)esperando.splice(i,1);b.removeAttribute("data-esperando");b.removeAttribute("aria-busy")};
addEventListener("click",function(ev){
if(performance.now()>30000)return;
var alvo=ev.target&&ev.target.closest?ev.target:null;
var botao=alvo&&alvo.closest("button,[role='button']");
if(!botao||botao.closest(".maplibregl-map,[data-sem-react],form[role='search']"))return;
if(pronto(botao)){largar(botao);return}
ev.preventDefault();ev.stopPropagation();
if(esperando.indexOf(botao)>=0)return;
esperando.push(botao);
botao.setAttribute("data-esperando","");botao.setAttribute("aria-busy","true");
var inicio=Date.now();
var vez=setInterval(function(){
if(esperando.indexOf(botao)<0){clearInterval(vez);return}
var acabou=!botao.isConnected||Date.now()-inicio>15000;
if(!acabou&&!pronto(botao))return;
clearInterval(vez);largar(botao);
if(!acabou)botao.click();
},50);
},true);
})();`;
