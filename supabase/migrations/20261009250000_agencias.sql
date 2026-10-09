-- =====================================================================
-- Agências de emprego e RH
--
-- Agências e consultorias de RH publicam vagas de outras empresas, de graça.
--   * Conta do tipo "agencia", com CNPJ (aceita o CNPJ com letras, que a
--     Receita emite desde julho de 2026).
--   * Na vaga, a empresa contratante: o nome ou "empresa confidencial".
--   * Agência verificada pela equipe (selo de verificado no admin) pode ter
--     200 vagas no ar e publicar 50 por dia. As outras contas seguem com 20 e 10.
--   * O selo cai sozinho se o CNPJ mudar.
--
-- Rode depois de 20261009240000_negociar_depois.sql.
-- =====================================================================


-- 1. Perfil: tipo "agencia" e CNPJ ------------------------------------------------

alter table public.perfis drop constraint perfis_tipo_check;
alter table public.perfis add constraint perfis_tipo_check
  check (tipo in ('pessoa', 'comercio', 'empresa', 'agencia'));

alter table public.perfis add column cnpj text check (cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$');
comment on column public.perfis.cnpj is 'Só para agências. Público: quem procura vaga pode conferir na Receita.';
grant insert (cnpj), update (cnpj) on public.perfis to authenticated;

-- Dígitos verificadores do CNPJ, numérico ou alfanumérico: cada caractere vale
-- o código ASCII menos 48 (0-9 valem 0-9; A vale 17, Z vale 42).
create or replace function public.cnpj_valido(p_cnpj text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  c text := upper(regexp_replace(coalesce(p_cnpj, ''), '[^0-9A-Za-z]', '', 'g'));
  pesos1 int[] := array[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  pesos2 int[] := array[6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  soma int;
  resto int;
  d1 int;
  d2 int;
begin
  if c !~ '^[0-9A-Z]{12}[0-9]{2}$' or c ~ '^(.)\1{13}$' then
    return false;
  end if;
  soma := 0;
  for i in 1..12 loop
    soma := soma + (ascii(substr(c, i, 1)) - 48) * pesos1[i];
  end loop;
  resto := soma % 11;
  d1 := case when resto < 2 then 0 else 11 - resto end;
  soma := d1 * pesos2[13];
  for i in 1..12 loop
    soma := soma + (ascii(substr(c, i, 1)) - 48) * pesos2[i];
  end loop;
  resto := soma % 11;
  d2 := case when resto < 2 then 0 else 11 - resto end;
  return substr(c, 13, 1)::int = d1 and substr(c, 14, 1)::int = d2;
end
$$;

-- Roda depois de perfis_antes_de_salvar (ordem alfabética dos gatilhos), então
-- pode tirar o selo de verificado que aquele gatilho preserva.
create or replace function public.perfis_verificar_agencia()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  sistema boolean := coalesce(current_setting('publike.sistema', true), '') = 'on';
begin
  new.cnpj := nullif(upper(regexp_replace(coalesce(new.cnpj, ''), '[^0-9A-Za-z]', '', 'g')), '');
  if new.tipo <> 'agencia' then
    new.cnpj := null;
  elsif not public.cnpj_valido(new.cnpj) then
    raise exception 'Confira o CNPJ da agência.' using errcode = 'P0001', hint = 'cnpj';
  end if;
  -- o selo de agência verificada vale para aquele CNPJ
  if tg_op = 'UPDATE' and not sistema and new.verificado
     and (new.cnpj is distinct from old.cnpj or (new.tipo = 'agencia') is distinct from (old.tipo = 'agencia')) then
    new.verificado := false;
  end if;
  return new;
end
$$;

create trigger perfis_verificar_agencia
  before insert or update on public.perfis
  for each row execute function public.perfis_verificar_agencia();

-- Aviso de cadastro novo para a equipe: agência pede a conferência do CNPJ.
create or replace function privado.perfil_novo_para_equipe()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.avisar_equipe('aviso_cadastro', jsonb_build_object(
    'nome', new.nome,
    'tipo', case new.tipo
              when 'comercio' then 'comércio'
              when 'empresa' then 'empresa'
              when 'agencia' then 'agência de emprego / RH; confira o CNPJ ' || coalesce(new.cnpj, '') || ' e verifique a conta'
              else 'pessoa'
            end,
    'cidade', new.cidade,
    'caminho', '/admin/usuarios/' || new.id));
  return null;
end
$$;

-- Quem vira agência depois também chega para a equipe conferir.
create or replace function privado.perfil_virou_agencia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tipo = 'agencia' and (old.tipo <> 'agencia' or new.cnpj is distinct from old.cnpj) then
    perform privado.avisar_equipe('aviso_cadastro', jsonb_build_object(
      'nome', new.nome,
      'tipo', 'agência de emprego / RH; confira o CNPJ ' || coalesce(new.cnpj, '') || ' e verifique a conta',
      'cidade', new.cidade,
      'caminho', '/admin/usuarios/' || new.id));
  end if;
  return null;
end
$$;

create trigger perfis_virou_agencia
  after update of tipo, cnpj on public.perfis
  for each row execute function privado.perfil_virou_agencia();

-- Salvar perfil agora leva o CNPJ.
drop function public.salvar_perfil(text, text, text, text, text, text[], text, text, text, boolean);
create function public.salvar_perfil(
  p_nome text,
  p_tipo text,
  p_cidade text,
  p_bairro text,
  p_sobre text,
  p_servicos text[],
  p_foto text,
  p_whatsapp text,
  p_email text,
  p_receber_emails boolean default true,
  p_cnpj text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
begin
  if usuario is null then
    raise exception 'Entre na sua conta para salvar o perfil.' using errcode = '42501';
  end if;
  insert into public.perfis as p (id, nome, tipo, cidade, bairro, sobre, servicos, foto, cnpj)
  values (usuario, p_nome, p_tipo, p_cidade, p_bairro, p_sobre, coalesce(p_servicos, '{}'), p_foto, p_cnpj)
  on conflict (id) do update
     set nome = excluded.nome, tipo = excluded.tipo, cidade = excluded.cidade,
         bairro = excluded.bairro, sobre = excluded.sobre, servicos = excluded.servicos,
         foto = excluded.foto, cnpj = excluded.cnpj;
  insert into public.contatos as c (perfil_id, whatsapp, email, receber_emails)
  values (usuario, p_whatsapp, p_email, coalesce(p_receber_emails, true))
  on conflict (perfil_id) do update
     set whatsapp = excluded.whatsapp, email = excluded.email, receber_emails = excluded.receber_emails;
end
$$;


-- 2. Vaga: empresa contratante --------------------------------------------------

alter table public.anuncios
  add column contratante text check (char_length(contratante) between 2 and 80),
  add column contratante_confidencial boolean not null default false;
alter table public.anuncios add constraint contratante_so_em_vaga
  check (tipo = 'vaga' or (contratante is null and not contratante_confidencial));
grant insert (contratante, contratante_confidencial), update (contratante, contratante_confidencial)
  on public.anuncios to authenticated;

-- Só vaga de agência tem contratante, e ela precisa dizer qual é (ou que é confidencial).
create or replace function public.anuncios_contratante()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  agencia boolean;
begin
  new.contratante := nullif(btrim(regexp_replace(coalesce(new.contratante, ''), '\s+', ' ', 'g')), '');
  new.contratante_confidencial := coalesce(new.contratante_confidencial, false);
  select p.tipo = 'agencia' into agencia from public.perfis p where p.id = new.autor_id;
  if new.tipo <> 'vaga' or not coalesce(agencia, false) then
    new.contratante := null;
    new.contratante_confidencial := false;
    return new;
  end if;
  if new.contratante_confidencial then
    new.contratante := null;
  end if;
  if tg_op = 'INSERT' or new.contratante is distinct from old.contratante
     or new.contratante_confidencial is distinct from old.contratante_confidencial then
    if new.contratante is null and not new.contratante_confidencial then
      raise exception 'Diga para qual empresa é a vaga ou marque “Empresa confidencial”.'
        using errcode = 'P0001', hint = 'contratante';
    end if;
    if public.tem_contato(new.contratante) then
      raise exception 'Tire o telefone, e-mail ou link do nome da empresa.' using errcode = 'P0001', hint = 'contato_no_texto';
    end if;
  end if;
  return new;
end
$$;

create trigger anuncios_contratante
  before insert or update on public.anuncios
  for each row execute function public.anuncios_contratante();


-- 3. Limites maiores para agência verificada ----------------------------------------

create or replace function privado.agencia_verificada(p_perfil uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.perfis p where p.id = p_perfil and p.tipo = 'agencia' and p.verificado)
$$;

create or replace function privado.conferir_ativos(p_ignorar uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  limite integer;
begin
  if usuario is null then
    return;
  end if;
  limite := case when privado.agencia_verificada(usuario) then 200 else 20 end;
  perform pg_advisory_xact_lock(hashtext('publike:ativos:' || usuario::text));
  if (select count(*) from public.anuncios a
       where a.autor_id = usuario and a.id <> p_ignorar
         and a.status in ('ativo', 'pausado', 'em_analise')) >= limite then
    raise exception 'Você já tem % anúncios no ar. Encerre algum para publicar ou reativar outro.', limite
      using errcode = 'P0001', hint = 'limite_ativos';
  end if;
end
$$;

create or replace function privado.conferir_limite(p_acao text, p_maximo integer, p_mensagem text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  maximo integer := p_maximo;
  mensagem text := p_mensagem;
begin
  if usuario is null then
    return;
  end if;
  if p_acao in ('anuncio', 'edicao') and privado.agencia_verificada(usuario) then
    maximo := case p_acao when 'anuncio' then 50 else 200 end;
    if p_acao = 'anuncio' then
      mensagem := 'Você chegou ao limite de 50 vagas publicadas por dia. Tente de novo amanhã.';
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtext('publike:' || p_acao || ':' || usuario::text));
  if (select count(*) from privado.limites_uso l
       where l.perfil_id = usuario and l.acao = p_acao and l.criado_em > now() - interval '24 hours') >= maximo then
    raise exception '%', mensagem using errcode = 'P0001', hint = 'limite_' || p_acao;
  end if;
  insert into privado.limites_uso (perfil_id, acao) values (usuario, p_acao);
end
$$;


-- 4. Página da vaga: empresa contratante e CNPJ da agência -----------------------

drop function public.obter_anuncio(uuid);
create function public.obter_anuncio(p_id uuid)
returns table (
  id uuid,
  autor_id uuid,
  tipo text,
  titulo text,
  descricao text,
  categoria text,
  regime text,
  pagamento_valor numeric,
  pagamento_unidade text,
  beneficios text,
  horario text,
  vagas smallint,
  cidade text,
  bairro text,
  lat double precision,
  lng double precision,
  status text,
  criado_em timestamptz,
  atualizado_em timestamptz,
  expira_em timestamptz,
  autor_nome text,
  autor_tipo text,
  autor_foto text,
  autor_verificado boolean,
  autor_desde timestamptz,
  minha_curtida text,
  minha_mensagem text,
  oficio text,
  fotos text[],
  atende text[],
  pede_curriculo boolean,
  contratante text,
  contratante_confidencial boolean,
  autor_cnpj text
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select a.id, a.autor_id, a.tipo, a.titulo, a.descricao, a.categoria, a.regime,
         a.pagamento_valor, a.pagamento_unidade, a.beneficios, a.horario, a.vagas,
         a.cidade, a.bairro,
         round(st_y(a.local::geometry)::numeric, 5)::double precision,
         round(st_x(a.local::geometry)::numeric, 5)::double precision,
         a.status, a.criado_em, a.atualizado_em, a.expira_em,
         p.nome, p.tipo, p.foto, p.verificado, p.criado_em,
         c.status, c.mensagem,
         a.oficio, a.fotos, a.atende, a.pede_curriculo,
         a.contratante, a.contratante_confidencial, p.cnpj
    from public.anuncios a
    join public.perfis p on p.id = a.autor_id
    left join public.curtidas c on c.anuncio_id = a.id and c.perfil_id = auth.uid()
   where a.id = p_id
$$;

grant execute on function public.obter_anuncio(uuid) to anon, authenticated;


-- 5. Admin: agências no painel, filtro "agências a verificar" e CNPJ na ficha ------
-- (mesmas funções de 20261008120000_admin.sql, com as agências; as permissões ficam)

create or replace function public.admin_resumo()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  r jsonb;
begin
  perform privado.exigir_admin();
  select jsonb_build_object(
    'contas', (select count(*) from auth.users u),
    'contas_7d', (select count(*) from auth.users u where u.created_at > now() - interval '7 days'),
    'contas_30d', (select count(*) from auth.users u where u.created_at > now() - interval '30 days'),
    'acessos_7d', (select count(*) from auth.users u where u.last_sign_in_at > now() - interval '7 days'),
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
$$;

create or replace function public.admin_listar_usuarios(
  p_busca text default null,
  p_filtro text default 'todos',
  p_limite integer default 30,
  p_deslocamento integer default 0
)
returns table (
  id uuid,
  email text,
  telefone text,
  provedor text,
  criado_em timestamptz,
  ultimo_acesso timestamptz,
  nome text,
  tipo text,
  cidade text,
  bairro text,
  foto text,
  verificado boolean,
  whatsapp text,
  moderador boolean,
  suspenso_ate timestamptz,
  suspensao_tipo text,
  anuncios_total integer,
  anuncios_no_ar integer,
  denuncias_recebidas integer,
  total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
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
         u.created_at, u.last_sign_in_at,
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
$$;

create or replace function public.admin_usuario(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
    'ultimo_acesso', u.last_sign_in_at,
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
$$;


-- 6. IA: a revisão do anúncio também vê a empresa contratante -------------------

drop function public.servidor_pegar_revisoes_ia(text, integer);
create function public.servidor_pegar_revisoes_ia(p_chave text, p_limite integer default 5)
returns table (
  anuncio_id uuid,
  versao text,
  tipo text,
  titulo text,
  descricao text,
  categoria text,
  regime text,
  pagamento_valor numeric,
  pagamento_unidade text,
  beneficios text,
  horario text,
  vagas smallint,
  cidade text,
  bairro text,
  autor_tipo text,
  modelo text,
  oficio text,
  fotos text[],
  contratante text,
  contratante_confidencial boolean
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform privado.exigir_servidor(p_chave);
  -- revisões que travaram três vezes: ficam registradas como erro (e aparecem para a moderação)
  with esgotadas as (
    delete from privado.fila_ia f
     where f.status = 'revisando' and f.tentar_depois <= now() and f.tentativas >= 3
    returning f.anuncio_id
  )
  insert into public.moderacao_ia (anuncio_id, decisao, explicacao)
  select e.anuncio_id, 'erro', 'A revisão não terminou depois de três tentativas.' from esgotadas e;

  return query
  with escolhidos as (
    select f.anuncio_id from privado.fila_ia f
     where f.tentar_depois <= now() and (f.status = 'pendente' or f.tentativas < 3)
     order by f.criado_em
     limit least(greatest(coalesce(p_limite, 5), 1), 20)
     for update skip locked
  ), marcados as (
    update privado.fila_ia f
       set status = 'revisando', tentativas = f.tentativas + 1, tentar_depois = now() + interval '5 minutes'
      from escolhidos e
     where f.anuncio_id = e.anuncio_id
    returning f.anuncio_id
  )
  select a.id, privado.conteudo_revisado(a), a.tipo, a.titulo, a.descricao, a.categoria, a.regime, a.pagamento_valor,
         a.pagamento_unidade, a.beneficios, a.horario, a.vagas, a.cidade, a.bairro, p.tipo, c.ia_modelo,
         a.oficio, a.fotos, a.contratante, a.contratante_confidencial
    from marcados m
    join public.anuncios a on a.id = m.anuncio_id
    join public.perfis p on p.id = a.autor_id
    cross join public.config_site c;
end
$$;

revoke execute on function public.servidor_pegar_revisoes_ia(text, integer) from public;
grant execute on function public.servidor_pegar_revisoes_ia(text, integer) to anon, authenticated, service_role;


-- 7. Permissões --------------------------------------------------------------

revoke execute on function privado.agencia_verificada(uuid), privado.perfil_virou_agencia() from public;
grant execute on function public.cnpj_valido(text) to anon, authenticated;
revoke execute on function public.salvar_perfil(text, text, text, text, text, text[], text, text, text, boolean, text)
  from public, anon;
grant execute on function public.salvar_perfil(text, text, text, text, text, text[], text, text, text, boolean, text)
  to authenticated;

notify pgrst, 'reload schema';
