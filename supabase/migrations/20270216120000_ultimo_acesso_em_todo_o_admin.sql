-- O último acesso em todo o Admin (05/11/2026): o mais recente entre o último login e a última página aberta
-- (privado.aparelho_da_conta, marcada no máximo a cada 6 horas por aparelho). Quem fica logado por semanas não passa
-- pelo login de novo, e aparecia "entrou há 3 dias" mesmo usando o site hoje. Vale na lista e na ficha de Usuários,
-- no "Entraram em 7 dias" do painel e na lista do painel no site (Moderadores). O "nunca entrou" continua sendo o
-- login (quem nunca fez login não abriu página nenhuma). Pode rodar de novo.

create or replace function privado.ultimo_acesso(p_conta uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(greatest(coalesce(u.last_sign_in_at, '-infinity'),
                         coalesce((select a.visto_em from privado.aparelho_da_conta a where a.conta_id = u.id), '-infinity')),
                '-infinity')
    from auth.users u where u.id = p_conta
$$;
revoke execute on function privado.ultimo_acesso(uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_listar_usuarios(p_busca text DEFAULT NULL::text, p_filtro text DEFAULT 'todos'::text, p_limite integer DEFAULT 30, p_deslocamento integer DEFAULT 0)
 RETURNS TABLE(id uuid, email text, telefone text, provedor text, criado_em timestamp with time zone, ultimo_acesso timestamp with time zone, nome text, tipo text, cidade text, bairro text, foto text, verificado boolean, whatsapp text, moderador boolean, suspenso_ate timestamp with time zone, suspensao_tipo text, anuncios_total integer, anuncios_no_ar integer, denuncias_recebidas integer, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
  termo text := nullif(btrim(coalesce(p_busca, '')), '');
  digitos text := regexp_replace(coalesce(p_busca, ''), '\D', '', 'g');
begin
  perform privado.exigir_admin();
  return query
  select u.id, u.email::text, nullif(u.phone::text, ''),
         coalesce(u.raw_app_meta_data ->> 'provider',
                  case when coalesce(u.phone::text, '') <> '' then 'phone' else 'email' end),
         u.created_at, privado.ultimo_acesso(u.id),
         p.nome, p.tipo, p.cidade, p.bairro, p.foto, coalesce(p.verificado, false), ct.whatsapp,
         (mo.perfil_id is not null), s.fim, s.tipo,
         coalesce(an.total, 0)::integer, coalesce(an.no_ar, 0)::integer, coalesce(dn.total, 0)::integer,
         count(*) over ()
    from auth.users u
    left join public.perfis p on p.id = u.id
    left join public.contatos ct on ct.perfil_id = u.id
    left join public.moderadores mo on mo.perfil_id = u.id
    left join lateral (
      select s1.fim, s1.tipo from public.suspensoes s1
       where s1.usuario_id = u.id and s1.encerrada_em is null and s1.fim > now()
       order by s1.fim desc limit 1
    ) s on true
    left join lateral (
      select count(*) as total, count(*) filter (where a.status = 'ativo' and a.expira_em > now()) as no_ar
        from public.anuncios a where a.autor_id = u.id
    ) an on true
    left join lateral (
      select count(*) as total
        from public.denuncias d join public.anuncios a2 on a2.id = d.anuncio_id
       where a2.autor_id = u.id
    ) dn on true
   where (termo is null
          or public.sem_acento(coalesce(p.nome, '')) ilike '%' || public.sem_acento(termo) || '%'
          or u.email::text ilike '%' || termo || '%'
          or (char_length(digitos) >= 4
              and (coalesce(ct.whatsapp, '') like '%' || digitos || '%' or coalesce(u.phone::text, '') like '%' || digitos || '%')))
     and case coalesce(p_filtro, 'todos')
           when 'suspensos' then s.tipo = 'suspensao'
           when 'banidos' then s.tipo = 'banimento'
           when 'moderadores' then mo.perfil_id is not null
           when 'sem_perfil' then p.id is null
           when 'verificados' then coalesce(p.verificado, false)
           when 'agencias' then p.tipo = 'agencia'
           when 'agencias_a_verificar' then p.tipo = 'agencia' and not p.verificado
           else true
         end
   order by u.created_at desc
   limit least(greatest(coalesce(p_limite, 30), 1), 100)
  offset greatest(coalesce(p_deslocamento, 0), 0);
end
$function$;

CREATE OR REPLACE FUNCTION public.admin_usuario(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r jsonb;
begin
  perform privado.exigir_admin();
  select jsonb_build_object(
    'id', u.id,
    'email', u.email::text,
    'telefone', nullif(u.phone::text, ''),
    'provedor', coalesce(u.raw_app_meta_data ->> 'provider',
                         case when coalesce(u.phone::text, '') <> '' then 'phone' else 'email' end),
    'provedores', coalesce(u.raw_app_meta_data -> 'providers', '[]'::jsonb),
    'criado_em', u.created_at,
    'ultimo_acesso', privado.ultimo_acesso(u.id),
    -- o último login (o último acesso é o mais recente entre ele e a última página aberta)
    'ultimo_login', u.last_sign_in_at,
    'login_bloqueado_ate', u.banned_until,
    'perfil', case when p.id is null then null else jsonb_build_object(
                'nome', p.nome, 'tipo', p.tipo, 'foto', p.foto, 'cidade', p.cidade, 'bairro', p.bairro,
                'sobre', p.sobre, 'servicos', to_jsonb(p.servicos), 'verificado', p.verificado,
                'criado_em', p.criado_em, 'cnpj', p.cnpj) end,
    'contato', jsonb_build_object('whatsapp', ct.whatsapp, 'email', ct.email,
                                  'receber_emails', coalesce(ct.receber_emails, true)),
    'moderador', (mo.perfil_id is not null),
    'suspensao', (
      select jsonb_build_object('id', s.id, 'tipo', s.tipo, 'dias', s.dias, 'motivo', s.motivo,
                                'inicio', s.inicio, 'fim', s.fim)
        from public.suspensoes s
       where s.usuario_id = u.id and s.encerrada_em is null and s.fim > now()
       order by s.fim desc limit 1),
    'historico', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', s.id, 'tipo', s.tipo, 'dias', s.dias, 'motivo', s.motivo, 'inicio', s.inicio, 'fim', s.fim,
               'encerrada_em', s.encerrada_em, 'aplicada_por', pa.nome, 'encerrada_por', pe.nome)
               order by s.inicio desc), '[]'::jsonb)
        from public.suspensoes s
        left join public.perfis pa on pa.id = s.aplicada_por
        left join public.perfis pe on pe.id = s.encerrada_por
       where s.usuario_id = u.id),
    'numeros', jsonb_build_object(
      'anuncios', (select count(*) from public.anuncios a where a.autor_id = u.id),
      'no_ar', (select count(*) from public.anuncios a where a.autor_id = u.id and a.status = 'ativo' and a.expira_em > now()),
      'curtidas_feitas', (select count(*) from public.curtidas c where c.perfil_id = u.id),
      'curtidas_recebidas', (select count(*) from public.curtidas c join public.anuncios a on a.id = c.anuncio_id
                              where a.autor_id = u.id),
      'matches', (select count(*) from public.curtidas c join public.anuncios a on a.id = c.anuncio_id
                   where c.status = 'match' and (c.perfil_id = u.id or a.autor_id = u.id)),
      'denuncias_recebidas', (select count(*) from public.denuncias d join public.anuncios a on a.id = d.anuncio_id
                               where a.autor_id = u.id),
      'denuncias_procedentes', (select count(*) from public.denuncias d join public.anuncios a on a.id = d.anuncio_id
                                 where a.autor_id = u.id and d.status = 'procedente'),
      'denuncias_feitas', (select count(*) from public.denuncias d where d.autor_id = u.id))
  ) into r
    from auth.users u
    left join public.perfis p on p.id = u.id
    left join public.contatos ct on ct.perfil_id = u.id
    left join public.moderadores mo on mo.perfil_id = u.id
   where u.id = p_id;
  return r;
