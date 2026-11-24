import pgserver,subprocess
db=pgserver.get_server('/tmp/rp/pgdata',cleanup_mode='stop'); uri=db.get_uri()
def sh(sql,role=None,hdr=None):
    pre=''
    if role: pre+=f"set role {role};"
    if hdr: pre+=f"select set_config('request.headers','{hdr}',false);"
    r=subprocess.run(['psql',uri,'-At','-c',pre+sql],capture_output=True,text=True)
    return (r.stdout.strip().split('\n')[-1] if r.stdout.strip() else '')+' '+r.stderr.strip()[:140]
print(sh("select count(*) from public.shipping_rates"))
print(sh("insert into public.shipping_rates(governorate,area,fee_egp,is_active) values('Dakahlia','',60,true)"))
print(sh("insert into public.products(slug,name_en,name_ar,price_egp,production_type,is_published,stock,category,category_ar) values('t','T','ت',1000,'made_to_order',true,0,'sets','طقم') returning id"))
pid=subprocess.run(['psql',uri,'-At','-c',"select id from public.products limit 1"],capture_output=True,text=True).stdout.strip()
gov,area=subprocess.run(['psql',uri,'-At','-F','|','-c',"select governorate,area from public.shipping_rates where is_active limit 1"],capture_output=True,text=True).stdout.strip().split('|')
def order(phone,name='Test Buyer',note='',ip='1.1.1.1',key=None,items=None):
    items=items or f'[{{"product_id":"{pid}","quantity":1}}]'
    k=f",'{key}'" if key else ''
    return sh(f"select order_number,total_egp from public.submit_store_order('{name}','{phone}',null,'{gov}','{area}','addr','{note}','cash_on_delivery','{items}'::jsonb{k})",'anon',f'{{"cf-connecting-ip":"{ip}"}}')
print('1',order('01000000001'))
print('idem',order('01000000001',key='abcdefghijklmnop1'), order('01000000001',key='abcdefghijklmnop1'))
for i in range(4): order('01000000001')
print('6th same phone (expect Too many):',order('01000000001'))
print('other phone ok:',order('01000000002'))
print('long name:',order('01000000003',name='x'*130))
print('bad pm:',sh(f"select * from public.submit_store_order('A B','01000000004',null,'{gov}','{area}','a',null,'bitcoin','[{{\"product_id\":\"{pid}\",\"quantity\":1}}]'::jsonb)",'anon'))
print('price tamper ignored:',order('01000000005',items=f'[{{"product_id":"{pid}","quantity":1,"price_egp":1,"unit_price_egp":1}}]'))
print('anon table select orders:',sh("select count(*) from public.orders",'anon'))
print('anon guard exec denied:',sh("select public.guard_guest_request('x','y',1,interval '1 hour')",'anon'))
print('anon log read denied:',sh("select count(*) from public.guest_request_log",'anon'))
print('design ok:',sh("select request_number from public.submit_custom_design_request('Name X','01000000009',null,'Dress',null,null,null,null,'a long description',array['references/a_b.png'],null,null)",'anon','{"cf-connecting-ip":"2.2.2.2"}'))
print('design bad url:',sh("select * from public.submit_custom_design_request('Name X','01000000009',null,'Dress',null,null,null,null,'a long description',array['javascript:alert(1)'],null,null)",'anon'))
for i in range(5): sh("select public.guard_guest_request('x','y',99,interval '1 hour')")
n=sh("select order_number from public.orders limit 1")
for i in range(21): r=sh(f"select public.lookup_public_order('MERO-1001','01000000001',null)",'anon','{"cf-connecting-ip":"3.3.3.3"}')
print('lookup 21st:',r)
print('lookup ok first window other num:',sh("select (public.lookup_public_order('MERO-1002','01000000002',null))->>'order_number'",'anon','{"cf-connecting-ip":"4.4.4.4"}'))
