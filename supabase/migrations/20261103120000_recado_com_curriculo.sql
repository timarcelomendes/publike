-- Recado com currículo (03/11/2026): compartilhar o currículo de alguém da aba Talentos no recado,
-- como a vaga citada. Pode rodar de novo.
--   * recados.talento_id: a pessoa do currículo (some se a conta for apagada).
--   * escrever_recado ganha p_talento: só quem está na aba Talentos (curriculo_na_vitrine), sem suspensão
--     nem bloqueio; ou a vaga, ou o currículo.
--   * recados_para, linha_recados, recados_do_perfil e recado devolvem o currículo (nome curto, título,
--     foto, bairro e cidade), só enquanto a pessoa continua na aba.
-- O resto igual a 20261022120000_recados.

alter table public.recados add column if not exists talento_id uuid references public.perfis (id) on delete set null;
create index if not exists recados_talento_idx on public.recados (talento_id) where talento_id is not null;

drop function if exists public.recado(uuid);
drop function if exists public.recados_do_perfil(uuid, integer);
drop function if exists public.linha_recados(double precision, double precision, double precision, integer);
drop function if exists privado.recados_para(uuid[], double precision, double precision);
drop function if exists public.escrever_recado(text, text, uuid, double precision, double precision, text, text);
drop function if exists public.escrever_recado(text, text, uuid, double precision, double precision, text, text, uuid);

