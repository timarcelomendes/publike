-- O "agora não" do WhatsApp do match (06/11/2026; claude/plano-agora-nao-no-whatsapp.md). Na pergunta "Deu match! Quer
-- falar agora com X?", fechar sem tocar no "Chamar no WhatsApp" fica no histórico da candidatura como
-- 'contato_pessoa:descartou' (só do lado da pessoa, depois do match), e Admin › Curtidas mostra. Pode rodar de novo.

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
  if p_canal is null or p_canal not in ('whatsapp', 'telefone', 'email', 'descartou') then
    raise exception 'Pedido inválido.' using errcode = '22023';
  end if;
  -- quem publicou a vaga (ou a equipe dela), tocando no contato de quem se candidatou (o "agora não" é só da pessoa)
  if p_canal <> 'descartou' and exists (select 1 from public.curtidas c join public.anuncios a on a.id = c.anuncio_id
              where c.anuncio_id = p_anuncio and c.perfil_id = p_perfil and a.autor_id = conta) then
    v_o_que := 'contato:' || p_canal;
  -- a própria pessoa que curtiu, tocando no contato de quem publicou (ou dizendo "agora não"), só depois do aceite
  elsif p_perfil = conta and exists (select 1 from public.curtidas c
                                      where c.anuncio_id = p_anuncio and c.perfil_id = conta
                                        and (c.status = 'match' or c.aceita_em is not null)) then
    v_o_que := 'contato_pessoa:' || p_canal;
  else
    return;
  end if;
  -- um registro por hora de cada lado e canal basta
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

notify pgrst, 'reload schema';
