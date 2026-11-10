"""Append-only task revisions plus the latest task state, independent of the panel."""
import hashlib
import json
from pathlib import Path
import sqlite3
import time

KEYS=('main_quests','side_quests')

def connect(state_path,create=True):
    folder=Path(state_path).parent/'task_records_v11_3';database=folder/'tasks.sqlite3'
    if not create and not database.exists():return None
    folder.mkdir(parents=True,exist_ok=True)
    ignore=folder/'.gitignore'
    try:
        with ignore.open('x',encoding='utf-8') as stream:stream.write('*\n')
    except FileExistsError:pass
    db=sqlite3.connect(database,timeout=8)
    db.execute('PRAGMA journal_mode=WAL')
    db.executescript('''CREATE TABLE IF NOT EXISTS tasks(identity TEXT PRIMARY KEY,group_name TEXT NOT NULL,payload TEXT NOT NULL,digest TEXT NOT NULL,observed REAL NOT NULL);
CREATE TABLE IF NOT EXISTS revisions(sequence INTEGER PRIMARY KEY AUTOINCREMENT,identity TEXT NOT NULL,payload TEXT NOT NULL,observed REAL NOT NULL);
CREATE INDEX IF NOT EXISTS task_revisions ON revisions(identity,sequence);
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,payload TEXT NOT NULL);''')
    return db

def archive(state_path,*states):
    db=connect(state_path)
    try:
        with db:
            for state in states:
                if not isinstance(state,dict):continue
                for group in KEYS:
                    for task in state.get(group,[]) or []:
                        if not isinstance(task,dict):continue
                        identity=hashlib.sha256(json.dumps([group,str(task.get('id','')),str(task.get('title',''))],ensure_ascii=False).encode()).hexdigest()
                        payload=json.dumps(task,ensure_ascii=False,sort_keys=True);digest=hashlib.sha256(payload.encode()).hexdigest()
                        prior=db.execute('SELECT digest FROM tasks WHERE identity=?',(identity,)).fetchone()
                        if prior and prior[0]==digest:continue
                        stamp=time.time()
                        db.execute('INSERT INTO revisions(identity,payload,observed) VALUES(?,?,?)',(identity,payload,stamp))
                        db.execute('INSERT INTO tasks VALUES(?,?,?,?,?) ON CONFLICT(identity) DO UPDATE SET payload=excluded.payload,digest=excluded.digest,observed=excluded.observed',(identity,group,payload,digest,stamp))
                meta=json.dumps({key:value for key,value in state.items() if key not in KEYS},ensure_ascii=False)
                db.execute("INSERT INTO meta VALUES('state',?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload",(meta,))
    finally:db.close()

def restore(state_path):
    db=connect(state_path,create=False)
    if db is None:return None
    try:
        row=db.execute("SELECT payload FROM meta WHERE key='state'").fetchone()
        result=json.loads(row[0]) if row else {}
        result.update({key:[] for key in KEYS})
        for group,payload in db.execute('SELECT group_name,payload FROM tasks ORDER BY observed'):
            if group in KEYS:result[group].append(json.loads(payload))
        return result
    finally:db.close()