create function privado.recados_para(p_ids uuid[], p_lat double precision, p_lng double precision)
returns table (
  id uuid,
  autor_id uuid,
  autor_nome text,
  autor_tipo text,
  autor_foto text,
  autor_verificado boolean,
  texto text,
  foto text,
  cidade text,
  bairro text,
  distancia_km double precision,
  status text,
  motivo text,
  forcas integer,
  dei_forca boolean,
  meu boolean,
  quando timestamptz,
  anuncio_id uuid,
  anuncio_tipo text,
  anuncio_titulo text,
  anuncio_autor text,
  anuncio_valor numeric,
  anuncio_unidade text,
  anuncio_regime text,
  anuncio_bairro text,
  anuncio_cidade text,
  talento_id uuid,
  talento_nome text,
  talento_titulo text,
  talento_foto text,
  talento_bairro text,
  talento_cidade text
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.autor_id, p.nome, p.tipo, p.foto, p.verificado,
         r.texto, r.foto, r.cidade, r.bairro,
         case when p_lat is null or p_lng is null then null
              else round((extensions.st_distance(r.local,
                     extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography) / 1000)::numeric, 1)::double precision
         end,
         r.status,
         case when r.autor_id = (select public.conta_atual()) then r.motivo end,
         r.forcas,
         exists (select 1 from public.recado_forcas f where f.recado_id = r.id and f.perfil_id = (select public.conta_atual())),
         r.autor_id = (select public.conta_atual()),
         coalesce(r.publicado_em, r.criado_em),
         a.id, a.tipo, a.titulo, pa.nome, a.pagamento_valor, a.pagamento_unidade, a.regime, a.bairro, a.cidade,
         pt.id, privado.nome_curto(pt.nome), ct.titulo, pt.foto, pt.bairro, pt.cidade
    from public.recados r
    join public.perfis p on p.id = r.autor_id
    -- a vaga citada só aparece enquanto está no ar
    left join public.anuncios a on a.id = r.anuncio_id and a.status = 'ativo' and a.expira_em > now()
    left join public.perfis pa on pa.id = a.autor_id
    -- o currículo compartilhado só aparece enquanto a pessoa está na aba Talentos (e sem suspensão nem bloqueio)
    left join public.perfis pt on pt.id = r.talento_id and pt.tipo = 'pessoa'
         and (pt.suspenso_ate is null or pt.suspenso_ate < now())
         and exists (select 1 from public.curriculo_na_vitrine n where n.perfil_id = pt.id)
         and ((select public.conta_atual()) is null or not privado.ha_bloqueio((select public.conta_atual()), pt.id))
    left join public.curriculos ct on ct.perfil_id = pt.id
   where r.id = any (p_ids)
$$;

create function public.escrever_recado(
  p_texto text,
  p_foto text default null,
  p_anuncio uuid default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_cidade text default null,
  p_bairro text default null,
  p_talento uuid default null
)
returns table (id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  conta uuid := (select public.conta_atual());
  pessoa uuid := (select auth.uid());
  v_texto text := btrim(regexp_replace(coalesce(p_texto, ''), '\n{3,}', E'\n\n', 'g'));
  v_cidade text := nullif(btrim(coalesce(p_cidade, '')), '');
  v_ponto extensions.geography;
  v_status text;
  v_id uuid;
  primeiro timestamptz;
  quando text;
begin
  if conta is null or pessoa is null then
    raise exception 'Entre na sua conta para escrever um recado.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  if not exists (
    select 1 from public.contatos c
     where c.perfil_id = conta and (c.whatsapp is not null or c.email is not null)
  ) then
    raise exception 'Complete seu perfil antes de escrever um recado.' using errcode = 'P0001', hint = 'perfil_incompleto';
  end if;
  if char_length(v_texto) < 1 then
    raise exception 'Escreva o recado.' using errcode = 'P0001', hint = 'texto';
  end if;
  if char_length(v_texto) > 280 then
    raise exception 'O recado passa de 280 letras.' using errcode = 'P0001', hint = 'texto';
  end if;
  if public.tem_contato(v_texto, true) then
    raise exception 'Tire o telefone, o e-mail ou o link do recado. O contato é pela conversa do Publike.'
      using errcode = 'P0001', hint = 'contato';
  end if;
  if p_foto is not null and p_foto !~ ('^' || pessoa::text || '/[0-9]{10,16}\.jpg$') then
    raise exception 'Envie a foto de novo.' using errcode = 'P0001', hint = 'foto';
  end if;
  if p_anuncio is not null and not exists (
    select 1 from public.anuncios a where a.id = p_anuncio and a.status = 'ativo' and a.expira_em > now()
  ) then
    raise exception 'Essa vaga não está mais no ar. Cite outra ou publique sem citar.'
      using errcode = 'P0001', hint = 'anuncio';
  end if;
  if p_talento is not null and p_anuncio is not null then
    raise exception 'Cite uma vaga ou compartilhe um currículo, um de cada vez.' using errcode = 'P0001', hint = 'talento';
  end if;
  if p_talento is not null and not exists (
    select 1 from public.curriculo_na_vitrine n
      join public.perfis p on p.id = n.perfil_id
     where n.perfil_id = p_talento and p.tipo = 'pessoa'
       and (p.suspenso_ate is null or p.suspenso_ate < now())
       and not privado.ha_bloqueio(conta, p.id)
  ) then
    raise exception 'Esse currículo não está mais na aba Talentos. Escolha outro ou publique sem.'
      using errcode = 'P0001', hint = 'talento';
  end if;
  if p_lat is null or p_lng is null or v_cidade is null then
    raise exception 'Complete o bairro no seu perfil para escrever um recado.' using errcode = 'P0001', hint = 'lugar';
  end if;
  v_ponto := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  -- Goiânia e região
  if not extensions.st_dwithin(v_ponto,
           extensions.st_setsrid(extensions.st_makepoint(-49.2563, -16.6806), 4326)::extensions.geography, 150000) then
    raise exception 'O Publike é de Goiânia e região.' using errcode = 'P0001', hint = 'lugar';
  end if;

  -- 5 por dia (24 horas): a mensagem diz quando dá para escrever de novo
  select min(l.criado_em) into primeiro
    from (select l.criado_em from privado.limites_uso l
           where l.perfil_id = pessoa and l.acao = 'recado' and l.criado_em > now() - interval '24 hours'
           order by l.criado_em desc limit 5) l;
  quando := case
              when primeiro is null then 'amanhã'
              when ((primeiro + interval '24 hours') at time zone 'America/Sao_Paulo')::date
                   = (now() at time zone 'America/Sao_Paulo')::date
                then 'hoje às ' || to_char((primeiro + interval '24 hours') at time zone 'America/Sao_Paulo', 'HH24"h"MI')
              else 'amanhã às ' || to_char((primeiro + interval '24 hours') at time zone 'America/Sao_Paulo', 'HH24"h"MI')
            end;
  perform privado.conferir_limite('recado', 5,
    'Você já escreveu 5 recados nas últimas 24 horas. Dá para escrever de novo ' || quando || '.');

  v_status := case when coalesce((select c.ia_moderacao from public.config_site c limit 1), false)
                   then 'revisao' else 'no_ar' end;
  insert into public.recados (autor_id, escrito_por, texto, foto, anuncio_id, talento_id, local, cidade, bairro, status,
                              publicado_em)
  values (conta, pessoa, v_texto, p_foto, p_anuncio, p_talento, v_ponto, v_cidade, nullif(btrim(coalesce(p_bairro, '')), ''),
          v_status, case when v_status = 'no_ar' then now() end)
  returning recados.id into v_id;
  if v_status = 'revisao' then
    insert into privado.fila_ia_recados (recado_id) values (v_id);
  end if;
  return query select v_id, v_status;
end
$$;

create function public.linha_recados(
  p_lat double precision,
  p_lng double precision,
  p_raio_km double precision default 25,
  p_limite integer default 60
)
returns table (
  id uuid, autor_id uuid, autor_nome text, autor_tipo text, autor_foto text, autor_verificado boolean,
  texto text, foto text, cidade text, bairro text, distancia_km double precision, status text, motivo text,
  forcas integer, dei_forca boolean, meu boolean, quando timestamptz,
  anuncio_id uuid, anuncio_tipo text, anuncio_titulo text, anuncio_autor text, anuncio_valor numeric,
  anuncio_unidade text, anuncio_regime text, anuncio_bairro text, anuncio_cidade text,
  talento_id uuid, talento_nome text, talento_titulo text, talento_foto text, talento_bairro text, talento_cidade text,
  seguindo boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  conta uuid := (select public.conta_atual());
  ponto extensions.geography :=
    extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  ids uuid[];
  seguidos uuid[];
begin
  if conta is null then
    return;
  end if;
  select coalesce(array_agg(s.alvo_perfil), '{}') into seguidos
    from public.seguindo s
   where s.perfil_id in (conta, (select auth.uid())) and s.alvo_perfil is not null;
  select coalesce(array_agg(x.id), '{}') into ids
    from (
      select r.id from public.recados r
       where (r.status = 'no_ar' and r.publicado_em > now() - interval '30 days'
              and privado.recado_visivel(r.status, r.autor_id)
              and (extensions.st_dwithin(r.local, ponto, least(greatest(coalesce(p_raio_km, 25), 1), 100) * 1000)
                   or r.autor_id = any (seguidos)
                   or r.autor_id = conta))
          or (r.autor_id = conta and r.status in ('revisao', 'retido') and r.criado_em > now() - interval '30 days')
       order by coalesce(r.publicado_em, r.criado_em) desc
       limit least(greatest(coalesce(p_limite, 60), 1), 200)
    ) x;
  return query
    select v.*, v.autor_id = any (seguidos)
      from privado.recados_para(ids, p_lat, p_lng) v
     order by v.quando desc;
end
$$;

create function public.recados_do_perfil(p_perfil uuid, p_limite integer default 30)
returns table (
  id uuid, autor_id uuid, autor_nome text, autor_tipo text, autor_foto text, autor_verificado boolean,
  texto text, foto text, cidade text, bairro text, distancia_km double precision, status text, motivo text,
  forcas integer, dei_forca boolean, meu boolean, quando timestamptz,
  anuncio_id uuid, anuncio_tipo text, anuncio_titulo text, anuncio_autor text, anuncio_valor numeric,
  anuncio_unidade text, anuncio_regime text, anuncio_bairro text, anuncio_cidade text,
  talento_id uuid, talento_nome text, talento_titulo text, talento_foto text, talento_bairro text, talento_cidade text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  ids uuid[];
  dona boolean := p_perfil = (select public.conta_atual());
begin
  select coalesce(array_agg(x.id), '{}') into ids
    from (
      select r.id from public.recados r
       where r.autor_id = p_perfil
         and (privado.recado_visivel(r.status, r.autor_id) or (dona and r.status in ('revisao', 'retido')))
       order by coalesce(r.publicado_em, r.criado_em) desc
       limit least(greatest(coalesce(p_limite, 30), 1), 100)
    ) x;
  return query select v.* from privado.recados_para(ids, null, null) v order by v.quando desc;
end
$$;

create function public.recado(p_id uuid)
returns table (
  id uuid, autor_id uuid, autor_nome text, autor_tipo text, autor_foto text, autor_verificado boolean,
  texto text, foto text, cidade text, bairro text, distancia_km double precision, status text, motivo text,
  forcas integer, dei_forca boolean, meu boolean, quando timestamptz,
  anuncio_id uuid, anuncio_tipo text, anuncio_titulo text, anuncio_autor text, anuncio_valor numeric,
  anuncio_unidade text, anuncio_regime text, anuncio_bairro text, anuncio_cidade text,
  talento_id uuid, talento_nome text, talento_titulo text, talento_foto text, talento_bairro text, talento_cidade text
)
language sql
stable
security definer
set search_path = ''
as $$
  select v.* from privado.recados_para(
    array(select r.id from public.recados r
           where r.id = p_id
             and (privado.recado_visivel(r.status, r.autor_id)
                  or (r.autor_id = (select public.conta_atual()) and r.status in ('revisao', 'retido')))),
    null, null) v
$$;

revoke execute on function privado.recados_para(uuid[], double precision, double precision) from public;

revoke execute on function
  public.escrever_recado(text, text, uuid, double precision, double precision, text, text, uuid),
  public.linha_recados(double precision, double precision, double precision, integer),
  public.recados_do_perfil(uuid, integer),
  public.recado(uuid)
from public, anon;

grant execute on function
  public.escrever_recado(text, text, uuid, double precision, double precision, text, text, uuid),
  public.linha_recados(double precision, double precision, double precision, integer)
to authenticated;

grant execute on function
  public.recados_do_perfil(uuid, integer),
  public.recado(uuid)
to anon, authenticated;

notify pgrst, 'reload schema';
