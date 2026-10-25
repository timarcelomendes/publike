-- Quem curtiu não fica esperando quem nunca entra (25/10/2026). Pode rodar de novo sem problema.
--
-- Muitas vagas são publicadas pela equipe em nome de uma empresa que nunca entrou no Publike: o
-- e-mail da curtida chega, mas ninguém aceita, e quem curtiu fica sem resposta. Depois de 48 horas,
-- se a conta que publicou nunca entrou, a vaga passa a ter o contato direto e as curtidas paradas
-- viram match (o mesmo caminho do contato direto): quem curtiu recebe "Deu match! O contato de …
-- já está liberado" no sino, no e-mail e no celular. Vaga que pede currículo, de quem ainda não
-- mandou: o aceite fica guardado e o match sai quando o currículo chegar.
-- Roda pela tarefa das filas (/api/filas, a cada minuto).

create index if not exists curtidas_pendentes_idx on public.curtidas (criado_em)
  where status = 'pendente' and aceita_em is null;

create or replace function privado.liberar_contatos_parados()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vagas uuid[];
  v_total integer := 0;
  r record;
begin
  select array_agg(distinct a.id) into v_vagas
    from public.curtidas c
    join public.anuncios a on a.id = c.anuncio_id
    join public.perfis p on p.id = a.autor_id
    left join auth.users u on u.id = a.autor_id
   where c.status = 'pendente' and c.aceita_em is null
     and c.criado_em < now() - interval '48 hours'
     and a.tipo = 'vaga' and a.status = 'ativo'
     and u.last_sign_in_at is null
     and not coalesce(p.suspenso_ate > now(), false);
  if v_vagas is null then
    return 0;
  end if;

  update public.anuncios set contato_direto = true where id = any (v_vagas) and not contato_direto;

  for r in
    select c.anuncio_id, c.perfil_id, a.autor_id, a.titulo, p.nome as dono_nome,
           (a.pede_curriculo and not exists (select 1 from public.curriculos cv where cv.perfil_id = c.perfil_id))
             as falta_cv
      from public.curtidas c
      join public.anuncios a on a.id = c.anuncio_id
      join public.perfis p on p.id = a.autor_id
     where c.anuncio_id = any (v_vagas) and c.status = 'pendente' and c.aceita_em is null
       and not privado.ha_bloqueio(a.autor_id, c.perfil_id)
  loop
    if r.falta_cv then
      update public.curtidas set aceita_em = now() where anuncio_id = r.anuncio_id and perfil_id = r.perfil_id;
      insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
      values (r.perfil_id, 'aceite_curriculo', r.anuncio_id, r.autor_id,
              left(coalesce(r.dono_nome, 'Quem publicou') || ' recebe todos os interessados em “' || r.titulo
                   || '”. Falta só o seu currículo: mande e o contato de vocês aparece na hora.', 300));
    else
      -- o aviso "Deu match! O contato … já está liberado" sai pelo gatilho do match
      update public.curtidas set status = 'match', respondida_em = now()
       where anuncio_id = r.anuncio_id and perfil_id = r.perfil_id;
    end if;
    v_total := v_total + 1;
  end loop;
  return v_total;
end
$$;
revoke execute on function privado.liberar_contatos_parados() from public, anon, authenticated;

create or replace function public.servidor_liberar_contatos_parados(p_chave text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return privado.liberar_contatos_parados();
end
$$;
revoke execute on function public.servidor_liberar_contatos_parados(text) from public;
grant execute on function public.servidor_liberar_contatos_parados(text) to anon, authenticated, service_role;
