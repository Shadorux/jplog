from flask import Flask, request, jsonify, send_from_directory, send_file
import sqlite3
import os
import csv
import io
import json
import ast

APP_DIR = os.path.dirname(__file__)
DB_PATH = os.path.join(APP_DIR, 'jplog_py.db')

def parse_tags(value):
    if not value:
        return []
    if isinstance(value, list):
        return value
    for parser in (json.loads, ast.literal_eval):
        try:
            parsed = parser(value)
            if isinstance(parsed, list):
                return [str(tag) for tag in parsed]
        except (TypeError, ValueError, SyntaxError):
            pass
    return [tag.strip() for tag in str(value).split(',') if tag.strip()]

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def normalized_text(value):
    return str(value or '').strip().casefold()

def find_duplicate(conn, term, reading, exclude_id=None):
    rows = conn.execute(
        'SELECT id, term, reading, meaning FROM entries'
    ).fetchall()
    term_key = normalized_text(term)
    reading_key = normalized_text(reading)
    for row in rows:
        if exclude_id is not None and row['id'] == exclude_id:
            continue
        if (
            normalized_text(row['term']) == term_key
            and normalized_text(row['reading']) == reading_key
        ):
            return dict(row)
    return None

def init_db():
    conn = get_db()
    conn.execute('''CREATE TABLE IF NOT EXISTS entries (
        id INTEGER PRIMARY KEY,
        kind TEXT,
        term TEXT,
        reading TEXT,
        meaning TEXT,
        tags TEXT,
        notes TEXT,
        created INTEGER,
        correct_count INTEGER NOT NULL DEFAULT 0,
        incorrect_count INTEGER NOT NULL DEFAULT 0
    )''')
    columns = {row['name'] for row in conn.execute('PRAGMA table_info(entries)')}
    if 'correct_count' not in columns:
        conn.execute('ALTER TABLE entries ADD COLUMN correct_count INTEGER NOT NULL DEFAULT 0')
    if 'incorrect_count' not in columns:
        conn.execute('ALTER TABLE entries ADD COLUMN incorrect_count INTEGER NOT NULL DEFAULT 0')
    conn.commit()
    conn.close()

app = Flask(__name__, static_folder='.', static_url_path='')
init_db()

@app.route('/')
def index():
    return send_from_directory(APP_DIR, 'index.html')

@app.route('/<path:fname>')
def static_files(fname):
    return send_from_directory(APP_DIR, fname)

@app.route('/api/ping')
def ping():
    return jsonify(ok=True)

@app.route('/api/entries')
def list_entries():
    conn = get_db()
    rows = conn.execute('SELECT * FROM entries ORDER BY created ASC').fetchall()
    conn.close()
    out = []
    for r in rows:
        item = dict(r)
        item['tags'] = parse_tags(item.get('tags'))
        out.append(item)
    return jsonify(out)

@app.route('/api/entries', methods=['POST'])
def create_entry():
    data = request.get_json() or {}
    kind = data.get('kind')
    term = data.get('term')
    reading = data.get('reading')
    meaning = data.get('meaning')
    tags = data.get('tags') or []
    notes = data.get('notes')
    created = data.get('created') or int(__import__('time').time()*1000)
    conn = get_db()
    duplicate = find_duplicate(conn, term, reading)
    if duplicate and not data.get('allow_duplicate'):
        conn.close()
        return jsonify(error='duplicate', duplicate=duplicate), 409
    cur = conn.execute('''INSERT INTO entries
        (kind,term,reading,meaning,tags,notes,created,correct_count,incorrect_count)
        VALUES (?,?,?,?,?,?,?,?,?)''',
        (kind, term, reading, meaning, json.dumps(tags, ensure_ascii=False),
         notes, created, 0, 0))
    conn.commit()
    id = cur.lastrowid
    row = conn.execute('SELECT * FROM entries WHERE id=?', (id,)).fetchone()
    conn.close()
    item = dict(row)
    item['tags'] = tags
    return jsonify(item)

@app.route('/api/entries/<int:entry_id>', methods=['DELETE'])
def delete_entry(entry_id):
    conn = get_db()
    conn.execute('DELETE FROM entries WHERE id=?', (entry_id,))
    conn.commit()
    conn.close()
    return jsonify(ok=True)


