-- Divulgar para quem chegou ao limite do grátis da Triagem (23/11/2026; Marcelo, sobre as 34 empresas que já usaram os
-- 5 candidatos grátis de novembro: "sim"). Em Admin › Convites › Divulgar, o público "Chegaram ao limite da Triagem":
-- as contas que contratam, sem a Triagem paga, em que a IA já leu neste mês (de Goiânia) os candidatos grátis. Com o
-- WhatsApp (o do cadastro, o do login ou o do aceite) e o e-mail, as vagas lidas, se já experimentou os 15 dias e os
-- preços da Triagem e do Plano Empresa à venda. O "Mandei" guarda `limite:<conta>:<AAAA-MM>` em privado.divulgacoes:
-- no mês seguinte a conta volta para "Faltam mandar". Pode rodar de novo.

alter table privado.divulgacoes drop constraint if exists divulgacoes_publico_check;
alter table privado.divulgacoes add constraint divulgacoes_publico_check
  check (publico in ('contabilidades', 'gestao', 'empresas', 'limite'));

create or replace function public.admin_divulgar_limite(
  p_mostrar text default 'faltam',
  p_limite integer default 30,
  p_pagina integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limite integer := least(greatest(coalesce(p_limite, 30), 1), 200);
  v_pagina integer := greatest(coalesce(p_pagina, 0), 0);
  v_inicio timestamptz := privado.gratis_inicio_do_mes();
  v_mes text := to_char(privado.gratis_inicio_do_mes() at time zone 'America/Sao_Paulo', 'YYYY-MM');
  v_gratis integer := coalesce((select c.gratis_triagem_mes from privado.config_pagamentos c where c.id), 5);
  v jsonb;
begin
  if not privado.eh_admin() then
    raise exception 'Só o admin vê os contatos.' using errcode = '42501';
  end if;
  if p_mostrar not in ('faltam', 'mandados', 'todos') then
    raise exception 'Pedido inválido.' using errcode = '22023';
  end if;
  with lidos as (
    select n.autor_id conta_id, count(*) lidos,
           (array_agg(distinct n.titulo))[1:3] vagas
      from privado.copiloto_avaliacoes x join public.anuncios n on n.id = x.anuncio_id
     where x.origem = 'candidato' and x.criado_em >= v_inicio
     group by n.autor_id
  ), base as (
    select l.conta_id, p.nome, p.tipo, l.lidos, l.vagas,
           coalesce(privado.telefone_do_login(ct.whatsapp), privado.telefone_do_login(u.phone),
                    (select w.numero from privado.whatsapp_permissoes w
                      where w.conta_id = l.conta_id and w.cancelado_em is null limit 1)) whatsapp,
           coalesce(nullif(btrim(ct.email), ''), u.email) email,
           exists (select 1 from privado.experimentos e where e.conta_id = l.conta_id and e.recurso = 'copiloto') experimentou,
           d.mandado_em
      from lidos l
      join public.perfis p on p.id = l.conta_id
      left join public.contatos ct on ct.perfil_id = l.conta_id
      left join auth.users u on u.id = l.conta_id
      left join privado.divulgacoes d on d.cnpj = 'limite:' || l.conta_id || ':' || v_mes
     where v_gratis > 0 and l.lidos >= v_gratis
       and privado.contrata(l.conta_id)
       and not privado.copiloto_liberado(l.conta_id)
       and not exists (select 1 from privado.pagamentos_teste t where t.conta_id = l.conta_id)
  ), filtrada as (
    select * from base b
     where case p_mostrar when 'faltam' then b.mandado_em is null
                          when 'mandados' then b.mandado_em is not null
                          else true end
  )
  select jsonb_build_object(
    'mes', v_mes,
    'gratis', v_gratis,
    'preco_triagem', (select pl.valor from privado.planos pl
                       where pl.recurso = 'copiloto' and pl.ciclo = 'MONTHLY' and pl.ligado limit 1),
    'preco_plano', (select pl.valor from privado.planos pl
                     where pl.recurso = 'empresa_5' and pl.ciclo = 'MONTHLY' and pl.ligado limit 1),
    'total', (select count(*) from filtrada),
    'faltam', (select count(*) from base where mandado_em is null),
    'mandados', (select count(*) from base where mandado_em is not null),
    'linhas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'conta_id', f.conta_id, 'nome', f.nome, 'tipo', f.tipo, 'lidos', f.lidos, 'vagas', to_jsonb(f.vagas),
               'whatsapp', f.whatsapp, 'email', f.email, 'experimentou', f.experimentou,
               'mandado_em', f.mandado_em) order by f.ord)
        from (select f.*, row_number() over (order by f.mandado_em desc nulls last, (f.whatsapp is null), f.lidos desc, f.nome) ord
                from filtrada f order by ord limit v_limite offset v_pagina * v_limite) f), '[]'::jsonb))
    into v;
  return v;
end
$$;
revoke execute on function public.admin_divulgar_limite(text, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_divulgar_limite(text, integer, integer) to service_role;

-- o "Mandei" aceita o novo público
create or replace function public.admin_divulgar_marcar(p_cnpj text, p_publico text, p_mandado boolean default true)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v timestamptz;
begin
  if not privado.eh_admin() then
    raise exception 'Só o admin marca os contatos.' using errcode = '42501';
  end if;
  if p_publico not in ('contabilidades', 'gestao', 'empresas', 'limite') then
    raise exception 'Pedido inválido.' using errcode = '22023';
  end if;
  if not coalesce(p_mandado, true) then
    delete from privado.divulgacoes where cnpj = p_cnpj;
    return null;
  end if;
  insert into privado.divulgacoes (cnpj, publico) values (p_cnpj, p_publico)
  on conflict (cnpj) do update set publico = excluded.publico, mandado_em = now()
  returning mandado_em into v;
  return v;
end
$$;
revoke execute on function public.admin_divulgar_marcar(text, text, boolean) from public, anon, authenticated;
grant execute on function public.admin_divulgar_marcar(text, text, boolean) to service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270917130000_divulgar_limite_da_triagem');
