-- A Triagem com IA começa pelos prontos (21/11/2026; Marcelo: "aplique 1,2,3"). Na busca em Talentos da Triagem, a
-- IA lia primeiro quem mais parecia combinar por uma pré-nota sem IA (palavras dos critérios e o % de match). Agora
-- lê primeiro quem a leitura do currículo (migração 20270826120000) indicou como "pronto" para a função da vaga: a
-- mesma ocupação da CBO antes, depois a mesma família (os 4 primeiros dígitos), e só então o resto pela pré-nota.
-- Esta função devolve só quem é pronto (o id e se é a mesma ocupação), sem nome nem contato, para a vaga de quem
-- publicou; a ordem e a leitura ficam com a Triagem, que só lê Talentos com o recurso liberado.
--
-- Pode rodar de novo.

create or replace function public.prontos_da_triagem(p_anuncio uuid)
returns table (perfil_id uuid, mesma boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  eu uuid := public.conta_atual();
  v_cbo text;
begin
  perform privado.minha_vaga_qualquer(p_anuncio);
  select f.cbo into v_cbo from privado.funcoes_das_vagas f where f.anuncio_id = p_anuncio;
  if v_cbo is null then
    return;
  end if;
  return query
  select l.perfil_id, bool_or((f ->> 'cbo') = v_cbo)
    from privado.leituras_curriculo l
    cross join jsonb_array_elements(l.funcoes) f
   where f ->> 'nivel' = 'pronto'
     and left(f ->> 'cbo', 4) = left(v_cbo, 4)
     and privado.curriculo_para_leitura(l.perfil_id)
     and not privado.ha_bloqueio(eu, l.perfil_id)
   group by l.perfil_id;
end
$$;
revoke execute on function public.prontos_da_triagem(uuid) from public, anon;
grant execute on function public.prontos_da_triagem(uuid) to authenticated;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270828120000_prontos_na_triagem');
