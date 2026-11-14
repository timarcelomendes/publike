-- A chave da campanha geral (14/11/2026). Pedido do Marcelo, sobre o robô que acerta o orçamento da campanha geral com
-- a verba dos pacotes no ar (20270519120000): "pode implementar e deixe uma chave de liga / desliga no admin".
--
-- Ligada, o robô deixa a campanha geral na base mais a verba de cada pacote no ar, até o máximo, de manhã e na hora em
-- que entra um pacote (como antes). Desligada, o robô devolve a campanha à base uma vez, se tinha subido, e depois não
-- mexe mais: o orçamento fica com quem mexer no Google Ads. A chave fica no alto de Admin › Impulsos
-- (src/components/admin/impulsos-chave-da-geral.tsx); as Regras guardam a base, o máximo, a conta e a campanha.
--
-- Pode rodar de novo.

alter table privado.config_impulso add column if not exists geral_voltar boolean not null default false;

-- a chave mudou, por onde for (a chave do admin, as Regras, o SQL): o robô age na volta seguinte. Desligada depois de o
-- robô subir a campanha, ela volta para a base.
create or replace function privado.geral_chave_mudou()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.geral_ligada then
    new.geral_voltar := false;
  else
    new.geral_voltar := old.geral_valor is not null and old.geral_valor <> new.geral_base;
  end if;
  new.geral_feita_em := null;
  new.geral_erro := null;
  new.geral_erro_em := null;
  return new;
end
$$;

drop trigger if exists geral_chave_mudou on privado.config_impulso;
create trigger geral_chave_mudou
  before update of geral_ligada on privado.config_impulso
  for each row
  when (old.geral_ligada is distinct from new.geral_ligada)
  execute function privado.geral_chave_mudou();

-- para o robô (a de 20270519120000): ligada, a base mais os pacotes; desligada, só a volta à base, uma vez. Depois de
-- um erro, espera 1 hora.
create or replace function public.servidor_geral_do_dia(p_chave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c privado.config_impulso;
  v_alvo numeric;
  v_hoje_6h timestamptz := ((now() at time zone 'America/Sao_Paulo')::date + time '06:00') at time zone 'America/Sao_Paulo';
  v_pode boolean;
begin
  perform privado.exigir_servidor(p_chave);
  select * into c from privado.config_impulso where id;
  if c.id is null or c.geral_conta is null or c.geral_campanha_id is null then
    return jsonb_build_object('fazer', false);
  end if;
  v_pode := c.geral_erro_em is null or c.geral_erro_em < now() - interval '1 hour';
  if not c.geral_ligada then
    return jsonb_build_object('fazer', c.geral_voltar and v_pode, 'conta', c.geral_conta,
                              'campanha_id', c.geral_campanha_id, 'valor', c.geral_base);
  end if;
  v_alvo := privado.geral_valor_alvo();
  return jsonb_build_object(
    'fazer', ((now() >= v_hoje_6h and (c.geral_feita_em is null or c.geral_feita_em < v_hoje_6h))
              or v_alvo > coalesce(c.geral_valor, 0))
             and v_pode,
    'conta', c.geral_conta, 'campanha_id', c.geral_campanha_id, 'valor', v_alvo);
end
$$;

-- o robô acertou o orçamento (a de 20270519120000) ou deu erro. Se a chave desligou no meio da volta e o robô ainda pôs
-- o valor de ligada, a volta à base fica pendente.
create or replace function public.servidor_geral_feita(p_chave text, p_valor numeric, p_erro text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  if p_erro is null then
    update privado.config_impulso
       set geral_feita_em = now(), geral_valor = round(p_valor, 2), geral_erro = null, geral_erro_em = null,
           geral_voltar = not geral_ligada and round(p_valor, 2) <> geral_base
     where id;
  else
    update privado.config_impulso set geral_erro = left(p_erro, 500), geral_erro_em = now() where id;
  end if;
end
$$;

notify pgrst, 'reload schema';
