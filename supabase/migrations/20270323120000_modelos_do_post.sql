-- Os modelos do post (09/11/2026; claude/plano-posts-e-conquistas.md, parte 3). Pode rodar de novo.
-- Rode depois de 20270322120000_conquistas.sql.
--
-- O post deixa de ser só uma caixa em branco: a pessoa escolhe "Procuro trabalho", "Dica para quem procura trabalho"
-- ou "Do meu jeito"; quem contrata, "Estamos contratando" (com uma vaga sua no ar, 1 por vaga por semana),
-- "Bastidores" (com foto) ou "Do meu jeito". O banco confere o modelo. Na aba Talentos, quem postou "Procuro
-- trabalho" nos últimos 14 dias ganha o selo "Procurando agora".

alter table public.recados add column if not exists modelo text not null default 'livre';
alter table public.recados drop constraint if exists recados_modelo_check;
alter table public.recados add constraint recados_modelo_check
  check (modelo in ('livre', 'procuro', 'dica', 'contratando', 'bastidores'));
create index if not exists recados_procuro_idx on public.recados (autor_id, publicado_em desc)
  where modelo = 'procuro' and status = 'no_ar';

-- escrever_recado ganha o modelo (a versão de antes, sem ele, sai)
drop function if exists public.escrever_recado(text, text, uuid, double precision, double precision, text, text, uuid);
CREATE OR REPLACE FUNCTION public.escrever_recado(p_texto text, p_foto text DEFAULT NULL::text, p_anuncio uuid DEFAULT NULL::uuid, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_cidade text DEFAULT NULL::text, p_bairro text DEFAULT NULL::text, p_talento uuid DEFAULT NULL::uuid, p_modelo text DEFAULT 'livre'::text)
 RETURNS TABLE(id uuid, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_modelo text := coalesce(nullif(btrim(p_modelo), ''), 'livre');
  v_tipo text;
begin
  if conta is null or pessoa is null then
    raise exception 'Entre na sua conta para postar.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  if not exists (
    select 1 from public.contatos c
     where c.perfil_id = conta and (c.whatsapp is not null or c.email is not null)
  ) then
    raise exception 'Complete seu perfil antes de postar.' using errcode = 'P0001', hint = 'perfil_incompleto';
  end if;
  if char_length(v_texto) < 1 then
    raise exception 'Escreva o post.' using errcode = 'P0001', hint = 'texto';
  end if;
  if char_length(v_texto) > 280 then
    raise exception 'O post passa de 280 letras.' using errcode = 'P0001', hint = 'texto';
  end if;
  if public.tem_contato(v_texto, true) then
    raise exception 'Tire o telefone, o e-mail ou o link do post. O contato é pela conversa do Publike.'
      using errcode = 'P0001', hint = 'contato';
  end if;
  -- o modelo do post (migração 20270323120000): cada um com o que precisa
  select p.tipo into v_tipo from public.perfis p where p.id = conta;
  if v_modelo not in ('livre', 'procuro', 'dica', 'contratando', 'bastidores') then
    raise exception 'Escolha o tipo do post.' using errcode = 'P0001', hint = 'modelo';
  end if;
  if v_modelo = 'procuro' and v_tipo is distinct from 'pessoa' then
    raise exception 'O "Procuro trabalho" é para quem procura trabalho.' using errcode = 'P0001', hint = 'modelo';
  end if;
  if v_modelo in ('contratando', 'bastidores') and v_tipo is not distinct from 'pessoa' then
    raise exception 'Esse tipo de post é para quem contrata.' using errcode = 'P0001', hint = 'modelo';
  end if;
  if v_modelo = 'contratando' then
    if p_anuncio is null or not exists (
      select 1 from public.anuncios a
       where a.id = p_anuncio and a.autor_id = conta and a.tipo = 'vaga' and a.status = 'ativo' and a.expira_em > now()
    ) then
      raise exception 'Escolha uma das suas vagas no ar para o "Estamos contratando".' using errcode = 'P0001', hint = 'anuncio';
    end if;
    if exists (
      select 1 from public.recados r
       where r.autor_id = conta and r.modelo = 'contratando' and r.anuncio_id = p_anuncio
         and r.status <> 'apagado' and r.criado_em > now() - interval '7 days'
    ) then
      raise exception 'Essa vaga já teve um "Estamos contratando" nesta semana. Escolha outra vaga ou poste do seu jeito.'
        using errcode = 'P0001', hint = 'anuncio';
    end if;
  end if;
  if v_modelo = 'bastidores' and p_foto is null then
    raise exception 'Ponha uma foto da equipe, do lugar ou do dia a dia no "Bastidores".' using errcode = 'P0001', hint = 'foto';
  end if;
  if p_talento is not null and p_talento = conta and not exists (
    select 1 from public.curriculo_na_vitrine n where n.perfil_id = conta
  ) then
    raise exception 'Para mostrar o seu currículo no post, ele precisa estar na aba Talentos (em Meu currículo).'
      using errcode = 'P0001', hint = 'talento';
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
    raise exception 'Complete o bairro no seu perfil para postar.' using errcode = 'P0001', hint = 'lugar';
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
    'Você já fez 5 posts nas últimas 24 horas. Dá para postar de novo ' || quando || '.');

  v_status := case when coalesce((select c.ia_moderacao from public.config_site c limit 1), false)
                   then 'revisao' else 'no_ar' end;
  insert into public.recados (autor_id, escrito_por, texto, foto, anuncio_id, talento_id, local, cidade, bairro, status,
                              publicado_em, modelo)
  values (conta, pessoa, v_texto, p_foto, p_anuncio, p_talento, v_ponto, v_cidade, nullif(btrim(coalesce(p_bairro, '')), ''),
          v_status, case when v_status = 'no_ar' then now() end, v_modelo)
  returning recados.id into v_id;
  if v_status = 'revisao' then
    insert into privado.fila_ia_recados (recado_id) values (v_id);
  end if;
  return query select v_id, v_status;
end
$function$;
revoke execute on function public.escrever_recado(text, text, uuid, double precision, double precision, text, text, uuid, text)
  from public, anon;
grant execute on function public.escrever_recado(text, text, uuid, double precision, double precision, text, text, uuid, text)
  to authenticated;

-- o modelo de cada post (as telas leem os posts pelas funções de sempre e juntam o modelo)
create or replace function public.modelos_dos_recados(p_ids uuid[])
returns table (id uuid, modelo text)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.modelo from public.recados r where r.id = any (p_ids[1:300]) and r.status <> 'apagado'
$$;
revoke execute on function public.modelos_dos_recados(uuid[]) from public;
grant execute on function public.modelos_dos_recados(uuid[]) to anon, authenticated;

-- "Procurando agora" na aba Talentos: quem postou "Procuro trabalho" nos últimos 14 dias
create or replace function public.procurando_agora(p_ids uuid[])
returns table (perfil_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct r.autor_id from public.recados r
   where r.autor_id = any (p_ids[1:200]) and r.modelo = 'procuro' and r.status = 'no_ar'
     and r.publicado_em > now() - interval '14 days'
$$;
revoke execute on function public.procurando_agora(uuid[]) from public, anon;
grant execute on function public.procurando_agora(uuid[]) to authenticated;

notify pgrst, 'reload schema';
