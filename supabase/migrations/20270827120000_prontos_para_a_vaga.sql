-- Prontos para assumir, em cada vaga (21/11/2026; Marcelo: "a empresa que não tem assinatura pode ter 5 talentos
-- qualificados", e a escolha "5 por vaga no ar"). Na aba Talentos, na vaga de quem publicou: as pessoas visíveis em
-- Talentos que a leitura do currículo (migração 20270826120000) indicou como "pronto" para a função da vaga (a mesma
-- ocupação da CBO ou a mesma família, os 4 primeiros dígitos), das que moram mais perto da vaga para as mais longe.
-- Sem assinatura: as 5 mais perto. Com assinatura (o plano que libera tudo ou o Plano Agência de cortesia): todas,
-- até 50. Quem já curtiu a vaga não aparece (está nos candidatos); quem bloqueou ou foi bloqueado, também não. Sem o
-- contato e com o nome encurtado, como em Talentos; a nota da leitura não aparece.
--
-- Pode rodar de novo.

create or replace function privado.qualificados_com_plano(p_conta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from privado.assinaturas a
                  where a.conta_id = p_conta and a.situacao = 'ativa' and privado.libera_tudo(a.recurso))
      or exists (select 1 from privado.cobrancas c
                  where c.conta_id = p_conta and c.situacao = 'paga' and privado.libera_tudo(c.recurso)
                    and c.periodo_ate + case when c.compra_id is null then interval '3 days' else interval '0' end > now())
      or exists (select 1 from privado.plano_agencia_cortesia x
                  where x.conta_id = p_conta and (x.ate is null or x.ate > now()))
$$;
revoke execute on function privado.qualificados_com_plano(uuid) from public, anon, authenticated;

create or replace function public.prontos_para_a_vaga(p_anuncio uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  eu uuid := public.conta_atual();
  v record;
  plano boolean;
  todos jsonb;
  total integer;
begin
  perform privado.minha_vaga_qualquer(p_anuncio);
  select a.id, a.cidade, a.local, f.cbo
    into v
    from public.anuncios a
    left join privado.funcoes_das_vagas f on f.anuncio_id = a.id
   where a.id = p_anuncio;
  plano := privado.qualificados_com_plano(eu);
  if v.cbo is null then
    return jsonb_build_object('plano', plano, 'funcao', false, 'total', 0, 'prontos', '[]'::jsonb);
  end if;
  with achados as (
    select distinct on (p.id)
           p.id as perfil_id, privado.nome_curto(p.nome) as nome, p.cidade, p.bairro, c.titulo,
           f ->> 'nome' as funcao, f ->> 'porque' as porque, (f ->> 'cbo') = v.cbo as mesma,
           case when v.local is not null and cb.lat is not null then
             round(extensions.st_distance(
               extensions.st_setsrid(extensions.st_makepoint(cb.lng, cb.lat), 4326)::extensions.geography,
               v.local::extensions.geography))::integer end as distancia_m
      from privado.leituras_curriculo l
      join public.perfis p on p.id = l.perfil_id
      join public.curriculos c on c.perfil_id = l.perfil_id
      cross join jsonb_array_elements(l.funcoes) f
      left join lateral privado.centro_do_bairro(p.cidade, p.bairro) cb on true
     where f ->> 'nivel' = 'pronto'
       and left(f ->> 'cbo', 4) = left(v.cbo, 4)
       and privado.curriculo_para_leitura(l.perfil_id)
       and not privado.ha_bloqueio(eu, p.id)
       and not exists (select 1 from public.curtidas k where k.anuncio_id = p_anuncio and k.perfil_id = p.id)
     order by p.id, ((f ->> 'cbo') = v.cbo) desc
  ),
  ordem as (
    select x.*, row_number() over (
             order by x.mesma desc, x.distancia_m nulls last, (lower(coalesce(x.cidade, '')) = lower(coalesce(v.cidade, ''))) desc,
                      x.perfil_id) as n
      from achados x
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'perfil_id', o.perfil_id, 'nome', o.nome, 'cidade', o.cidade, 'bairro', o.bairro, 'titulo', o.titulo,
           'funcao', o.funcao, 'porque', o.porque, 'distancia_m', o.distancia_m) order by o.n)
           filter (where o.n <= case when plano then 50 else 5 end), '[]'::jsonb),
         count(*)::integer
    into todos, total
    from ordem o;
  return jsonb_build_object('plano', plano, 'funcao', true, 'total', total, 'prontos', todos);
end
$$;
revoke execute on function public.prontos_para_a_vaga(uuid) from public, anon;
grant execute on function public.prontos_para_a_vaga(uuid) to authenticated;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270827120000_prontos_para_a_vaga');
