-- O histórico de uso dos recursos pagos (24/11/2026; Marcelo: "adicione um histórico de uso dos recursos pagos"), na
-- aba Uso de Admin › Recursos pagos: o que cada conta fez com cada recurso, dia a dia, tirado de onde o uso já fica
-- registrado:
--   * Triagem com IA: privado.copiloto_registro (candidatos avaliados e critérios montados);
--   * Teste Prático: privado.avaliacoes_pedidas (testes enviados);
--   * Entrevista em vídeo: public.entrevistas_video (entrevistas pedidas);
--   * Automações: privado.automacoes_feitas e privado.regras_feitas (o que as automações fizeram);
--   * Consulta de salários: privado.consultas_salario.
-- Visões das vagas e Contato no convite não deixam registro de uso: ficam de fora. As contas de teste vêm marcadas.

create or replace function public.admin_uso_recursos_pagos(p_dias integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_desde timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_dias, 30), 180)));
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike.' using errcode = '42501';
  end if;
  return (
    with usos as (
      select r.conta_id, 'copiloto'::text as recurso, r.criado_em as quando,
             case r.acao when 'avaliou' then 'avaliou ' || coalesce(r.quantos, 1) || ' candidato(s)'
                         when 'criterios' then 'montou os critérios'
                         when 'convidou' then 'convidou ' || coalesce(r.quantos, 1) || ' pela triagem'
                         else 'ligou a triagem' end as o_que,
             case when r.acao = 'avaliou' then coalesce(r.quantos, 1) else 1 end as peso,
             r.anuncio_id
        from privado.copiloto_registro r
       where r.criado_em > v_desde
      union all
      select a.autor_id, 'testes', p.pedida_em, 'mandou um teste', 1, p.anuncio_id
        from privado.avaliacoes_pedidas p join public.anuncios a on a.id = p.anuncio_id
       where p.pedida_em > v_desde
      union all
      select a.autor_id, 'video', v.pedida_em, 'pediu uma entrevista em vídeo', 1, v.anuncio_id
        from public.entrevistas_video v join public.anuncios a on a.id = v.anuncio_id
       where v.pedida_em > v_desde
      union all
      select a.autor_id, 'automacoes', f.feito_em, 'automação: ' || f.regra, 1, f.anuncio_id
        from privado.automacoes_feitas f join public.anuncios a on a.id = f.anuncio_id
       where f.feito_em > v_desde
      union all
      select a.autor_id, 'automacoes', f.feito_em, 'automação personalizada', 1, f.anuncio_id
        from privado.regras_feitas f join public.anuncios a on a.id = f.anuncio_id
       where f.feito_em > v_desde and f.desfeito_em is null
      union all
      select c.conta_id, 'salarios', c.criado_em, 'consultou um salário', 1, null::uuid
        from privado.consultas_salario c
       where c.criado_em > v_desde
    ),
    com_conta as (
      select u.*, p.nome, p.tipo,
             exists (select 1 from privado.pagamentos_teste t where t.conta_id = u.conta_id) as conta_de_teste
        from usos u join public.perfis p on p.id = u.conta_id
    )
    select jsonb_build_object(
      'dias', greatest(1, least(coalesce(p_dias, 30), 180)),
      'por_dia', coalesce((
        select jsonb_agg(jsonb_build_object('dia', d.dia, 'recurso', d.recurso, 'usos', d.usos) order by d.dia, d.recurso)
          from (select (x.quando at time zone 'America/Sao_Paulo')::date as dia, x.recurso, sum(x.peso)::integer as usos
                  from com_conta x where not x.conta_de_teste group by 1, 2) d), '[]'::jsonb),
      'contas', coalesce((
        select jsonb_agg(jsonb_build_object('conta_id', c.conta_id, 'nome', c.nome, 'tipo', c.tipo, 'recurso', c.recurso,
                                            'usos', c.usos, 'vagas', c.vagas, 'primeiro', c.primeiro, 'ultimo', c.ultimo,
                                            'conta_de_teste', c.conta_de_teste)
                         order by c.conta_de_teste, c.usos desc, c.ultimo desc)
          from (select x.conta_id, x.nome, x.tipo, x.recurso, x.conta_de_teste, sum(x.peso)::integer as usos,
                       count(distinct x.anuncio_id)::integer as vagas, min(x.quando) as primeiro, max(x.quando) as ultimo
                  from com_conta x group by 1, 2, 3, 4, 5) c), '[]'::jsonb),
      'eventos', coalesce((
        select jsonb_agg(jsonb_build_object('quando', e.quando, 'conta_id', e.conta_id, 'nome', e.nome, 'recurso', e.recurso,
                                            'o_que', e.o_que, 'vaga', e.vaga, 'conta_de_teste', e.conta_de_teste)
                         order by e.quando desc)
          from (select x.*, a.titulo as vaga from com_conta x left join public.anuncios a on a.id = x.anuncio_id
                 order by x.quando desc limit 200) e), '[]'::jsonb)
    )
  );
end
$$;
revoke execute on function public.admin_uso_recursos_pagos(integer) from public, anon;
grant execute on function public.admin_uso_recursos_pagos(integer) to authenticated, service_role;

select privado.migracao_aplicada('20270925120000_uso_dos_recursos_pagos');
