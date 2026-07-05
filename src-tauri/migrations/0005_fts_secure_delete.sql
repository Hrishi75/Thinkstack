-- Privacy: make FTS5 remove deleted entries from its inverted index
-- immediately instead of leaving them in doclists until a merge. Without
-- this, text of permanently deleted notes remains recoverable from the
-- notes_fts shadow tables. (Persistent config; requires SQLite >= 3.42.)
INSERT INTO notes_fts(notes_fts, rank) VALUES('secure-delete', 1);