@app.route('/api/entries/<int:entry_id>', methods=['PUT'])
def update_entry(entry_id):
    data = request.get_json() or {}
    fields = {}
    for k in ('kind','term','reading','meaning','tags','notes','created'):
        if k in data:
            fields[k] = json.dumps(data[k], ensure_ascii=False) if k == 'tags' else data[k]
    if not fields:
        return jsonify(error='no fields'), 400
    conn = get_db()
    current = conn.execute(
        'SELECT term, reading FROM entries WHERE id=?',
        (entry_id,)
    ).fetchone()
    if not current:
        conn.close()
        return jsonify(error='not found'), 404
    duplicate = find_duplicate(
        conn,
        data.get('term', current['term']),
        data.get('reading', current['reading']),
        exclude_id=entry_id
    )
    if duplicate and not data.get('allow_duplicate'):
        conn.close()
        return jsonify(error='duplicate', duplicate=duplicate), 409
    set_clause = ','.join(f"{k}=?" for k in fields.keys())
    params = list(fields.values()) + [entry_id]
    conn.execute(f'UPDATE entries SET {set_clause} WHERE id=?', params)
    conn.commit()
    row = conn.execute('SELECT * FROM entries WHERE id=?', (entry_id,)).fetchone()
    conn.close()
    if not row:
        return jsonify(error='not found'), 404
    item = dict(row)
    item['tags'] = parse_tags(item.get('tags'))
    return jsonify(item)

@app.route('/api/entries/<int:entry_id>/answer', methods=['POST'])
def record_answer(entry_id):
    data = request.get_json() or {}
    correct = data.get('correct')
    if not isinstance(correct, bool):
        return jsonify(error='correct must be a boolean'), 400
    column = 'correct_count' if correct else 'incorrect_count'
    conn = get_db()
    conn.execute(
        f'UPDATE entries SET {column}=COALESCE({column}, 0)+1 WHERE id=?',
        (entry_id,)
    )
    conn.commit()
    row = conn.execute(
        'SELECT correct_count, incorrect_count FROM entries WHERE id=?',
        (entry_id,)
    ).fetchone()
    conn.close()
    if not row:
        return jsonify(error='not found'), 404
    return jsonify(dict(row))

@app.route('/api/export')
def export_csv():
    conn = get_db()
    rows = conn.execute('SELECT * FROM entries ORDER BY created ASC').fetchall()
    conn.close()
    si = io.StringIO()
    writer = csv.writer(si)
    writer.writerow([
        'id', 'kind', 'term', 'reading', 'meaning', 'tags', 'notes', 'created',
        'correct_count', 'incorrect_count'
    ])
    for r in rows:
        writer.writerow([
            r['id'], r['kind'], r['term'], r['reading'], r['meaning'],
            r['tags'], r['notes'], r['created'], r['correct_count'],
            r['incorrect_count']
        ])
    si.seek(0)
    return send_file(io.BytesIO(si.getvalue().encode('utf8')), mimetype='text/csv', as_attachment=True, download_name='jplog-export.csv')

@app.route('/api/import', methods=['POST'])
def import_csv():
    f = request.files.get('file')
    if not f:
        return jsonify(error='no file'), 400
    stream = io.StringIO(f.stream.read().decode('utf8'))
    reader = csv.DictReader(stream)
    conn = get_db()
    cur = conn.cursor()
    count = 0
    for row in reader:
        tags = json.dumps(parse_tags(row.get('tags', '')), ensure_ascii=False)
        cur.execute('''INSERT INTO entries
            (kind,term,reading,meaning,tags,notes,created,correct_count,incorrect_count)
            VALUES (?,?,?,?,?,?,?,?,?)''',
            (
                row.get('kind'), row.get('term'), row.get('reading'),
                row.get('meaning'), tags, row.get('notes'),
                row.get('created') or int(__import__('time').time()*1000),
                int(row.get('correct_count') or 0),
                int(row.get('incorrect_count') or 0)
            ))
        count += 1
    conn.commit()
    conn.close()
    return jsonify(ok=True, imported=count)


@app.route('/api/db-download')
def download_db():
    if not os.path.exists(DB_PATH):
        return jsonify(error='db not found'), 404
    return send_file(DB_PATH, as_attachment=True, download_name='jplog_py.db')


@app.route('/api/db-upload', methods=['POST'])
def upload_db():
    f = request.files.get('file')
    if not f:
        return jsonify(error='no file'), 400
    # Save uploaded file to a temporary path then replace
    tmp_path = DB_PATH + '.upload'
    f.save(tmp_path)
    try:
        # Replace existing DB
        os.replace(tmp_path, DB_PATH)
        init_db()
    except Exception as e:
        return jsonify(error=str(e)), 500
    return jsonify(ok=True)

if __name__ == '__main__':
    app.run(port=5000, debug=True)
