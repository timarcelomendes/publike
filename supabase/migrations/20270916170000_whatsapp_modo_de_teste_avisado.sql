-- O modo de teste do WhatsApp não passa mais despercebido (23/11/2026: de 22/11, 13h, a 23/11, 20h29, o envio ficou
-- só para os números de teste e 169 avisos de 35 contas foram descartados, sem ninguém ver; Marcelo: "pode ter sido
-- eu, sem ver"). A configuração do servidor diz também se o envio está só para os testes e quantos avisos foram
-- descartados por isso na última hora (o /api/filas acusa um problema, e o alarme da fila manda e-mail); a equipe
-- lê o mesmo para a faixa vermelha no alto do Admin. Pode rodar de novo.

create or replace function public.servidor_whatsapp_config(p_chave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cfg privado.config_whatsapp;
begin
  perform privado.exigir_servidor(p_chave);
  select * into cfg from privado.config_whatsapp where id;
  return jsonb_build_object(
    'ativo', coalesce(cfg.ativo, false),
    'modelos', coalesce(cfg.modelos, '{}'::jsonb),
    'conferidos_em', cfg.modelos_conferidos_em,
    'para_todos', coalesce(cfg.para_todos, false),
    'descartados_hora', (select count(*) from privado.fila_whatsapp f
                          where f.situacao = 'descartada' and f.motivo like 'modo de teste%'
                            and f.criado_em > now() - interval '1 hour'));
end
$$;

-- a faixa do Admin: ligado, só para os testes, e quantos avisos foram descartados nas últimas 24 horas
create or replace function public.admin_whatsapp_modo_teste()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cfg privado.config_whatsapp;
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike.' using errcode = '42501';
  end if;
  select * into cfg from privado.config_whatsapp where id;
  return jsonb_build_object(
    'teste', coalesce(cfg.ativo, false) and not coalesce(cfg.para_todos, false),
    'descartados', (select count(*) from privado.fila_whatsapp f
                     where f.situacao = 'descartada' and f.motivo like 'modo de teste%'
                       and f.criado_em > now() - interval '24 hours'));
end
$$;
revoke execute on function public.admin_whatsapp_modo_teste() from public, anon;
grant execute on function public.admin_whatsapp_modo_teste() to authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270916170000_whatsapp_modo_de_teste_avisado');
