-- Quem chamou no WhatsApp, no telefone ou no e-mail depois do match (05/11/2026, pedido do Marcelo: "tem como saber
-- se clicou em conversar no whatsapp?"). A empresa tocando no contato do candidato já ficava no histórico da
-- candidatura (`contato:<canal>`, migração 20270127120000). Agora a pessoa que curtiu, tocando no contato de quem
-- publicou (em Candidaturas e em Matches), também fica (`contato_pessoa:<canal>`). Admin › Curtidas mostra o último
-- toque de cada lado. É o toque no botão: o que acontece dentro do WhatsApp o Publike não vê.
-- Rode depois de 20270218120000_consulta_de_salarios.sql. Pode rodar de novo.

create or replace function public.registrar_contato_candidato(p_anuncio uuid, p_perfil uuid, p_canal text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := public.conta_atual();
  v_o_que text;
begin
  if (select auth.uid()) is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  if p_canal is null or p_canal not in ('whatsapp', 'telefone', 'email') then
    raise exception 'Pedido inválido.' using errcode = '22023';
  end if;
  -- quem publicou a vaga (ou a equipe dela), tocando no contato de quem se candidatou
  if exists (select 1 from public.curtidas c join public.anuncios a on a.id = c.anuncio_id
              where c.anuncio_id = p_anuncio and c.perfil_id = p_perfil and a.autor_id = conta) then
    v_o_que := 'contato:' || p_canal;
  -- a própria pessoa que curtiu, tocando no contato de quem publicou (só depois do aceite)
  elsif p_perfil = conta and exists (select 1 from public.curtidas c
                                      where c.anuncio_id = p_anuncio and c.perfil_id = conta
                                        and (c.status = 'match' or c.aceita_em is not null)) then
    v_o_que := 'contato_pessoa:' || p_canal;
  else
    return;
  end if;
  -- um toque por hora de cada lado e canal basta
  if exists (select 1 from privado.historico_etapas h
              where h.anuncio_id = p_anuncio and h.perfil_id = p_perfil
                and h.o_que = v_o_que and h.em > now() - interval '1 hour') then
    return;
  end if;
  insert into privado.historico_etapas (anuncio_id, perfil_id, o_que) values (p_anuncio, p_perfil, v_o_que);
end
$$;
revoke execute on function public.registrar_contato_candidato(uuid, uuid, text) from public, anon;
grant execute on function public.registrar_contato_candidato(uuid, uuid, text) to authenticated;

-- Admin › Curtidas: o último toque de cada lado em cada candidatura das vagas pedidas
create or replace function public.admin_contatos_das_curtidas(p_anuncios uuid[])
returns table (anuncio_id uuid, perfil_id uuid, lado text, canal text, em timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform privado.exigir_admin();
  return query
  select distinct on (h.anuncio_id, h.perfil_id, split_part(h.o_que, ':', 1))
         h.anuncio_id, h.perfil_id,
         case when h.o_que like 'contato_pessoa:%' then 'pessoa' else 'empresa' end,
         split_part(h.o_que, ':', 2), h.em
    from privado.historico_etapas h
   where h.anuncio_id = any ((coalesce(p_anuncios, '{}'))[1:1000])
     and (h.o_que like 'contato:%' or h.o_que like 'contato_pessoa:%')
   order by h.anuncio_id, h.perfil_id, split_part(h.o_que, ':', 1), h.em desc;
end
$$;
revoke execute on function public.admin_contatos_das_curtidas(uuid[]) from public, anon;
grant execute on function public.admin_contatos_das_curtidas(uuid[]) to authenticated, service_role;

notify pgrst, 'reload schema';
