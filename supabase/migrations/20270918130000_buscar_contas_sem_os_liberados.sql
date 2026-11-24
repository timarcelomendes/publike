-- A busca da promoção de lançamento sem quem já tem tudo (24/11/2026; Marcelo: "Liberados em todas assinaturas sai da
-- lista para não serem adicionados novamente"). `equipe_buscar_contas` devolve também `ja_tem`: os recursos que a
-- conta já usa agora (a assinatura, os 15 dias, a promoção ou o Liberar sem prazo); a conta com os cinco liberados sai
-- da lista, e na tela os que ela já tem ficam desmarcados e travados. Pode rodar de novo.

drop function if exists public.equipe_buscar_contas(text);

create function public.equipe_buscar_contas(p_busca text)
returns table (id uuid, nome text, tipo text, email text, cnpj text, ja_tem text[])
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q text := btrim(coalesce(p_busca, ''));
  d text := regexp_replace(coalesce(p_busca, ''), '\D', '', 'g');
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike busca contas.' using errcode = '42501';
  end if;
  if char_length(q) < 2 then
    return;
  end if;
  return query
    select x.id, x.nome, x.tipo, x.email, x.cnpj, x.ja_tem
      from (
        select p.id, p.nome, p.tipo, u.email::text email, p.cnpj,
               array_remove(array[
                 case when privado.copiloto_liberado(p.id) or privado.assina_o_recurso(p.id, 'copiloto') then 'copiloto' end,
                 case when privado.testes_liberado(p.id) or privado.assina_o_recurso(p.id, 'testes') then 'testes' end,
                 case when privado.video_liberado(p.id) or privado.assina_o_recurso(p.id, 'video') then 'video' end,
                 case when privado.automacoes_liberado(p.id) or privado.assina_o_recurso(p.id, 'automacoes') then 'automacoes' end,
                 case when privado.salarios_liberado(p.id) or privado.assina_o_recurso(p.id, 'salarios') then 'salarios' end
               ], null) ja_tem
          from public.perfis p
          left join auth.users u on u.id = p.id
         where p.tipo in ('comercio', 'empresa', 'agencia')
           and (p.nome ilike '%' || q || '%'
                or (char_length(d) >= 5 and regexp_replace(coalesce(p.cnpj, ''), '\D', '', 'g') like d || '%')
                or (position('@' in q) > 0 and u.email ilike q || '%'))
         order by (p.nome ilike q || '%') desc, char_length(p.nome), p.nome
         limit 30
      ) x
     where cardinality(x.ja_tem) < 5
     limit 10;
end
$$;
revoke execute on function public.equipe_buscar_contas(text) from public, anon;
grant execute on function public.equipe_buscar_contas(text) to authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270918130000_buscar_contas_sem_os_liberados');
