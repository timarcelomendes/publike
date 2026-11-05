-- Quem respondeu a curtida (05/11/2026, Admin › Curtidas): a empresa (ou a equipe dela), o contato direto (o match
-- na hora), uma automação da vaga, uma regra personalizada ou o Publike (o contato liberado depois de 48 horas, para
-- a conta que nunca entrou). Daqui para frente, o gatilho guarda na hora; as antigas ganham uma estimativa pelo que
-- ficou registrado (as automações, as regras, o contato direto e o primeiro acesso de quem publicou). Pode rodar de
-- novo.

alter table public.curtidas add column if not exists respondida_por text
  check (respondida_por in ('empresa', 'pessoa', 'direto', 'automacao', 'regra', 'publike'));

create or replace function privado.quem_respondeu_a_curtida()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  -- curtiu de novo (depois do match desfeito ou da recusa): a próxima resposta é nova
  if new.status = 'pendente' and old.status <> 'pendente' and new.aceita_em is null then
    new.respondida_por := null;
    return new;
  end if;
  -- só a primeira resposta: sair de "pendente" ou o aceite (falta o currículo); o match depois do aceite fica com
  -- quem aceitou
  if not ((old.status = 'pendente' and new.status <> 'pendente') or (old.aceita_em is null and new.aceita_em is not null))
     or old.respondida_por is not null then
    return new;
  end if;
  new.respondida_por := case
    -- de dentro de outro gatilho: o contato direto (o match ou o aceite na hora) ou a automação ao curtir/preencher
    when pg_trigger_depth() > 1 then
      case when new.status <> 'dispensada'
                and exists (select 1 from public.anuncios a where a.id = new.anuncio_id and a.contato_direto)
           then 'direto' else 'automacao' end
    when v_uid is not null then case when v_uid = new.perfil_id then 'pessoa' else 'empresa' end
    -- o servidor (as filas): uma regra personalizada, uma automação da vaga ou o Publike
    when exists (select 1 from privado.regras_feitas r
                  where r.anuncio_id = new.anuncio_id and r.perfil_id = new.perfil_id
                    and r.feito_em > now() - interval '2 minutes') then 'regra'
    when exists (select 1 from privado.automacoes_feitas f
                  where f.anuncio_id = new.anuncio_id and f.perfil_id = new.perfil_id
                    and f.feito_em > now() - interval '2 minutes') then 'automacao'
    else 'publike'
  end;
  return new;
end
$$;
revoke execute on function privado.quem_respondeu_a_curtida() from public;

drop trigger if exists curtidas_quem_respondeu on public.curtidas;
create trigger curtidas_quem_respondeu
  before update of status, aceita_em on public.curtidas
  for each row execute function privado.quem_respondeu_a_curtida();

-- as antigas: a estimativa (só onde ainda não tem; mexer só nesta coluna não dispara os outros gatilhos)
update public.curtidas c
   set respondida_por = case
     when c.status <> 'dispensada' and a.contato_direto
          and coalesce(c.aceita_em, c.respondida_em) <= c.criado_em + interval '1 minute' then 'direto'
     when exists (select 1 from privado.regras_feitas r
                   where r.anuncio_id = c.anuncio_id and r.perfil_id = c.perfil_id
                     and abs(extract(epoch from (r.feito_em - coalesce(c.respondida_em, c.aceita_em)))) < 120) then 'regra'
     when exists (select 1 from privado.automacoes_feitas f
                   where f.anuncio_id = c.anuncio_id and f.perfil_id = c.perfil_id
                     and abs(extract(epoch from (f.feito_em - coalesce(c.respondida_em, c.aceita_em)))) < 120) then 'automacao'
     -- o contato liberado: 48 horas depois, de quem publicou e ainda não tinha entrado
     when coalesce(c.aceita_em, c.respondida_em) >= c.criado_em + interval '47 hours'
          and not exists (select 1 from auth.users u
                           where u.id = a.autor_id and u.last_sign_in_at < coalesce(c.aceita_em, c.respondida_em)) then 'publike'
     else 'empresa'
   end
  from public.anuncios a
 where a.id = c.anuncio_id and c.respondida_por is null
   and (c.status <> 'pendente' or c.aceita_em is not null)
   and coalesce(c.respondida_em, c.aceita_em) is not null;

notify pgrst, 'reload schema';
