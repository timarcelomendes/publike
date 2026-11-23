-- O aceite dos avisos pela própria conversa do WhatsApp (23/11/2026; Marcelo: "eu preciso fazer as pessoas aceitarem o
-- envio via whatsapp, isso está me limitando muito"). Até aqui o pedido ia por e-mail (89 pedidos, 5 aceites) e pelo
-- site (depois de publicar e no painel: nenhum aceite), e quem contrata quase não abre nem um nem outro. Agora o link
-- `wa.me` do Publike com "Quero receber meus candidatos pelo WhatsApp" já escrito (na mensagem de Admin › Esperando, que
-- a equipe manda pelo próprio WhatsApp): a empresa toca e envia, e pedir na conversa vale como aceite (a regra da
-- Meta). O Publike acha as contas que contratam com esse número (o celular do login ou o WhatsApp do cadastro), liga o
-- aviso pelo WhatsApp de cada uma e responde com quem está esperando. Pode rodar de novo.

create or replace function public.servidor_whatsapp_aceite_pela_conversa(p_chave text, p_conversa text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_numero text;
  v_contas uuid[];
begin
  perform privado.exigir_servidor(p_chave);
  select regexp_replace(c.numero, '\D', '', 'g') into v_numero from privado.whatsapp_conversas c where c.chave = p_conversa;
  if v_numero is null or v_numero !~ '^55[1-9][0-9][0-9]{8,9}$' then
    return jsonb_build_object('ok', false, 'contas', '[]'::jsonb);
  end if;

  -- as contas que contratam com este número: as que entram com ele e as que o têm no cadastro (empresa, comércio,
  -- agência, ou a pessoa com vaga no ar); a da equipe do Publike, não
  select array_agg(distinct x.id) into v_contas
    from (
      select u.id from auth.users u
       where u.phone = any (privado.numeros_do_whatsapp(v_numero)) and u.deleted_at is null
      union
      select ct.perfil_id from public.contatos ct
       where ct.whatsapp is not null
         and privado.telefone_do_login(ct.whatsapp) = privado.telefone_do_login(v_numero)
    ) x
    join public.perfis p on p.id = x.id
   where not privado.conta_da_equipe_publike(p.id)
     and (p.tipo in ('empresa', 'comercio', 'agencia')
          or exists (select 1 from public.anuncios a where a.autor_id = p.id and a.tipo = 'vaga' and a.status = 'ativo'));
  if v_contas is null then
    return jsonb_build_object('ok', true, 'contas', '[]'::jsonb);
  end if;

  insert into privado.whatsapp_permissoes as w (conta_id, numero, origem, aceito_em, cancelado_em)
  select c, v_numero, 'whatsapp', now(), null from unnest(v_contas) c
  on conflict (conta_id) do update
    set numero = excluded.numero, origem = excluded.origem, aceito_em = now(), cancelado_em = null,
        cancelado_por = null;

  return jsonb_build_object('ok', true, 'contas', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', p.id,
             'nome', p.nome,
             'esperando', (select count(*) from public.curtidas k
                             join public.anuncios a on a.id = k.anuncio_id
                            where a.autor_id = p.id and a.tipo = 'vaga' and a.status = 'ativo'
                              and k.status = 'pendente' and k.aceita_em is null),
             'vagas', (select coalesce(jsonb_agg(jsonb_build_object('titulo', t.titulo, 'n', t.n) order by t.n desc), '[]'::jsonb)
                         from (select a.titulo, count(*) n
                                 from public.curtidas k
                                 join public.anuncios a on a.id = k.anuncio_id
                                where a.autor_id = p.id and a.tipo = 'vaga' and a.status = 'ativo'
                                  and k.status = 'pendente' and k.aceita_em is null
                                group by a.id, a.titulo
                                order by count(*) desc
                                limit 5) t)
           ) order by p.nome), '[]'::jsonb)
      from public.perfis p where p.id = any (v_contas)));
end
$$;
revoke execute on function public.servidor_whatsapp_aceite_pela_conversa(text, text) from public;
grant execute on function public.servidor_whatsapp_aceite_pela_conversa(text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270915120000_whatsapp_aceite_pela_conversa');
