-- =====================================================================
-- O funil de quem chega sem conta conta também o chat que abre sozinho:
--   * chat_mostrou / chat_tocou: o "Deixa comigo" (abre a cada 7 dias, no computador);
--   * saida_mostrou / saida_tocou: o chat na saída ("Antes de ir…"), quando o mouse sai
--     pelo alto da janela sem a pessoa ter curtido nem começado a publicar.
-- "tocou": mandou uma pergunta, tocou num dos botões ou numa vaga mostrada.
-- (a lista anterior: 20270226120000_porta_de_entrada.sql) Pode rodar de novo.
-- =====================================================================

alter table privado.funil_visitante drop constraint if exists funil_visitante_evento_check;
alter table privado.funil_visitante add constraint funil_visitante_evento_check
  check (evento in ('home', 'curtir', 'publicar', 'curriculo', 'entrar',
                    'toque_mostrou', 'toque_entrou', 'convite_mostrou', 'convite_tocou',
                    'chat_mostrou', 'chat_tocou', 'saida_mostrou', 'saida_tocou'));

create or replace function public.registrar_funil_visitante(p_evento text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into privado.funil_visitante (dia, evento, total)
  select (now() at time zone 'America/Sao_Paulo')::date, p_evento, 1
   where p_evento in ('home', 'curtir', 'publicar', 'curriculo', 'entrar',
                      'toque_mostrou', 'toque_entrou', 'convite_mostrou', 'convite_tocou',
                      'chat_mostrou', 'chat_tocou', 'saida_mostrou', 'saida_tocou')
  on conflict (dia, evento) do update set total = privado.funil_visitante.total + 1;
$$;
revoke all on function public.registrar_funil_visitante(text) from public;
grant execute on function public.registrar_funil_visitante(text) to anon, authenticated;

notify pgrst, 'reload schema';
