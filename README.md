# JP Log

I made this for myself to keep track of my Japanese progress. It is made to be
self-hosted and stores study data in a local SQLite database.
<img width="1883" height="935" alt="image" src="https://github.com/user-attachments/assets/386824a5-26f6-4637-b158-6d838a386f02" />

## Features

- Save Japanese words, readings, meanings, notes, and tags.
- Optionally group entries by word type, such as `i-adj`, `verb`, `noun`, or
  `expression`.
- Practice selected words or an entire list with multiple-choice questions.
- Track correct answers, incorrect answers, and accuracy for every entry.
- Search, edit, and delete saved entries.
- Warn before saving a duplicate term and reading.
- Import and export CSV files.
- Import and export the local SQLite database.

## CSS

Uses my Shadow CSS:
[Shadorux/shadow-the-hedgehog-css](https://github.com/Shadorux/shadow-the-hedgehog-css).

The CSS is how I want it to look personally. The included
`shadow-the-hedgehog.css` can be edited or replaced to make your own CSS.

## Running Locally

Python 3 is required.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python server_py.py
```

Open <http://localhost:5000>.

Entries are stored in `jplog_py.db`. The database is ignored by Git, so local
study data is not uploaded to the repository.

## Database Import and Export

The app includes **Export DB** and **Import DB** options for backing up and
restoring the local SQLite database. CSV import and export are also included.

## Practice Mode

1. Add an entry.
2. Optionally choose its **Word Type**, such as `i-adj`, `na-adj`, `verb`,
   `noun`, `adverb`, or `expression`.
3. Open that list from the sidebar.
4. Select individual entries or choose **Select all**.
5. Press **Start practice**.
6. Press **End** to return to the selected list.

Tags also become practice lists, so one entry can be included in multiple
lists. A Word Type is not required when an entry has at least one tag.