end
$function$;

CREATE OR REPLACE FUNCTION public.admin_resumo()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  r jsonb;
begin
  perform privado.exigir_admin();
  select jsonb_build_object(
    'contas', (select count(*) from auth.users u),
    'contas_7d', (select count(*) from auth.users u where u.created_at > now() - interval '7 days'),
    'contas_30d', (select count(*) from auth.users u where u.created_at > now() - interval '30 days'),
    'acessos_7d', (select count(*) from auth.users u where u.last_sign_in_at > now() - interval '7 days'
                      or exists (select 1 from privado.aparelho_da_conta ac
                                  where ac.conta_id = u.id and ac.visto_em > now() - interval '7 days')),
    'sem_perfil', (select count(*) from auth.users u where not exists (select 1 from public.perfis p where p.id = u.id)),
    'perfis', (select jsonb_build_object(
                 'total', count(*),
                 'pessoa', count(*) filter (where p.tipo = 'pessoa'),
                 'comercio', count(*) filter (where p.tipo = 'comercio'),
                 'empresa', count(*) filter (where p.tipo = 'empresa'),
                 'agencia', count(*) filter (where p.tipo = 'agencia'),
                 'agencias_a_verificar', count(*) filter (where p.tipo = 'agencia' and not p.verificado),
                 'verificados', count(*) filter (where p.verificado))
                 from public.perfis p),
    'anuncios', (select jsonb_build_object(
                   'total', count(*),
                   'no_ar', count(*) filter (where a.status = 'ativo' and a.expira_em > now()),
                   'vagas_no_ar', count(*) filter (where a.tipo = 'vaga' and a.status = 'ativo' and a.expira_em > now()),
                   'servicos_no_ar', count(*) filter (where a.tipo = 'servico' and a.status = 'ativo' and a.expira_em > now()),
                   'pausados', count(*) filter (where a.status = 'pausado'),
                   'expirados', count(*) filter (where a.status = 'expirado' or (a.status = 'ativo' and a.expira_em <= now())),
                   'encerrados', count(*) filter (where a.status = 'encerrado'),
                   'em_analise', count(*) filter (where a.status = 'em_analise'),
                   'removidos', count(*) filter (where a.status = 'removido'),
                   'novos_7d', count(*) filter (where a.criado_em > now() - interval '7 days'))
                   from public.anuncios a),
    'curtidas', (select jsonb_build_object(
                   'total', count(*),
                   'novas_7d', count(*) filter (where c.criado_em > now() - interval '7 days'),
                   'matches', count(*) filter (where c.status = 'match'),
                   'matches_7d', count(*) filter (where c.status = 'match' and c.respondida_em > now() - interval '7 days'))
                   from public.curtidas c),
    'denuncias_abertas', (select count(*) from public.denuncias d where d.status = 'aberta'),
    'denuncias_7d', (select count(*) from public.denuncias d where d.criado_em > now() - interval '7 days'),
    'suspensos', (select count(distinct s.usuario_id) from public.suspensoes s
                   where s.tipo = 'suspensao' and s.encerrada_em is null and s.fim > now()),
    'banidos', (select count(distinct s.usuario_id) from public.suspensoes s
                 where s.tipo = 'banimento' and s.encerrada_em is null and s.fim > now()),
    'ia', (select jsonb_build_object(
             'revisados_7d', count(*) filter (where m.criado_em > now() - interval '7 days'),
             'retidos_7d', count(*) filter (where m.decisao = 'retido' and m.criado_em > now() - interval '7 days'),
             'na_fila', (select count(*) from privado.fila_ia))
             from public.moderacao_ia m),
    'emails', (select jsonb_build_object(
                 'enviados_7d', count(*) filter (where f.status = 'enviado' and f.enviado_em > now() - interval '7 days'),
                 'falhas_7d', count(*) filter (where f.status = 'falhou' and f.criado_em > now() - interval '7 days'),
                 'na_fila', count(*) filter (where f.status in ('pendente', 'enviando')))
                 from privado.fila_emails f),
    'por_dia', (
      select jsonb_agg(jsonb_build_object(
               'dia', d.dia, 'contas', coalesce(u.n, 0), 'anuncios', coalesce(a.n, 0), 'curtidas', coalesce(c.n, 0))
               order by d.dia)
        from (select hoje - g as dia from generate_series(0, 29) as g) d
        left join (select (u1.created_at at time zone 'America/Sao_Paulo')::date as dia, count(*) as n
                     from auth.users u1 where u1.created_at > now() - interval '31 days' group by 1) u using (dia)
        left join (select (a1.criado_em at time zone 'America/Sao_Paulo')::date as dia, count(*) as n
                     from public.anuncios a1 where a1.criado_em > now() - interval '31 days' group by 1) a using (dia)
        left join (select (c1.criado_em at time zone 'America/Sao_Paulo')::date as dia, count(*) as n
                     from public.curtidas c1 where c1.criado_em > now() - interval '31 days' group by 1) c using (dia)),
    'categorias', (
      select coalesce(jsonb_agg(jsonb_build_object('nome', t.categoria, 'n', t.n) order by t.n desc, t.categoria), '[]'::jsonb)
        from (select a.categoria, count(*) as n from public.anuncios a
               where a.status = 'ativo' and a.expira_em > now()
               group by a.categoria order by count(*) desc limit 8) t),
    'bairros', (
      select coalesce(jsonb_agg(jsonb_build_object('nome', t.bairro, 'n', t.n) order by t.n desc, t.bairro), '[]'::jsonb)
        from (select a.bairro, count(*) as n from public.anuncios a
               where a.status = 'ativo' and a.expira_em > now()
               group by a.bairro order by count(*) desc limit 8) t)
  ) into r;
  return r;
end
$function$;

CREATE OR REPLACE FUNCTION public.admin_contas_painel_no_site()
 RETURNS TABLE(usuario_id uuid, email text, nome text, liberado boolean, liberado_em timestamp with time zone, ultimo_acesso timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform privado.exigir_admin();
  return query
  select u.id, u.email::text, p.nome, (l.usuario_id is not null), l.liberado_em, privado.ultimo_acesso(u.id)
    from auth.users u
    left join public.perfis p on p.id = u.id
    left join privado.painel_no_site l on l.usuario_id = u.id
   where u.email_confirmed_at is not null
     and lower(u.email) like '%@publike.org'
   order by u.email;
end
$function$;

notify pgrst, 'reload schema';
