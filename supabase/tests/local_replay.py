import pgserver,glob,subprocess,sys
db=pgserver.get_server('/tmp/rp/pgdata',cleanup_mode='stop')
uri=db.get_uri()
def psql(path):
    r=subprocess.run(['psql',uri,'-v','ON_ERROR_STOP=1','-q','-f',path],capture_output=True,text=True)
    return r.returncode,(r.stderr or '')[:400]
print(psql('/tmp/rp/boot.sql'))
for f in sorted(glob.glob('/tmp/rp/mig/*.sql')):
    rc,e=psql(f); print(f.split('/')[-1][:50],'OK' if rc==0 else 'ERR '+e)
    if rc: break
