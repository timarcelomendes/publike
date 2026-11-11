-- O mapa de talentos (claude/oportunidades-distancia-e-localizacao.md, item 7): quantas pessoas de cada função moram
-- perto da vaga (até 15, 30 e 45 minutos de ônibus), por bairro, sem mostrar a casa de ninguém. Serve para escolher
-- o salário e o lugar do mutirão, e para a agência mostrar ao cliente.
-- Só entra quem deixou as empresas acharem o currículo (curriculo_visivel) e informou o CEP de casa (public.casas,
-- já guardado como um ponto arredondado). O banco devolve ao servidor só o bairro, a distância e as experiências,
-- sem nome nem id; o servidor junta e mostra só os grupos com 5 pessoas ou mais.
-- Pago: com a Consulta de salários liberada (assinatura ou dias grátis) ou com um plano. Sem isso, a tela mostra só
-- o total a até 30 minutos. Pode rodar de novo.

create or replace function privado.mapa_de_talentos_liberado(p_conta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from privado.salarios_contas s where s.conta_id = p_conta and (s.ate is null or s.ate > now()))
      or exists (select 1 from privado.assinaturas a
                  where a.conta_id = p_conta and a.situacao = 'ativa' and privado.libera_tudo(a.recurso))
      or exists (select 1 from privado.cobrancas c
                  where c.conta_id = p_conta and c.situacao = 'paga' and privado.libera_tudo(c.recurso)
                    and c.periodo_ate + case when c.compra_id is null then interval '3 days' else interval '0' end > now())
      or exists (select 1 from privado.plano_agencia_cortesia x
                  where x.conta_id = p_conta and (x.ate is null or x.ate > now()))
$$;
revoke execute on function privado.mapa_de_talentos_liberado(uuid) from public;

create or replace function public.mapa_de_talentos_liberado()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and privado.mapa_de_talentos_liberado(public.conta_atual())
$$;
revoke execute on function public.mapa_de_talentos_liberado() from public, anon;
grant execute on function public.mapa_de_talentos_liberado() to authenticated;

-- só para o servidor: as pessoas perto do endereço da vaga da conta, sem nome nem id, com o bairro, a distância
-- (em km, com uma casa) e as experiências do currículo (para a função). Até p_km (no máximo 15 km) e 5000 pessoas.
create or replace function public.servidor_mapa_de_talentos(p_chave text, p_conta uuid, p_anuncio uuid, p_km numeric)
returns table (bairro text, cidade text, km numeric, experiencias jsonb, titulo text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_local extensions.geography;
begin
  perform privado.exigir_servidor(p_chave);
  select a.local into v_local from public.anuncios a
   where a.id = p_anuncio and a.autor_id = p_conta and a.tipo = 'vaga' and a.local is not null;
  if v_local is null or not privado.contrata(p_conta) then
    return;
  end if;
  return query
  select coalesce(nullif(ca.bairro, ''), 'Sem bairro'), ca.cidade,
         round((extensions.st_distance(ca.local, v_local) / 1000)::numeric, 1),
         c.experiencias, c.titulo
    from public.casas ca
    join public.perfis p on p.id = ca.perfil_id
    join public.curriculo_visivel v on v.perfil_id = ca.perfil_id
    join public.curriculos c on c.perfil_id = ca.perfil_id
   where p.tipo = 'pessoa'
     and (p.suspenso_ate is null or p.suspenso_ate < now())
     and not privado.ha_bloqueio(p_conta, p.id)
     and extensions.st_dwithin(ca.local, v_local, least(greatest(coalesce(p_km, 5), 1), 15) * 1000)
   limit 5000;
end
$$;
revoke execute on function public.servidor_mapa_de_talentos(text, uuid, uuid, numeric) from public;
grant execute on function public.servidor_mapa_de_talentos(text, uuid, uuid, numeric) to anon, authenticated, service_role;
